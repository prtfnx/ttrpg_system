import React, { useEffect, useRef, useState } from 'react';
import { useBrushPresets, usePaintInteraction, usePaintSystem } from '../hooks/usePaintSystem';
import './PaintPanel.css';

interface PaintPanelProps {
  renderEngine?: any;
  isVisible?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}

export const PaintPanel: React.FC<PaintPanelProps> = ({
  renderEngine = null,
  isVisible = true,
  onToggle,
  onClose
}) => {
  const [paintState, paintControls] = usePaintSystem(renderEngine, {
    onStrokeCompleted: () => console.log('Stroke completed'),
    onCanvasCleared: () => console.log('Canvas cleared'),
  });

  const brushPresets = useBrushPresets();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Paint interaction is available for future mouse handling integration
  usePaintInteraction(renderEngine, paintControls, paintState);

  // Color picker state for future advanced color picker
  const [currentColor, setCurrentColor] = useState('#ffffff');

  // Convert RGB array to hex color
  const rgbToHex = (rgb: number[]) => {
    const [r, g, b] = rgb.map(c => Math.round(c * 255));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  // Convert hex color to RGB array
  const hexToRgb = (hex: string): number[] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [1, 1, 1, 1];
    return [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255,
      1.0
    ];
  };

  // Update color when brush color changes
  useEffect(() => {
    if (paintState.brushColor.length >= 3) {
      setCurrentColor(rgbToHex(paintState.brushColor));
    }
  }, [paintState.brushColor]);

  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const color = event.target.value;
    setCurrentColor(color);
    const [r, g, b] = hexToRgb(color);
    paintControls.setBrushColor(r, g, b, 1.0);
  };

  const handleWidthChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const width = parseFloat(event.target.value);
    paintControls.setBrushWidth(width);
  };

  const handleBlendModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = event.target.value as 'alpha' | 'additive' | 'modulate' | 'multiply';
    paintControls.setBlendMode(mode);
  };

  const handleEnterPaintMode = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      paintControls.enterPaintMode(canvas.width, canvas.height);
    } else {
      paintControls.enterPaintMode(800, 600);
    }
  };

  const predefinedColors = [
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
    '#FFA500', '#800080', '#FFC0CB', '#A52A2A', '#808080', '#000000'
  ];

  if (!isVisible) return null;

  return (
    <div className="paint-panel">
      <div className="paint-panel-header">
        <h3>🎨 Paint System</h3>
        <div className="header-controls">
          {onToggle && (
            <button onClick={onToggle} className="panel-toggle">
              ⬇
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="panel-toggle">
              ×
            </button>
          )}
        </div>
      </div>

      <div className="paint-panel-content">
        {/* Paint Mode Controls */}
        <div className="paint-mode-section">
          <div className="paint-mode-status">
            <span className={`status-indicator ${paintState.isActive ? 'active' : 'inactive'}`}>
              {paintState.isActive ? 'Paint Mode ON' : 'Paint Mode OFF'}
            </span>
            {paintState.isDrawing && (
              <span className="drawing-indicator">Drawing...</span>
            )}
          </div>
          
          <div className="paint-mode-controls">
            {!paintState.isActive ? (
              <button 
                onClick={handleEnterPaintMode}
                className="btn-primary"
                disabled={!renderEngine}
              >
                Enter Paint Mode
              </button>
            ) : (
              <button 
                onClick={paintControls.exitPaintMode}
                className="btn-secondary"
              >
                Exit Paint Mode
              </button>
            )}
          </div>
        </div>

        {/* Brush Settings */}
        <div className="brush-settings-section">
          <h4>Brush Settings</h4>
          
          {/* Color Picker */}
          <div className="color-picker-section">
            <label>Color:</label>
            <div className="color-controls">
              <input
                type="color"
                value={currentColor}
                onChange={handleColorChange}
                disabled={!paintState.isActive}
                className="color-input"
              />
              <div className="predefined-colors">
                {predefinedColors.map(color => (
                  <button
                    key={color}
                    className="color-swatch"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setCurrentColor(color);
                      const [r, g, b] = hexToRgb(color);
                      paintControls.setBrushColor(r, g, b, 1.0);
                    }}
                    disabled={!paintState.isActive}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Brush Width */}
          <div className="brush-width-section">
            <label>Width: {paintState.brushWidth.toFixed(1)}px</label>
            <input
              type="range"
              min="0.5"
              max="20"
              step="0.5"
              value={paintState.brushWidth}
              onChange={handleWidthChange}
              disabled={!paintState.isActive}
              className="width-slider"
            />
          </div>

          {/* Blend Mode */}
          <div className="blend-mode-section">
            <label>Blend Mode:</label>
            <select 
              value={paintState.blendMode} 
              onChange={handleBlendModeChange}
              disabled={!paintState.isActive}
              className="blend-mode-select"
            >
              <option value="alpha">Alpha (Normal)</option>
              <option value="additive">Additive (Glow)</option>
              <option value="modulate">Modulate</option>
              <option value="multiply">Multiply (Darken)</option>
            </select>
          </div>
        </div>

        {/* Brush Presets */}
        {brushPresets.length > 0 && (
          <div className="brush-presets-section">
            <h4>Brush Presets</h4>
            <div className="preset-buttons">
              {brushPresets.map((preset, index) => (
                <button
                  key={index}
                  onClick={() => paintControls.applyBrushPreset(preset)}
                  disabled={!paintState.isActive}
                  className="preset-button"
                  title={`Preset ${index + 1}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Canvas Actions */}
        <div className="canvas-actions-section">
          <h4>Canvas Actions</h4>
          <div className="action-buttons">
            <button
              onClick={paintControls.undoStroke}
              disabled={!paintState.isActive || paintState.strokeCount === 0}
              className="btn-secondary"
              title="Undo last stroke"
            >
              ↶ Undo
            </button>
            <button
              onClick={paintControls.clearAll}
              disabled={!paintState.isActive || paintState.strokeCount === 0}
              className="btn-danger"
              title="Clear all strokes"
            >
              🗑️ Clear All
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div className="paint-stats-section">
          <h4>Statistics</h4>
          <div className="stats-grid">
            <div className="stat">
              <span className="stat-label">Strokes:</span>
              <span className="stat-value">{paintState.strokeCount}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Status:</span>
              <span className="stat-value">
                {paintState.isDrawing ? 'Drawing' : 'Idle'}
              </span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="instructions-section">
          <h4>Instructions</h4>
          <ul className="instructions-list">
            <li>Enter paint mode to start drawing</li>
            <li>Click and drag on the canvas to draw strokes</li>
            <li>Use different brush sizes and colors</li>
            <li>Try different blend modes for effects</li>
            <li>Use presets for quick brush changes</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PaintPanel;
