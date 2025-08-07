import React, { useCallback, useState } from 'react';
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
  const engine = useRenderEngine();
  const [fogRectangles, setFogRectangles] = useState<FogRectangle[]>([]);
  const [selectedRectId, setSelectedRectId] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<'hide' | 'reveal'>('hide');
  const [isGmMode, setIsGmMode] = useState(false);

  const addFogRectangle = useCallback((startX: number, startY: number, endX: number, endY: number, mode: 'hide' | 'reveal') => {
    if (!engine) return;

    const id = `fog_${mode}_${Date.now()}`;
    const newRect: FogRectangle = {
      id,
      startX,
      startY,
      endX,
      endY,
      mode,
    };

    engine.add_fog_rectangle(id, startX, startY, endX, endY, mode);
    setFogRectangles(prev => [...prev, newRect]);
  }, [engine]);

  const removeFogRectangle = useCallback((id: string) => {
    if (!engine) return;

    engine.remove_fog_rectangle(id);
    setFogRectangles(prev => prev.filter(rect => rect.id !== id));
    if (selectedRectId === id) {
      setSelectedRectId(null);
    }
  }, [engine, selectedRectId]);

  const clearAllFog = useCallback(() => {
    if (!engine) return;

    engine.clear_fog();
    setFogRectangles([]);
    setSelectedRectId(null);
  }, [engine]);

  const hideEntireTable = useCallback(() => {
    if (!engine) return;

    // Assume table size - in real implementation, get from table properties
    const tableWidth = 1000;
    const tableHeight = 800;
    
    clearAllFog();
    addFogRectangle(0, 0, tableWidth, tableHeight, 'hide');
  }, [engine, clearAllFog, addFogRectangle]);

  const toggleGmMode = useCallback(() => {
    if (!engine) return;

    const newGmMode = !isGmMode;
    setIsGmMode(newGmMode);
    engine.set_gm_mode(newGmMode);
  }, [engine, isGmMode]);

  const selectedRect = fogRectangles.find(rect => rect.id === selectedRectId);

  return (
    <div className={styles['fog-panel']}>
      <h3>Fog of War</h3>
      
      {/* GM Mode Toggle */}
      <div className={styles['gm-mode']}>
        <label>
          <input
            type="checkbox"
            checked={isGmMode}
            onChange={toggleGmMode}
          />
          GM Mode (see through fog)
        </label>
      </div>

      {/* Drawing Mode */}
      <div className={styles['drawing-mode']}>
        <h4>Drawing Mode</h4>
        <div className={styles['mode-buttons']}>
          <button
            className={`${styles['mode-button']} ${currentMode === 'hide' ? styles.active : ''}`}
            onClick={() => setCurrentMode('hide')}
          >
            Hide Areas
          </button>
          <button
            className={`${styles['mode-button']} ${currentMode === 'reveal' ? styles.active : ''}`}
            onClick={() => setCurrentMode('reveal')}
          >
            Reveal Areas
          </button>
        </div>
      </div>

      {/* Manual Rectangle Entry */}
      <div className={styles['manual-entry']}>
        <h4>Add Rectangle</h4>
        <div className={styles['coords-input']}>
          <input
            type="number"
            placeholder="Start X"
            id="fog-startX"
          />
          <input
            type="number"
            placeholder="Start Y"
            id="fog-startY"
          />
          <input
            type="number"
            placeholder="End X"
            id="fog-endX"
          />
          <input
            type="number"
            placeholder="End Y"
            id="fog-endY"
          />
          <button
            onClick={() => {
              const startX = parseFloat((document.getElementById('fog-startX') as HTMLInputElement).value) || 0;
              const startY = parseFloat((document.getElementById('fog-startY') as HTMLInputElement).value) || 0;
              const endX = parseFloat((document.getElementById('fog-endX') as HTMLInputElement).value) || 100;
              const endY = parseFloat((document.getElementById('fog-endY') as HTMLInputElement).value) || 100;
              addFogRectangle(startX, startY, endX, endY, currentMode);
              
              // Clear inputs
              (document.getElementById('fog-startX') as HTMLInputElement).value = '';
              (document.getElementById('fog-startY') as HTMLInputElement).value = '';
              (document.getElementById('fog-endX') as HTMLInputElement).value = '';
              (document.getElementById('fog-endY') as HTMLInputElement).value = '';
            }}
          >
            Add {currentMode === 'hide' ? 'Hide' : 'Reveal'} Rectangle
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className={styles['quick-actions']}>
        <h4>Quick Actions</h4>
        <div className={styles['action-buttons']}>
          <button onClick={hideEntireTable}>
            Hide Entire Table
          </button>
          <button onClick={clearAllFog} disabled={fogRectangles.length === 0}>
            Reveal All (Clear Fog)
          </button>
        </div>
      </div>

      {/* Fog Rectangle List */}
      <div className={styles['fog-list']}>
        <h4>Fog Rectangles ({fogRectangles.length})</h4>
        {fogRectangles.map(rect => (
          <div
            key={rect.id}
            className={`${styles['fog-item']} ${selectedRectId === rect.id ? styles.selected : ''}`}
            onClick={() => setSelectedRectId(rect.id)}
          >
            <div className={styles['fog-header']}>
              <span className={`${styles['fog-mode']} ${styles[rect.mode]}`}>
                {rect.mode === 'hide' ? '🌫️' : '👁️'} {rect.mode.toUpperCase()}
              </span>
              <button
                className={styles['remove-button']}
                onClick={(e) => {
                  e.stopPropagation();
                  removeFogRectangle(rect.id);
                }}
              >
                ❌
              </button>
            </div>
            <div className={styles['fog-coords']}>
              ({rect.startX.toFixed(0)}, {rect.startY.toFixed(0)}) → 
              ({rect.endX.toFixed(0)}, {rect.endY.toFixed(0)})
            </div>
          </div>
        ))}
      </div>

      {/* Selected Rectangle Properties */}
      {selectedRect && (
        <div className={styles['fog-properties']}>
          <h4>Properties: {selectedRect.id}</h4>
          <div className={styles['property-group']}>
            <label>Start Position</label>
            <div className={styles['position-controls']}>
              <input
                type="number"
                value={selectedRect.startX}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0;
                  setFogRectangles(prev => prev.map(rect => 
                    rect.id === selectedRect.id 
                      ? { ...rect, startX: newValue }
                      : rect
                  ));
                  if (engine) {
                    engine.add_fog_rectangle(
                      selectedRect.id, 
                      newValue, selectedRect.startY, 
                      selectedRect.endX, selectedRect.endY, 
                      selectedRect.mode
                    );
                  }
                }}
              />
              <input
                type="number"
                value={selectedRect.startY}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0;
                  setFogRectangles(prev => prev.map(rect => 
                    rect.id === selectedRect.id 
                      ? { ...rect, startY: newValue }
                      : rect
                  ));
                  if (engine) {
                    engine.add_fog_rectangle(
                      selectedRect.id, 
                      selectedRect.startX, newValue, 
                      selectedRect.endX, selectedRect.endY, 
                      selectedRect.mode
                    );
                  }
                }}
              />
            </div>
          </div>

          <div className={styles['property-group']}>
            <label>End Position</label>
            <div className={styles['position-controls']}>
              <input
                type="number"
                value={selectedRect.endX}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0;
                  setFogRectangles(prev => prev.map(rect => 
                    rect.id === selectedRect.id 
                      ? { ...rect, endX: newValue }
                      : rect
                  ));
                  if (engine) {
                    engine.add_fog_rectangle(
                      selectedRect.id, 
                      selectedRect.startX, selectedRect.startY, 
                      newValue, selectedRect.endY, 
                      selectedRect.mode
                    );
                  }
                }}
              />
              <input
                type="number"
                value={selectedRect.endY}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value) || 0;
                  setFogRectangles(prev => prev.map(rect => 
                    rect.id === selectedRect.id 
                      ? { ...rect, endY: newValue }
                      : rect
                  ));
                  if (engine) {
                    engine.add_fog_rectangle(
                      selectedRect.id, 
                      selectedRect.startX, selectedRect.startY, 
                      selectedRect.endX, newValue, 
                      selectedRect.mode
                    );
                  }
                }}
              />
            </div>
          </div>

          <div className={styles['property-group']}>
            <label>Mode</label>
            <select
              value={selectedRect.mode}
              onChange={(e) => {
                const newMode = e.target.value as 'hide' | 'reveal';
                setFogRectangles(prev => prev.map(rect => 
                  rect.id === selectedRect.id 
                    ? { ...rect, mode: newMode }
                    : rect
                ));
                if (engine) {
                  engine.add_fog_rectangle(
                    selectedRect.id, 
                    selectedRect.startX, selectedRect.startY, 
                    selectedRect.endX, selectedRect.endY, 
                    newMode
                  );
                }
              }}
            >
              <option value="hide">Hide</option>
              <option value="reveal">Reveal</option>
            </select>
          </div>
        </div>
      )}

      {/* Fog Stats */}
      <div className={styles['fog-stats']}>
        <p>Total Rectangles: {fogRectangles.length}</p>
        <p>Hide Areas: {fogRectangles.filter(r => r.mode === 'hide').length}</p>
        <p>Reveal Areas: {fogRectangles.filter(r => r.mode === 'reveal').length}</p>
        {engine && <p>Engine Fog Count: {engine.get_fog_count()}</p>}
      </div>
    </div>
  );
};
