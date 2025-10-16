import React, { useCallback, useEffect, useState } from 'react';// FogPanel.tsx

import { useRenderEngine } from '../hooks/useRenderEngine';
import './PanelStyles.css';

interface FogRectangle {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  mode: 'hide' | 'reveal';
}

export const FogPanel: React.FC = () => {
  const renderer = useRenderEngine();
  const [fogRectangles, setFogRectangles] = useState<FogRectangle[]>([]);
  const [fogDrawMode, setFogDrawMode] = useState<'hide' | 'reveal' | null>(null);
  const [_fogDrawing, setFogDrawing] = useState<{ id: string; startX: number; startY: number } | null>(null);

  // Mouse event handlers for fog drawing
  useEffect(() => {
    if (!renderer || !fogDrawMode) return;

    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    let currentDrawing: { id: string; startX: number; startY: number } | null = null;
    let previewOverlay: HTMLDivElement | null = null;

    const handleMouseDown = (e: MouseEvent) => {
      // Stop event propagation to prevent canvas panning
      e.stopPropagation();
      e.preventDefault();
      
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      
      const [worldX, worldY] = renderer.screen_to_world(screenX, screenY);
      
      const fogId = `fog_${Date.now()}`;
      currentDrawing = { id: fogId, startX: worldX, startY: worldY };
      setFogDrawing(currentDrawing);
      
      // Create preview overlay
      previewOverlay = document.createElement('div');
      previewOverlay.style.position = 'absolute';
      previewOverlay.style.border = fogDrawMode === 'hide' ? '2px solid rgba(0, 0, 0, 0.8)' : '2px solid rgba(255, 255, 0, 0.8)';
      previewOverlay.style.backgroundColor = fogDrawMode === 'hide' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 0, 0.2)';
      previewOverlay.style.pointerEvents = 'none';
      previewOverlay.style.zIndex = '1000';
      previewOverlay.style.left = `${rect.left + screenX}px`;
      previewOverlay.style.top = `${rect.top + screenY}px`;
      document.body.appendChild(previewOverlay);
      
      console.log(`Fog drawing started (${fogDrawMode}): (${worldX}, ${worldY})`);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!currentDrawing || !previewOverlay) return;
      
      e.stopPropagation();
      e.preventDefault();
      
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      
      const [startScreenX, startScreenY] = renderer.world_to_screen(currentDrawing.startX, currentDrawing.startY);
      
      const left = Math.min(startScreenX, screenX);
      const top = Math.min(startScreenY, screenY);
      const width = Math.abs(screenX - startScreenX);
      const height = Math.abs(screenY - startScreenY);
      
      previewOverlay.style.left = `${rect.left + left}px`;
      previewOverlay.style.top = `${rect.top + top}px`;
      previewOverlay.style.width = `${width}px`;
      previewOverlay.style.height = `${height}px`;
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!currentDrawing) return;
      
      // Stop event propagation to prevent canvas panning
      e.stopPropagation();
      e.preventDefault();
      
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      
      const [worldX, worldY] = renderer.screen_to_world(screenX, screenY);
      
      renderer.add_fog_rectangle(
        currentDrawing.id,
        currentDrawing.startX,
        currentDrawing.startY,
        worldX,
        worldY,
        fogDrawMode
      );
      
      const newRect: FogRectangle = {
        id: currentDrawing.id,
        startX: currentDrawing.startX,
        startY: currentDrawing.startY,
        endX: worldX,
        endY: worldY,
        mode: fogDrawMode
      };
      setFogRectangles(prev => [...prev, newRect]);
      
      console.log(`Fog rectangle added (${fogDrawMode}): ${currentDrawing.id} - from (${currentDrawing.startX}, ${currentDrawing.startY}) to (${worldX}, ${worldY})`);
      
      // Clean up preview overlay
      if (previewOverlay && previewOverlay.parentNode) {
        previewOverlay.parentNode.removeChild(previewOverlay);
        previewOverlay = null;
      }
      
      currentDrawing = null;
      setFogDrawing(null);
    };

    // Use capture phase to intercept events before GameCanvas handlers
    canvas.addEventListener('mousedown', handleMouseDown, true);
    canvas.addEventListener('mousemove', handleMouseMove, true);
    canvas.addEventListener('mouseup', handleMouseUp, true);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown, true);
      canvas.removeEventListener('mousemove', handleMouseMove, true);
      canvas.removeEventListener('mouseup', handleMouseUp, true);
      
      // Clean up preview overlay if component unmounts
      if (previewOverlay && previewOverlay.parentNode) {
        previewOverlay.parentNode.removeChild(previewOverlay);
      }
    };
  }, [renderer, fogDrawMode]);

  const handleToggleFogMode = useCallback((mode: 'hide' | 'reveal') => {
    if (fogDrawMode === mode) {
      setFogDrawMode(null);
      console.log('Fog drawing mode disabled');
    } else {
      setFogDrawMode(mode);
      console.log(`Fog drawing mode: ${mode}`);
    }
  }, [fogDrawMode]);

  const handleClearAll = useCallback(() => {
    if (!renderer) return;
    renderer.clear_fog();
    setFogRectangles([]);
    console.log('All fog cleared');
  }, [renderer]);

  const handleHideAll = useCallback(() => {
    if (!renderer) return;
    renderer.hide_entire_table(10000, 10000);
    
    // Update state to reflect the full table fog
    setFogRectangles([{
      id: 'full_table_fog',
      startX: 0,
      startY: 0,
      endX: 10000,
      endY: 10000,
      mode: 'hide'
    }]);
    
    console.log('Entire table hidden with fog');
  }, [renderer]);

  const handleRemoveRectangle = useCallback((id: string) => {
    if (!renderer) return;
    renderer.remove_fog_rectangle(id);
    setFogRectangles(prev => prev.filter(rect => rect.id !== id));
    console.log(`Removed fog rectangle: ${id}`);
  }, [renderer]);

  return (
    <div className="panel-base">
      <div className="panel-header">
        <h3>🌫️ Fog of War</h3>
      </div>
      
      <div className="panel-section">
        <div className="control-group">
          <div style={{ marginBottom: '12px', color: '#888', fontSize: '13px' }}>
            Click a mode button, then click and drag on canvas to draw rectangles
          </div>
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button 
              onClick={() => handleToggleFogMode('hide')}
              disabled={!renderer}
              className={`panel-button ${fogDrawMode === 'hide' ? 'success' : ''}`}
              title="Click and drag on canvas to draw fog hide rectangles"
            >
              {fogDrawMode === 'hide' ? '✓ ' : ''}🌑 Hide Mode
            </button>
            <button 
              onClick={() => handleToggleFogMode('reveal')}
              disabled={!renderer}
              className={`panel-button ${fogDrawMode === 'reveal' ? 'success' : ''}`}
              title="Click and drag on canvas to draw fog reveal rectangles"
            >
              {fogDrawMode === 'reveal' ? '✓ ' : ''}☀️ Reveal Mode
            </button>
            <button 
              onClick={handleHideAll}
              disabled={!renderer}
              className="panel-button"
              title="Cover entire table with fog"
            >
              🌑 Hide All
            </button>
            <button 
              onClick={handleClearAll}
              disabled={!renderer}
              className="panel-button danger"
              title="Remove all fog rectangles"
            >
              🗑️ Clear All
            </button>
          </div>

          {fogDrawMode && (
            <div style={{ 
              marginTop: '12px', 
              padding: '8px', 
              backgroundColor: fogDrawMode === 'hide' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
              border: `1px solid ${fogDrawMode === 'hide' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(34, 197, 94, 0.5)'}`,
              borderRadius: '4px',
              fontSize: '13px',
              color: 'var(--text-primary, #ffffff)'
            }}>
              ✏️ <strong>{fogDrawMode === 'hide' ? 'Hide' : 'Reveal'} Mode Active</strong> - Click and drag on the canvas to draw fog rectangles
            </div>
          )}
        </div>
      </div>

      <div className="panel-section">
        <h4>📋 Fog Rectangles ({fogRectangles.length})</h4>
        <div className="activity-log" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {fogRectangles.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary, #9ca3af)', fontSize: '13px' }}>
              No fog rectangles yet. Click a mode button and draw on the canvas!
            </div>
          ) : (
            fogRectangles.map(rect => (
              <div
                key={rect.id}
                className="activity-item"
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '8px',
                  marginBottom: '4px',
                  backgroundColor: rect.mode === 'hide' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                  border: `1px solid ${rect.mode === 'hide' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                  borderRadius: '4px'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div>
                    <span style={{ fontWeight: '500', color: 'var(--text-primary, #ffffff)' }}>
                      {rect.mode === 'hide' ? '🌑' : '☀️'} {rect.mode.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary, #9ca3af)', marginTop: '2px' }}>
                    ({rect.startX.toFixed(0)}, {rect.startY.toFixed(0)}) → ({rect.endX.toFixed(0)}, {rect.endY.toFixed(0)})
                  </div>
                </div>
                <button
                  className="panel-button danger small"
                  onClick={() => handleRemoveRectangle(rect.id)}
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                  title="Remove this fog rectangle"
                >
                  ❌
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel-section">
        <h4>📊 Statistics</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ 
            padding: '12px', 
            backgroundColor: 'var(--bg-secondary, #374151)', 
            border: '1px solid var(--border-color, #4b5563)',
            borderRadius: '4px', 
            textAlign: 'center' 
          }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary, #ffffff)' }}>
              {fogRectangles.filter(r => r.mode === 'hide').length}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary, #9ca3af)' }}>🌑 Hidden Areas</div>
          </div>
          <div style={{ 
            padding: '12px', 
            backgroundColor: 'var(--bg-secondary, #374151)', 
            border: '1px solid var(--border-color, #4b5563)',
            borderRadius: '4px', 
            textAlign: 'center' 
          }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary, #ffffff)' }}>
              {fogRectangles.filter(r => r.mode === 'reveal').length}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary, #9ca3af)' }}>☀️ Revealed Areas</div>
          </div>
        </div>
      </div>
    </div>
  );
};
