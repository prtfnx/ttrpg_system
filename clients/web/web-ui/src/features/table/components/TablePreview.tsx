import { wasmIntegrationService } from '@lib/wasm';
import React, { useEffect, useRef, useState } from 'react';
import { tableThumbnailService } from '../services/tableThumbnail.service';
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
  
  // Expose regenerate method globally for debugging
  React.useEffect(() => {
    (window as any).__regenerateThumbnail = (tableId: string) => {
      if (tableId === table.table_id) {
        console.log(`[TablePreview] Manual regeneration triggered for ${tableId}`);
        tableThumbnailService.invalidateThumbnail(table.table_id, width, height);
        setRefreshTrigger(prev => prev + 1);
      }
    };
  }, [table.table_id, width, height]);
  
  // Listen for sprite loading completion to trigger thumbnail regeneration
  useEffect(() => {
    const handleSpritesLoaded = (event: Event) => {
      const customEvent = event as CustomEvent<{ tableId: string; spriteCount: number; timestamp: number }>;
      const { tableId, spriteCount } = customEvent.detail;
      
      // Only regenerate thumbnail if this event is for our table
      if (tableId === table.table_id) {
        console.log(`[TablePreview] Sprites loaded for table ${tableId} (${spriteCount} sprites), regenerating thumbnail`);
        
        // Force regeneration by clearing cache
        tableThumbnailService.invalidateThumbnail(table.table_id, width, height);
        
        // Trigger immediate thumbnail generation
        setRefreshTrigger(prev => prev + 1);
      }
    };
    
    window.addEventListener('table-sprites-loaded', handleSpritesLoaded);
    
    return () => {
      window.removeEventListener('table-sprites-loaded', handleSpritesLoaded);
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
            console.log(`[TablePreview] Rendering thumbnail for ${table.table_id}: ${imageData.width}x${imageData.height}`);
            ctx.putImageData(imageData, 0, 0);
          } else {
            // Table not active - show "Not Loaded" placeholder
            console.log(`[TablePreview] Table ${table.table_id} not active, showing placeholder`);
            
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, width, height);
            
            // Draw dashed border
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.strokeRect(2, 2, width - 4, height - 4);
            ctx.setLineDash([]);
            
            // Draw icon (table symbol)
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 2;
            const iconSize = 32;
            const iconX = width / 2;
            const iconY = height / 2 - 10;
            
            // Draw simple table icon (grid)
            ctx.strokeRect(iconX - iconSize/2, iconY - iconSize/2, iconSize, iconSize);
            ctx.beginPath();
            ctx.moveTo(iconX - iconSize/2, iconY - iconSize/6);
            ctx.lineTo(iconX + iconSize/2, iconY - iconSize/6);
            ctx.moveTo(iconX - iconSize/2, iconY + iconSize/6);
            ctx.lineTo(iconX + iconSize/2, iconY + iconSize/6);
            ctx.moveTo(iconX - iconSize/6, iconY - iconSize/2);
            ctx.lineTo(iconX - iconSize/6, iconY + iconSize/2);
            ctx.moveTo(iconX + iconSize/6, iconY - iconSize/2);
            ctx.lineTo(iconX + iconSize/6, iconY + iconSize/2);
            ctx.stroke();
            
            // Draw text
            ctx.fillStyle = '#888';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('Not Loaded', width / 2, height / 2 + 20);
            ctx.font = '9px sans-serif';
            ctx.fillStyle = '#666';
            ctx.fillText('(Switch to table to preview)', width / 2, height / 2 + 34);
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
