import React, { useCallback, useState, useEffect } from 'react';
import { useRenderEngine } from '../hooks/useRenderEngine';

interface GridSettings {
  enabled: boolean;
  size: number;
  color: string;
  opacity: number;
  snapToGrid: boolean;
  type: 'square' | 'hex';
}

interface MapSettings {
  width: number;
  height: number;
  backgroundColor: string;
  gridSettings: GridSettings;
  scale: number;
  panX: number;
  panY: number;
}

export const MapPanel: React.FC = () => {
  const engine = useRenderEngine();
  const [mapSettings, setMapSettings] = useState<MapSettings>({
    width: 2000,
    height: 2000,
    backgroundColor: '#2a3441',
    gridSettings: {
      enabled: true,
      size: 50,
      color: '#ffffff',
      opacity: 0.2,
      snapToGrid: true,
      type: 'square'
    },
    scale: 1.0,
    panX: 0,
    panY: 0
  });

  const [gridPresets] = useState([
    { name: 'D&D 5ft', size: 50, type: 'square' as const },
    { name: 'D&D 10ft', size: 100, type: 'square' as const },
    { name: 'Pathfinder', size: 50, type: 'square' as const },
    { name: 'Hex Large', size: 60, type: 'hex' as const },
    { name: 'Hex Small', size: 40, type: 'hex' as const },
  ]);

  // Update engine when settings change
  useEffect(() => {
    if (!engine) return;

    try {
      // Update grid settings
      engine.set_grid_enabled(mapSettings.gridSettings.enabled);
      engine.set_grid_size(mapSettings.gridSettings.size);
      engine.set_snap_to_grid(mapSettings.gridSettings.snapToGrid);
      
      // Parse color and set grid color
      const color = mapSettings.gridSettings.color;
      const r = parseInt(color.slice(1, 3), 16) / 255;
      const g = parseInt(color.slice(3, 5), 16) / 255;
      const b = parseInt(color.slice(5, 7), 16) / 255;
      engine.set_grid_color(r, g, b, mapSettings.gridSettings.opacity);

      // Update map background
      const bgColor = mapSettings.backgroundColor;
      const bgR = parseInt(bgColor.slice(1, 3), 16) / 255;
      const bgG = parseInt(bgColor.slice(3, 5), 16) / 255;
      const bgB = parseInt(bgColor.slice(5, 7), 16) / 255;
      engine.set_background_color(bgR, bgG, bgB, 1.0);

    } catch (error) {
      console.error('Failed to update map settings:', error);
    }
  }, [engine, mapSettings]);

  const updateGridSettings = useCallback((updates: Partial<GridSettings>) => {
    setMapSettings(prev => ({
      ...prev,
      gridSettings: { ...prev.gridSettings, ...updates }
    }));
  }, []);

  const updateMapSettings = useCallback((updates: Partial<MapSettings>) => {
    setMapSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const applyPreset = useCallback((preset: typeof gridPresets[0]) => {
    updateGridSettings({
      size: preset.size,
      type: preset.type
    });
  }, [updateGridSettings]);

  const resetCamera = useCallback(() => {
    if (!engine) return;
    
    try {
      engine.reset_camera();
      updateMapSettings({ scale: 1.0, panX: 0, panY: 0 });
    } catch (error) {
      console.error('Failed to reset camera:', error);
    }
  }, [engine, updateMapSettings]);

  const centerOnMap = useCallback(() => {
    if (!engine) return;
    
    try {
      const centerX = mapSettings.width / 2;
      const centerY = mapSettings.height / 2;
      engine.set_camera_position(centerX, centerY);
      updateMapSettings({ panX: centerX, panY: centerY });
    } catch (error) {
      console.error('Failed to center camera:', error);
    }
  }, [engine, mapSettings.width, mapSettings.height, updateMapSettings]);

  const fitToScreen = useCallback(() => {
    if (!engine) return;
    
    try {
      // Calculate scale to fit map to screen
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const scaleX = screenWidth / mapSettings.width;
      const scaleY = screenHeight / mapSettings.height;
      const scale = Math.min(scaleX, scaleY) * 0.9; // 90% to leave some margin
      
      engine.set_camera_scale(scale);
      updateMapSettings({ scale });
    } catch (error) {
      console.error('Failed to fit to screen:', error);
    }
  }, [engine, mapSettings.width, mapSettings.height, updateMapSettings]);

  const handleExportMap = useCallback(() => {
    if (!engine) return;
    
    try {
      // Export current map view as image
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const link = document.createElement('a');
        link.download = `map_${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();
      }
    } catch (error) {
      console.error('Failed to export map:', error);
    }
  }, [engine]);

  const clearMap = useCallback(() => {
    if (!engine) return;
    
    if (confirm('Clear all sprites from the map? This cannot be undone.')) {
      try {
        engine.clear_all_sprites();
      } catch (error) {
        console.error('Failed to clear map:', error);
      }
    }
  }, [engine]);

  return (
    <div className="map-panel">
      <div className="panel-header">
        <h3>🗺️ Map & Grid</h3>
      </div>

      <div className="panel-content">
        {/* Map Settings */}
        <div className="settings-section">
          <h4>Map Settings</h4>
          <div className="setting-row">
            <label>Width:</label>
            <input
              type="number"
              min="500"
              max="10000"
              step="100"
              value={mapSettings.width}
              onChange={(e) => updateMapSettings({ width: parseInt(e.target.value) || 2000 })}
            />
            <span>px</span>
          </div>
          <div className="setting-row">
            <label>Height:</label>
            <input
              type="number"
              min="500"
              max="10000"
              step="100"
              value={mapSettings.height}
              onChange={(e) => updateMapSettings({ height: parseInt(e.target.value) || 2000 })}
            />
            <span>px</span>
          </div>
          <div className="setting-row">
            <label>Background:</label>
            <input
              type="color"
              value={mapSettings.backgroundColor}
              onChange={(e) => updateMapSettings({ backgroundColor: e.target.value })}
            />
          </div>
        </div>

        {/* Grid Settings */}
        <div className="settings-section">
          <h4>Grid Settings</h4>
          <div className="setting-row">
            <label>
              <input
                type="checkbox"
                checked={mapSettings.gridSettings.enabled}
                onChange={(e) => updateGridSettings({ enabled: e.target.checked })}
              />
              Enable Grid
            </label>
          </div>
          <div className="setting-row">
            <label>Grid Size:</label>
            <input
              type="number"
              min="10"
              max="200"
              value={mapSettings.gridSettings.size}
              onChange={(e) => updateGridSettings({ size: parseInt(e.target.value) || 50 })}
              disabled={!mapSettings.gridSettings.enabled}
            />
            <span>px</span>
          </div>
          <div className="setting-row">
            <label>Grid Type:</label>
            <select
              value={mapSettings.gridSettings.type}
              onChange={(e) => updateGridSettings({ type: e.target.value as 'square' | 'hex' })}
              disabled={!mapSettings.gridSettings.enabled}
            >
              <option value="square">Square</option>
              <option value="hex">Hexagonal</option>
            </select>
          </div>
          <div className="setting-row">
            <label>Grid Color:</label>
            <input
              type="color"
              value={mapSettings.gridSettings.color}
              onChange={(e) => updateGridSettings({ color: e.target.value })}
              disabled={!mapSettings.gridSettings.enabled}
            />
          </div>
          <div className="setting-row">
            <label>Opacity:</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={mapSettings.gridSettings.opacity}
              onChange={(e) => updateGridSettings({ opacity: parseFloat(e.target.value) })}
              disabled={!mapSettings.gridSettings.enabled}
            />
            <span>{Math.round(mapSettings.gridSettings.opacity * 100)}%</span>
          </div>
          <div className="setting-row">
            <label>
              <input
                type="checkbox"
                checked={mapSettings.gridSettings.snapToGrid}
                onChange={(e) => updateGridSettings({ snapToGrid: e.target.checked })}
                disabled={!mapSettings.gridSettings.enabled}
              />
              Snap to Grid
            </label>
          </div>
        </div>

        {/* Grid Presets */}
        <div className="settings-section">
          <h4>Grid Presets</h4>
          <div className="preset-buttons">
            {gridPresets.map(preset => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="preset-btn"
                disabled={!mapSettings.gridSettings.enabled}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Camera Controls */}
        <div className="settings-section">
          <h4>Camera Controls</h4>
          <div className="camera-buttons">
            <button onClick={resetCamera} className="btn-secondary">
              Reset Camera
            </button>
            <button onClick={centerOnMap} className="btn-secondary">
              Center Map
            </button>
            <button onClick={fitToScreen} className="btn-secondary">
              Fit to Screen
            </button>
          </div>
          <div className="setting-row">
            <label>Scale:</label>
            <span>{Math.round(mapSettings.scale * 100)}%</span>
          </div>
        </div>

        {/* Map Actions */}
        <div className="settings-section">
          <h4>Map Actions</h4>
          <div className="action-buttons">
            <button onClick={handleExportMap} className="btn-primary">
              📸 Export Image
            </button>
            <button onClick={clearMap} className="btn-danger">
              🗑️ Clear Map
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="settings-section">
          <h4>Controls</h4>
          <ul className="instructions">
            <li>Mouse wheel to zoom</li>
            <li>Right-click and drag to pan</li>
            <li>Ctrl+scroll for fine zoom</li>
            <li>Double-click to reset zoom</li>
          </ul>
        </div>
      </div>

      <style>{`
        .map-panel {
          background: #1f2937;
          color: white;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .panel-header {
          padding: 1rem;
          border-bottom: 1px solid #374151;
        }

        .panel-header h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        .panel-content {
          flex: 1;
          padding: 1rem;
          overflow-y: auto;
        }

        .settings-section {
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #374151;
        }

        .settings-section:last-child {
          border-bottom: none;
        }

        .settings-section h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.9rem;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .setting-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          font-size: 0.9rem;
        }

        .setting-row label {
          min-width: 80px;
          color: #d1d5db;
        }

        .setting-row input[type="number"],
        .setting-row input[type="color"],
        .setting-row input[type="range"],
        .setting-row select {
          padding: 0.25rem;
          border: 1px solid #4b5563;
          border-radius: 3px;
          background: #374151;
          color: white;
          font-size: 0.8rem;
        }

        .setting-row input[type="number"] {
          width: 80px;
        }

        .setting-row input[type="color"] {
          width: 40px;
          height: 30px;
          padding: 0;
          border: none;
          cursor: pointer;
        }

        .setting-row input[type="range"] {
          flex: 1;
        }

        .setting-row input[type="checkbox"] {
          margin-right: 0.5rem;
        }

        .setting-row span {
          color: #9ca3af;
          font-size: 0.8rem;
        }

        .preset-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }

        .preset-btn {
          padding: 0.5rem;
          border: 1px solid #4b5563;
          border-radius: 3px;
          background: #374151;
          color: white;
          cursor: pointer;
          font-size: 0.8rem;
        }

        .preset-btn:hover:not(:disabled) {
          background: #4b5563;
        }

        .preset-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .camera-buttons,
        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .btn-primary,
        .btn-secondary,
        .btn-danger {
          padding: 0.5rem;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.8rem;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
        }

        .btn-secondary {
          background: #6b7280;
          color: white;
        }

        .btn-danger {
          background: #ef4444;
          color: white;
        }

        .btn-primary:hover {
          background: #2563eb;
        }

        .btn-secondary:hover {
          background: #4b5563;
        }

        .btn-danger:hover {
          background: #dc2626;
        }

        .instructions {
          margin: 0;
          padding-left: 1rem;
          color: #9ca3af;
          font-size: 0.8rem;
        }

        .instructions li {
          margin-bottom: 0.25rem;
        }
      `}</style>
    </div>
  );
};

export default MapPanel;
