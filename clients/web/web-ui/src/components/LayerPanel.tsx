import React, { useCallback, useRef, useState } from 'react';
import { useLayerManager, type LayerInfo } from '../hooks/useLayerManager';

interface DragItem {
  index: number;
  layerName: string;
}

const BlendModeSelector: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => (
  <select 
    className="blend-mode-select" 
    value={value} 
    onChange={(e) => onChange(e.target.value)}
  >
    <option value="Alpha">Normal</option>
    <option value="Additive">Additive</option>
    <option value="Modulate">Modulate</option>
    <option value="Multiply">Multiply</option>
  </select>
);

const ColorPicker: React.FC<{
  color: [number, number, number, number];
  onChange: (color: [number, number, number, number]) => void;
}> = ({ color, onChange }) => {
  const hexColor = `#${Math.round(color[0] * 255).toString(16).padStart(2, '0')}${Math.round(color[1] * 255).toString(16).padStart(2, '0')}${Math.round(color[2] * 255).toString(16).padStart(2, '0')}`;
  
  const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    onChange([r, g, b, color[3]]);
  }, [color, onChange]);

  const handleAlphaChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const alpha = parseFloat(e.target.value);
    onChange([color[0], color[1], color[2], alpha]);
  }, [color, onChange]);

  return (
    <div className="color-picker">
      <input
        type="color"
        value={hexColor}
        onChange={handleColorChange}
        className="color-input"
      />
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={color[3]}
        onChange={handleAlphaChange}
        className="alpha-slider"
        title={`Alpha: ${Math.round(color[3] * 100)}%`}
      />
    </div>
  );
};

const LayerItem: React.FC<{
  layer: LayerInfo;
  index: number;
  isActive: boolean;
  onSelect: (layerName: string) => void;
  onVisibilityToggle: (layerName: string, visible: boolean) => void;
  onOpacityChange: (layerName: string, opacity: number) => void;
  onColorChange: (layerName: string, color: [number, number, number, number]) => void;
  onBlendModeChange: (layerName: string, blendMode: string) => void;
  onClearLayer: (layerName: string) => void;
  onDragStart: (e: React.DragEvent, index: number, layerName: string) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
}> = ({
  layer,
  index,
  isActive,
  onSelect,
  onVisibilityToggle,
  onOpacityChange,
  onColorChange,
  onBlendModeChange,
  onClearLayer,
  onDragStart,
  onDragOver,
  onDrop
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`layer-item ${isActive ? 'active' : ''} ${layer.settings.visible ? 'visible' : 'hidden'}`}
      draggable
      onDragStart={(e) => onDragStart(e, index, layer.name)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
    >
      <div className="layer-header" onClick={() => onSelect(layer.name)}>
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
            className={`visibility-btn ${layer.settings.visible ? 'visible' : 'hidden'}`}
            onClick={(e) => {
              e.stopPropagation();
              onVisibilityToggle(layer.name, !layer.settings.visible);
            }}
            title={layer.settings.visible ? 'Hide Layer' : 'Show Layer'}
          >
            {layer.settings.visible ? '👁️' : '🚫'}
          </button>
          
          <button
            className={`expand-btn ${isExpanded ? 'expanded' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            title="Layer Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      <div className="layer-opacity-control">
        <label className="opacity-label">
          Opacity: {Math.round(layer.settings.opacity * 100)}%
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={layer.settings.opacity}
          onChange={(e) => onOpacityChange(layer.name, parseFloat(e.target.value))}
          className="opacity-slider"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {isExpanded && (
        <div className="layer-advanced-settings">
          <div className="setting-group">
            <label>Blend Mode:</label>
            <BlendModeSelector
              value={layer.settings.blend_mode}
              onChange={(value) => onBlendModeChange(layer.name, value)}
            />
          </div>
          
          <div className="setting-group">
            <label>Color Tint:</label>
            <ColorPicker
              color={layer.settings.color}
              onChange={(color) => onColorChange(layer.name, color)}
            />
          </div>
          
          <div className="setting-group">
            <button
              className="btn-danger btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                onClearLayer(layer.name);
              }}
              disabled={layer.spriteCount === 0}
            >
              Clear Layer ({layer.spriteCount})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export function LayerPanel() {
  const {
    isInitialized,
    layers,
    activeLayer,
    setActiveLayer,
    setLayerVisibility,
    setLayerOpacity,
    setLayerColor,
    setLayerBlendMode,
    reorderLayers,
    clearLayer,
    hideOtherLayers,
    showAllLayers
  } = useLayerManager();

  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const dragOverIndex = useRef<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number, layerName: string) => {
    setDraggedItem({ index, layerName });
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverIndex.current = index;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem.index === dropIndex) {
      setDraggedItem(null);
      return;
    }

    const newOrder = [...layers];
    const [draggedLayer] = newOrder.splice(draggedItem.index, 1);
    newOrder.splice(dropIndex, 0, draggedLayer);
    
    const layerNames = newOrder.map(l => l.name);
    reorderLayers(layerNames);
    setDraggedItem(null);
  }, [draggedItem, layers, reorderLayers]);

  const handleClearLayer = useCallback((layerName: string) => {
    if (confirm(`Clear all sprites from ${layerName} layer?`)) {
      clearLayer(layerName);
    }
  }, [clearLayer]);

  const handleVisibilityToggle = useCallback((layerName: string, visible: boolean) => {
    setLayerVisibility(layerName, visible);
  }, [setLayerVisibility]);

  if (!isInitialized) {
    return (
      <div className="game-panel">
        <div className="panel-header-compact">
          <h3 className="panel-title">🎨 Layers</h3>
        </div>
        <div className="loading">Initializing layers...</div>
      </div>
    );
  }

  return (
    <div className="game-panel layer-panel">
      <div className="panel-header-compact">
        <h3 className="panel-title">🎨 Layers</h3>
        <div className="layer-global-controls">
          <button 
            className="btn-sm"
            onClick={showAllLayers}
            title="Show All Layers"
          >
            👁️
          </button>
          <button 
            className="btn-sm"
            onClick={() => hideOtherLayers(activeLayer)}
            title="Solo Active Layer"
          >
            🎯
          </button>
        </div>
      </div>

      <div className="active-layer-indicator">
        <span className="label">Active:</span>
        <span className="active-layer-name">
          {layers.find(l => l.name === activeLayer)?.displayName || activeLayer}
        </span>
      </div>

      <div className="layer-list">
        {layers.map((layer, index) => (
          <LayerItem
            key={layer.name}
            layer={layer}
            index={index}
            isActive={activeLayer === layer.name}
            onSelect={setActiveLayer}
            onVisibilityToggle={handleVisibilityToggle}
            onOpacityChange={setLayerOpacity}
            onColorChange={setLayerColor}
            onBlendModeChange={setLayerBlendMode}
            onClearLayer={handleClearLayer}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
      </div>

      <div className="layer-panel-footer">
        <div className="layer-stats">
          Total Sprites: {layers.reduce((sum, layer) => sum + layer.spriteCount, 0)}
        </div>
        <div className="layer-tips">
          <details>
            <summary>💡 Layer Tips</summary>
            <ul>
              <li>Drag layers to reorder them</li>
              <li>Click layer name to make it active</li>
              <li>Use ⚙️ for advanced settings</li>
              <li>Solo button shows only active layer</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
