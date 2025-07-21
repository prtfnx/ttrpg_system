import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store';
import './GameCanvas.css';

declare global {
  interface Window {
    wasmModule?: any;
  }
}

export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderManager, setRenderManager] = useState<any>(null);
  const { connectionState, updateConnectionState } = useGameStore();

  useEffect(() => {
    const loadWasm = async () => {
      try {
        updateConnectionState('connecting');
        
        // Load the WASM module from public directory
        const wasmScript = document.createElement('script');
        wasmScript.src = '/wasm/ttrpg_rust_core.js';
        wasmScript.type = 'module';
        
        await new Promise((resolve, reject) => {
          wasmScript.onload = resolve;
          wasmScript.onerror = reject;
          document.head.appendChild(wasmScript);
        });
        
        // Wait for the WASM to be ready and access it from window
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Initialize render manager if canvas is ready
        if (canvasRef.current && window.wasmModule) {
          const manager = new window.wasmModule.RenderManager(canvasRef.current);
          setRenderManager(manager);
          
          // Start render loop
          const renderLoop = () => {
            try {
              manager.render_frame();
            } catch (error) {
              console.error('Render error:', error);
            }
            requestAnimationFrame(renderLoop);
          };
          requestAnimationFrame(renderLoop);
        }
        
        updateConnectionState('connected');
      } catch (error) {
        console.error('Failed to load WASM module:', error);
        updateConnectionState('error');
      }
    };

    loadWasm();
  }, [updateConnectionState]);

  useEffect(() => {
    if (renderManager && canvasRef.current) {
      const canvas = canvasRef.current;
      
      // Handle canvas resize
      const resizeCanvas = () => {
        const rect = canvas.parentElement?.getBoundingClientRect();
        if (rect) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
      };
      
      // Handle mouse events
      const handleMouseDown = (event: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Convert to world coordinates and handle sprite selection
        if (renderManager.screen_to_world) {
          const worldPos = renderManager.screen_to_world(x, y);
          console.log('Mouse clicked at world position:', worldPos);
        }
      };
      
      const handleMouseMove = (event: MouseEvent) => {
        if (event.buttons === 1 && renderManager.pan_camera) {
          // Pan camera on drag
          renderManager.pan_camera(event.movementX, event.movementY);
        }
      };
      
      const handleWheel = (event: WheelEvent) => {
        event.preventDefault();
        if (renderManager.zoom_camera) {
          const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
          renderManager.zoom_camera(zoomFactor);
        }
      };
      
      // Add event listeners
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('wheel', handleWheel);
      window.addEventListener('resize', resizeCanvas);
      
      // Initial resize
      resizeCanvas();
      
      return () => {
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('wheel', handleWheel);
        window.removeEventListener('resize', resizeCanvas);
      };
    }
  }, [renderManager]);

  return (
    <div className="game-canvas-container">
      <canvas
        ref={canvasRef}
        className="game-canvas"
      />
      
      {/* Status indicator */}
      <div className="canvas-overlay">
        <div 
          className={`status-indicator status-${connectionState}`}
        >
          {connectionState === 'connecting' && 'Loading WASM...'}
          {connectionState === 'connected' && 'Ready'}
          {connectionState === 'error' && 'Error loading'}
          {connectionState === 'disconnected' && 'Disconnected'}
        </div>
      </div>
    </div>
  );
};
