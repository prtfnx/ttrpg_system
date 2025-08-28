import type { RefObject } from 'react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
// import { useSpriteSyncing } from '../hooks/useSpriteSyncing';
import { assetIntegrationService } from '../services/assetIntegration.service';
import { wasmIntegrationService } from '../services/wasmIntegration.service';
import { useGameStore } from '../store';
import type { RenderEngine } from '../types';
import type { GlobalWasmModule } from '../utils/wasmManager';
import { DebugOverlay } from './DebugOverlay';
import './GameCanvas.css';

declare global {
  interface Window {
    rustRenderManager?: RenderEngine;
    ttrpg_rust_core: GlobalWasmModule | null;
    wasmInitialized: boolean;
  }
}

// Persistent debug panel for canvas/mouse/world info
function useCanvasDebug(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  rustRenderManagerRef: RefObject<RenderEngine | null>,
  dprRef: RefObject<number>
): {
  cssWidth: number; cssHeight: number; deviceWidth: number; deviceHeight: number;
  mouseCss: { x: number; y: number }; mouseDevice: { x: number; y: number }; world: { x: number; y: number }
} {
  const [debug, setDebug] = useState({
    cssWidth: 0, cssHeight: 0, deviceWidth: 0, deviceHeight: 0,
    mouseCss: { x: 0, y: 0 }, mouseDevice: { x: 0, y: 0 }, world: { x: 0, y: 0 }
  });
  useEffect(() => {
    function update(e: MouseEvent | UIEvent | null) {
      // For resize events, e is UIEvent, so skip mouse calculations
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = dprRef.current;
      let mouseCss = { x: 0, y: 0 }, mouseDevice = { x: 0, y: 0 }, world = { x: 0, y: 0 };
      if (e && 'clientX' in e && 'clientY' in e) {
        mouseCss = { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
        mouseDevice = { x: mouseCss.x * dpr, y: mouseCss.y * dpr };
        if (rustRenderManagerRef.current && rustRenderManagerRef.current.screen_to_world) {
          const w = rustRenderManagerRef.current.screen_to_world(mouseDevice.x, mouseDevice.y);
          if (Array.isArray(w) && w.length === 2) world = { x: w[0], y: w[1] };
        }
      }
      setDebug({
        cssWidth: rect.width, cssHeight: rect.height,
        deviceWidth: canvas.width, deviceHeight: canvas.height,
        mouseCss, mouseDevice, world
      });
    }
    const move = (e: MouseEvent) => update(e);
    window.addEventListener('mousemove', move);
    window.addEventListener('resize', update);
    // Initial update
    update(null);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('resize', update);
    };
  }, [canvasRef, rustRenderManagerRef, dprRef]);
  return debug;
}

export const GameCanvas: React.FC = () => {

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rustRenderManagerRef = useRef<RenderEngine | null>(null);
  const dprRef = useRef<number>(1);
  const { updateConnectionState, tables, activeTableId } = useGameStore();
  const activeTable = tables.find(t => t.table_id === activeTableId);
  const { connect: connectWebSocket, disconnect: disconnectWebSocket } = useWebSocket('ws://127.0.0.1:12345/ws');
  const debugPanel = useCanvasDebug(canvasRef as React.RefObject<HTMLCanvasElement | null>, rustRenderManagerRef, dprRef);
  
  // FPS Counter
  const [fps, setFps] = useState(0);
  const fpsRef = useRef({ frameCount: 0, lastTime: performance.now() });
  
  // TODO: Re-enable sprite syncing after fixing React error
  // useSpriteSyncing();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    spriteId?: string;
    copiedSprite?: string;
  }>({ visible: false, x: 0, y: 0 });

  const getRelativeCoords = useCallback((e: MouseEvent | WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Calculate mouse position relative to the canvas display area
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    
    // Scale to canvas internal resolution (accounts for DPR scaling)
    // canvas.width/height are the internal dimensions, rect.width/height are display dimensions
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = rawX * scaleX;
    const y = rawY * scaleY;
    
    return { x, y };
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    console.log('[MOUSE] Mouse down event:', e.clientX, e.clientY);
    if (rustRenderManagerRef.current) {
      const { x, y } = getRelativeCoords(e);
      console.log('[MOUSE] Relative coords:', x, y);
      // Check if we have the new Ctrl-aware method
      const renderManager = rustRenderManagerRef.current as any;
      if (renderManager.handle_mouse_down_with_ctrl) {
        renderManager.handle_mouse_down_with_ctrl(x, y, e.ctrlKey);
      } else {
        // Fallback to original method
        renderManager.handle_mouse_down(x, y);
      }
    }
  }, [getRelativeCoords]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (rustRenderManagerRef.current) {
      const { x, y } = getRelativeCoords(e);
      rustRenderManagerRef.current.handle_mouse_move(x, y);
      
      // Update cursor based on what's under the mouse
      const canvas = canvasRef.current;
      if (canvas && rustRenderManagerRef.current.get_cursor_type) {
        const cursorType = rustRenderManagerRef.current.get_cursor_type(x, y);
        canvas.style.cursor = cursorType;
      }
    }
  }, [getRelativeCoords]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (rustRenderManagerRef.current) {
      const { x, y } = getRelativeCoords(e);
      rustRenderManagerRef.current.handle_mouse_up(x, y);
      
      // Update cursor after mouse up
      const canvas = canvasRef.current;
      if (canvas && rustRenderManagerRef.current.get_cursor_type) {
        const cursorType = rustRenderManagerRef.current.get_cursor_type(x, y);
        canvas.style.cursor = cursorType;
      }
    }
  }, [getRelativeCoords]);
  const handleWheel = useCallback((e: WheelEvent) => {
    console.log('[WHEEL] Wheel event:', e.deltaY);
    if (rustRenderManagerRef.current) {
      e.preventDefault();
      const { x, y } = getRelativeCoords(e);
      console.log('[WHEEL] Wheel at coords:', x, y, 'delta:', e.deltaY);
      // Debug: log mouse coordinates and DPR
      console.log('[WHEEL] Mouse event:', {
        clientX: e.clientX,
        clientY: e.clientY,
        offsetX: (e as unknown as { offsetX?: number }).offsetX,
        offsetY: (e as unknown as { offsetY?: number }).offsetY,
        canvasRect: canvasRef.current?.getBoundingClientRect(),
        dpr: dprRef.current,
        computed: { x, y }
      });
      rustRenderManagerRef.current.handle_wheel(x, y, e.deltaY);
    }
  }, [getRelativeCoords]);

  const handleRightClick = useCallback((e: MouseEvent) => {
    e.preventDefault();
    if (rustRenderManagerRef.current) {
      const { x, y } = getRelativeCoords(e);
      const spriteId = rustRenderManagerRef.current.handle_right_click(x, y);
      
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        spriteId: spriteId || undefined,
        copiedSprite: contextMenu.copiedSprite
      });
    }
  }, [getRelativeCoords, contextMenu.copiedSprite]);

  const handleContextMenuAction = useCallback((action: string) => {
    if (!rustRenderManagerRef.current) return;
    
    const { spriteId, x, y } = contextMenu;
    
    switch (action) {
      case 'delete':
        if (spriteId) {
          rustRenderManagerRef.current.delete_sprite(spriteId);
        }
        break;
      case 'copy':
        if (spriteId) {
          const spriteData = rustRenderManagerRef.current.copy_sprite(spriteId);
          if (spriteData) {
            setContextMenu(prev => ({ ...prev, copiedSprite: spriteData }));
          }
        }
        break;
      case 'paste':
        if (contextMenu.copiedSprite) {
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const canvasX = (x - rect.left) * (canvas.width / rect.width);
            const canvasY = (y - rect.top) * (canvas.height / rect.height);
            const worldCoords = rustRenderManagerRef.current.screen_to_world(canvasX, canvasY);
            rustRenderManagerRef.current.paste_sprite('tokens', contextMenu.copiedSprite, worldCoords[0], worldCoords[1]);
          }
        }
        break;
      case 'resize':
        if (spriteId) {
          const newSize = prompt('Enter new size (width,height):', '64,64');
          if (newSize) {
            const [width, height] = newSize.split(',').map(n => parseFloat(n.trim()));
            if (!isNaN(width) && !isNaN(height)) {
              rustRenderManagerRef.current.resize_sprite(spriteId, width, height);
            }
          }
        }
        break;
      case 'rotate':
        if (spriteId) {
          const angle = prompt('Enter rotation angle (degrees):', '0');
          if (angle) {
            const degrees = parseFloat(angle);
            if (!isNaN(degrees)) {
              rustRenderManagerRef.current.rotate_sprite(spriteId, degrees);
            }
          }
        }
        break;
    }
    
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, [contextMenu]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu({ visible: false, x: 0, y: 0 });
    if (contextMenu.visible) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.visible]);

  useEffect(() => {
  let animationFrameId: number | null = null;
  let mounted = true;
  let resizeObserver: ResizeObserver | null = null;
  // Debounced resize scheduling shared across the effect scope so cleanup can access it
  let resizeTimeout: number | null = null;
  const scheduleResize = () => {
    if (resizeTimeout) {
      window.clearTimeout(resizeTimeout);
    }
    // Debounce final resize until layout is stable (150ms)
    resizeTimeout = window.setTimeout(() => {
      try { resizeCanvas(); } catch (e) { console.error('Scheduled resize failed', e); }
      resizeTimeout = null;
    }, 150);
  };

    // Helper to resize canvas and notify WASM. Preserve the world point
    // currently at the canvas center so the view doesn't jump on resize.
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      const rect = canvas.getBoundingClientRect();

      // Compute world coordinate at canvas center before changing internal size.
      // Use the canvas' current internal pixel size (canvas.width/height) to avoid
      // transient layout differences between CSS rect and internal buffer size.
      let worldCenter: number[] | null = null;
      try {
        const rm: any = window.rustRenderManager;
        if (rm && typeof rm.screen_to_world === 'function') {
          const deviceCenterX = (canvas.width || (rect.width * dpr)) / 2;
          const deviceCenterY = (canvas.height || (rect.height * dpr)) / 2;
          const w = rm.screen_to_world(deviceCenterX, deviceCenterY);
          if (Array.isArray(w) && w.length >= 2) {
            worldCenter = w;
          }
        }
      } catch (err) {
        console.warn('screen_to_world before resize failed:', err);
      }

      // Update canvas internal resolution
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';

      // Notify WASM of resize if method exists. Try common names exported by wasm-bindgen.
      try {
        const rm: any = window.rustRenderManager;
        if (rm) {
          if (typeof rm.resize_canvas === 'function') {
            rm.resize_canvas(canvas.width, canvas.height);
          } else if (typeof rm.resize === 'function') {
            rm.resize(canvas.width, canvas.height);
          } else if (typeof rm.resizeCanvas === 'function') {
            rm.resizeCanvas(canvas.width, canvas.height);
          }
        }
      } catch (err) {
        console.error('WASM resize error:', err);
      }

      // Re-center camera so the same world point stays under the canvas center
      try {
        const rm: any = window.rustRenderManager;
        if (worldCenter && rm) {
          if (typeof rm.center_camera === 'function') {
            rm.center_camera(worldCenter[0], worldCenter[1]);
          } else if (typeof rm.centerCamera === 'function') {
            rm.centerCamera(worldCenter[0], worldCenter[1]);
          }
          // Force a render immediately after resize+recenter to avoid visual lag
          if (typeof rm.render === 'function') {
            rm.render();
          }
        }
      } catch (err) {
        console.error('WASM center_camera after resize failed:', err);
      }
    };

    const loadAndInitWasm = async () => {
      console.log('loadAndInitWasm called');
      try {
        updateConnectionState('connecting');
        console.log('Starting WASM dynamic import...');
        let initWasm, WasmRenderEngine;
        
        // Use proper dynamic import with runtime path construction
        const wasmPath = '/static/ui/wasm/ttrpg_rust_core.js';
        const wasmModule = await import(/* @vite-ignore */ wasmPath);
        window.ttrpg_rust_core = wasmModule;
        console.log('[WASM] window.ttrpg_rust_core:', wasmModule);
        
        initWasm = wasmModule?.default;
        WasmRenderEngine = wasmModule?.RenderEngine;
        
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
        
        resizeCanvas();
        
        console.log('[WASM] Constructing RenderEngine...');
        const rustRenderEngine = new WasmRenderEngine(canvas);
        console.log('[WASM] RenderEngine constructed:', rustRenderEngine);
        
        // Center camera on world origin
        rustRenderEngine.set_camera(0, 0, 1.0);
        rustRenderManagerRef.current = rustRenderEngine;
        window.rustRenderManager = rustRenderEngine;

        // Initialize WASM integration service for protocol-driven updates
        wasmIntegrationService.initialize(rustRenderEngine);
        console.log('[WASM] Integration service initialized');

        // Initialize asset integration service
        assetIntegrationService.initialize();
        console.log('[ASSET] Integration service initialized');

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('wheel', handleWheel);
        canvas.addEventListener('contextmenu', handleRightClick);
        // Set default cursor to grab
        canvas.style.cursor = 'grab';

        // Setup ResizeObserver + window resize hook to schedule debounced canvas resize
        try {
          resizeObserver = new ResizeObserver(() => scheduleResize());
          resizeObserver.observe(canvas);
        } catch (err) {
          console.warn('ResizeObserver unavailable or failed to observe canvas:', err);
        }
        try { window.addEventListener('resize', scheduleResize); } catch (e) { /* ignore */ }

        // Start render loop
        const renderLoop = () => {
          try {
            if (rustRenderManagerRef.current) {
              rustRenderManagerRef.current.render();
            }
            
            // Calculate FPS
            fpsRef.current.frameCount++;
            const currentTime = performance.now();
            if (currentTime - fpsRef.current.lastTime >= 1000) { // Update every second
              setFps(Math.round(fpsRef.current.frameCount * 1000 / (currentTime - fpsRef.current.lastTime)));
              fpsRef.current.frameCount = 0;
              fpsRef.current.lastTime = currentTime;
            }
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
              tint_color: [1.0, 0.5, 0.5, 1.0] // Red tint
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
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      disconnectWebSocket();
      
      // Cleanup WASM integration service
      wasmIntegrationService.dispose();
      
      // Cleanup asset integration service
      assetIntegrationService.dispose();
      
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('wheel', handleWheel);
        canvas.removeEventListener('contextmenu', handleRightClick);
      }
      window.removeEventListener('resize', resizeCanvas);
      // remove debounced listener (scheduleResize may be bound differently in closure)
      try { window.removeEventListener('resize', scheduleResize as EventListener); } catch {}
      if (resizeObserver && canvas) {
        try { resizeObserver.unobserve(canvas); } catch { /* ignore */ }
        try { resizeObserver.disconnect(); } catch { /* ignore */ }
      }
  // Clear any pending timeout
  try { if (typeof resizeTimeout !== 'undefined' && resizeTimeout) window.clearTimeout(resizeTimeout); } catch {}
      resizeObserver = null;
      window.rustRenderManager = undefined;
    };
  }, [updateConnectionState, connectWebSocket, disconnectWebSocket, handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleRightClick]);

  // Debug overlay state
  const [debugCursorScreen, setDebugCursorScreen] = React.useState({ x: 0, y: 0 });
  const [debugCursorWorld, setDebugCursorWorld] = React.useState({ x: 0, y: 0 });
  const [debugGrid, setDebugGrid] = React.useState({ x: 0, y: 0 });

  // Helper to get nearest grid coordinate
  const getGridCoord = (world: { x: number; y: number }, gridSize: number = 50) => {
    return {
      x: Math.round(world.x / gridSize) * gridSize,
      y: Math.round(world.y / gridSize) * gridSize,
    };
  };

  // Mouse move handler for debug overlay - track actual mouse position
  const updateDebugOverlay = React.useCallback((event: MouseEvent) => {
    const rm = rustRenderManagerRef.current;
    const canvas = canvasRef.current;
    if (rm && canvas) {
      try {
        const rect = canvas.getBoundingClientRect();
        const dpr = dprRef.current;
        
        // Get actual mouse position relative to canvas
        const mouseCss = { 
          x: event.clientX - rect.left, 
          y: event.clientY - rect.top 
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

  // Attach debug mouse handler only after WASM is loaded
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', updateDebugOverlay);
      return () => {
        canvas.removeEventListener('mousemove', updateDebugOverlay);
      };
    }
  }, [updateDebugOverlay]);

  return (
    <div className="game-canvas-container" style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        className="game-canvas"
        tabIndex={0}
        style={{ outline: 'none' }}
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
            color: '#333'
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
                  background: 'transparent'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#f0f0f0'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                onClick={() => handleContextMenuAction('delete')}
              >
                Delete Sprite
              </div>
              <div 
                style={{ 
                  padding: '8px 12px', 
                  cursor: 'pointer', 
                  borderBottom: '1px solid #eee',
                  color: '#333',
                  background: 'transparent'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#f0f0f0'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
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
                    background: 'transparent'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#f0f0f0'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleContextMenuAction('paste')}
                >
                  Paste Sprite
                </div>
              )}
              <div 
                style={{ 
                  padding: '8px 12px', 
                  cursor: 'pointer', 
                  borderBottom: '1px solid #eee',
                  color: '#333',
                  background: 'transparent'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#f0f0f0'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                onClick={() => handleContextMenuAction('resize')}
              >
                Resize Sprite
              </div>
              <div 
                style={{ 
                  padding: '8px 12px', 
                  cursor: 'pointer',
                  color: '#333',
                  background: 'transparent'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#f0f0f0'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                onClick={() => handleContextMenuAction('rotate')}
              >
                Rotate Sprite
              </div>
            </>
          ) : (
            // Show paste option when clicking on empty space if there's a copied sprite
            <div>
              {contextMenu.copiedSprite && (
                <div 
                  style={{ 
                    padding: '8px 12px', 
                    cursor: 'pointer',
                    color: '#333',
                    background: 'transparent'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#f0f0f0'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleContextMenuAction('paste')}
                >
                  Paste Sprite
                </div>
              )}
              {!contextMenu.copiedSprite && (
                <div 
                  style={{ 
                    padding: '8px 12px', 
                    color: '#999',
                    background: 'transparent'
                  }}
                >
                  No actions available
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Persistent debug panel */}
      <div style={{
        position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.8)', color: '#0f0',
        fontSize: 14, padding: 10, borderRadius: 8, zIndex: 1000, pointerEvents: 'none', fontFamily: 'monospace', minWidth: 220
      }}>
        <div><b>FPS:</b> <span style={{color: fps > 30 ? '#0f0' : fps > 15 ? '#ff0' : '#f00'}}>{fps}</span></div>
        <div><b>Canvas CSS:</b> {debugPanel.cssWidth} x {debugPanel.cssHeight}</div>
        <div><b>Canvas Device:</b> {debugPanel.deviceWidth} x {debugPanel.deviceHeight}</div>
        <div><b>Mouse CSS:</b> {debugPanel.mouseCss.x.toFixed(1)}, {debugPanel.mouseCss.y.toFixed(1)}</div>
        <div><b>Mouse Device:</b> {debugPanel.mouseDevice.x.toFixed(1)}, {debugPanel.mouseDevice.y.toFixed(1)}</div>
        <div><b>World:</b> {debugPanel.world.x.toFixed(2)}, {debugPanel.world.y.toFixed(2)}</div>
        {activeTable && (
          <>
            <div style={{borderTop: '1px solid #333', marginTop: 8, paddingTop: 8}}>
              <b>Table:</b> {activeTable.table_name}
            </div>
            <div><b>Size:</b> {activeTable.width} x {activeTable.height}</div>
          </>
        )}
      </div>
      {/* Debug overlay near cursor */}
      <DebugOverlay
        cursorScreen={debugCursorScreen}
        cursorWorld={debugCursorWorld}
        grid={debugGrid}
      />
    </div>
  );
}
