import React, { useCallback, useState } from 'react';
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
  const engine = useRenderEngine();
  const [fogRectangles, setFogRectangles] = useState<FogRectangle[]>([]);
  const [selectedRectId, setSelectedRectId] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<'hide' | 'reveal'>('hide');
  const [isGmMode, setIsGmMode] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

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
    const newGmMode = !isGmMode;
    setIsGmMode(newGmMode);
    
    // Try to set engine mode, but don't fail if engine is not available
    if (engine && typeof engine.set_gm_mode === 'function') {
      engine.set_gm_mode(newGmMode);
    }

    // Set status message
    if (newGmMode) {
      setStatusMessage('GM mode enabled - fog hidden from players');
    } else {
      setStatusMessage('GM mode disabled - fog visible to players');
    }
  }, [engine, isGmMode]);

  const applyFogPreset = useCallback((preset: 'dungeon' | 'outdoor' | 'darkness') => {
    if (!engine) return;
    
    // Clear existing fog first
    clearAllFog();
    
    // Apply preset-specific fog patterns
    switch (preset) {
      case 'dungeon':
        // Hide most areas, reveal starting room
        addFogRectangle(0, 0, 800, 600, 'hide');
        addFogRectangle(350, 250, 450, 350, 'reveal');
        setStatusMessage('Dungeon preset applied');
        break;
      case 'outdoor':
        // Create scattered hidden areas for forests/obstacles
        addFogRectangle(100, 100, 300, 200, 'hide');
        addFogRectangle(500, 300, 700, 500, 'hide');
        setStatusMessage('Outdoor preset applied');
        break;
      case 'darkness':
        // Hide everything
        addFogRectangle(0, 0, 1000, 1000, 'hide');
        setStatusMessage('Complete darkness applied');
        break;
    }
  }, [engine, clearAllFog, addFogRectangle]);

  const selectedRect = fogRectangles.find(rect => rect.id === selectedRectId);

  return (
    <div className="panel-base">
      <div className="panel-header">
        <h3>🌫️ Fog of War</h3>
      </div>
      
      {/* Status Message */}
      {statusMessage && (
        <div className="panel-section">
          <div className="status-message" style={{ padding: '8px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '4px', marginBottom: '8px' }}>
            ✅ {statusMessage}
          </div>
        </div>
      )}
      
      {/* Drawing status indicator */}
      {engine && typeof engine.is_in_fog_draw_mode === 'function' && engine.is_in_fog_draw_mode() && (
        <div className="status-indicator active">
          🖌️ Drawing {engine.get_current_input_mode && engine.get_current_input_mode() === 'fog_draw' ? 'hide' : 'reveal'} areas...
          <button 
            onClick={() => {
              if (engine && typeof engine.set_fog_draw_mode === 'function') {
                engine.set_fog_draw_mode(false);
              }
              if (engine && typeof engine.set_fog_erase_mode === 'function') {
                engine.set_fog_erase_mode(false);
              }
            }} 
            className="panel-button danger"
          >
            Cancel
          </button>
        </div>
      )}
      
      {/* GM Mode Toggle */}
      <div className="panel-section">
        <div className="control-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isGmMode}
              onChange={toggleGmMode}
            />
            <span>🎭 GM Mode (see through fog)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
            <input
              type="checkbox"
              checked={!isGmMode}
              onChange={toggleGmMode}
            />
            <span>👥 Show fog to players</span>
          </label>
        </div>
      </div>

      {/* Interactive Drawing Controls */}
      {isGmMode && (
        <div className="panel-section">
          <h4>🖌️ Interactive Drawing</h4>
          <div className="control-group">
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                className={`panel-button ${(typeof engine?.is_in_fog_draw_mode === 'function' && engine?.is_in_fog_draw_mode() && typeof engine?.get_current_input_mode === 'function' && engine?.get_current_input_mode() === 'fog_draw') ? 'primary' : ''}`}
                onClick={() => {
                  if (!engine) return;
                  const isActive = engine.get_current_input_mode() === 'fog_draw';
                  engine.set_fog_draw_mode(!isActive);
                  if (!isActive) {
                    engine.set_fog_erase_mode(false); // Turn off erase mode
                  }
                  setCurrentMode('hide');
                }}
              >
                🌫️ Hide Mode
              </button>
              <button
                className={`panel-button ${(typeof engine?.is_in_fog_draw_mode === 'function' && engine?.is_in_fog_draw_mode() && typeof engine?.get_current_input_mode === 'function' && engine?.get_current_input_mode() === 'fog_erase') ? 'primary' : ''}`}
                onClick={() => {
                  if (!engine) return;
                  const isActive = engine.get_current_input_mode() === 'fog_erase';
                  engine.set_fog_erase_mode(!isActive);
                  if (!isActive) {
                    engine.set_fog_draw_mode(false); // Turn off draw mode
                  }
                  setCurrentMode('reveal');
                }}
              >
                👁️ Reveal Mode
              </button>
              <button
                className={`panel-button ${(typeof engine?.is_in_fog_draw_mode === 'function' && !engine?.is_in_fog_draw_mode()) ? 'primary' : ''}`}
                onClick={() => {
                  if (!engine) return;
                  engine.set_fog_draw_mode(false);
                  engine.set_fog_erase_mode(false);
                }}
              >
                🎯 Select Mode
              </button>
            </div>
            
            {/* Brush Controls */}
            <div className="brush-controls">
              <div style={{ marginBottom: '8px' }}>
                <label htmlFor="fog-brush-size">Brush Size: 10px</label>
                <input
                  id="fog-brush-size"
                  type="range"
                  min="5"
                  max="50"
                  step="1"
                  defaultValue="10"
                  className="brush-slider"
                />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label htmlFor="fog-opacity">Fog Opacity: 0.8</label>
                <input
                  id="fog-opacity"
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  defaultValue="0.8"
                  className="opacity-slider"
                />
              </div>
            </div>
            
            {(typeof engine?.is_in_fog_draw_mode === 'function' && engine?.is_in_fog_draw_mode()) && (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                💡 {(typeof engine?.get_current_input_mode === 'function' && engine.get_current_input_mode() === 'fog_draw') ? 
                  'Click and drag to hide areas' : 
                  'Click and drag to reveal areas'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Manual Entry Drawing Mode */}
      <div className="panel-section">
        <h4>📐 Manual Entry</h4>
        <div className="control-group">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              className={`panel-button ${currentMode === 'hide' ? 'primary' : ''}`}
              onClick={() => setCurrentMode('hide')}
            >
              🌫️ Hide Areas
            </button>
            <button
              className={`panel-button ${currentMode === 'reveal' ? 'primary' : ''}`}
              onClick={() => setCurrentMode('reveal')}
            >
              ✨ Reveal Areas
            </button>
            <button
              className="panel-button"
              onClick={clearAllFog}
            >
              Reveal All (Clear Fog)
            </button>
          </div>
        </div>
      </div>

      {/* Manual Rectangle Entry */}
      <div className="panel-section">
        <h4>📏 Add Rectangle</h4>
        <div className="control-group">
          <div className="input-grid">
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
          </div>
          <button
            className="panel-button primary"
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
            {currentMode === 'hide' ? '🌫️ Add Hide Rectangle' : '✨ Add Reveal Rectangle'}
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="panel-section">
        <h4>⚡ Quick Actions</h4>
        <div className="control-group">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="panel-button" onClick={hideEntireTable}>
              🌫️ Hide Entire Table
            </button>
          </div>
        </div>
      </div>

      {/* Fog Presets */}
      <div className="panel-section">
        <h4>🎲 Fog Presets</h4>
        <div className="control-group">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button 
              className="panel-button secondary"
              onClick={() => applyFogPreset('dungeon')}
            >
              🏰 Dungeon Exploration
            </button>
            <button 
              className="panel-button secondary"
              onClick={() => applyFogPreset('outdoor')}
            >
              🌲 Outdoor Travel
            </button>
            <button 
              className="panel-button secondary"
              onClick={() => applyFogPreset('darkness')}
            >
              🌑 Complete Darkness
            </button>
          </div>
        </div>
      </div>

      {/* Fog Rectangle List */}
      <div className="panel-section">
        <h4>📋 Fog Rectangles ({fogRectangles.length})</h4>
        <div className="activity-log">
          {fogRectangles.map(rect => (
            <div
              key={rect.id}
              className={`activity-item ${selectedRectId === rect.id ? 'selected' : ''}`}
              onClick={() => setSelectedRectId(rect.id)}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={`status-indicator ${rect.mode === 'hide' ? 'error' : 'success'}`}>
                  {rect.mode === 'hide' ? '🌫️' : '👁️'} {rect.mode.toUpperCase()}
                </span>
                <button
                  className="panel-button danger small"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFogRectangle(rect.id);
                  }}
                  style={{ padding: '2px 6px', fontSize: '12px' }}
                >
                  ❌
                </button>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                ({rect.startX.toFixed(0)}, {rect.startY.toFixed(0)}) → 
                ({rect.endX.toFixed(0)}, {rect.endY.toFixed(0)})
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Rectangle Properties */}
      {selectedRect && (
        <div className="panel-section">
          <h4>⚙️ Properties: {selectedRect.id}</h4>
          <div className="control-group">
            <label>Start Position</label>
            <div className="input-grid">
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

          <div className="control-group">
            <label>End Position</label>
            <div className="input-grid">
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

          <div className="control-group">
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
              <option value="hide">🌫️ Hide</option>
              <option value="reveal">👁️ Reveal</option>
            </select>
          </div>
        </div>
      )}

      {/* Fog Stats */}
      <div className="panel-section">
        <h4>📊 Statistics</h4>
        <div className="activity-log">
          <div className="activity-item">
            <span>Total Rectangles: <strong>{fogRectangles.length}</strong></span>
          </div>
          <div className="activity-item">
            <span>🌫️ Hide Areas: <strong>{fogRectangles.filter(r => r.mode === 'hide').length}</strong></span>
          </div>
          <div className="activity-item">
            <span>👁️ Reveal Areas: <strong>{fogRectangles.filter(r => r.mode === 'reveal').length}</strong></span>
          </div>
          {engine && (
            <div className="activity-item">
              <span>Engine Fog Count: <strong>{engine.get_fog_count ? engine.get_fog_count() : 'N/A'}</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
