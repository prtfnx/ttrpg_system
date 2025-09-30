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
  const [brushType, setBrushType] = useState<'brush' | 'marker' | 'eraser'>('brush');

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
    <div className="paint-panel" style={{ position: 'relative' }}>
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
          
          {/* Brush Type Selection */}
          <div className="brush-type-section">
            <label>Brush Type:</label>
            <div className="brush-type-controls" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button 
                className={`panel-button ${brushType === 'brush' ? 'primary' : ''}`}
                onClick={() => setBrushType('brush')}
                disabled={!paintState.isActive}
              >
                🖌️ Brush
              </button>
              <button 
                className={`panel-button ${brushType === 'marker' ? 'primary' : ''}`}
                onClick={() => setBrushType('marker')}
                disabled={!paintState.isActive}
              >
                🖍️ Marker
              </button>
              <button 
                className={`panel-button ${brushType === 'eraser' ? 'primary' : ''}`}
                onClick={() => setBrushType('eraser')}
                disabled={!paintState.isActive}
              >
                🧽 Eraser
              </button>
            </div>
          </div>
          
          {/* Color Picker */}
          <div className="color-picker-section">
            <label htmlFor="color-picker">Color:</label>
            <div className="color-controls">
              <input
                id="color-picker"
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
            <label htmlFor="brush-size">Brush Size: {paintState.brushWidth.toFixed(1)}px</label>
            <input
              id="brush-size"
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

          {/* Opacity Control */}
          <div className="opacity-section">
            <label htmlFor="opacity">Opacity: {(paintState.brushColor[3] || 1).toFixed(2)}</label>
            <input
              id="opacity"
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={paintState.brushColor[3] || 1}
              onChange={(e) => {
                const opacity = parseFloat(e.target.value);
                const [r, g, b] = paintState.brushColor;
                paintControls.setBrushColor(r, g, b, opacity);
              }}
              disabled={!paintState.isActive}
              className="opacity-slider"
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
              onClick={() => {
                // TODO: Implement redo functionality
                console.log('Redo functionality not yet implemented');
              }}
              disabled={true}
              className="btn-secondary"
              title="Redo last undone stroke"
            >
              ↷ Redo
            </button>
            <button
              onClick={() => {
                if (renderEngine && renderEngine.paint_save_strokes_as_sprites) {
                  const spriteIds = renderEngine.paint_save_strokes_as_sprites('shapes');
                  console.log(`[PaintPanel] Saved ${spriteIds.length} paint strokes as sprites`);
                  if (spriteIds.length > 0) {
                    alert(`Saved ${spriteIds.length} paint strokes as sprites!`);
                  } else {
                    alert('No strokes to save. Draw something first!');
                  }
                } else {
                  console.warn('[PaintPanel] Save strokes method not available');
                  alert('Save functionality not available');
                }
              }}
              disabled={!paintState.isActive || paintState.strokeCount === 0}
              className="btn-primary"
              title="Save current strokes as sprites"
            >
              💾 Save Strokes
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

        {/* Template System */}
        <div className="templates-section">
          <h4>Templates</h4>
          <div className="template-controls">
            <button
              onClick={() => {
                // TODO: Implement save as template
                console.log('Save as template functionality not yet implemented');
              }}
              disabled={!paintState.isActive || paintState.strokeCount === 0}
              className="btn-secondary"
              title="Save current strokes as a reusable template"
            >
              📋 Save as Template
            </button>
            <button
              onClick={() => {
                // TODO: Implement load template
                console.log('Load template functionality not yet implemented');
              }}
              disabled={!paintState.isActive}
              className="btn-secondary"
              title="Load a saved template"
            >
              📁 Load Template
            </button>
          </div>
          <div className="template-list">
            <p className="template-placeholder">No templates available</p>
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
            <li>Save strokes as sprites to make them permanent</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PaintPanel;
