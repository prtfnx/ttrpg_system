import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
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
  const { connectionState, updateConnectionState, sprites, selectSprite, selectedSprites } = useGameStore();
  
  // Simple render function for sprites
  const renderFrame = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const { camera } = useGameStore.getState();
    
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    const gridSize = 32 * camera.zoom;
    const offsetX = camera.x % gridSize;
    const offsetY = camera.y % gridSize;
    
    for (let x = offsetX; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    
    for (let y = offsetY; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    // Draw sprites
    sprites.forEach(sprite => {
      const x = (sprite.x - camera.x) * camera.zoom + canvas.width / 2;
      const y = (sprite.y - camera.y) * camera.zoom + canvas.height / 2;
      const w = sprite.width * camera.zoom;
      const h = sprite.height * camera.zoom;
      
      // Draw sprite body
      ctx.fillStyle = selectedSprites.includes(sprite.id) ? '#4ade80' : '#6366f1';
      ctx.fillRect(x, y, w, h);
      
      // Draw sprite border
      ctx.strokeStyle = selectedSprites.includes(sprite.id) ? '#16a34a' : '#4f46e5';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      
      // Draw sprite name
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.max(10, 12 * camera.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(sprite.name, x + w/2, y + h/2 + 4);
    });
  };
  
  // WebSocket integration
  const {
    connect: connectWebSocket,
    disconnect: disconnectWebSocket,
    isConnected: wsConnected,
    sendSpriteMove,
    requestTableData,
    sendMessage
  } = useWebSocket('ws://127.0.0.1:12345/ws');

  useEffect(() => {
    const loadWasm = async () => {
      try {
        updateConnectionState('connecting');
        
        // For now, use simple Canvas API rendering instead of WASM
        // Initialize render manager if canvas is ready
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Set up simple rendering
            setRenderManager({ 
              context: ctx,
              canvas: canvas,
              render_frame: () => renderFrame(ctx, canvas),
              pan_camera: (dx: number, dy: number) => {
                const { camera, updateCamera } = useGameStore.getState();
                updateCamera(camera.x + dx, camera.y + dy);
              },
              zoom_camera: (factor: number) => {
                const { camera, updateCamera } = useGameStore.getState();
                updateCamera(camera.x, camera.y, camera.zoom * factor);
              }
            });
            
            // Start render loop
            const renderLoop = () => {
              try {
                renderFrame(ctx, canvas);
              } catch (error) {
                console.error('Render error:', error);
              }
              requestAnimationFrame(renderLoop);
            };
            requestAnimationFrame(renderLoop);
          }
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
        canvas.focus(); // Focus canvas for keyboard events
        
        const rect = canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;
        
        // Convert canvas coordinates to world coordinates
        const { camera } = useGameStore.getState();
        const worldX = (canvasX - canvas.width / 2) / camera.zoom + camera.x;
        const worldY = (canvasY - canvas.height / 2) / camera.zoom + camera.y;
        
        lastMousePos = { x: canvasX, y: canvasY };
        
        // Check if we clicked on a sprite (using world coordinates)
        const clickedSprite = sprites.find(sprite => {
          return worldX >= sprite.x && worldX <= sprite.x + sprite.width &&
                 worldY >= sprite.y && worldY <= sprite.y + sprite.height;
        });
        
        if (clickedSprite) {
          // Handle sprite selection with multi-select support
          const isMultiSelect = event.ctrlKey || event.metaKey;
          selectSprite(clickedSprite.id, isMultiSelect);
          
          // Start dragging if this sprite is now selected
          if (selectedSprites.includes(clickedSprite.id)) {
            isDragging = true;
            draggedSpriteId = clickedSprite.id;
            canvas.style.cursor = 'grabbing';
          }
        } else {
          // Clear selection if clicking empty space and not multi-selecting
          if (!event.ctrlKey && !event.metaKey) {
            // Clear all selections - we can implement this in the store
            selectedSprites.forEach(id => selectSprite(id, false));
          }
        }
      };
      
      const handleMouseMove = (event: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;
        
        if (isDragging && draggedSpriteId) {
          // Calculate sprite movement delta in world coordinates
          const { camera } = useGameStore.getState();
          const deltaX = (canvasX - lastMousePos.x) / camera.zoom;
          const deltaY = (canvasY - lastMousePos.y) / camera.zoom;
          
          // Find the sprite and move it
          const sprite = sprites.find(s => s.id === draggedSpriteId);
          if (sprite) {
            const newX = sprite.x + deltaX;
            const newY = sprite.y + deltaY;
            
            // Send sprite move via WebSocket
            sendSpriteMove(draggedSpriteId, newX, newY);
          }
          
          lastMousePos = { x: canvasX, y: canvasY };
        } else if (event.buttons === 1 && !isDragging) {
          // Pan camera on drag when not dragging sprites
          const deltaX = canvasX - lastMousePos.x;
          const deltaY = canvasY - lastMousePos.y;
          
          if (renderManager.pan_camera) {
            renderManager.pan_camera(-deltaX, -deltaY);
          }
          
          lastMousePos = { x: canvasX, y: canvasY };
        }
        
        // Update cursor based on hover state
        const { camera } = useGameStore.getState();
        const worldX = (canvasX - canvas.width / 2) / camera.zoom + camera.x;
        const worldY = (canvasY - canvas.height / 2) / camera.zoom + camera.y;
        
        const hoveredSprite = sprites.find(sprite => {
          return worldX >= sprite.x && worldX <= sprite.x + sprite.width &&
                 worldY >= sprite.y && worldY <= sprite.y + sprite.height;
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
      
      const handleKeyDown = (event: KeyboardEvent) => {
        switch (event.key) {
          case 'Delete':
          case 'Backspace':
            // Delete selected sprites
            if (selectedSprites.length > 0) {
              selectedSprites.forEach(id => {
                // Send delete message via WebSocket
                sendMessage('sprite_remove', { id });
              });
            }
            break;
            
          case 'Escape':
            // Clear selection
            selectedSprites.forEach(id => selectSprite(id, false));
            break;
            
          case 'a':
          case 'A':
            if (event.ctrlKey || event.metaKey) {
              // Select all sprites
              event.preventDefault();
              sprites.forEach(sprite => selectSprite(sprite.id, true));
            }
            break;
        }
      };
      
      // Add event listeners
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('wheel', handleWheel);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('resize', resizeCanvas);
      
      // Initial resize
      resizeCanvas();
      
      return () => {
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('wheel', handleWheel);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('resize', resizeCanvas);
      };
    }
  }, [renderManager, sprites, selectedSprites, selectSprite, sendSpriteMove, sendMessage]);

  return (
    <div className="game-canvas-container">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        tabIndex={0}
        style={{ outline: 'none' }}
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
