/**
 * Fog of War Management Panel
 * Professional React UI for fog of war system management with production-quality features
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fogOfWarSystem,
  type AnyFogOfWarRegion,
  type FogOfWarSettings,
  type FogOfWarViewport
} from '../services/fogOfWar.service';
import '../styles/FogOfWarPanel.css';

interface FogOfWarPanelProps {
  isOpen: boolean;
  onClose: () => void;
  canvasRef?: React.RefObject<HTMLCanvasElement>;
}

interface PerformanceMetrics {
  fps: number;
  regionCount: number;
  visibleRegionCount: number;
  cacheSize: number;
  isWebGLEnabled: boolean;
  lastRenderTime: number;
}

const TOOL_DESCRIPTIONS = {
  select: 'Select and move fog regions',
  reveal: 'Click to reveal areas (make visible)',
  hide: 'Click to hide areas (add fog)',
  polygon: 'Draw custom polygon shapes',
  circle: 'Draw circular fog areas',
  rectangle: 'Draw rectangular fog areas'
} as const;

const QUALITY_LEVELS = [
  { value: 'low', label: 'Low (Performance)' },
  { value: 'medium', label: 'Medium (Balanced)' },
  { value: 'high', label: 'High (Quality)' },
  { value: 'ultra', label: 'Ultra (WebGL)' }
] as const;

const FOG_PATTERNS = [
  { value: 'solid', label: 'Solid' },
  { value: 'crosshatch', label: 'Crosshatch' },
  { value: 'diagonal', label: 'Diagonal Lines' },
  { value: 'dots', label: 'Dots' }
] as const;

export const FogOfWarPanel: React.FC<FogOfWarPanelProps> = ({
  isOpen,
  onClose,
  canvasRef
}) => {
  // State management
  const [activeTab, setActiveTab] = useState<'tools' | 'regions' | 'settings' | 'performance'>('tools');
  const [settings, setSettings] = useState<FogOfWarSettings>(fogOfWarSystem.getSettings());
  const [regions, setRegions] = useState<AnyFogOfWarRegion[]>([]);
  const [viewport, setViewport] = useState<FogOfWarViewport>(fogOfWarSystem.getViewport());
  const [currentTool, setCurrentTool] = useState(fogOfWarSystem.getCurrentTool());
  const [isEnabled, setIsEnabled] = useState(fogOfWarSystem.getEnabled());
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    regionCount: 0,
    visibleRegionCount: 0,
    cacheSize: 0,
    isWebGLEnabled: false,
    lastRenderTime: 0
  });

  // Refs for performance
  const subscriptionKeyRef = useRef('fog_panel');
    const updateIntervalRef = useRef<number | null>(null);

  // === Event Handlers ===

  const handleSystemEvent = useCallback(() => {
    // Update UI state based on system events
    setRegions(fogOfWarSystem.getRegions());
    setSettings(fogOfWarSystem.getSettings());
    setViewport(fogOfWarSystem.getViewport());
    setCurrentTool(fogOfWarSystem.getCurrentTool());
  }, []);

  // === Effects ===

  useEffect(() => {
    if (!isOpen) return;

    // Subscribe to fog of war events
    const events = [
      'regionCreated', 'regionUpdated', 'regionRemoved', 'regionsCleared',
      'settingsUpdated', 'viewportUpdated', 'toolChanged', 'fogOfWarToggled', 'regionSelected'
    ];

    events.forEach(event => {
      fogOfWarSystem.subscribe(subscriptionKeyRef.current, event, handleSystemEvent);
    });

    // Initialize data
    setRegions(fogOfWarSystem.getRegions());
    setSettings(fogOfWarSystem.getSettings());
    setViewport(fogOfWarSystem.getViewport());
    setCurrentTool(fogOfWarSystem.getCurrentTool());
    setIsEnabled(fogOfWarSystem.getEnabled());

    // Start performance monitoring
    updateIntervalRef.current = setInterval(() => {
      setPerformanceMetrics(fogOfWarSystem.getPerformanceMetrics());
    }, 1000);

    return () => {
      // Cleanup subscriptions
      events.forEach(event => {
        fogOfWarSystem.unsubscribe(subscriptionKeyRef.current, event);
      });

      // Clear performance monitoring
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
    };
  }, [isOpen, handleSystemEvent]);

  useEffect(() => {
    // Initialize fog of war system when canvas is available
    if (isOpen && canvasRef?.current && !fogOfWarSystem.getEnabled()) {
      try {
        fogOfWarSystem.initialize(canvasRef.current);
      } catch (error) {
        console.error('Failed to initialize fog of war system:', error);
      }
    }
  }, [isOpen, canvasRef]);

  // === Handlers ===

  const handleToolChange = useCallback((tool: typeof currentTool) => {
    fogOfWarSystem.setTool(tool);
  }, []);

  const handleToggleFogOfWar = useCallback(() => {
    fogOfWarSystem.setEnabled(!isEnabled);
  }, [isEnabled]);

  const handleSettingChange = useCallback(<K extends keyof FogOfWarSettings>(
    key: K,
    value: FogOfWarSettings[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    fogOfWarSystem.updateSettings({ [key]: value });
  }, [settings]);

  const handleRegionToggle = useCallback((regionId: string) => {
    fogOfWarSystem.toggleRegion(regionId, true);
  }, []);

  const handleRegionDelete = useCallback((regionId: string) => {
    if (window.confirm('Are you sure you want to delete this region?')) {
      fogOfWarSystem.removeRegion(regionId);
      if (selectedRegion === regionId) {
        setSelectedRegion(null);
      }
    }
  }, [selectedRegion]);

  const handleClearAllRegions = useCallback(() => {
    if (window.confirm('Are you sure you want to clear all fog regions?')) {
      fogOfWarSystem.clearRegions();
      setSelectedRegion(null);
    }
  }, []);

  const handleExportData = useCallback(() => {
    try {
      const data = fogOfWarSystem.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fog-of-war-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export fog data:', error);
      alert('Failed to export fog data. Please try again.');
    }
  }, []);

  const handleImportData = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        fogOfWarSystem.importData(data);
        alert('Fog data imported successfully!');
      } catch (error) {
        console.error('Failed to import fog data:', error);
        alert('Failed to import fog data. Please check the file format.');
      }
    };
    reader.readAsText(file);

    // Reset input
    event.target.value = '';
  }, []);

  // === Filtered Regions ===

  const filteredRegions = regions.filter(region =>
    region.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // === Render Methods ===

  const renderToolsTab = () => (
    <div className="fog-tools-section">
      <div className="fog-enable-section">
        <label className="fog-checkbox">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={handleToggleFogOfWar}
          />
          <span className="fog-checkbox-label">Enable Fog of War</span>
        </label>
      </div>

      <div className="fog-tools-grid">
        {Object.entries(TOOL_DESCRIPTIONS).map(([tool, description]) => (
          <button
            key={tool}
            className={`fog-tool-button ${currentTool === tool ? 'active' : ''} ${!isEnabled ? 'disabled' : ''}`}
            onClick={() => handleToolChange(tool as typeof currentTool)}
            disabled={!isEnabled}
            title={description}
          >
            <div className={`fog-tool-icon fog-tool-${tool}`}></div>
            <span className="fog-tool-label">{tool.charAt(0).toUpperCase() + tool.slice(1)}</span>
          </button>
        ))}
      </div>

      <div className="fog-instructions">
        <h4>Current Tool: {currentTool.charAt(0).toUpperCase() + currentTool.slice(1)}</h4>
        <p>{TOOL_DESCRIPTIONS[currentTool]}</p>
        
        <div className="fog-shortcuts">
          <h5>Keyboard Shortcuts:</h5>
          <ul>
            <li><kbd>1</kbd> - Select Tool</li>
            <li><kbd>2</kbd> - Reveal Tool</li>
            <li><kbd>3</kbd> - Hide Tool</li>
            <li><kbd>4</kbd> - Polygon Tool</li>
            <li><kbd>5</kbd> - Circle Tool</li>
            <li><kbd>6</kbd> - Rectangle Tool</li>
            <li><kbd>Esc</kbd> - Cancel Current Action</li>
            <li><kbd>Del</kbd> - Delete Selected Region</li>
          </ul>
        </div>
      </div>
    </div>
  );

  const renderRegionsTab = () => (
    <div className="fog-regions-section">
      <div className="fog-regions-header">
        <div className="fog-search-bar">
          <input
            type="text"
            placeholder="Search regions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="fog-search-input"
          />
        </div>
        
        <div className="fog-regions-actions">
          <button
            onClick={handleClearAllRegions}
            className="fog-btn fog-btn-danger fog-btn-small"
            disabled={regions.length === 0}
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="fog-regions-stats">
        <span>Total: {regions.length}</span>
        <span>Visible: {performanceMetrics.visibleRegionCount}</span>
        <span>Hidden: {regions.filter(r => !r.isRevealed).length}</span>
      </div>

      <div className="fog-regions-list">
        {filteredRegions.length === 0 ? (
          <div className="fog-empty-state">
            <p>No fog regions found.</p>
            <p>Use the tools tab to create fog areas.</p>
          </div>
        ) : (
          filteredRegions.map(region => (
            <div
              key={region.id}
              className={`fog-region-item ${selectedRegion === region.id ? 'selected' : ''} ${region.isRevealed ? 'revealed' : 'hidden'}`}
              onClick={() => setSelectedRegion(region.id)}
            >
              <div className="fog-region-header">
                <span className={`fog-region-type fog-region-${region.type}`}>
                  {region.type}
                </span>
                <span className="fog-region-name">{region.name}</span>
                <div className="fog-region-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRegionToggle(region.id);
                    }}
                    className={`fog-btn fog-btn-small ${region.isRevealed ? 'fog-btn-primary' : 'fog-btn-secondary'}`}
                    title={region.isRevealed ? 'Hide' : 'Reveal'}
                  >
                    {region.isRevealed ? '👁️' : '🙈'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRegionDelete(region.id);
                    }}
                    className="fog-btn fog-btn-danger fog-btn-small"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              
              <div className="fog-region-details">
                <div className="fog-region-property">
                  <span>Opacity: {Math.round(region.opacity * 100)}%</span>
                </div>
                <div className="fog-region-property">
                  <span>Layer: {region.layer}</span>
                </div>
                <div className="fog-region-property">
                  <span>Created: {new Date(region.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderSettingsTab = () => (
    <div className="fog-settings-section">
      <div className="fog-setting-group">
        <h4>Appearance</h4>
        
        <div className="fog-setting">
          <label>Global Opacity</label>
          <div className="fog-setting-control">
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.globalOpacity}
              onChange={(e) => handleSettingChange('globalOpacity', parseFloat(e.target.value))}
            />
            <span>{Math.round(settings.globalOpacity * 100)}%</span>
          </div>
        </div>

        <div className="fog-setting">
          <label>Fog Color</label>
          <div className="fog-setting-control">
            <input
              type="color"
              value={settings.color}
              onChange={(e) => handleSettingChange('color', e.target.value)}
            />
            <span>{settings.color}</span>
          </div>
        </div>

        <div className="fog-setting">
          <label>Pattern</label>
          <select
            value={settings.pattern}
            onChange={(e) => handleSettingChange('pattern', e.target.value as any)}
          >
            {FOG_PATTERNS.map(pattern => (
              <option key={pattern.value} value={pattern.value}>
                {pattern.label}
              </option>
            ))}
          </select>
        </div>

        <div className="fog-setting">
          <label>Pattern Scale</label>
          <div className="fog-setting-control">
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={settings.patternScale}
              onChange={(e) => handleSettingChange('patternScale', parseFloat(e.target.value))}
            />
            <span>{settings.patternScale}x</span>
          </div>
        </div>
      </div>

      <div className="fog-setting-group">
        <h4>Visual Effects</h4>
        
        <div className="fog-setting">
          <label>Blur Radius</label>
          <div className="fog-setting-control">
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={settings.blurRadius}
              onChange={(e) => handleSettingChange('blurRadius', parseInt(e.target.value))}
            />
            <span>{settings.blurRadius}px</span>
          </div>
        </div>

        <div className="fog-setting">
          <label>Animation Duration</label>
          <div className="fog-setting-control">
            <input
              type="range"
              min="0"
              max="2000"
              step="100"
              value={settings.animationDuration}
              onChange={(e) => handleSettingChange('animationDuration', parseInt(e.target.value))}
            />
            <span>{settings.animationDuration}ms</span>
          </div>
        </div>

        <div className="fog-setting">
          <label className="fog-checkbox">
            <input
              type="checkbox"
              checked={settings.enableSmoothTransitions}
              onChange={(e) => handleSettingChange('enableSmoothTransitions', e.target.checked)}
            />
            <span className="fog-checkbox-label">Smooth Transitions</span>
          </label>
        </div>
      </div>

      <div className="fog-setting-group">
        <h4>Performance</h4>
        
        <div className="fog-setting">
          <label>Quality Level</label>
          <select
            value={settings.qualityLevel}
            onChange={(e) => handleSettingChange('qualityLevel', e.target.value as any)}
          >
            {QUALITY_LEVELS.map(level => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="fog-setting-group">
        <h4>Data Management</h4>
        
        <div className="fog-data-actions">
          <button
            onClick={handleExportData}
            className="fog-btn fog-btn-primary"
          >
            Export Fog Data
          </button>
          
          <label className="fog-btn fog-btn-secondary fog-file-input">
            Import Fog Data
            <input
              type="file"
              accept=".json"
              onChange={handleImportData}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>
    </div>
  );

  const renderPerformanceTab = () => (
    <div className="fog-performance-section">
      <div className="fog-performance-metrics">
        <div className="fog-metric-card">
          <div className="fog-metric-label">Frame Rate</div>
          <div className={`fog-metric-value ${performanceMetrics.fps < 30 ? 'warning' : performanceMetrics.fps < 45 ? 'caution' : 'good'}`}>
            {performanceMetrics.fps} FPS
          </div>
        </div>

        <div className="fog-metric-card">
          <div className="fog-metric-label">Total Regions</div>
          <div className="fog-metric-value">{performanceMetrics.regionCount}</div>
        </div>

        <div className="fog-metric-card">
          <div className="fog-metric-label">Visible Regions</div>
          <div className="fog-metric-value">{performanceMetrics.visibleRegionCount}</div>
        </div>

        <div className="fog-metric-card">
          <div className="fog-metric-label">Cache Size</div>
          <div className="fog-metric-value">{performanceMetrics.cacheSize}</div>
        </div>

        <div className="fog-metric-card">
          <div className="fog-metric-label">Renderer</div>
          <div className={`fog-metric-value ${performanceMetrics.isWebGLEnabled ? 'good' : 'neutral'}`}>
            {performanceMetrics.isWebGLEnabled ? 'WebGL' : 'Canvas 2D'}
          </div>
        </div>

        <div className="fog-metric-card">
          <div className="fog-metric-label">Last Render</div>
          <div className="fog-metric-value">{performanceMetrics.lastRenderTime.toFixed(2)}ms</div>
        </div>
      </div>

      <div className="fog-performance-info">
        <h4>Performance Tips</h4>
        <ul>
          <li>Use fewer complex polygon regions for better performance</li>
          <li>Enable WebGL (Ultra quality) for GPU acceleration</li>
          <li>Lower blur radius if experiencing frame drops</li>
          <li>Disable smooth transitions on slower devices</li>
          <li>Clear unused regions regularly to reduce memory usage</li>
        </ul>

        <h4>System Information</h4>
        <div className="fog-system-info">
          <div>Canvas Size: {canvasRef?.current ? `${canvasRef.current.width}×${canvasRef.current.height}` : 'N/A'}</div>
          <div>WebGL Support: {performanceMetrics.isWebGLEnabled ? '✅ Available' : '❌ Not Available'}</div>
          <div>Quality Level: {settings.qualityLevel}</div>
          <div>Viewport: {viewport.width}×{viewport.height} @ {viewport.zoom.toFixed(1)}x</div>
        </div>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="fog-panel-overlay" onClick={onClose}>
      <div className="fog-panel" onClick={(e) => e.stopPropagation()}>
        <div className="fog-panel-header">
          <h3>Fog of War</h3>
          <button onClick={onClose} className="fog-panel-close">×</button>
        </div>

        <div className="fog-panel-tabs">
          {[
            { id: 'tools', label: 'Tools', icon: '🛠️' },
            { id: 'regions', label: 'Regions', icon: '📍', count: regions.length },
            { id: 'settings', label: 'Settings', icon: '⚙️' },
            { id: 'performance', label: 'Performance', icon: '📊' }
          ].map(tab => (
            <button
              key={tab.id}
              className={`fog-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id as any)}
            >
              <span className="fog-tab-icon">{tab.icon}</span>
              <span className="fog-tab-label">{tab.label}</span>
              {tab.count !== undefined && (
                <span className="fog-tab-count">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="fog-panel-content">
          {activeTab === 'tools' && renderToolsTab()}
          {activeTab === 'regions' && renderRegionsTab()}
          {activeTab === 'settings' && renderSettingsTab()}
          {activeTab === 'performance' && renderPerformanceTab()}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FogOfWarPanel;