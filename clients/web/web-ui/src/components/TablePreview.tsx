import React, { useEffect, useRef, useState } from 'react';
import { tableThumbnailService } from '../services/tableThumbnail.service';
import { wasmIntegrationService } from '../services/wasmIntegration.service';
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add refresh trigger state
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Listen for table switches to force thumbnail regeneration
  useEffect(() => {
    const handleTableSwitch = () => {
      // Force regeneration by clearing cache
      tableThumbnailService.invalidateThumbnail(table.table_id, width, height);
      
      // Trigger re-render with small delay to allow WASM table switch to complete
      setTimeout(() => {
        setRefreshTrigger(prev => prev + 1);
      }, 100);
    };
    
    window.addEventListener('table-data-received', handleTableSwitch);
    
    return () => {
      window.removeEventListener('table-data-received', handleTableSwitch);
    };
  }, [table.table_id, width, height]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isCancelled = false;

    const renderThumbnail = async () => {
      setIsLoading(true);
      setError(null);
      
      // Draw loading state immediately
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, width, height);
      
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, width - 2, height - 2);
      
      ctx.fillStyle = '#888';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Loading...', width / 2, height / 2);

      try {
        // Get the render engine
        const renderEngine = wasmIntegrationService.getRenderEngine();
        if (!renderEngine) {
          throw new Error('Render engine not initialized');
        }

        // Initialize the thumbnail service if needed
        if (!tableThumbnailService.isInitialized()) {
          tableThumbnailService.initialize(renderEngine);
        }

        // Generate thumbnail using real WASM rendering
        const imageData = await tableThumbnailService.generateThumbnail(
          table.table_id,
          table.width,
          table.height,
          width,
          height,
          false // Don't force refresh, use cache if available
        );

        // Only update if not cancelled
        if (!isCancelled) {
          if (imageData) {
            // Real thumbnail captured from active table
            ctx.putImageData(imageData, 0, 0);
          } else {
            // Table not currently active - draw placeholder
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, width, height);
            
            // Draw grid pattern
            ctx.strokeStyle = '#2a2a2a';
            ctx.lineWidth = 1;
            
            const gridSize = 6;
            const cellWidth = width / gridSize;
            const cellHeight = height / gridSize;

            for (let i = 0; i <= gridSize; i++) {
              ctx.beginPath();
              ctx.moveTo(i * cellWidth, 0);
              ctx.lineTo(i * cellWidth, height);
              ctx.stroke();
              
              ctx.beginPath();
              ctx.moveTo(0, i * cellHeight);
              ctx.lineTo(width, i * cellHeight);
              ctx.stroke();
            }
            
            // Draw border
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, width - 2, height - 2);
            
            // Show "Not Loaded" text
            ctx.fillStyle = '#666';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Not Loaded', width / 2, height / 2);
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to render table thumbnail:', err);
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render thumbnail');
          
          // Draw error state - red border
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(0, 0, width, height);
          
          ctx.strokeStyle = '#ff4444';
          ctx.lineWidth = 2;
          ctx.strokeRect(1, 1, width - 2, height - 2);
          
          ctx.fillStyle = '#ff4444';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('Error', width / 2, height / 2);
          
          setIsLoading(false);
        }
      }
    };

    renderThumbnail();

    return () => {
      isCancelled = true;
    };
  }, [table.table_id, table.width, table.height, width, height, refreshTrigger]);

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
        objectFit: 'contain',
        imageRendering: 'auto',
        opacity: isLoading ? 0.5 : 1,
        transition: 'opacity 0.2s ease-in-out'
      }}
      title={error || (isLoading ? 'Loading thumbnail...' : `Table: ${table.table_name}`)}
    />
  );
};
