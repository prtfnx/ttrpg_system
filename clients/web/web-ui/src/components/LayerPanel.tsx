import React, { useCallback, useRef, useState } from 'react';
import { useLayerManager, type LayerInfo } from '../hooks/useLayerManager';

interface DragItem {
  index: number;
  layerName: string;
}

const LayerItem: React.FC<{
  layer: LayerInfo;
  index: number;
  isActive: boolean;
  onSelect: (layerName: string) => void;
  onVisibilityToggle: (layerName: string, visible: boolean) => void;
  onOpacityChange: (layerName: string, opacity: number) => void;
  onDragStart: (e: React.DragEvent, index: number, layerName: string) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  settingsVisible: boolean;
  onToggleSettings: () => void;
}> = ({
  layer,
  index,
  isActive,
  onSelect,
  onVisibilityToggle,
  onOpacityChange,
  onDragStart,
  onDragOver,
  onDrop,
  settingsVisible,
  onToggleSettings
}) => {
  return (
    <div
      className={`layer-item-minimal ${isActive ? 'active' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, index, layer.name)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
    >
      <div className="layer-row" onClick={() => onSelect(layer.name)}>
        <span className="layer-icon">{layer.icon}</span>
        <span className="layer-name">{layer.displayName}</span>
        <span className="layer-opacity">{Math.round(layer.settings.opacity * 100)}%</span>
        
        <div className="layer-controls">
          <button
            className={`control-btn visibility ${layer.settings.visible ? 'visible' : 'hidden'}`}
            onClick={(e) => {
              e.stopPropagation();
              onVisibilityToggle(layer.name, !layer.settings.visible);
            }}
            title={layer.settings.visible ? 'Hide Layer' : 'Show Layer'}
          >
            {layer.settings.visible ? '👁️' : '🚫'}
          </button>
          
          <button
            className={`control-btn settings ${settingsVisible ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSettings();
            }}
            title="Layer Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {settingsVisible && (
        <div className="layer-settings-minimal">
          <div className="opacity-control">
            <span>Opacity:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={layer.settings.opacity}
              onChange={(e) => onOpacityChange(layer.name, parseFloat(e.target.value))}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
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
    reorderLayers,
  } = useLayerManager();

  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [expandedSettings, setExpandedSettings] = useState<string | null>(null);
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

  const handleVisibilityToggle = useCallback((layerName: string, visible: boolean) => {
    setLayerVisibility(layerName, visible);
  }, [setLayerVisibility]);

  const toggleSettings = useCallback((layerName: string) => {
    setExpandedSettings(prev => prev === layerName ? null : layerName);
  }, []);

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
    <div className="game-panel layer-panel-minimal">
      <div className="panel-header-compact">
        <h3 className="panel-title">🎨 Layers</h3>
      </div>

      <div className="active-layer-minimal">
        <span className="active-text">Active: {layers.find(l => l.name === activeLayer)?.displayName || activeLayer}</span>
      </div>

      <div className="layer-list-minimal">
        {layers.map((layer, index) => (
          <LayerItem
            key={layer.name}
            layer={layer}
            index={index}
            isActive={activeLayer === layer.name}
            onSelect={setActiveLayer}
            onVisibilityToggle={handleVisibilityToggle}
            onOpacityChange={setLayerOpacity}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            settingsVisible={expandedSettings === layer.name}
            onToggleSettings={() => toggleSettings(layer.name)}
          />
        ))}
      </div>
    </div>
  );
}
