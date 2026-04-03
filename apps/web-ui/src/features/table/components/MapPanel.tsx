import { useRenderEngine } from '@features/canvas';
import { ProtocolService } from '@lib/api';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../../store';

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
}

type MapPanelProps = React.HTMLProps<HTMLDivElement>;

const gridPresets = [
  { name: 'D&D 5ft', size: 50, type: 'square' as const },
  { name: 'D&D 10ft', size: 100, type: 'square' as const },
  { name: 'Pathfinder', size: 50, type: 'square' as const },
  { name: 'Hex Large', size: 60, type: 'hex' as const },
  { name: 'Hex Small', size: 40, type: 'hex' as const },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export const MapPanel: React.FC<MapPanelProps> = ({ className, style, id, ...rest }) => {
  const engine = useRenderEngine();
  const { activeTableId, gridEnabled, gridCellPx, gridSnapping, gridColorHex, backgroundColorHex } = useGameStore();

  const [settings, setSettings] = useState<MapSettings>(() => ({
    width: 2000,
    height: 2000,
    backgroundColor: backgroundColorHex ?? '#2a3441',
    gridSettings: {
      enabled: gridEnabled,
      size: gridCellPx,
      color: gridColorHex ?? '#ffffff',
      opacity: 0.4,
      snapToGrid: gridSnapping,
      type: 'square',
    },
  }));

  const initialized = useRef(false);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!initialized.current) return;
    setSettings(prev => ({
      ...prev,
      backgroundColor: backgroundColorHex ?? prev.backgroundColor,
      gridSettings: {
        ...prev.gridSettings,
        enabled: gridEnabled,
        size: gridCellPx,
        snapToGrid: gridSnapping,
        color: gridColorHex ?? prev.gridSettings.color,
      },
    }));
  }, [gridEnabled, gridCellPx, gridSnapping, gridColorHex, backgroundColorHex]);

  useEffect(() => {
    initialized.current = true;
  }, []);

  const applyToWasm = useCallback((s: MapSettings) => {
    if (!engine) return;
    const g = s.gridSettings;
    engine.set_grid_enabled?.(g.enabled);
    engine.set_grid_size?.(g.size);
    engine.set_snap_to_grid?.(g.snapToGrid);
    if (engine.set_grid_color) {
      const [r, gv, b] = hexToRgb(g.color);
      engine.set_grid_color(r, gv, b, g.opacity);
    }
    if (engine.set_background_color) {
      const [r, gv, b] = hexToRgb(s.backgroundColor);
      engine.set_background_color(r, gv, b, 1.0);
    }
  }, [engine]);

  const sendToServer = useCallback((s: MapSettings) => {
    if (!activeTableId || !ProtocolService.hasProtocol()) return;
    const g = s.gridSettings;
    ProtocolService.getProtocol().sendTableSettingsUpdate(activeTableId, {
      grid_cell_px: g.size,
      grid_enabled: g.enabled,
      snap_to_grid: g.snapToGrid,
      grid_color_hex: g.color,
      background_color_hex: s.backgroundColor,
    });
  }, [activeTableId]);

  const updateSettings = useCallback((next: MapSettings) => {
    setSettings(next);
    applyToWasm(next);
    if (sendTimer.current) clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => sendToServer(next), 300);
  }, [applyToWasm, sendToServer]);

  const updateGrid = useCallback((updates: Partial<GridSettings>) => {
    setSettings(prev => {
      const next = { ...prev, gridSettings: { ...prev.gridSettings, ...updates } };
      applyToWasm(next);
      if (sendTimer.current) clearTimeout(sendTimer.current);
      sendTimer.current = setTimeout(() => sendToServer(next), 300);
      return next;
    });
  }, [applyToWasm, sendToServer]);

  const resetCamera = useCallback(() => {
    engine?.reset_camera?.();
  }, [engine]);

  const centerOnMap = useCallback(() => {
    engine?.set_camera_position?.(settings.width / 2, settings.height / 2);
  }, [engine, settings.width, settings.height]);

  const fitToScreen = useCallback(() => {
    const scale = Math.min(window.innerWidth / settings.width, window.innerHeight / settings.height) * 0.9;
    engine?.set_camera_scale?.(scale);
  }, [engine, settings.width, settings.height]);

  const handleExportMap = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `map_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  }, []);

  const clearMap = useCallback(() => {
    if (!engine) return;
    if (confirm('Clear all sprites from the map? This cannot be undone.')) {
      engine.clear_all_sprites?.();
    }
  }, [engine]);

  return (
    <div className={`map-panel ${className || ''}`} style={style} id={id} {...rest}>
      <div className="panel-header">
        <h3>Map & Grid</h3>
      </div>

      <div className="panel-content">
        <div className="settings-section">
          <h4>Map Settings</h4>
          <div className="setting-row">
            <label>Width:</label>
            <input
              type="number" min="500" max="10000" step="100"
              value={settings.width}
              onChange={e => updateSettings({ ...settings, width: parseInt(e.target.value) || 2000 })}
            />
            <span>px</span>
          </div>
          <div className="setting-row">
            <label>Height:</label>
            <input
              type="number" min="500" max="10000" step="100"
              value={settings.height}
              onChange={e => updateSettings({ ...settings, height: parseInt(e.target.value) || 2000 })}
            />
            <span>px</span>
          </div>
          <div className="setting-row">
            <label>Background:</label>
            <input
              type="color"
              value={settings.backgroundColor}
              onChange={e => updateSettings({ ...settings, backgroundColor: e.target.value })}
            />
          </div>
        </div>

        <div className="settings-section">
          <h4>Grid Settings</h4>
          <div className="setting-row">
            <label>
              <input
                type="checkbox"
                checked={settings.gridSettings.enabled}
                onChange={e => updateGrid({ enabled: e.target.checked })}
              />
              Enable Grid
            </label>
          </div>
          <div className="setting-row">
            <label>Grid Size:</label>
            <input
              type="number" min="10" max="200"
              value={settings.gridSettings.size}
              onChange={e => updateGrid({ size: parseInt(e.target.value) || 50 })}
              disabled={!settings.gridSettings.enabled}
            />
            <span>px</span>
          </div>
          <div className="setting-row">
            <label>Grid Type:</label>
            <select
              value={settings.gridSettings.type}
              onChange={e => updateGrid({ type: e.target.value as 'square' | 'hex' })}
              disabled={!settings.gridSettings.enabled}
            >
              <option value="square">Square</option>
              <option value="hex">Hexagonal</option>
            </select>
          </div>
          <div className="setting-row">
            <label>Grid Color:</label>
            <input
              type="color"
              value={settings.gridSettings.color}
              onChange={e => updateGrid({ color: e.target.value })}
              disabled={!settings.gridSettings.enabled}
            />
          </div>
          <div className="setting-row">
            <label>Opacity:</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={settings.gridSettings.opacity}
              onChange={e => updateGrid({ opacity: parseFloat(e.target.value) })}
              disabled={!settings.gridSettings.enabled}
            />
            <span>{Math.round(settings.gridSettings.opacity * 100)}%</span>
          </div>
          <div className="setting-row">
            <label>
              <input
                type="checkbox"
                checked={settings.gridSettings.snapToGrid}
                onChange={e => updateGrid({ snapToGrid: e.target.checked })}
                disabled={!settings.gridSettings.enabled}
              />
              Snap to Grid
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h4>Grid Presets</h4>
          <div className="preset-buttons">
            {gridPresets.map(preset => (
              <button
                key={preset.name}
                className="preset-btn"
                onClick={() => updateGrid({ size: preset.size, type: preset.type })}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h4>Camera</h4>
          <div className="button-row">
            <button className="action-btn" onClick={resetCamera}>Reset</button>
            <button className="action-btn" onClick={centerOnMap}>Center</button>
            <button className="action-btn" onClick={fitToScreen}>Fit Screen</button>
          </div>
        </div>

        <div className="settings-section">
          <h4>Actions</h4>
          <div className="button-row">
            <button className="action-btn" onClick={handleExportMap}>Export PNG</button>
            <button className="action-btn danger-btn" onClick={clearMap}>Clear Map</button>
          </div>
        </div>
      </div>
    </div>
  );
};

