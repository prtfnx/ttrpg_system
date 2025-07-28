declare global {
  interface Window {
    rustRenderManager?: any;
    ttrpg_rust_core?: any;
  }
}

// Persistent debug panel for canvas/mouse/world info
import type { RefObject } from 'react';
function useCanvasDebug(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  rustRenderManagerRef: RefObject<any>,
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

import React, { useEffect, useRef, useState } from 'react';
import { DebugOverlay } from './DebugOverlay';
import { useWebSocket } from '../hooks/useWebSocket';
import { useGameStore } from '../store';
import './GameCanvas.css';

export const GameCanvas: React.FC = () => {

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rustRenderManagerRef = useRef<any>(null);
  const dprRef = useRef<number>(1);
  const { updateConnectionState } = useGameStore();
  const { connect: connectWebSocket, disconnect: disconnectWebSocket, requestTableData } = useWebSocket('ws://127.0.0.1:12345/ws');
  const debugPanel = useCanvasDebug(canvasRef as React.RefObject<HTMLCanvasElement | null>, rustRenderManagerRef, dprRef);

  const getRelativeCoords = (e: MouseEvent | WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const dpr = dprRef.current;
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;
    return { x, y };
  };

  const handleMouseDown = (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Pan/drag mode: set cursor to grabbing
      canvas.style.cursor = 'grabbing';
    }
    if (rustRenderManagerRef.current) {
      const { x, y } = getRelativeCoords(e);
      rustRenderManagerRef.current.handle_mouse_down(x, y);
    }
  };
  const handleMouseMove = (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (canvas && rustRenderManagerRef.current && rustRenderManagerRef.current.get_drag_mode) {
      // Use get_drag_mode from WASM for reliable cursor style changes
      const mode = rustRenderManagerRef.current.get_drag_mode();
      let cursor = 'grab';
      if (mode === 'ResizeSprite') {
        cursor = 'nwse-resize';
      } else if (mode === 'MoveSprite') {
        cursor = 'grabbing';
      } else if (mode === 'Camera') {
        cursor = 'grabbing';
      } else {
        cursor = 'grab';
      }
      canvas.style.cursor = cursor;
    }
    if (rustRenderManagerRef.current) {
      const { x, y } = getRelativeCoords(e);
      rustRenderManagerRef.current.handle_mouse_move(x, y);
    }
  };
  const handleMouseUp = (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Reset cursor to grab after mouse up
      canvas.style.cursor = 'grab';
    }
    if (rustRenderManagerRef.current) {
      const { x, y } = getRelativeCoords(e);
      rustRenderManagerRef.current.handle_mouse_up(x, y);
    }
  };
  const handleWheel = (e: WheelEvent) => {
    if (rustRenderManagerRef.current) {
      e.preventDefault();
      const { x, y } = getRelativeCoords(e);
      // Debug: log mouse coordinates and DPR
      console.log('[WHEEL] Mouse event:', {
        clientX: e.clientX,
        clientY: e.clientY,
        offsetX: (e as any).offsetX,
        offsetY: (e as any).offsetY,
        canvasRect: canvasRef.current?.getBoundingClientRect(),
        dpr: dprRef.current,
        computed: { x, y }
      });
      rustRenderManagerRef.current.handle_wheel(x, y, e.deltaY);
    }
  };

  useEffect(() => {
    let animationFrameId: number | null = null;
    let mounted = true;

    // Helper to resize canvas and notify WASM
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      // Notify WASM of resize if method exists
      try {
        if (window.rustRenderManager && window.rustRenderManager.resize) {
          window.rustRenderManager.resize(canvas.width, canvas.height);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('WASM resize error:', err);
      }
    };

    const loadAndInitWasm = async () => {
      console.log('loadAndInitWasm called');
      try {
        updateConnectionState('connecting');
        console.log('Starting WASM dynamic import...');
        let initWasm, RenderManager;
        try {
          // Inject the WASM glue file as a <script> tag at runtime
          // Inject ES module glue file as <script type="module"> at runtime
          let wasmModule;
          try {
            // Use eval to perform dynamic import at runtime, avoiding Vite/Rollup resolution
            wasmModule = await eval('import("/static/ui/wasm/ttrpg_rust_core.js")');
            window.ttrpg_rust_core = wasmModule;
            console.log('[WASM] window.ttrpg_rust_core:', wasmModule);
          } catch (wasmErr) {
            console.error('[WASM] dynamic import via eval failed:', wasmErr);
            updateConnectionState('error');
            return;
          }
          initWasm = wasmModule?.default;
          RenderManager = wasmModule?.RenderManager;
          if (!initWasm) {
            console.error('[WASM] initWasm is undefined!', wasmModule);
            updateConnectionState('error');
            return;
          }
          if (!RenderManager) {
            console.error('[WASM] RenderManager is undefined!', wasmModule);
            updateConnectionState('error');
            return;
          }
          console.log('[WASM] WASM module loaded, calling initWasm...');
          try {
            await initWasm();
            console.log('[WASM] initWasm completed');
          } catch (initErr) {
            console.error('[WASM] initWasm failed:', initErr);
            updateConnectionState('error');
            return;
          }
          const canvas = canvasRef.current;
          if (!canvas) {
            console.error('[WASM] Canvas is null!');
            updateConnectionState('error');
            return;
          }
          resizeCanvas();
          console.log('[WASM] Constructing RenderManager...');
          let rustRenderManager;
          try {
            rustRenderManager = new RenderManager(canvas);
            console.log('[WASM] RenderManager constructed:', rustRenderManager);
            rustRenderManagerRef.current = rustRenderManager;
            window.rustRenderManager = rustRenderManager;
          } catch (rmErr) {
            console.error('[WASM] RenderManager construction failed:', rmErr);
            updateConnectionState('error');
            return;
          }
        } catch (wasmErr) {
          console.error('WASM script injection failed:', wasmErr);
          updateConnectionState('error');
          return;
        }

        try {
          await initWasm();
          console.log('WASM initialized!');
        } catch (initErr) {
          console.error('initWasm failed:', initErr);
          updateConnectionState('error');
          return;
        }

        if (!mounted) {
          console.warn('Component not mounted, aborting WASM init');
          return;
        }
        const canvas = canvasRef.current;
        if (!canvas) {
          console.error('Canvas is null!');
          updateConnectionState('error');
          return;
        }
        resizeCanvas();

        console.log('Constructing RenderManager...');
        try {
          const rustRenderManager = new RenderManager(canvas);
          console.log('RenderManager constructed:', rustRenderManager);
          rustRenderManagerRef.current = rustRenderManager;
          window.rustRenderManager = rustRenderManager;
        } catch (rmErr) {
          console.error('RenderManager construction failed:', rmErr);
          updateConnectionState('error');
          return;
        }

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('wheel', handleWheel);
        // Set default cursor to grab
        canvas.style.cursor = 'grab';

        // Start render loop
        const renderLoop = () => {
          try {
            rustRenderManagerRef.current.render();
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Rust WASM render error:', error);
          }
          if (mounted) animationFrameId = requestAnimationFrame(renderLoop);
        };
        animationFrameId = requestAnimationFrame(renderLoop);

        // Listen for window resize
        window.addEventListener('resize', resizeCanvas);

        // Connect to WebSocket after WASM is loaded
        try {
          await connectWebSocket();
          requestTableData();
          updateConnectionState('connected');
        } catch (wsErr) {
          console.error('WebSocket connection failed:', wsErr);
          updateConnectionState('error');
        }
      } catch (error) {
        // eslint-disable-next-line no-console
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
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('wheel', handleWheel);
      }
      window.removeEventListener('resize', resizeCanvas);
      window.rustRenderManager = undefined;
    };
  }, [updateConnectionState, connectWebSocket, disconnectWebSocket, requestTableData]);

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

  // Mouse move handler for debug overlay

  // Attach debug mouse handler only after WASM is loaded
  React.useEffect(() => {
    let rafId: number | null = null;
    const pollOverlay = () => {
      const rm = rustRenderManagerRef.current;
      if (rm && typeof rm.get_cursor_coords === 'function') {
        try {
          const coords = rm.get_cursor_coords();
          if (coords && coords.screen && coords.world) {
            setDebugCursorScreen(coords.screen);
            setDebugCursorWorld(coords.world);
            setDebugGrid(getGridCoord(coords.world));
          } else if (typeof coords === 'object' && coords !== null && 'screen' in coords && 'world' in coords) {
            setDebugCursorScreen(coords.screen);
            setDebugCursorWorld(coords.world);
            setDebugGrid(getGridCoord(coords.world));
          }
        } catch (err) {
          // ignore
        }
      }
      rafId = requestAnimationFrame(pollOverlay);
    };
    rafId = requestAnimationFrame(pollOverlay);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="game-canvas-container" style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        className="game-canvas"
        tabIndex={0}
        style={{ outline: 'none' }}
      />
      <div className="canvas-overlay">
        <div className="status-indicator">WASM Canvas Ready</div>
      </div>
      {/* Persistent debug panel */}
      <div style={{
        position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.8)', color: '#0f0',
        fontSize: 14, padding: 10, borderRadius: 8, zIndex: 1000, pointerEvents: 'none', fontFamily: 'monospace', minWidth: 220
      }}>
        <div><b>Canvas CSS:</b> {debugPanel.cssWidth} x {debugPanel.cssHeight}</div>
        <div><b>Canvas Device:</b> {debugPanel.deviceWidth} x {debugPanel.deviceHeight}</div>
        <div><b>Mouse CSS:</b> {debugPanel.mouseCss.x.toFixed(1)}, {debugPanel.mouseCss.y.toFixed(1)}</div>
        <div><b>Mouse Device:</b> {debugPanel.mouseDevice.x.toFixed(1)}, {debugPanel.mouseDevice.y.toFixed(1)}</div>
        <div><b>World:</b> {debugPanel.world.x.toFixed(2)}, {debugPanel.world.y.toFixed(2)}</div>
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
