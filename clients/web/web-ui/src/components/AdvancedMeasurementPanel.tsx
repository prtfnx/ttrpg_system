/**
 * Advanced Measurement & Grid Management Panel
 * Production-ready UI for comprehensive measurement tools, grid management,
 * and geometric shape creation with D&D 5e integration
 */

import clsx from 'clsx';
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
import styles from './AdvancedMeasurementPanel.module.css';
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
      <div className={styles.measurementPanelOverlay}>
        <div className={styles.measurementPanel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>📏 Advanced Measurement & Grid System</h2>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">
              ✕
            </button>
          </div>

          {error && (
            <div className={styles.errorMessage} role="alert">
              <span className={styles.errorIcon}>⚠️</span>
              {error}
              <button className={styles.errorDismiss} onClick={() => setError(null)}>✕</button>
            </div>
          )}

          <div className={styles.panelContent}>
            {/* Tool Selection */}
            <div className={styles.toolSelection}>
              <button 
                className={clsx(styles.toolBtn, activeTool === 'measure' && styles.active)}
                onClick={() => handleToolSelect('measure')}
                title="Measurement Tool"
              >
                📏 Measure
              </button>
              <button 
                className={clsx(styles.toolBtn, activeTool === 'shape' && styles.active)}
                onClick={() => handleToolSelect('shape')}
                title="Shape Tool"
              >
                📐 Shapes
              </button>
              <button 
                className={clsx(styles.toolBtn, activeTool === 'template' && styles.active)}
                onClick={() => handleToolSelect('template')}
                title="Template Tool"
              >
                🎯 Templates
              </button>
              <button 
                className={clsx(styles.toolBtn, activeTool === 'grid' && styles.active)}
                onClick={() => handleToolSelect('grid')}
                title="Grid Tool"
              >
                ⊞ Grid
              </button>
            </div>

            {/* Active Tool Status */}
            {activeTool && (
              <div className={styles.activeToolStatus}>
                <div className={styles.statusIndicator}>
                  <span className={clsx(styles.statusDot, styles.active)}></span>
                  Active Tool: <strong>{activeTool.charAt(0).toUpperCase() + activeTool.slice(1)}</strong>
                </div>
                {activeMeasurement && (
                  <div className={styles.measurementStatus}>
                    <span>📏 Measuring... Click to complete</span>
                  </div>
                )}
                {isCreatingShape && (
                  <div className={styles.shapeStatus}>
                    <span>📐 Creating {selectedShapeType}... {shapePoints.length} points</span>
                    {selectedShapeType === 'polygon' && (
                      <span className={styles.shapeHelp}>Double-click to complete</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab Navigation */}
            <div className={styles.tabNavigation}>
              {['measure', 'shapes', 'grids', 'templates', 'settings'].map(tab => (
                <button
                  key={tab}
                  className={clsx(styles.tabBtn, selectedTab === tab && styles.active)}
                  onClick={() => setSelectedTab(tab as any)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className={styles.searchSection}>
              <input
                type="text"
                placeholder="Search measurements, shapes, templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            {/* Tab Content */}
            <div className={styles.tabContent}>
              {selectedTab === 'measure' && (
                <div className={styles.measurementsTab}>
                  <div className={styles.sectionHeader}>
                    <h3>Measurements ({filteredMeasurements.length})</h3>
                    <div className={styles.sectionControls}>
                      <button onClick={handleClearMeasurements} className={styles.clearBtn}>
                        Clear All
                      </button>
                    </div>
                  </div>

                  {activeTool === 'measure' && (
                    <div className={styles.toolOptions}>
                      <h4>Measurement Options</h4>
                      <div className={styles.optionsGrid}>
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

                  <div className={styles.measurementsList}>
                    {filteredMeasurements.map(measurement => (
                      <div key={measurement.id} className={styles.measurementItem}>
                        <div className={styles.measurementInfo}>
                          <div className={styles.measurementDistance}>
                            {advancedMeasurementSystem.formatDistance(measurement.distance)}
                            {measurement.gridDistance !== measurement.distance && (
                              <span className={styles.gridDistance}>
                                ({advancedMeasurementSystem.formatDistance(measurement.gridDistance)} grid)
                              </span>
                            )}
                          </div>
                          <div className={styles.measurementDetails}>
                            Angle: {measurement.angle.toFixed(1)}° | 
                            Length: {measurement.distance.toFixed(1)}px
                            {measurement.label && <span className={styles.measurementLabel}> | {measurement.label}</span>}
                          </div>
                        </div>
                        <div className={styles.measurementControls}>
                          <div 
                            className={styles.colorIndicator} 
                            style={{ backgroundColor: measurement.color }}
                          ></div>
                          <button 
                            className={styles.deleteBtn}
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
                      <div className={styles.emptyState}>
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
                <div className={styles.shapesTab}>
                  <div className={styles.sectionHeader}>
                    <h3>Geometric Shapes ({filteredShapes.length})</h3>
                  </div>

                  {activeTool === 'shape' && (
                    <div className={styles.toolOptions}>
                      <h4>Shape Type</h4>
                      <div className={styles.shapeTypeSelector}>
                        {(['rectangle', 'circle', 'polygon', 'ellipse', 'arc'] as ShapeType[]).map(type => (
                          <button
                            key={type}
                            className={clsx(styles.shapeTypeBtn, selectedShapeType === type && styles.active)}
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

                  <div className={styles.shapesList}>
                    {filteredShapes.map(shape => (
                      <div key={shape.id} className={styles.shapeItem}>
                        <div className={styles.shapeInfo}>
                          <div className={styles.shapeType}>
                            {shape.type.charAt(0).toUpperCase() + shape.type.slice(1)}
                            {shape.label && <span className={styles.shapeLabel}> - {shape.label}</span>}
                          </div>
                          <div className={styles.shapeDetails}>
                            {shape.area && <span>Area: {shape.area.toFixed(1)}</span>}
                            {shape.perimeter && <span> | Perimeter: {shape.perimeter.toFixed(1)}</span>}
                          </div>
                        </div>
                        <div className={styles.shapeControls}>
                          <div 
                            className={styles.colorIndicator} 
                            style={{ backgroundColor: shape.color }}
                          ></div>
                          {shape.fillColor && (
                            <div 
                              className={styles.fillIndicator} 
                              style={{ backgroundColor: shape.fillColor }}
                            ></div>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {filteredShapes.length === 0 && (
                      <div className={styles.emptyState}>
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
                <div className={styles.gridsTab}>
                  <div className={styles.sectionHeader}>
                    <h3>Grid Configuration</h3>
                  </div>

                  <div className={styles.gridSelector}>
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
                    <div className={styles.gridSettings}>
                      <h4>Grid Settings</h4>
                      <div className={styles.settingsGrid}>
                        <div className={styles.setting}>
                          <label>Visible:</label>
                          <input
                            type="checkbox"
                            checked={activeGrid.visible}
                            onChange={(e) => handleGridUpdate(activeGrid.id, { visible: e.target.checked })}
                          />
                        </div>
                        <div className={styles.setting}>
                          <label>Snap to Grid:</label>
                          <input
                            type="checkbox"
                            checked={activeGrid.snapToGrid}
                            onChange={(e) => handleGridUpdate(activeGrid.id, { snapToGrid: e.target.checked })}
                          />
                        </div>
                        <div className={styles.setting}>
                          <label>Size:</label>
                          <input
                            type="number"
                            value={activeGrid.size}
                            onChange={(e) => handleGridUpdate(activeGrid.id, { size: parseFloat(e.target.value) })}
                          />
                        </div>
                        <div className={styles.setting}>
                          <label>Scale:</label>
                          <input
                            type="number"
                            value={activeGrid.scale}
                            onChange={(e) => handleGridUpdate(activeGrid.id, { scale: parseFloat(e.target.value) })}
                          />
                        </div>
                        <div className={styles.setting}>
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
                        <div className={styles.setting}>
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
                        <div className={styles.setting}>
                          <label>Color:</label>
                          <input
                            type="color"
                            value={activeGrid.color}
                            onChange={(e) => handleGridUpdate(activeGrid.id, { color: e.target.value })}
                          />
                        </div>
                      </div>

                      {activeGrid.type === 'hex' && (
                        <div className={styles.hexSettings}>
                          <h5>Hex Grid Settings</h5>
                          <div className={styles.setting}>
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
                <div className={styles.templatesTab}>
                  <div className={styles.sectionHeader}>
                    <h3>Measurement Templates</h3>
                    <button onClick={handleCreateCustomTemplate} className={styles.createBtn}>
                      + Create Template
                    </button>
                  </div>

                  <div className={styles.templatesGrid}>
                    {templates.map(template => (
                      <div 
                        key={template.id} 
                        className={clsx(styles.templateItem, selectedTemplate === template.id && styles.selected)}
                        onClick={() => setSelectedTemplate(template.id)}
                      >
                        <div className={styles.templateIcon}>
                          {template.type === 'cone' && '📐'}
                          {template.type === 'sphere' && '🔴'}
                          {template.type === 'line' && '📏'}
                          {template.type === 'cylinder' && '🛢️'}
                          {template.type === 'cube' && '⬛'}
                          {template.type === 'custom' && '⭐'}
                        </div>
                        <div className={styles.templateInfo}>
                          <div className={styles.templateName}>{template.name}</div>
                          <div className={styles.templateDetails}>
                            Size: {template.size} {template.secondarySize && `x ${template.secondarySize}`}
                          </div>
                          <div className={styles.templateDescription}>{template.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedTemplate && activeTool === 'template' && (
                    <div className={styles.templateInstructions}>
                      <p>📍 Click on the canvas to place the selected template.</p>
                    </div>
                  )}
                </div>
              )}

              {selectedTab === 'settings' && settings && (
                <div className={styles.settingsTab}>
                  <div className={styles.sectionHeader}>
                    <h3>System Settings</h3>
                  </div>

                  <div className={styles.settingsSections}>
                    <div className={styles.settingsSection}>
                      <h4>Display Settings</h4>
                      <div className={styles.settingsGrid}>
                        <div className={styles.setting}>
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
                        <div className={styles.setting}>
                          <label>Precision (decimals):</label>
                          <input
                            type="number"
                            min="0"
                            max="3"
                            value={settings.precision}
                            onChange={(e) => handleSettingsUpdate({ precision: parseInt(e.target.value) })}
                          />
                        </div>
                        <div className={styles.setting}>
                          <label>Show Tooltips:</label>
                          <input
                            type="checkbox"
                            checked={settings.showTooltips}
                            onChange={(e) => handleSettingsUpdate({ showTooltips: e.target.checked })}
                          />
                        </div>
                        <div className={styles.setting}>
                          <label>Show Distance Labels:</label>
                          <input
                            type="checkbox"
                            checked={settings.showDistanceLabels}
                            onChange={(e) => handleSettingsUpdate({ showDistanceLabels: e.target.checked })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className={styles.settingsSection}>
                      <h4>Measurement Line Style</h4>
                      <div className={styles.settingsGrid}>
                        <div className={styles.setting}>
                          <label>Line Color:</label>
                          <input
                            type="color"
                            value={settings.measurementLineColor}
                            onChange={(e) => handleSettingsUpdate({ measurementLineColor: e.target.value })}
                          />
                        </div>
                        <div className={styles.setting}>
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
                        <div className={styles.setting}>
                          <label>Highlight Color:</label>
                          <input
                            type="color"
                            value={settings.highlightColor}
                            onChange={(e) => handleSettingsUpdate({ highlightColor: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className={styles.settingsSection}>
                      <h4>Advanced Settings</h4>
                      <button 
                        className={styles.toggleBtn}
                        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                      >
                        {showAdvancedSettings ? 'Hide' : 'Show'} Advanced Settings
                      </button>
                      
                      {showAdvancedSettings && (
                        <div className={styles.settingsGrid}>
                          <div className={styles.setting}>
                            <label>Snap Tolerance:</label>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={settings.snapTolerance}
                              onChange={(e) => handleSettingsUpdate({ snapTolerance: parseInt(e.target.value) })}
                            />
                          </div>
                          <div className={styles.setting}>
                            <label>Max History Size:</label>
                            <input
                              type="number"
                              min="10"
                              max="1000"
                              value={settings.maxHistorySize}
                              onChange={(e) => handleSettingsUpdate({ maxHistorySize: parseInt(e.target.value) })}
                            />
                          </div>
                          <div className={styles.setting}>
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

                  <div className={styles.dataManagement}>
                    <h4>Data Management</h4>
                    <div className={styles.dataControls}>
                      <button onClick={handleExportData} className={styles.exportBtn}>
                        📥 Export Data
                      </button>
                      <button onClick={handleImportData} className={styles.importBtn}>
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

