import { useProtocol } from '@lib/api';
import clsx from 'clsx';
import React, { useCallback, useEffect, useState } from 'react'; // FogPanel.tsx
import { useRenderEngine } from '../hooks/useRenderEngine';
import styles from './FogPanel.module.css';

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
  const { protocol } = useProtocol();
  const [fogRectangles, setFogRectangles] = useState<FogRectangle[]>([]);
  const [fogDrawMode, setFogDrawMode] = useState<'hide' | 'reveal' | null>(null);
  const [_fogDrawing, setFogDrawing] = useState<{ id: string; startX: number; startY: number } | null>(null);

  // Helper function to send fog updates to server
  const sendFogUpdateToServer = useCallback((updatedRectangles: FogRectangle[]) => {
    if (!protocol || !renderer) return;

    // Get active table ID
    const tableId = (renderer as any).get_active_table_id?.();
    if (!tableId) {
      console.warn('No active table ID, cannot send fog update');
      return;
    }

    // Separate into hide and reveal rectangles
    const hideRectangles = updatedRectangles
      .filter(rect => rect.mode === 'hide')
      .map(rect => [[rect.startX, rect.startY], [rect.endX, rect.endY]] as [[number, number], [number, number]]);
    
    const revealRectangles = updatedRectangles
      .filter(rect => rect.mode === 'reveal')
      .map(rect => [[rect.startX, rect.startY], [rect.endX, rect.endY]] as [[number, number], [number, number]]);

    console.log('🌫️ Sending fog update to server:', { tableId, hideCount: hideRectangles.length, revealCount: revealRectangles.length });
    protocol.updateFog(tableId, hideRectangles, revealRectangles);
  }, [protocol, renderer]);

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
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      
      // Scale to canvas internal resolution (accounts for DPR/HiDPI scaling)
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const screenX = rawX * scaleX;
      const screenY = rawY * scaleY;
      
      const [worldX, worldY] = renderer.screen_to_world(screenX, screenY);
      
      const fogId = `fog_${Date.now()}`;
      currentDrawing = { id: fogId, startX: worldX, startY: worldY };
      setFogDrawing(currentDrawing);
      
      // Create preview overlay (uses display coordinates for DOM positioning)
      previewOverlay = document.createElement('div');
      previewOverlay.style.position = 'absolute';
      previewOverlay.style.border = fogDrawMode === 'hide' ? '2px solid rgba(0, 0, 0, 0.8)' : '2px solid rgba(255, 255, 0, 0.8)';
      previewOverlay.style.backgroundColor = fogDrawMode === 'hide' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 0, 0.2)';
      previewOverlay.style.pointerEvents = 'none';
      previewOverlay.style.zIndex = '1000';
      previewOverlay.style.left = `${rect.left + rawX}px`;
      previewOverlay.style.top = `${rect.top + rawY}px`;
      document.body.appendChild(previewOverlay);
      
      console.log(`Fog drawing started (${fogDrawMode}): (${worldX}, ${worldY})`);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!currentDrawing || !previewOverlay) return;
      
      e.stopPropagation();
      e.preventDefault();
      
      const rect = canvas.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      
      // Scale factor for converting canvas internal coords to display coords
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      const [startScreenX, startScreenY] = renderer.world_to_screen(currentDrawing.startX, currentDrawing.startY);
      
      // Convert canvas internal coordinates back to display coordinates for DOM overlay
      const startDisplayX = startScreenX / scaleX;
      const startDisplayY = startScreenY / scaleY;
      
      const left = Math.min(startDisplayX, rawX);
      const top = Math.min(startDisplayY, rawY);
      const width = Math.abs(rawX - startDisplayX);
      const height = Math.abs(rawY - startDisplayY);
      
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
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      
      // Scale to canvas internal resolution (accounts for DPR/HiDPI scaling)
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const screenX = rawX * scaleX;
      const screenY = rawY * scaleY;
      
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
      
      const updatedRectangles = [...fogRectangles, newRect];
      setFogRectangles(updatedRectangles);
      
      // Send update to server
      sendFogUpdateToServer(updatedRectangles);
      
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
  }, [renderer, fogDrawMode, fogRectangles, sendFogUpdateToServer]);

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
    sendFogUpdateToServer([]); // Send empty update to server
    console.log('All fog cleared');
  }, [renderer, sendFogUpdateToServer]);

  const handleHideAll = useCallback(() => {
    if (!renderer) return;
    // Use active table world bounds so Hide All covers the table only
    const bounds = renderer.get_active_table_world_bounds();
    if (!bounds || bounds.length < 4) return;
    const [startX, startY, width, height] = bounds;

    const endX = startX + width;
    const endY = startY + height;

    renderer.clear_fog();
    renderer.add_fog_rectangle('full_table_fog', startX, startY, endX, endY, 'hide');

    // Update state to reflect the full table fog
    const updatedRectangles = [{
      id: 'full_table_fog',
      startX,
      startY,
      endX,
      endY,
      mode: 'hide' as const
    }];
    setFogRectangles(updatedRectangles);
    
    // Send update to server
    sendFogUpdateToServer(updatedRectangles);

    console.log(`Entire table hidden with fog: (${startX}, ${startY}) to (${endX}, ${endY})`);
  }, [renderer, sendFogUpdateToServer]);

  const handleRemoveRectangle = useCallback((id: string) => {
    if (!renderer) return;
    renderer.remove_fog_rectangle(id);
    const updatedRectangles = fogRectangles.filter(rect => rect.id !== id);
    setFogRectangles(updatedRectangles);
    
    // Send update to server
    sendFogUpdateToServer(updatedRectangles);
    
    console.log(`Removed fog rectangle: ${id}`);
  }, [renderer, fogRectangles, sendFogUpdateToServer]);

  return (
    <div className={styles.panelBase}>
      <div className={styles.panelHeader}>
        <h3>🌫️ Fog of War</h3>
      </div>
      
      <div className={styles.panelSection}>
        <div className={styles.controlGroup}>
          <div style={{ marginBottom: '12px', color: '#888', fontSize: '13px' }}>
            Click a mode button, then click and drag on canvas to draw rectangles
          </div>
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button 
              onClick={() => handleToggleFogMode('hide')}
              disabled={!renderer}
              className={clsx(styles.panelButton, fogDrawMode === 'hide' && styles.success)}
              title="Click and drag on canvas to draw fog hide rectangles"
            >
              {fogDrawMode === 'hide' ? '✓ ' : ''}🌑 Hide Mode
            </button>
            <button 
              onClick={() => handleToggleFogMode('reveal')}
              disabled={!renderer}
              className={clsx(styles.panelButton, fogDrawMode === 'reveal' && styles.success)}
              title="Click and drag on canvas to draw fog reveal rectangles"
            >
              {fogDrawMode === 'reveal' ? '✓ ' : ''}☀️ Reveal Mode
            </button>
            <button 
              onClick={handleHideAll}
              disabled={!renderer}
              className={styles.panelButton}
              title="Cover entire table with fog"
            >
              🌑 Hide All
            </button>
            <button 
              onClick={handleClearAll}
              disabled={!renderer}
              className={clsx(styles.panelButton, styles.danger)}
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

      <div className={styles.panelSection}>
        <h4>Fog Rectangles ({fogRectangles.length})</h4>
        <div className={styles.activityLog} style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {fogRectangles.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary, #9ca3af)', fontSize: '13px' }}>
              No fog rectangles yet. Click a mode button and draw on the canvas!
            </div>
          ) : (
            fogRectangles.map(rect => (
              <div
                key={rect.id}
                className={styles.activityItem}
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
                  className={clsx(styles.panelButton, styles.danger, styles.small)}
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

      <div className={styles.panelSection}>
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
