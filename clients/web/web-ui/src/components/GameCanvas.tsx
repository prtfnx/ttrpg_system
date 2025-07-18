import React, { useRef, useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { Position } from '../types';

interface GameCanvasProps {
  width: number;
  height: number;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState<Position>({ x: 0, y: 0 });
  
  const { 
    sprites, 
    selectedSpriteId, 
    cameraPosition, 
    cameraZoom, 
    gridSize, 
    gridVisible,
    moveCamera,
    setZoom,
    selectSprite
  } = useGameStore();

  // Initialize WASM module (placeholder for now)
  useEffect(() => {
    // TODO: Initialize Rust WASM module
    console.log('Canvas initialized, WASM integration coming soon...');
  }, []);

  // Drawing function
  const draw = (ctx: CanvasRenderingContext2D) => {
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Save context
    ctx.save();
    
    // Apply camera transform
    ctx.translate(width / 2, height / 2);
    ctx.scale(cameraZoom, cameraZoom);
    ctx.translate(-cameraPosition.x, -cameraPosition.y);
    
    // Draw grid
    if (gridVisible) {
      drawGrid(ctx);
    }
    
    // Draw sprites
    sprites.forEach(sprite => {
      if (sprite.visible) {
        drawSprite(ctx, sprite);
      }
    });
    
    // Restore context
    ctx.restore();
  };

  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    const startX = Math.floor(cameraPosition.x / gridSize) * gridSize;
    const startY = Math.floor(cameraPosition.y / gridSize) * gridSize;
    const endX = startX + (width / cameraZoom) + gridSize;
    const endY = startY + (height / cameraZoom) + gridSize;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1 / cameraZoom;
    ctx.beginPath();
    
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    
    ctx.stroke();
  };

  const drawSprite = (ctx: CanvasRenderingContext2D, sprite: any) => {
    // For now, draw rectangles as placeholders
    ctx.fillStyle = sprite.id === selectedSpriteId ? '#ff6b6b' : '#4ecdc4';
    ctx.fillRect(sprite.position.x, sprite.position.y, sprite.width, sprite.height);
    
    // Draw sprite name
    ctx.fillStyle = '#fff';
    ctx.font = `${12 / cameraZoom}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(
      sprite.name, 
      sprite.position.x + sprite.width / 2, 
      sprite.position.y + sprite.height / 2
    );
  };

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      draw(ctx);
      requestAnimationFrame(animate);
    };

    animate();
  }, [sprites, selectedSpriteId, cameraPosition, cameraZoom, gridVisible, gridSize]);

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setIsDragging(true);
    setLastMousePos({ x: mouseX, y: mouseY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const deltaX = (mouseX - lastMousePos.x) / cameraZoom;
    const deltaY = (mouseY - lastMousePos.y) / cameraZoom;

    moveCamera({
      x: cameraPosition.x - deltaX,
      y: cameraPosition.y - deltaY
    });

    setLastMousePos({ x: mouseX, y: mouseY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(cameraZoom * zoomFactor);
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{
        border: '1px solid #333',
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
    />
  );
};
