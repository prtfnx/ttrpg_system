/**
 * Advanced Measurement & Grid Management Panel
 * Production-ready UI for comprehensive measurement tools, grid management,
 * and geometric shape creation with D&D 5e integration
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    advancedMeasurementSystem,
    type GeometricShape,
    type GridConfiguration,
    type HexGridConfiguration,
    type MeasurementLine,
    type MeasurementSettings,
    type MeasurementTemplate
} from '../services/advancedMeasurement.service';
import './AdvancedMeasurementPanel.css';
import { ErrorBoundary } from './common/ErrorBoundary';

interface AdvancedMeasurementPanelProps {
  isOpen: boolean;
  onClose: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onMeasurementStart?: (point: { x: number; y: number }) => void;
  onMeasurementUpdate?: (measurementId: string, endPoint: { x: number; y: number }) => void;
  onMeasurementComplete?: (measurement: MeasurementLine) => void;
}

type ActiveTool = 'measure' | 'shape' | 'template' | 'grid' | null;
type ShapeType = 'circle' | 'rectangle' | 'polygon' | 'arc' | 'ellipse';

const AdvancedMeasurementPanel: React.FC<AdvancedMeasurementPanelProps> = ({
  isOpen,
  onClose,
  canvasRef,
  onMeasurementStart,
  onMeasurementUpdate,
  onMeasurementComplete
}) => {
  // State management
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [measurements, setMeasurements] = useState<MeasurementLine[]>([]);
  const [shapes, setShapes] = useState<GeometricShape[]>([]);
  const [grids, setGrids] = useState<GridConfiguration[]>([]);
  const [templates, setTemplates] = useState<MeasurementTemplate[]>([]);
  const [settings, setSettings] = useState<MeasurementSettings | null>(null);
  const [activeGrid, setActiveGrid] = useState<GridConfiguration | null>(null);
  const [selectedTab, setSelectedTab] = useState<'measure' | 'shapes' | 'grids' | 'templates' | 'settings'>('measure');
  
  // Tool-specific state
  const [selectedShapeType, setSelectedShapeType] = useState<ShapeType>('rectangle');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isCreatingShape, setIsCreatingShape] = useState(false);
  const [shapePoints, setShapePoints] = useState<{ x: number; y: number }[]>([]);
  const [activeMeasurement, setActiveMeasurement] = useState<string | null>(null);
  
  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize and load data
  useEffect(() => {
    if (!isOpen) return;

    try {
      setMeasurements(advancedMeasurementSystem.getMeasurements());
      setShapes(advancedMeasurementSystem.getShapes());
      setGrids(advancedMeasurementSystem.getGrids());
      setTemplates(advancedMeasurementSystem.getTemplates());
      setSettings(advancedMeasurementSystem.getSettings());
      setActiveGrid(advancedMeasurementSystem.getActiveGrid());
    } catch (err) {
      setError('Failed to load measurement system data: ' + (err as Error).message);
    }
  }, [isOpen]);

  // Subscribe to measurement system events
  useEffect(() => {
    const handleMeasurementEvent = (event: string, data: any) => {
      switch (event) {
        case 'measurementStarted':
          setActiveMeasurement(data.measurement.id);
          onMeasurementStart?.(data.measurement.start);
          break;
        case 'measurementUpdated':
          onMeasurementUpdate?.(data.measurement.id, data.measurement.end);
          break;
        case 'measurementCompleted':
          setActiveMeasurement(null);
          setMeasurements(advancedMeasurementSystem.getMeasurements());
          onMeasurementComplete?.(data.measurement);
          break;
        case 'shapeCreated':
          setShapes(advancedMeasurementSystem.getShapes());
          setIsCreatingShape(false);
          setShapePoints([]);
          break;
        case 'activeGridChanged':
          setActiveGrid(advancedMeasurementSystem.getActiveGrid());
          break;
        case 'settingsUpdated':
          setSettings(data.settings);
          break;
        default:
          break;
      }
    };

    advancedMeasurementSystem.subscribe('ui', handleMeasurementEvent);

    return () => {
      advancedMeasurementSystem.unsubscribe('ui');
    };
  }, [onMeasurementStart, onMeasurementUpdate, onMeasurementComplete]);

  // Canvas click handler for measurements and shapes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen) return;

    const handleCanvasClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const point = { x, y };

      try {
        switch (activeTool) {
          case 'measure':
            if (activeMeasurement) {
              // Complete current measurement
              advancedMeasurementSystem.completeMeasurement(activeMeasurement);
            } else {
              // Start new measurement
              advancedMeasurementSystem.startMeasurement(point);
            }
            break;

          case 'shape':
            if (isCreatingShape) {
              const newPoints = [...shapePoints, point];
              setShapePoints(newPoints);

              // Complete shape based on type
              if ((selectedShapeType === 'rectangle' || selectedShapeType === 'circle' || selectedShapeType === 'ellipse') && newPoints.length === 2) {
                advancedMeasurementSystem.createShape(selectedShapeType, newPoints);
              } else if (selectedShapeType === 'polygon' && event.detail === 2) {
                // Double-click to complete polygon
                advancedMeasurementSystem.createShape(selectedShapeType, newPoints);
              }
            } else {
              setIsCreatingShape(true);
              setShapePoints([point]);
            }
            break;

          case 'template':
            if (selectedTemplate) {
              // Place template at click location
              // This would integrate with the template system
              console.log('Template placement at:', point, 'template:', selectedTemplate);
            }
            break;

          default:
            break;
        }
      } catch (err) {
        setError('Tool operation failed: ' + (err as Error).message);
      }
    };

    const handleCanvasMouseMove = (event: MouseEvent) => {
      if (activeMeasurement) {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        advancedMeasurementSystem.updateMeasurement(activeMeasurement, { x, y });
      }
    };

    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);

    return () => {
      canvas.removeEventListener('click', handleCanvasClick);
      canvas.removeEventListener('mousemove', handleCanvasMouseMove);
    };
  }, [canvasRef, isOpen, activeTool, activeMeasurement, isCreatingShape, shapePoints, selectedShapeType, selectedTemplate]);

  // Tool handlers
  const handleToolSelect = useCallback((tool: ActiveTool) => {
    setActiveTool(tool);
    
    // Cancel any active operations
    if (activeMeasurement) {
      advancedMeasurementSystem.cancelMeasurement(activeMeasurement);
    }
    setIsCreatingShape(false);
    setShapePoints([]);
    setError(null);
  }, [activeMeasurement]);

  const handleClearMeasurements = useCallback(() => {
    if (window.confirm('Clear all measurements? This cannot be undone.')) {
      advancedMeasurementSystem.clearMeasurements(true);
      setMeasurements([]);
    }
  }, []);

  const handleGridChange = useCallback((gridId: string) => {
    advancedMeasurementSystem.setActiveGrid(gridId);
  }, []);

  const handleGridUpdate = useCallback((gridId: string, updates: Partial<GridConfiguration>) => {
    advancedMeasurementSystem.updateGrid(gridId, updates);
    setGrids(advancedMeasurementSystem.getGrids());
    if (activeGrid?.id === gridId) {
      setActiveGrid(advancedMeasurementSystem.getActiveGrid());
    }
  }, [activeGrid]);

  const handleSettingsUpdate = useCallback((updates: Partial<MeasurementSettings>) => {
    advancedMeasurementSystem.updateSettings(updates);
  }, []);

  const handleExportData = useCallback(() => {
    try {
      const data = advancedMeasurementSystem.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `measurements_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export data: ' + (err as Error).message);
    }
  }, []);

  const handleImportData = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        advancedMeasurementSystem.importData(content);
        
        // Refresh UI data
        setMeasurements(advancedMeasurementSystem.getMeasurements());
        setShapes(advancedMeasurementSystem.getShapes());
        setGrids(advancedMeasurementSystem.getGrids());
        setTemplates(advancedMeasurementSystem.getTemplates());
        setActiveGrid(advancedMeasurementSystem.getActiveGrid());
      } catch (err) {
        setError('Failed to import data: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleCreateCustomTemplate = useCallback(() => {
    const name = prompt('Template name:');
    if (!name) return;
    
    const size = parseFloat(prompt('Size (in current units):') || '10');
    if (isNaN(size)) return;

    try {
      advancedMeasurementSystem.createTemplate({
        name,
        type: 'custom',
        size,
        color: '#ff6b35',
        fillColor: '#ff6b3533',
        opacity: 0.7,
        rotatable: true,
        snapToGrid: true,
        showArea: true,
        description: `Custom ${name} template`
      });
      setTemplates(advancedMeasurementSystem.getTemplates());
    } catch (err) {
      setError('Failed to create template: ' + (err as Error).message);
    }
  }, []);

  const filteredMeasurements = measurements.filter(m => 
    !searchQuery || m.label?.toLowerCase().includes(searchQuery.toLowerCase()) || m.id.includes(searchQuery)
  );

  const filteredShapes = shapes.filter(s => 
    !searchQuery || s.label?.toLowerCase().includes(searchQuery.toLowerCase()) || s.type.includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <ErrorBoundary>
      <div className="measurement-panel-overlay">
        <div className="measurement-panel">
          <div className="panel-header">
            <h2>📏 Advanced Measurement & Grid System</h2>
            <button className="close-btn" onClick={onClose} aria-label="Close panel">
              ✕
            </button>
          </div>

          {error && (
            <div className="error-message" role="alert">
              <span className="error-icon">⚠️</span>
              {error}
              <button className="error-dismiss" onClick={() => setError(null)}>✕</button>
            </div>
          )}

          <div className="panel-content">
            {/* Tool Selection */}
            <div className="tool-selection">
              <button 
                className={`tool-btn ${activeTool === 'measure' ? 'active' : ''}`}
                onClick={() => handleToolSelect('measure')}
                title="Measurement Tool"
              >
                📏 Measure
              </button>
              <button 
                className={`tool-btn ${activeTool === 'shape' ? 'active' : ''}`}
                onClick={() => handleToolSelect('shape')}
                title="Shape Tool"
              >
                📐 Shapes
              </button>
              <button 
                className={`tool-btn ${activeTool === 'template' ? 'active' : ''}`}
                onClick={() => handleToolSelect('template')}
                title="Template Tool"
              >
                🎯 Templates
              </button>
              <button 
                className={`tool-btn ${activeTool === 'grid' ? 'active' : ''}`}
                onClick={() => handleToolSelect('grid')}
                title="Grid Tool"
              >
                ⊞ Grid
              </button>
            </div>

            {/* Active Tool Status */}
            {activeTool && (
              <div className="active-tool-status">
                <div className="status-indicator">
                  <span className="status-dot active"></span>
                  Active Tool: <strong>{activeTool.charAt(0).toUpperCase() + activeTool.slice(1)}</strong>
                </div>
                {activeMeasurement && (
                  <div className="measurement-status">
                    <span>📏 Measuring... Click to complete</span>
                  </div>
                )}
                {isCreatingShape && (
                  <div className="shape-status">
                    <span>📐 Creating {selectedShapeType}... {shapePoints.length} points</span>
                    {selectedShapeType === 'polygon' && (
                      <span className="shape-help">Double-click to complete</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab Navigation */}
            <div className="tab-navigation">
              {['measure', 'shapes', 'grids', 'templates', 'settings'].map(tab => (
                <button
                  key={tab}
                  className={`tab-btn ${selectedTab === tab ? 'active' : ''}`}
                  onClick={() => setSelectedTab(tab as any)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="search-section">
              <input
                type="text"
                placeholder="Search measurements, shapes, templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>

            {/* Tab Content */}
            <div className="tab-content">
              {selectedTab === 'measure' && (
                <div className="measurements-tab">
                  <div className="section-header">
                    <h3>Measurements ({filteredMeasurements.length})</h3>
                    <div className="section-controls">
                      <button onClick={handleClearMeasurements} className="clear-btn">
                        Clear All
                      </button>
                    </div>
                  </div>

                  {activeTool === 'measure' && (
                    <div className="tool-options">
                      <h4>Measurement Options</h4>
                      <div className="options-grid">
                        <label>
                          <input
                            type="checkbox"
                            checked={settings?.snapToGrid || false}
                            onChange={(e) => handleSettingsUpdate({ snapToGrid: e.target.checked })}
                          />
                          Snap to Grid
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={settings?.showDistanceLabels || false}
                            onChange={(e) => handleSettingsUpdate({ showDistanceLabels: e.target.checked })}
                          />
                          Show Labels
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={settings?.showAngleMarkers || false}
                            onChange={(e) => handleSettingsUpdate({ showAngleMarkers: e.target.checked })}
                          />
                          Show Angles
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="measurements-list">
                    {filteredMeasurements.map(measurement => (
                      <div key={measurement.id} className="measurement-item">
                        <div className="measurement-info">
                          <div className="measurement-distance">
                            {advancedMeasurementSystem.formatDistance(measurement.distance)}
                            {measurement.gridDistance !== measurement.distance && (
                              <span className="grid-distance">
                                ({advancedMeasurementSystem.formatDistance(measurement.gridDistance)} grid)
                              </span>
                            )}
                          </div>
                          <div className="measurement-details">
                            Angle: {measurement.angle.toFixed(1)}° | 
                            Length: {measurement.distance.toFixed(1)}px
                            {measurement.label && <span className="measurement-label"> | {measurement.label}</span>}
                          </div>
                        </div>
                        <div className="measurement-controls">
                          <div 
                            className="color-indicator" 
                            style={{ backgroundColor: measurement.color }}
                          ></div>
                          <button 
                            className="delete-btn"
                            onClick={() => {
                              // Remove measurement (this would need to be implemented in the service)
                              console.log('Remove measurement:', measurement.id);
                            }}
                            title="Delete measurement"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    {filteredMeasurements.length === 0 && (
                      <div className="empty-state">
                        <p>No measurements yet.</p>
                        {activeTool === 'measure' ? (
                          <p>Click on the canvas to start measuring.</p>
                        ) : (
                          <p>Select the Measure tool and click on the canvas to start.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedTab === 'shapes' && (
                <div className="shapes-tab">
                  <div className="section-header">
                    <h3>Geometric Shapes ({filteredShapes.length})</h3>
                  </div>

                  {activeTool === 'shape' && (
                    <div className="tool-options">
                      <h4>Shape Type</h4>
                      <div className="shape-type-selector">
                        {(['rectangle', 'circle', 'polygon', 'ellipse', 'arc'] as ShapeType[]).map(type => (
                          <button
                            key={type}
                            className={`shape-type-btn ${selectedShapeType === type ? 'active' : ''}`}
                            onClick={() => setSelectedShapeType(type)}
                          >
                            {type === 'rectangle' && '▭'}
                            {type === 'circle' && '●'}
                            {type === 'polygon' && '⬟'}
                            {type === 'ellipse' && '⬭'}
                            {type === 'arc' && '◗'}
                            <span>{type}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="shapes-list">
                    {filteredShapes.map(shape => (
                      <div key={shape.id} className="shape-item">
                        <div className="shape-info">
                          <div className="shape-type">
                            {shape.type.charAt(0).toUpperCase() + shape.type.slice(1)}
                            {shape.label && <span className="shape-label"> - {shape.label}</span>}
                          </div>
                          <div className="shape-details">
                            {shape.area && <span>Area: {shape.area.toFixed(1)}</span>}
                            {shape.perimeter && <span> | Perimeter: {shape.perimeter.toFixed(1)}</span>}
                          </div>
                        </div>
                        <div className="shape-controls">
                          <div 
                            className="color-indicator" 
                            style={{ backgroundColor: shape.color }}
                          ></div>
                          {shape.fillColor && (
                            <div 
                              className="fill-indicator" 
                              style={{ backgroundColor: shape.fillColor }}
                            ></div>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {filteredShapes.length === 0 && (
                      <div className="empty-state">
                        <p>No shapes created yet.</p>
                        {activeTool === 'shape' ? (
                          <p>Select a shape type and click on the canvas to start drawing.</p>
                        ) : (
                          <p>Select the Shapes tool to begin creating geometric shapes.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedTab === 'grids' && (
                <div className="grids-tab">
                  <div className="section-header">
                    <h3>Grid Configuration</h3>
                  </div>

                  <div className="grid-selector">
                    <h4>Active Grid</h4>
                    <select 
                      value={activeGrid?.id || ''}
                      onChange={(e) => handleGridChange(e.target.value)}
                    >
                      <option value="">No Grid</option>
                      {grids.map(grid => (
                        <option key={grid.id} value={grid.id}>
                          {grid.name} ({grid.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  {activeGrid && (
                    <div className="grid-settings">
                      <h4>Grid Settings</h4>
                      <div className="settings-grid">
                        <div className="setting">
                          <label>Visible:</label>
                          <input
                            type="checkbox"
                            checked={activeGrid.visible}
                            onChange={(e) => handleGridUpdate(activeGrid.id, { visible: e.target.checked })}
                          />
                        </div>
                        <div className="setting">
                          <label>Snap to Grid:</label>
                          <input
                            type="checkbox"
                            checked={activeGrid.snapToGrid}
                            onChange={(e) => handleGridUpdate(activeGrid.id, { snapToGrid: e.target.checked })}
                          />
                        </div>
                        <div className="setting">
                          <label>Size:</label>
                          <input
                            type="number"
                            value={activeGrid.size}
                            onChange={(e) => handleGridUpdate(activeGrid.id, { size: parseFloat(e.target.value) })}
                          />
                        </div>
                        <div className="setting">
                          <label>Scale:</label>
                          <input
                            type="number"
                            value={activeGrid.scale}
                            onChange={(e) => handleGridUpdate(activeGrid.id, { scale: parseFloat(e.target.value) })}
                          />
                        </div>
                        <div className="setting">
                          <label>Unit:</label>
                          <select
                            value={activeGrid.unit}
                            onChange={(e) => handleGridUpdate(activeGrid.id, { unit: e.target.value as any })}
                          >
                            <option value="feet">Feet</option>
                            <option value="meters">Meters</option>
                            <option value="squares">Squares</option>
                            <option value="hexes">Hexes</option>
                            <option value="custom">Custom</option>
                          </select>
                        </div>
                        <div className="setting">
                          <label>Opacity:</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={activeGrid.opacity}
                            onChange={(e) => handleGridUpdate(activeGrid.id, { opacity: parseFloat(e.target.value) })}
                          />
                          <span>{(activeGrid.opacity * 100).toFixed(0)}%</span>
                        </div>
                        <div className="setting">
                          <label>Color:</label>
                          <input
                            type="color"
                            value={activeGrid.color}
                            onChange={(e) => handleGridUpdate(activeGrid.id, { color: e.target.value })}
                          />
                        </div>
                      </div>

                      {activeGrid.type === 'hex' && (
                        <div className="hex-settings">
                          <h5>Hex Grid Settings</h5>
                          <div className="setting">
                            <label>Orientation:</label>
                            <select
                              value={(activeGrid as HexGridConfiguration).orientation}
                              onChange={(e) => {
                                const hexGrid = activeGrid as HexGridConfiguration;
                                advancedMeasurementSystem.updateGrid(activeGrid.id, {
                                  ...hexGrid,
                                  orientation: e.target.value as 'flat' | 'pointy'
                                } as any);
                              }}
                            >
                              <option value="flat">Flat Top</option>
                              <option value="pointy">Pointy Top</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedTab === 'templates' && (
                <div className="templates-tab">
                  <div className="section-header">
                    <h3>Measurement Templates</h3>
                    <button onClick={handleCreateCustomTemplate} className="create-btn">
                      + Create Template
                    </button>
                  </div>

                  <div className="templates-grid">
                    {templates.map(template => (
                      <div 
                        key={template.id} 
                        className={`template-item ${selectedTemplate === template.id ? 'selected' : ''}`}
                        onClick={() => setSelectedTemplate(template.id)}
                      >
                        <div className="template-icon">
                          {template.type === 'cone' && '📐'}
                          {template.type === 'sphere' && '🔴'}
                          {template.type === 'line' && '📏'}
                          {template.type === 'cylinder' && '🛢️'}
                          {template.type === 'cube' && '⬛'}
                          {template.type === 'custom' && '⭐'}
                        </div>
                        <div className="template-info">
                          <div className="template-name">{template.name}</div>
                          <div className="template-details">
                            Size: {template.size} {template.secondarySize && `x ${template.secondarySize}`}
                          </div>
                          <div className="template-description">{template.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedTemplate && activeTool === 'template' && (
                    <div className="template-instructions">
                      <p>📍 Click on the canvas to place the selected template.</p>
                    </div>
                  )}
                </div>
              )}

              {selectedTab === 'settings' && settings && (
                <div className="settings-tab">
                  <div className="section-header">
                    <h3>System Settings</h3>
                  </div>

                  <div className="settings-sections">
                    <div className="settings-section">
                      <h4>Display Settings</h4>
                      <div className="settings-grid">
                        <div className="setting">
                          <label>Default Unit:</label>
                          <select
                            value={settings.defaultUnit}
                            onChange={(e) => handleSettingsUpdate({ defaultUnit: e.target.value as any })}
                          >
                            <option value="feet">Feet</option>
                            <option value="meters">Meters</option>
                            <option value="squares">Squares</option>
                            <option value="hexes">Hexes</option>
                          </select>
                        </div>
                        <div className="setting">
                          <label>Precision (decimals):</label>
                          <input
                            type="number"
                            min="0"
                            max="3"
                            value={settings.precision}
                            onChange={(e) => handleSettingsUpdate({ precision: parseInt(e.target.value) })}
                          />
                        </div>
                        <div className="setting">
                          <label>Show Tooltips:</label>
                          <input
                            type="checkbox"
                            checked={settings.showTooltips}
                            onChange={(e) => handleSettingsUpdate({ showTooltips: e.target.checked })}
                          />
                        </div>
                        <div className="setting">
                          <label>Show Distance Labels:</label>
                          <input
                            type="checkbox"
                            checked={settings.showDistanceLabels}
                            onChange={(e) => handleSettingsUpdate({ showDistanceLabels: e.target.checked })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="settings-section">
                      <h4>Measurement Line Style</h4>
                      <div className="settings-grid">
                        <div className="setting">
                          <label>Line Color:</label>
                          <input
                            type="color"
                            value={settings.measurementLineColor}
                            onChange={(e) => handleSettingsUpdate({ measurementLineColor: e.target.value })}
                          />
                        </div>
                        <div className="setting">
                          <label>Line Thickness:</label>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            value={settings.measurementLineThickness}
                            onChange={(e) => handleSettingsUpdate({ measurementLineThickness: parseInt(e.target.value) })}
                          />
                          <span>{settings.measurementLineThickness}px</span>
                        </div>
                        <div className="setting">
                          <label>Highlight Color:</label>
                          <input
                            type="color"
                            value={settings.highlightColor}
                            onChange={(e) => handleSettingsUpdate({ highlightColor: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="settings-section">
                      <h4>Advanced Settings</h4>
                      <button 
                        className="toggle-btn"
                        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                      >
                        {showAdvancedSettings ? 'Hide' : 'Show'} Advanced Settings
                      </button>
                      
                      {showAdvancedSettings && (
                        <div className="settings-grid">
                          <div className="setting">
                            <label>Snap Tolerance:</label>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={settings.snapTolerance}
                              onChange={(e) => handleSettingsUpdate({ snapTolerance: parseInt(e.target.value) })}
                            />
                          </div>
                          <div className="setting">
                            <label>Max History Size:</label>
                            <input
                              type="number"
                              min="10"
                              max="1000"
                              value={settings.maxHistorySize}
                              onChange={(e) => handleSettingsUpdate({ maxHistorySize: parseInt(e.target.value) })}
                            />
                          </div>
                          <div className="setting">
                            <label>Auto-save History:</label>
                            <input
                              type="checkbox"
                              checked={settings.autoSaveHistory}
                              onChange={(e) => handleSettingsUpdate({ autoSaveHistory: e.target.checked })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="data-management">
                    <h4>Data Management</h4>
                    <div className="data-controls">
                      <button onClick={handleExportData} className="export-btn">
                        📥 Export Data
                      </button>
                      <button onClick={handleImportData} className="import-btn">
                        📤 Import Data
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileImport}
                        accept=".json"
                        style={{ display: 'none' }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default AdvancedMeasurementPanel;