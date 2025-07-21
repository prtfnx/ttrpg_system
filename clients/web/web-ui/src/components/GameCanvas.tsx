import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import './GameCanvas.css';

declare global {
  interface Window {
    wasmModule?: any;
  }
}

export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderManager, setRenderManager] = useState<any>(null);
  const { connectionState, updateConnectionState, sprites } = useGameStore();
  
  // WebSocket integration
  const {
    connect: connectWebSocket,
    disconnect: disconnectWebSocket,
    isConnected: wsConnected,
    sendSpriteMove,
    requestTableData
  } = useWebSocket('ws://localhost:8000/ws');

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
        
        // Connect to WebSocket after WASM is loaded
        await connectWebSocket();
        
        // Request initial table data
        requestTableData();
        
        updateConnectionState('connected');
      } catch (error) {
        console.error('Failed to load WASM module:', error);
        updateConnectionState('error');
      }
    };

    loadWasm();

    // Cleanup on unmount
    return () => {
      disconnectWebSocket();
    };
  }, [updateConnectionState, connectWebSocket, disconnectWebSocket, requestTableData]);

  useEffect(() => {
    if (renderManager && canvasRef.current) {
      const canvas = canvasRef.current;
      let isDragging = false;
      let draggedSpriteId: string | null = null;
      let lastMousePos = { x: 0, y: 0 };
      
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
        
        lastMousePos = { x, y };
        
        // Check if we clicked on a sprite
        const clickedSprite = sprites.find(sprite => {
          return x >= sprite.x && x <= sprite.x + sprite.width &&
                 y >= sprite.y && y <= sprite.y + sprite.height;
        });
        
        if (clickedSprite) {
          isDragging = true;
          draggedSpriteId = clickedSprite.id;
          canvas.style.cursor = 'grabbing';
        }
      };
      
      const handleMouseMove = (event: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        if (isDragging && draggedSpriteId) {
          // Calculate sprite movement delta
          const deltaX = x - lastMousePos.x;
          const deltaY = y - lastMousePos.y;
          
          // Find the sprite and move it
          const sprite = sprites.find(s => s.id === draggedSpriteId);
          if (sprite) {
            const newX = sprite.x + deltaX;
            const newY = sprite.y + deltaY;
            
            // Send sprite move via WebSocket
            sendSpriteMove(draggedSpriteId, newX, newY);
          }
          
          lastMousePos = { x, y };
        } else if (event.buttons === 1 && renderManager.pan_camera && !isDragging) {
          // Pan camera on drag when not dragging sprites
          renderManager.pan_camera(event.movementX, event.movementY);
        }
        
        // Update cursor based on hover state
        const hoveredSprite = sprites.find(sprite => {
          return x >= sprite.x && x <= sprite.x + sprite.width &&
                 y >= sprite.y && y <= sprite.y + sprite.height;
        });
        
        canvas.style.cursor = hoveredSprite ? 'grab' : 'crosshair';
      };
      
      const handleMouseUp = () => {
        isDragging = false;
        draggedSpriteId = null;
        canvas.style.cursor = 'crosshair';
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
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('wheel', handleWheel);
      window.addEventListener('resize', resizeCanvas);
      
      // Initial resize
      resizeCanvas();
      
      return () => {
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('wheel', handleWheel);
        window.removeEventListener('resize', resizeCanvas);
      };
    }
  }, [renderManager, sprites, sendSpriteMove]);

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
          {connectionState === 'connecting' && 'Connecting...'}
          {connectionState === 'connected' && wsConnected && 'Ready'}
          {connectionState === 'connected' && !wsConnected && 'WASM Ready'}
          {connectionState === 'error' && 'Connection Error'}
          {connectionState === 'disconnected' && 'Disconnected'}
        </div>
        
        {/* WebSocket status */}
        <div className={`ws-status ${wsConnected ? 'ws-connected' : 'ws-disconnected'}`}>
          WebSocket: {wsConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    </div>
  );
};
