import React, { useEffect, useRef } from 'react';
import type { TableInfo } from '../store';

interface TablePreviewProps {
  table: TableInfo;
  width?: number;
  height?: number;
}

export const TablePreview: React.FC<TablePreviewProps> = ({ 
  table, 
  width = 160, 
  height = 120 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate aspect ratio
    const tableAspect = table.width / table.height;
    const canvasAspect = width / height;
    
    let renderWidth = width;
    let renderHeight = height;
    let offsetX = 0;
    let offsetY = 0;

    // Fit to canvas while maintaining aspect ratio
    if (tableAspect > canvasAspect) {
      renderHeight = width / tableAspect;
      offsetY = (height - renderHeight) / 2;
    } else {
      renderWidth = height * tableAspect;
      offsetX = (width - renderWidth) / 2;
    }

    // Draw background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(offsetX, offsetY, renderWidth, renderHeight);

    // Draw grid pattern (subtle)
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    
    const gridSize = 10; // Number of grid lines
    const cellWidth = renderWidth / gridSize;
    const cellHeight = renderHeight / gridSize;

    // Vertical lines
    for (let i = 0; i <= gridSize; i++) {
      const x = offsetX + i * cellWidth;
      ctx.beginPath();
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + renderHeight);
      ctx.stroke();
    }

    // Horizontal lines
    for (let i = 0; i <= gridSize; i++) {
      const y = offsetY + i * cellHeight;
      ctx.beginPath();
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + renderWidth, y);
      ctx.stroke();
    }

    // Draw border
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, renderWidth, renderHeight);

    // Draw entities as dots (if we have entity data)
    // Note: This would require entity data to be passed in the table info
    // For now, we'll show a placeholder pattern
    if (table.entity_count && table.entity_count > 0) {
      ctx.fillStyle = '#0078d4';
      
      // Draw some sample entity dots (in a real implementation, 
      // we'd get actual entity positions)
      const dotCount = Math.min(table.entity_count, 20);
      for (let i = 0; i < dotCount; i++) {
        const x = offsetX + Math.random() * renderWidth;
        const y = offsetY + Math.random() * renderHeight;
        const radius = 3;
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  }, [table, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="table-preview-canvas"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        minHeight: '120px',
        imageRendering: 'crisp-edges'
      }}
    />
  );
};
