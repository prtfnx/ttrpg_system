import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import './LayerPanel.css';

interface Layer {
  id: string;
  name: string;
  icon: string;
  color: string;
  spriteCount: number;
}

const DEFAULT_LAYERS: Layer[] = [
  { id: 'map', name: 'Map', icon: '🗺️', color: '#8b5cf6', spriteCount: 0 },
  { id: 'tokens', name: 'Tokens', icon: '⚪', color: '#06b6d4', spriteCount: 0 },
  { id: 'dungeon_master', name: 'DM Layer', icon: '👁️', color: '#dc2626', spriteCount: 0 },
  { id: 'light', name: 'Lighting', icon: '💡', color: '#f59e0b', spriteCount: 0 },
  { id: 'height', name: 'Height', icon: '⛰️', color: '#10b981', spriteCount: 0 },
  { id: 'obstacles', name: 'Obstacles', icon: '🧱', color: '#ef4444', spriteCount: 0 },
  { id: 'fog_of_war', name: 'Fog of War', icon: '🌫️', color: '#6b7280', spriteCount: 0 }
];

export function LayerPanel() {
  const {
    activeLayer,
    layerVisibility,
    layerOpacity,
    setActiveLayer,
    setLayerVisibility,
    setLayerOpacity
  } = useGameStore();

  const [layers, setLayers] = useState<Layer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize layers
    const initLayers = () => {
      console.log('🔧 LayerPanel: Initializing layers...');
      setLayers(DEFAULT_LAYERS);
      setIsLoading(false);
      console.log('✅ LayerPanel: Layers initialized');
    };

    // Simulate loading
    const timer = setTimeout(initLayers, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleLayerClick = (layerId: string) => {
    console.log('🎯 LayerPanel: Setting active layer:', layerId);
    setActiveLayer(layerId);
  };

  const handleVisibilityToggle = (layerId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const currentVisibility = layerVisibility[layerId] ?? true;
    console.log('👁️ LayerPanel: Toggling visibility for', layerId, 'from', currentVisibility, 'to', !currentVisibility);
    setLayerVisibility(layerId, !currentVisibility);
  };

  const handleOpacityChange = (layerId: string, opacity: number) => {
    console.log('🌟 LayerPanel: Setting opacity for', layerId, 'to', opacity);
    setLayerOpacity(layerId, opacity);
  };

  if (isLoading) {
    return (
      <div className="layer-panel loading">
        <div className="loading-content">
          <div className="spinner"></div>
          <span>Initializing layers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="layer-panel">
      <div className="layer-panel-header">
        <h3>Layers</h3>
        <div className="layer-count">
          {layers.length} layers
        </div>
      </div>

      <div className="active-layer-display">
        <span className="label">Active:</span>
        <span className="active-layer-name">{activeLayer}</span>
      </div>

      <div className="layer-list">
        {layers.map((layer) => {
          const isActive = activeLayer === layer.id;
          const isVisible = layerVisibility[layer.id] ?? true;
          const opacity = layerOpacity[layer.id] ?? 1;

          return (
            <div
              key={layer.id}
              className={`layer-item ${isActive ? 'active' : ''}`}
              onClick={() => handleLayerClick(layer.id)}
            >
              <div className="layer-main">
                <div className="layer-info">
                  <span className="layer-icon">{layer.icon}</span>
                  <div className="layer-details">
                    <span className="layer-name">{layer.name}</span>
                    <span className="sprite-count">{layer.spriteCount} sprites</span>
                  </div>
                </div>
                
                <div className="layer-controls">
                  <button
                    className={`visibility-btn ${!isVisible ? 'hidden' : ''}`}
                    onClick={(e) => handleVisibilityToggle(layer.id, e)}
                    title={isVisible ? 'Hide layer' : 'Show layer'}
                  >
                    {isVisible ? '👁️' : '🙈'}
                  </button>
                </div>
              </div>

              <div className="layer-opacity">
                <label className="opacity-label">
                  Opacity: {Math.round(opacity * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={opacity}
                  onChange={(e) => handleOpacityChange(layer.id, parseFloat(e.target.value))}
                  className="opacity-slider"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div 
                className="layer-color-indicator" 
                style={{ backgroundColor: layer.color }}
              />
            </div>
          );
        })}
      </div>

      <div className="layer-panel-footer">
        <div className="layer-tips">
          <small>💡 Click layer to activate • Use icons to toggle visibility</small>
        </div>
      </div>
    </div>
  );
}
