import React, { useEffect, useRef, useState } from 'react';
import { useBrushPresets, usePaintInteraction, usePaintSystem } from '../hooks/usePaintSystem';
import { useRenderEngine } from '../hooks/useRenderEngine';
import { paintTemplateService, type TemplateMetadata } from '../services/paintTemplate.service';
import './PaintPanel.css';

interface PanelDimensions {
  width: number;
  height: number;
}

// Custom hook for responsive panel dimensions
const usePanelDimensions = (): PanelDimensions => {
  const [dimensions, setDimensions] = useState<PanelDimensions>({ width: 320, height: 400 });
  
  useEffect(() => {
    const updateDimensions = () => {
      const rightPanel = document.querySelector('.right-panel');
      if (rightPanel) {
        const { width, height } = rightPanel.getBoundingClientRect();
        setDimensions({
          width: Math.max(width - 20, 200), // Min width with padding
          height: height - 40 // Account for headers
        });
      }
    };
    
    // Initial measurement
    updateDimensions();
    
    // Listen for resize events
    window.addEventListener('resize', updateDimensions);
    
    // Use ResizeObserver for more accurate panel size changes
    const observer = new ResizeObserver(updateDimensions);
    const rightPanel = document.querySelector('.right-panel');
    if (rightPanel) {
      observer.observe(rightPanel);
    }
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
      observer.disconnect();
    };
  }, []);
  
  return dimensions;
};

interface PaintModeStatus {
  mode: 'draw' | 'erase' | 'template' | 'table';
  isActive: boolean;
  brush: {
    size: number;
    color: string;
  };
  template?: {
    name: string;
  };
  isDrawing: boolean;
  tableIntegration: boolean;
}

// Paint Mode Indicator Component
const PaintModeIndicator: React.FC<{ status: PaintModeStatus }> = ({ status }) => (
  <div className={`paint-mode-indicator ${status.mode} ${status.isActive ? 'active' : 'inactive'}`}>
    <div className="mode-icon">
      {status.mode === 'draw' && <span>🖌️</span>}
      {status.mode === 'erase' && <span>🧽</span>}
      {status.mode === 'template' && <span>📋</span>}
      {status.mode === 'table' && <span>🗓️</span>}
    </div>
    <div className="mode-details">
      <div className="mode-name">{status.mode.toUpperCase()} MODE</div>
      <div className="mode-settings">
        Size: {status.brush.size}px | 
        {status.template ? ` Template: ${status.template.name}` : ` Color: ${status.brush.color}`}
        {status.tableIntegration && <span className="table-badge"> | TABLE</span>}
      </div>
      {status.isDrawing && (
        <div className="drawing-indicator">
          <span className="pulse-dot">●</span> Drawing...
        </div>
      )}
    </div>
    <div className={`status-indicator ${status.isActive ? 'active' : 'inactive'}`}>
      {status.isActive ? 'ON' : 'OFF'}
    </div>
  </div>
);

interface WASMTablePaintIntegration {
  paintLayer: string;
  tableId: string;
  coordinateSystem: 'world' | 'screen';
  persistence: boolean;
}

interface PaintStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  blendMode: string;
}

// Custom hook for paint-table integration
const usePaintTableIntegration = () => {
  const engine = useRenderEngine();
  
  const paintToTable = async (
    strokes: PaintStroke[],
    layer: string,
    options: WASMTablePaintIntegration
  ) => {
    if (!engine) {
      throw new Error('Render engine not available');
    }
    
    try {
      // Convert paint strokes to WASM coordinates and paint them
      for (const stroke of strokes) {
        // Set brush properties
        const [r, g, b, a] = hexToRgb(stroke.color);
        engine.paint_set_brush_color(r, g, b, a);
        engine.paint_set_brush_size(stroke.width);
        
        // Paint the stroke
        if (stroke.points.length > 0) {
          const firstPoint = stroke.points[0];
          let worldCoords = [firstPoint.x, firstPoint.y];
          
          if (options.coordinateSystem === 'world') {
            worldCoords = engine.screen_to_world(firstPoint.x, firstPoint.y);
          }
          
          engine.paint_start_stroke(worldCoords[0], worldCoords[1]);
          
          for (let i = 1; i < stroke.points.length; i++) {
            let coords = [stroke.points[i].x, stroke.points[i].y];
            if (options.coordinateSystem === 'world') {
              coords = engine.screen_to_world(coords[0], coords[1]);
            }
            engine.paint_continue_stroke(coords[0], coords[1]);
          }
          
          engine.paint_end_stroke();
        }
      }
      
      // Save strokes as sprites if persistence is enabled
      if (options.persistence && engine.paint_save_strokes_as_sprites) {
        const spriteIds = engine.paint_save_strokes_as_sprites(layer);
        return spriteIds;
      }
      
      return [];
      
    } catch (error) {
      throw new Error(`Failed to integrate paint with table: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  
  const clearTablePaint = async () => {
    if (!engine) {
      throw new Error('Render engine not available');
    }
    
    try {
      engine.paint_clear();
    } catch (error) {
      throw new Error(`Failed to clear table paint: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  
  // Helper function to convert hex to RGB array
  const hexToRgb = (hex: string): [number, number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [1, 1, 1, 1];
    return [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255,
      1.0
    ];
  };
  
  return {
    paintToTable,
    clearTablePaint,
    isIntegrated: !!engine,
    engine
  };
};

interface PaintPanelProps {
  isVisible?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}

export const PaintPanel: React.FC<PaintPanelProps> = ({
  isVisible = true,
  onToggle,
  onClose
}) => {
  // WASM table integration hook
  const { paintToTable, clearTablePaint, isIntegrated, engine } = usePaintTableIntegration();
  
  const [paintState, paintControls] = usePaintSystem(engine, {
    onStrokeCompleted: () => console.log('Stroke completed'),
    onCanvasCleared: () => console.log('Canvas cleared'),
  });

  const brushPresets = useBrushPresets();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelDimensions = usePanelDimensions();
  
  // Paint interaction for table integration
  usePaintInteraction(engine, paintControls, paintState);

  // Responsive layout detection
  const isNarrow = panelDimensions.width < 300;
  const isCompact = panelDimensions.width < 250;

  // Color picker state for future advanced color picker
  const [currentColor, setCurrentColor] = useState('#ffffff');
  
  // Template management state
  const [templates, setTemplates] = useState<TemplateMetadata[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [brushType, setBrushType] = useState<'brush' | 'marker' | 'eraser'>('brush');
  
  // Paint mode state for table integration
  const [paintMode, setPaintMode] = useState<'canvas' | 'table'>('table');

  // Determine current paint mode status for the indicator
  const currentPaintMode: PaintModeStatus = {
    mode: brushType === 'eraser' ? 'erase' : selectedTemplate ? 'template' : paintMode === 'table' ? 'table' : 'draw',
    isActive: paintState.isActive,
    brush: {
      size: 10, // Default brush size - could be enhanced to track actual brush size
      color: currentColor
    },
    template: selectedTemplate ? { name: templates.find(t => t.id === selectedTemplate)?.name || 'Unknown' } : undefined,
    isDrawing: paintState.isDrawing,
    tableIntegration: isIntegrated && paintMode === 'table'
  };

  // Load templates on mount
  useEffect(() => {
    setTemplates(paintTemplateService.getAllTemplateMetadata());
  }, []);

  // Template management functions
  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) return;
    
    // Get current strokes from paint system
    const strokes = paintControls.getStrokes();
    
    await paintTemplateService.saveTemplate(
      newTemplateName.trim(), 
      strokes,
      `Template saved on ${new Date().toLocaleDateString()}`
    );
    setTemplates(paintTemplateService.getAllTemplateMetadata());
    setNewTemplateName('');
    setShowTemplateDialog(false);
  };

  const handleLoadTemplate = async (templateId: string) => {
    const template = paintTemplateService.getTemplate(templateId);
    if (template) {
      // Clear current canvas and apply template strokes
      paintControls.clearAll();
      
      // Load template into table if in table mode
      if (paintMode === 'table' && isIntegrated) {
        try {
          await paintToTable(template.strokes, 'paint', {
            paintLayer: 'paint',
            tableId: 'main-table',
            coordinateSystem: 'world',
            persistence: true
          });
        } catch (error) {
          console.error('Failed to load template to table:', error);
        }
      }
      
      setSelectedTemplate(templateId);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    await paintTemplateService.deleteTemplate(templateId);
    setTemplates(paintTemplateService.getAllTemplateMetadata());
    if (selectedTemplate === templateId) {
      setSelectedTemplate(null);
    }
  };

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

  const panelStyle = {
    width: `${panelDimensions.width}px`,
    maxWidth: '100%',
    minWidth: '200px',
    position: 'relative' as const
  };

  return (
    <div 
      className={`paint-panel ${isNarrow ? 'narrow' : 'wide'} ${isCompact ? 'compact' : ''}`} 
      style={panelStyle}
    >
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
          <PaintModeIndicator status={currentPaintMode} />
          
          <div className="paint-mode-controls">
            {!paintState.isActive ? (
              <button 
                onClick={handleEnterPaintMode}
                className="btn-primary"
                disabled={!engine}
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
            <div 
              className={`brush-type-controls ${isCompact ? 'compact' : ''}`}
              style={{ 
                display: 'flex', 
                gap: isCompact ? '4px' : '8px', 
                marginBottom: '12px',
                flexWrap: isNarrow ? 'wrap' : 'nowrap'
              }}
            >
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
              <div 
                className={`predefined-colors ${isNarrow ? 'narrow' : ''} ${isCompact ? 'compact' : ''}`}
              >
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

        {/* Paint Templates */}
        <div className="templates-section">
          <h4>Paint Templates</h4>
          
          {/* Save Template */}
          <div className="template-save">
            <button
              onClick={() => setShowTemplateDialog(true)}
              disabled={!paintState.isActive || paintState.strokeCount === 0}
              className="btn-primary"
              title="Save current strokes as template"
            >
              💾 Save Template
            </button>
          </div>

          {/* Template List */}
          {templates.length > 0 && (
            <div className="template-list">
              <label>Saved Templates:</label>
              {templates.map((template) => (
                <div key={template.id} className="template-item">
                  <div className="template-info">
                    <span className="template-name">{template.name}</span>
                    <span className="template-meta">
                      {template.strokeCount} strokes • {new Date(template.created).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="template-actions">
                    <button
                      onClick={() => handleLoadTemplate(template.id)}
                      disabled={!paintState.isActive}
                      className="btn-secondary small"
                      title="Load template"
                    >
                      📂 Load
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="btn-danger small"
                      title="Delete template"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Template Save Dialog */}
        {showTemplateDialog && (
          <div className="modal-overlay">
            <div className="modal-dialog">
              <h4>Save Paint Template</h4>
              <div className="form-group">
                <label htmlFor="template-name">Template Name:</label>
                <input
                  id="template-name"
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Enter template name..."
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button
                  onClick={handleSaveTemplate}
                  disabled={!newTemplateName.trim()}
                  className="btn-primary"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowTemplateDialog(false);
                    setNewTemplateName('');
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
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
              onClick={paintControls.redoStroke}
              disabled={!paintState.isActive || !paintState.canRedo}
              className="btn-secondary"
              title="Redo last undone stroke"
            >
              ↷ Redo
            </button>
            <button
              onClick={() => {
                if (engine && engine.paint_save_strokes_as_sprites) {
                  const spriteIds = engine.paint_save_strokes_as_sprites('shapes');
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
