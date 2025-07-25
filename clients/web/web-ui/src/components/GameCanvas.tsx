
import { useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useGameStore } from '../store';
import './GameCanvas.css';
// @ts-ignore
import initWasm, { RenderManager } from '/static/ui/wasm/ttrpg_rust_core.js';



export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { connectionState, updateConnectionState } = useGameStore();
  const { connect: connectWebSocket, disconnect: disconnectWebSocket, isConnected: wsConnected, requestTableData } = useWebSocket('ws://127.0.0.1:12345/ws');

  useEffect(() => {
    let rustRenderManager: any = null;
    let animationFrameId: number | null = null;
    let mounted = true;

    const loadAndInitWasm = async () => {
      try {
        updateConnectionState('connecting');
        await initWasm();

        if (!mounted) return;
        const canvas = canvasRef.current;
        if (canvas) {
          rustRenderManager = RenderManager.new(canvas);
          // Start render loop
          const renderLoop = () => {
            try {
              rustRenderManager.render();
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('Rust WASM render error:', error);
            }
            if (mounted) animationFrameId = requestAnimationFrame(renderLoop);
          };
          animationFrameId = requestAnimationFrame(renderLoop);
        }

        // Connect to WebSocket after WASM is loaded
        await connectWebSocket();
        requestTableData();
        updateConnectionState('connected');
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
        <div className={`status-indicator status-${connectionState}`}>
          {connectionState === 'connecting' && 'Connecting...'}
          {connectionState === 'connected' && wsConnected && 'Ready'}
          {connectionState === 'connected' && !wsConnected && 'WASM Ready'}
          {connectionState === 'error' && 'Connection Error'}
          {connectionState === 'disconnected' && 'Disconnected'}
        </div>
        <div className={`ws-status ${wsConnected ? 'ws-connected' : 'ws-disconnected'}`}>
          WebSocket: {wsConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    </div>
  );
};
