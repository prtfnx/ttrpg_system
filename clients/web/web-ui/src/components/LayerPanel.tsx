import React, { useState } from 'react';
import { useGameStore } from '../store';

interface LayerInfo {
  name: string;
  displayName: string;
  visible: boolean;
  opacity: number;
  spriteCount: number;
  color: string;
  icon: string;
}

const LAYER_CONFIG: LayerInfo[] = [
  {
    name: 'fog_of_war',
    displayName: 'Fog of War',
    visible: true,
    opacity: 0.8,
    spriteCount: 0,
    color: '#6b7280',
    icon: '🌫️'
  },
  {
    name: 'obstacles',
    displayName: 'Obstacles',
    visible: true,
    opacity: 1.0,
    spriteCount: 0,
    color: '#7c2d12',
    icon: '🚧'
  },
  {
    name: 'height',
    displayName: 'Height/Terrain',
    visible: true,
    opacity: 0.7,
    spriteCount: 0,
    color: '#a16207',
    icon: '⛰️'
  },
  {
    name: 'light',
    displayName: 'Lighting',
    visible: true,
    opacity: 0.6,
    spriteCount: 0,
    color: '#fbbf24',
    icon: '💡'
  },
  {
    name: 'dungeon_master',
    displayName: 'DM Layer',
    visible: true,
    opacity: 1.0,
    spriteCount: 0,
    color: '#7c3aed',
    icon: '🎭'
  },
  {
    name: 'tokens',
    displayName: 'Tokens/Characters',
    visible: true,
    opacity: 1.0,
    spriteCount: 0,
    color: '#059669',
    icon: '⚔️'
  },
  {
    name: 'map',
    displayName: 'Background Map',
    visible: true,
    opacity: 1.0,
    spriteCount: 0,
    color: '#0369a1',
    icon: '🗺️'
  }
];

export function LayerPanel() {
  const { 
    sprites, 
    activeLayer, 
    setActiveLayer, 
    layerVisibility, 
    layerOpacity,
    setLayerVisibility,
    setLayerOpacity 
  } = useGameStore();
  
  const [layers, setLayers] = useState<LayerInfo[]>(() => {
    // Calculate sprite counts for each layer
    return LAYER_CONFIG.map(layer => ({
      ...layer,
      visible: layerVisibility[layer.name] ?? layer.visible,
      opacity: layerOpacity[layer.name] ?? layer.opacity,
      spriteCount: sprites.filter(sprite => sprite.layer === layer.name).length
    }));
  });

  const handleLayerVisibilityToggle = (layerName: string) => {
    const newVisible = !layerVisibility[layerName];
    setLayerVisibility(layerName, newVisible);
    
    setLayers(prevLayers => 
      prevLayers.map(layer => 
        layer.name === layerName 
          ? { ...layer, visible: newVisible }
          : layer
      )
    );
    
    // Send visibility change to game engine
    if (window.gameAPI?.sendMessage) {
      window.gameAPI.sendMessage('layer_visibility', {
        layer: layerName,
        visible: newVisible
      });
    }
    
    // Also update the Rust render engine directly for immediate visual feedback
    const renderManager = window.gameAPI?.renderManager();
    if (renderManager?.set_layer_visible) {
      renderManager.set_layer_visible(layerName, newVisible);
    }
  };

  const handleLayerOpacityChange = (layerName: string, opacity: number) => {
    setLayerOpacity(layerName, opacity);
    
    setLayers(prevLayers => 
      prevLayers.map(layer => 
        layer.name === layerName 
          ? { ...layer, opacity }
          : layer
      )
    );
    
    // Send opacity change to game engine
    if (window.gameAPI?.sendMessage) {
      window.gameAPI.sendMessage('layer_opacity', {
        layer: layerName,
        opacity
      });
    }
    
    // Also update the Rust render engine directly for immediate visual feedback
    const renderManager = window.gameAPI?.renderManager();
    if (renderManager?.set_layer_opacity) {
      renderManager.set_layer_opacity(layerName, opacity);
    }
  };

  const handleLayerSelect = (layerName: string) => {
    setActiveLayer(layerName);
  };

  // Update sprite counts when sprites change
  React.useEffect(() => {
    setLayers(prevLayers => 
      prevLayers.map(layer => ({
        ...layer,
        visible: layerVisibility[layer.name] ?? layer.visible,
        opacity: layerOpacity[layer.name] ?? layer.opacity,
        spriteCount: sprites.filter(sprite => sprite.layer === layer.name).length
      }))
    );
  }, [sprites, layerVisibility, layerOpacity]);

  return (
    <div className="layer-panel">
      <div className="layer-panel-header">
        <h3>🎨 Layers</h3>
        <div className="layer-controls">
          <button 
            className="btn-sm"
            title="Add New Layer"
            onClick={() => console.log('Add layer (future feature)')}
          >
            ➕
          </button>
        </div>
      </div>

      <div className="active-layer-indicator">
        <span className="label">Active Layer:</span>
        <span className="active-layer-name">
          {layers.find(l => l.name === activeLayer)?.displayName || activeLayer}
        </span>
      </div>

      <div className="layer-list">
        {layers.map((layer) => (
          <div 
            key={layer.name}
            className={`layer-item ${activeLayer === layer.name ? 'active' : ''}`}
            onClick={() => handleLayerSelect(layer.name)}
          >
            <div className="layer-header">
              <div className="layer-info">
                <span className="layer-icon">{layer.icon}</span>
                <div className="layer-details">
                  <span className="layer-name">{layer.displayName}</span>
                  <span className="sprite-count">
                    {layer.spriteCount} sprite{layer.spriteCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              
              <div className="layer-controls">
                <button
                  className={`visibility-btn ${layer.visible ? 'visible' : 'hidden'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLayerVisibilityToggle(layer.name);
                  }}
                  title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                >
                  {layer.visible ? '👁️' : '🚫'}
                </button>
              </div>
            </div>

            <div className="layer-opacity-control">
              <label className="opacity-label">
                Opacity: {Math.round(layer.opacity * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={layer.opacity}
                onChange={(e) => handleLayerOpacityChange(layer.name, parseFloat(e.target.value))}
                className="opacity-slider"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div 
              className="layer-color-indicator"
              style={{ backgroundColor: layer.color }}
            />
          </div>
        ))}
      </div>

      <div className="layer-panel-footer">
        <div className="layer-tips">
          <h4>💡 Tips:</h4>
          <ul>
            <li>Click a layer to make it active for new sprites</li>
            <li>Use the eye icon to toggle layer visibility</li>
            <li>Adjust opacity for overlay effects</li>
            <li>Layers are rendered from bottom (Map) to top (Fog of War)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
