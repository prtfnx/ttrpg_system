declare global {
  interface Window {
    rustRenderManager?: any;
    ttrpg_rust_core?: any;
  }
}

import { useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useGameStore } from '../store';
import './GameCanvas.css';

export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { updateConnectionState } = useGameStore();
  const { connect: connectWebSocket, disconnect: disconnectWebSocket, requestTableData } = useWebSocket('ws://127.0.0.1:12345/ws');

  // Mouse event handlers must be defined outside useEffect for cleanup
  // We'll use refs to access the latest rustRenderManager and dpr
  const rustRenderManagerRef = useRef<any>(null);
  const dprRef = useRef<number>(1);

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

  return (
    <div className="game-canvas-container">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        tabIndex={0}
        style={{ outline: 'none' }}
      />
      <div className="canvas-overlay">
        <div className="status-indicator">WASM Canvas Ready</div>
      </div>
    </div>
  );
}
