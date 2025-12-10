import React, { useEffect, useRef, useState } from 'react';
import type { TableInfo } from '../store';
import { tableThumbnailService } from '../services/tableThumbnail.service';
import { wasmIntegrationService } from '../services/wasmIntegration.service';

interface TablePreviewProps {
  table: TableInfo;
  width?: number;
  height?: number;
}

export const TablePreview: React.FC<TablePreviewProps> = ({ 
  table, 
  width = 160, 
  height = 60 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isCancelled = false;

    const renderThumbnail = async () => {
      setIsLoading(true);
      setError(null);

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
          table.id,
          table.width,
          table.height,
          width,
          height,
          false // Don't force refresh, use cache if available
        );

        // Only update if not cancelled
        if (!isCancelled) {
          ctx.putImageData(imageData, 0, 0);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to render table thumbnail:', err);
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render thumbnail');
          
          // Draw error state
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
  }, [table.id, table.width, table.height, width, height]);

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
      title={error || (isLoading ? 'Loading thumbnail...' : `Table: ${table.name}`)}
    />
  );
};
