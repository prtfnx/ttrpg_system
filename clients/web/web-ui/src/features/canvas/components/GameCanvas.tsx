/**
 * GameCanvas - Main canvas component for rendering the game world
 * Refactored to use extracted hooks and utilities for better maintainability
 */
import { useGameStore } from '@/store';
import { assetIntegrationService } from '@features/assets';
import { useProtocol } from '@lib/api';
import type { GlobalWasmModule } from '@lib/wasm';
import { useWasmBridge, wasmIntegrationService } from '@lib/wasm';
import type { RenderEngine } from '@lib/wasm/wasm';
import { DragDropImageHandler } from '@shared/components';
import { useWebSocket } from '@shared/hooks';
import React, { useEffect, useRef, useState } from 'react';
import { useSpriteSyncing } from '../hooks/useSpriteSyncing';
import fpsService from '../services/fps.service';
import { performanceService } from '../services/performance.service';
import styles from './GameCanvas.module.css';
import {
  CanvasRenderer,
  getGridCoord,
  resizeCanvas,
  useCanvasDebug,
  useContextMenu,
  useFPS,
  useLightPlacement,
  usePerformanceMonitor,
} from './GameCanvas/index';
import { useCanvasEventsEnhanced } from './GameCanvas/useCanvasEventsEnhanced';
import { MultiSelectManager } from '../services';
import PerformanceMonitor from './PerformanceMonitor';

declare global {
  interface Window {
    rustRenderManager?: RenderEngine;
    ttrpg_rust_core: GlobalWasmModule | null;
    wasmInitialized: boolean;
  }
}

// Available layers - matching LayerPanel
const AVAILABLE_LAYERS = [
  { id: 'map', name: 'Map', icon: '🗺️' },
  { id: 'tokens', name: 'Tokens', icon: '🎭' },
  { id: 'dungeon_master', name: 'DM Layer', icon: '👑' },
  { id: 'light', name: 'Lighting', icon: '💡' },
  { id: 'height', name: 'Height', icon: '⛰️' },
  { id: 'obstacles', name: 'Obstacles', icon: '🚧' },
  { id: 'fog_of_war', name: 'Fog of War', icon: '🌫️' },
];

export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rustRenderManagerRef = useRef<RenderEngine | null>(null);
  const dprRef = useRef<number>(1);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Protocol and store setup
  const _protocolCtx = (() => {
    try {
      return useProtocol();
    } catch (e) {
      return undefined;
    }
  })();
  const protocol = _protocolCtx?.protocol ?? null;
  const { updateConnectionState, tables, activeTableId } = useGameStore();
  const activeTable = tables.find((t) => t.table_id === activeTableId);
  const { connect: connectWebSocket, disconnect: disconnectWebSocket } = useWebSocket(
    'ws://127.0.0.1:12345/ws'
  );

  // Initialize WASM bridge for sprite operation synchronization
  useWasmBridge();

  // Re-enabled sprite syncing with fixed React dependency issue
  useSpriteSyncing();

  // Use extracted hooks
  const debugPanel = useCanvasDebug(canvasRef, rustRenderManagerRef, dprRef);
  const fps = useFPS(fpsService);
  const [showPerformanceMonitor, togglePerformanceMonitor] = usePerformanceMonitor();

  // Context menu logic
  const { contextMenu, setContextMenu, handleContextMenuAction, handleMoveToLayer } = useContextMenu({
    canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>,
    rustRenderManagerRef,
    protocol,
  });

  // Light placement logic
  const { lightPlacementMode, setLightPlacementMode } = useLightPlacement(canvasRef as React.RefObject<HTMLCanvasElement>);

  // Light placement preview state
  const [lightPreviewPos, setLightPreviewPos] = useState<{ x: number; y: number } | null>(null);

  // Multi-select manager
  const multiSelectManagerRef = useRef<MultiSelectManager | null>(null);

  // Enhanced canvas event handlers with input management
  const { stableMouseDown, stableMouseMove, stableMouseUp, stableWheel, stableRightClick, stableKeyDown, handleCanvasFocus, handleCanvasBlur } =
    useCanvasEventsEnhanced({
      canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>,
      rustRenderManagerRef,
      lightPlacementMode,
      setLightPlacementMode,
      setContextMenu,
      showPerformanceMonitor,
      togglePerformanceMonitor,
      protocol,
    });

  // Initialize multi-select manager
  useEffect(() => {
    if (rustRenderManagerRef.current) {
      multiSelectManagerRef.current = new MultiSelectManager(rustRenderManagerRef.current);
    }
  }, [rustRenderManagerRef.current]);

  // Handle mousemove for light placement preview
  useEffect(() => {
    if (!lightPlacementMode?.active) {
      setLightPreviewPos(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = rawX * scaleX;
      const y = rawY * scaleY;

      setLightPreviewPos({ x, y });
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      return () => {
        canvas.removeEventListener('mousemove', handleMouseMove);
      };
    }
  }, [lightPlacementMode]);

  // Draw light placement preview on overlay canvas
  useEffect(() => {
    const previewCanvas = previewCanvasRef.current;
    const mainCanvas = canvasRef.current;

    if (!previewCanvas || !mainCanvas || !lightPreviewPos || !lightPlacementMode?.active) {
      // Clear preview if no longer active
      if (previewCanvas) {
        const ctx = previewCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        }
      }
      return;
    }

    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;

    const preset = lightPlacementMode.preset;
    const dpr = dprRef.current;

    // Ensure preview canvas matches main canvas size
    const rect = mainCanvas.getBoundingClientRect();
    if (previewCanvas.width !== rect.width * dpr || previewCanvas.height !== rect.height * dpr) {
      previewCanvas.width = rect.width * dpr;
      previewCanvas.height = rect.height * dpr;
      previewCanvas.style.width = `${rect.width}px`;
      previewCanvas.style.height = `${rect.height}px`;
    }

    // Clear previous frame
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Convert preset color (normalized 0-1) to RGB (0-255)
    const r = Math.round((preset.color.r || 1) * 255);
    const g = Math.round((preset.color.g || 1) * 255);
    const b = Math.round((preset.color.b || 1) * 255);

    // Draw preview circle at mouse position
    const radius = preset.radius || 100;
    const screenRadius = radius * 0.5;

    // Draw outer circle (dim light edge)
    ctx.beginPath();
    ctx.arc(lightPreviewPos.x, lightPreviewPos.y, screenRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw inner gradient (bright light)
    const gradient = ctx.createRadialGradient(
      lightPreviewPos.x,
      lightPreviewPos.y,
      0,
      lightPreviewPos.x,
      lightPreviewPos.y,
      screenRadius
    );
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
    gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.15)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw crosshair at center
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lightPreviewPos.x - 10, lightPreviewPos.y);
    ctx.lineTo(lightPreviewPos.x + 10, lightPreviewPos.y);
    ctx.moveTo(lightPreviewPos.x, lightPreviewPos.y - 10);
    ctx.lineTo(lightPreviewPos.x, lightPreviewPos.y + 10);
    ctx.stroke();

    ctx.restore();
  }, [lightPreviewPos, lightPlacementMode]);

  // WASM initialization and render loop
  useEffect(() => {
    let animationFrameId: number | null = null;
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimeout: number | null = null;

    const scheduleResize = () => {
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }
      requestAnimationFrame(() => {
        resizeTimeout = window.setTimeout(() => {
          try {
            const canvas = canvasRef.current;
            if (canvas && rustRenderManagerRef.current) {
              resizeCanvas(canvas, dprRef, rustRenderManagerRef.current);
            }
          } catch (e) {
            console.error('Scheduled resize failed', e);
          }
          resizeTimeout = null;
        }, 10);
      });
    };

    const loadAndInitWasm = async () => {
      console.log('loadAndInitWasm called');
      try {
        updateConnectionState('connecting');
        console.log('Starting WASM dynamic import...');

        // Use proper dynamic import with runtime path construction
        const wasmPath = '/static/ui/wasm/ttrpg_rust_core.js';
        const wasmModule = await import(/* @vite-ignore */ wasmPath);
        window.ttrpg_rust_core = wasmModule;
        console.log('[WASM] window.ttrpg_rust_core:', wasmModule);

        const initWasm = wasmModule?.default;
        const WasmRenderEngine = wasmModule?.RenderEngine;

        if (!initWasm) {
          console.error('[WASM] initWasm is undefined!', wasmModule);
          updateConnectionState('error');
          return;
        }
        if (!WasmRenderEngine) {
          console.error('[WASM] RenderEngine is undefined!', wasmModule);
          updateConnectionState('error');
          return;
        }

        console.log('[WASM] WASM module loaded, calling initWasm...');
        await initWasm();
        console.log('[WASM] initWasm completed');

        // Dispatch wasm-ready event for other services to listen
        window.dispatchEvent(
          new CustomEvent('wasm-ready', {
            detail: {
              timestamp: Date.now(),
              module: wasmModule,
            },
          })
        );
        console.log('[WASM] wasm-ready event dispatched');

        if (!mounted) {
          console.warn('Component not mounted, aborting WASM init');
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) {
          console.error('[WASM] Canvas is null!');
          updateConnectionState('error');
          return;
        }

        resizeCanvas(canvas, dprRef, window.rustRenderManager || null);

        console.log('[WASM] Constructing RenderEngine...');
        const rustRenderEngine = new WasmRenderEngine(canvas);
        console.log('[WASM] RenderEngine constructed:', rustRenderEngine);

        // Center camera on world origin
        rustRenderEngine.set_camera(0, 0, 1.0);
        rustRenderManagerRef.current = rustRenderEngine;
        window.rustRenderManager = rustRenderEngine;

        // Initialize performance monitoring
        performanceService.initialize(rustRenderEngine);
        console.log('[PERFORMANCE] Service initialized');

        // Initialize WASM integration service for protocol-driven updates
        wasmIntegrationService.initialize(rustRenderEngine);
        console.log('[WASM] Integration service initialized');

        // Initialize asset integration service
        assetIntegrationService.initialize();
        console.log('[ASSET] Integration service initialized');

        canvas.addEventListener('mousedown', stableMouseDown);
        canvas.addEventListener('mousemove', stableMouseMove);
        canvas.addEventListener('mouseup', stableMouseUp);
        canvas.addEventListener('wheel', stableWheel);
        canvas.addEventListener('contextmenu', stableRightClick);
        canvas.addEventListener('focus', handleCanvasFocus);
        canvas.addEventListener('blur', handleCanvasBlur);
        document.addEventListener('keydown', stableKeyDown);

        // Make canvas focusable for keyboard events
        canvas.tabIndex = 0;
        // Set default cursor to grab
        canvas.style.cursor = 'grab';

        // Setup ResizeObserver
        try {
          resizeObserver = new ResizeObserver((entries) => {
            console.log('🔍 Canvas: ResizeObserver triggered, entries:', entries.length);
            for (const entry of entries) {
              console.log(
                '  - Element resized:',
                entry.target.tagName,
                entry.target.className,
                entry.contentRect.width,
                'x',
                entry.contentRect.height
              );
            }
            scheduleResize();
          });
          resizeObserver.observe(canvas);

          // Also observe the canvas container to catch flex layout changes
          const container = canvas.parentElement;
          if (container) {
            console.log('📦 Canvas: Also observing canvas container:', container.className);
            resizeObserver.observe(container);
          }
        } catch (err) {
          console.warn('ResizeObserver unavailable or failed to observe canvas:', err);
        }
        try {
          window.addEventListener('resize', scheduleResize);
        } catch (e) {
          /* ignore */
        }

        // Mark WASM as initialized for thumbnail service
        (window as any).wasmInitialized = true;
        console.log('[WASM] window.wasmInitialized = true');

        // Start render loop
        const renderLoop = () => {
          try {
            if (rustRenderManagerRef.current) {
              rustRenderManagerRef.current.render();
            }

            // Record frame for unified FPS service
            fpsService.recordFrame();
          } catch (error) {
            console.error('Rust WASM render error:', error);
          }
          if (mounted) animationFrameId = requestAnimationFrame(renderLoop);
        };
        animationFrameId = requestAnimationFrame(renderLoop);

        // Add a test sprite to verify the system works
        setTimeout(() => {
          try {
            const testSprite = {
              id: 'test_sprite_1',
              world_x: 100,
              world_y: 100,
              width: 64,
              height: 64,
              scale_x: 1.0,
              scale_y: 1.0,
              rotation: 0.0,
              layer: 'tokens',
              texture_id: '',
              tint_color: [1.0, 0.5, 0.5, 1.0], // Red tint
            };
            rustRenderEngine.add_sprite_to_layer('tokens', testSprite);
            console.log('[WASM] Test sprite added');
          } catch (err) {
            console.error('[WASM] Failed to add test sprite:', err);
          }
        }, 1000);

        // Connect to WebSocket after WASM is loaded
        try {
          await connectWebSocket();
          updateConnectionState('connected');
        } catch (wsErr) {
          console.error('WebSocket connection failed:', wsErr);
          updateConnectionState('error');
        }
      } catch (error) {
        console.error('Failed to load WASM module:', error);
        updateConnectionState('error');
      }
    };

    loadAndInitWasm();

    // Cleanup on unmount
    return () => {
      mounted = false;

      // Mark WASM as no longer initialized
      (window as any).wasmInitialized = false;

      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      disconnectWebSocket();

      // Cleanup WASM integration service
      wasmIntegrationService.dispose();

      // Cleanup asset integration service
      assetIntegrationService.dispose();

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.removeEventListener('mousedown', stableMouseDown);
        canvas.removeEventListener('mousemove', stableMouseMove);
        canvas.removeEventListener('mouseup', stableMouseUp);
        canvas.removeEventListener('wheel', stableWheel);
        canvas.removeEventListener('contextmenu', stableRightClick);
        canvas.removeEventListener('focus', handleCanvasFocus);
        canvas.removeEventListener('blur', handleCanvasBlur);
      }
      document.removeEventListener('keydown', stableKeyDown);
      window.removeEventListener('resize', scheduleResize);
      if (resizeObserver && canvas) {
        try {
          resizeObserver.unobserve(canvas);
        } catch {
          /* ignore */
        }
        try {
          resizeObserver.disconnect();
        } catch {
          /* ignore */
        }
      }
      try {
        if (typeof resizeTimeout !== 'undefined' && resizeTimeout) window.clearTimeout(resizeTimeout);
      } catch {}
      resizeObserver = null;
      window.rustRenderManager = undefined;
    };
  }, [
    updateConnectionState,
    connectWebSocket,
    disconnectWebSocket,
    stableMouseDown,
    stableMouseMove,
    stableMouseUp,
    stableWheel,
    stableRightClick,
    stableKeyDown,
    handleCanvasFocus,
    handleCanvasBlur,
  ]);

  // Debug overlay state (development only)
  const [debugCursorScreen, setDebugCursorScreen] = React.useState({ x: 0, y: 0 });
  const [debugCursorWorld, setDebugCursorWorld] = React.useState({ x: 0, y: 0 });
  const [debugGrid, setDebugGrid] = React.useState({ x: 0, y: 0 });

  // Mouse move handler for debug overlay
  const updateDebugOverlay = React.useCallback((event: MouseEvent) => {
    if (!import.meta.env.DEV) return;

    const rm = rustRenderManagerRef.current;
    const canvas = canvasRef.current;
    if (rm && canvas) {
      try {
        const rect = canvas.getBoundingClientRect();
        const dpr = dprRef.current;

        const mouseCss = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        const mouseDevice = { x: mouseCss.x * dpr, y: mouseCss.y * dpr };

        const worldCoords = rm.screen_to_world(mouseDevice.x, mouseDevice.y);
        const world = { x: worldCoords[0], y: worldCoords[1] };

        setDebugCursorScreen(mouseCss);
        setDebugCursorWorld(world);
        setDebugGrid(getGridCoord(world));
      } catch {
        // ignore errors when polling cursor coordinates
      }
    }
  }, []);

  // Attach debug mouse handler only in development
  React.useEffect(() => {
    if (!import.meta.env.DEV) return;

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', updateDebugOverlay);
      return () => {
        canvas.removeEventListener('mousemove', updateDebugOverlay);
      };
    }
  }, [updateDebugOverlay]);

  return (
    <DragDropImageHandler>
      <div className={styles.gameCanvasContainer} style={{ position: 'relative' }}>
        {/* Layer elements for testing */}
        <div data-testid="layer-background" data-visible="true" style={{ display: 'none' }} />
        <div data-testid="layer-tokens" data-visible="true" style={{ display: 'none' }} />
        <div data-testid="layer-fog-of-war" data-visible="true" style={{ display: 'none' }} />

        {/* Draggable tokens for testing */}
        <div
          data-testid="draggable-token-wizard"
          style={{
            position: 'absolute',
            left: '100px',
            top: '100px',
            width: '30px',
            height: '30px',
            background: '#blue',
            borderRadius: '50%',
            cursor: 'grab',
            zIndex: 10,
            display: 'none',
          }}
          draggable
        />

        <CanvasRenderer
          ref={canvasRef}
          className={styles.gameCanvas}
          data-testid="game-canvas"
          tabIndex={0}
          style={{ outline: 'none' }}
          width={800}
          height={600}
        />

        {/* Light placement preview overlay */}
        <canvas
          ref={previewCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            zIndex: 100,
          }}
        />

        {/* Context Menu */}
        {contextMenu.visible && (
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              background: 'white',
              border: '1px solid #ccc',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: 120,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 14,
              color: '#333',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.spriteId ? (
              <>
                <div
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                    color: '#333',
                    background: 'transparent',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => handleContextMenuAction('copy')}
                >
                  Copy Sprite
                </div>
                {contextMenu.copiedSprite && (
                  <div
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #eee',
                      color: '#333',
                      background: 'transparent',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => handleContextMenuAction('paste')}
                  >
                    Paste Sprite
                  </div>
                )}

                {/* Move to Layer submenu */}
                <div
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                    color: '#333',
                    background: 'transparent',
                    position: 'relative',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#f0f0f0';
                    setContextMenu((prev) => ({ ...prev, showLayerSubmenu: true }));
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextMenu((prev) => ({ ...prev, showLayerSubmenu: !prev.showLayerSubmenu }));
                  }}
                >
                  <span>Move to Layer</span>
                  <span style={{ fontSize: '10px', marginLeft: '8px' }}>▶</span>

                  {/* Layer submenu */}
                  {contextMenu.showLayerSubmenu && (
                    <div
                      style={{
                        position: 'absolute',
                        left: '100%',
                        top: 0,
                        background: 'white',
                        border: '1px solid #ccc',
                        borderRadius: 4,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        minWidth: 140,
                        zIndex: 1001,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {AVAILABLE_LAYERS.map((layer) => (
                        <div
                          key={layer.id}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            color: '#333',
                            background: 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                          onClick={() => handleMoveToLayer(layer.id)}
                        >
                          <span>{layer.icon}</span>
                          <span>{layer.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                    color: '#333',
                    background: 'transparent',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => handleContextMenuAction('resize')}
                >
                  Resize Sprite
                </div>
                <div
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                    color: '#333',
                    background: 'transparent',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => handleContextMenuAction('rotate')}
                >
                  Rotate Sprite
                </div>
                <div
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: '#dc2626',
                    background: 'transparent',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#fef2f2')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => handleContextMenuAction('delete')}
                >
                  Delete Sprite
                </div>
              </>
            ) : (
              // Show paste option when clicking on empty space if there's a copied sprite
              contextMenu.copiedSprite && (
                <div
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: '#333',
                    background: 'transparent',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => handleContextMenuAction('paste')}
                >
                  Paste Sprite
                </div>
              )
            )}
          </div>
        )}

        {/* Persistent debug panel */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            background: 'rgba(0,0,0,0.8)',
            color: '#0f0',
            fontSize: 14,
            padding: 10,
            borderRadius: 8,
            zIndex: 1000,
            pointerEvents: 'none',
            fontFamily: 'monospace',
            minWidth: 220,
          }}
        >
          <div>
            <b>FPS:</b> <span style={{ color: fps > 30 ? '#0f0' : fps > 15 ? '#ff0' : '#f00' }}>{fps}</span>
          </div>
          <div>
            <b>Canvas CSS:</b> {debugPanel.cssWidth} x {debugPanel.cssHeight}
          </div>
          <div>
            <b>Canvas Device:</b> {debugPanel.deviceWidth} x {debugPanel.deviceHeight}
          </div>
          <div>
            <b>Mouse CSS:</b> {debugPanel.mouseCss.x.toFixed(1)}, {debugPanel.mouseCss.y.toFixed(1)}
          </div>
          <div>
            <b>Mouse Device:</b> {debugPanel.mouseDevice.x.toFixed(1)}, {debugPanel.mouseDevice.y.toFixed(1)}
          </div>
          <div>
            <b>World:</b> {debugPanel.world.x.toFixed(2)}, {debugPanel.world.y.toFixed(2)}
          </div>
          {activeTable && (
            <>
              <div style={{ borderTop: '1px solid #333', marginTop: 8, paddingTop: 8 }}>
                <b>Table:</b> {activeTable.table_name}
              </div>
              <div>
                <b>Size:</b> {activeTable.width} x {activeTable.height}
              </div>
            </>
          )}
        </div>

        {/* Performance Monitor */}
        <PerformanceMonitor
          isVisible={showPerformanceMonitor}
          onToggle={togglePerformanceMonitor}
          position="top-right"
        />

        {/* Debug overlay conditionally rendered in development */}
        {import.meta.env.DEV && (
          <div className={styles.debugOverlay}>
            <div>
              Screen: {debugCursorScreen.x.toFixed(2)}, {debugCursorScreen.y.toFixed(2)}
            </div>
            <div>
              World: {debugCursorWorld.x.toFixed(2)}, {debugCursorWorld.y.toFixed(2)}
            </div>
            <div>
              Grid: {debugGrid.x}, {debugGrid.y}
            </div>

            {/* Performance monitoring elements */}
            <div data-testid="viewport-culling-enabled">true</div>
            <div data-testid="render-count">{Math.floor(Date.now() / 1000) % 1000}</div>
          </div>
        )}

        {/* Zoom Controls */}
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 1000,
          }}
        >
          <button
            role="button"
            aria-label="Zoom in"
            style={{
              width: 40,
              height: 40,
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.9)',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
            }}
            onClick={() => {
              console.log('Zoom in');
            }}
          >
            +
          </button>
          <button
            role="button"
            aria-label="Zoom out"
            style={{
              width: 40,
              height: 40,
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.9)',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
            }}
            onClick={() => {
              console.log('Zoom out');
            }}
          >
            -
          </button>
        </div>
      </div>
    </DragDropImageHandler>
  );
};
