import React, { useState } from 'react';
import { useRenderEngine } from '../hooks/useRenderEngine';
import type { Color } from '../types';
import styles from './LightingPanel.module.css';

interface Light {
  id: string;
  x: number;
  y: number;
  color: Color;
  intensity: number;
  radius: number;
  isOn: boolean;
}

export const LightingPanel: React.FC = () => {
  const engine = useRenderEngine();
  const [lights, setLights] = useState<Light[]>([]);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [newLightName, setNewLightName] = useState('');

  const addLight = () => {
    if (!engine || !newLightName.trim()) return;

    const lightId = newLightName.trim();
    const newLight: Light = {
      id: lightId,
      x: 0,
      y: 0,
      color: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
      intensity: 1.0,
      radius: 200.0,
      isOn: true,
    };

    engine.add_light(lightId, newLight.x, newLight.y);
    engine.set_light_color(lightId, newLight.color.r, newLight.color.g, newLight.color.b, newLight.color.a);
    engine.set_light_intensity(lightId, newLight.intensity);
    engine.set_light_radius(lightId, newLight.radius);

    setLights([...lights, newLight]);
    setNewLightName('');
  };

  const removeLight = (lightId: string) => {
    if (!engine) return;

    engine.remove_light(lightId);
    setLights(lights.filter(light => light.id !== lightId));
    if (selectedLightId === lightId) {
      setSelectedLightId(null);
    }
  };

  const updateLightProperty = (lightId: string, property: keyof Light, value: any) => {
    if (!engine) return;

    const updatedLights = lights.map(light => {
      if (light.id === lightId) {
        const updatedLight = { ...light, [property]: value };
        
        // Update engine based on property
        switch (property) {
          case 'x':
          case 'y':
            engine.update_light_position(lightId, updatedLight.x, updatedLight.y);
            break;
          case 'color':
            const color = value as Color;
            engine.set_light_color(lightId, color.r, color.g, color.b, color.a);
            break;
          case 'intensity':
            engine.set_light_intensity(lightId, value as number);
            break;
          case 'radius':
            engine.set_light_radius(lightId, value as number);
            break;
          case 'isOn':
            engine.toggle_light(lightId);
            break;
        }
        
        return updatedLight;
      }
      return light;
    });
    setLights(updatedLights);
  };

  const toggleAllLights = () => {
    if (!engine) return;
    
    const allOn = lights.every(light => light.isOn);
    if (allOn) {
      engine.turn_off_all_lights();
      setLights(lights.map(light => ({ ...light, isOn: false })));
    } else {
      engine.turn_on_all_lights();
      setLights(lights.map(light => ({ ...light, isOn: true })));
    }
  };

  const clearAllLights = () => {
    if (!engine) return;
    
    engine.clear_lights();
    setLights([]);
    setSelectedLightId(null);
  };

  const selectedLight = lights.find(light => light.id === selectedLightId);

  return (
    <div className={styles['lighting-panel']}>
      <h3>Lighting System</h3>
      
      {/* Drag status indicator */}
      {engine && typeof engine.is_in_light_drag_mode === 'function' && engine.is_in_light_drag_mode() && (
        <div className={styles['drag-indicator']}>
          � Light drag mode active - click and drag lights
          <button 
            onClick={() => engine?.set_light_drag_mode(false)} 
            className={styles['cancel-button']}
          >
            Exit
          </button>
        </div>
      )}
      
      {/* Light Management */}
      <div className={styles['light-management']}>
        <div className={styles['add-light']}>
          <input
            type="text"
            placeholder="Light name"
            value={newLightName}
            onChange={(e) => setNewLightName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addLight()}
          />
          <button onClick={addLight} disabled={!newLightName.trim()}>
            Add Light
          </button>
        </div>
        
        <div className={styles['light-controls']}>
          <button onClick={toggleAllLights}>
            {lights.every(light => light.isOn) ? 'Turn Off All' : 'Turn On All'}
          </button>
          <button onClick={clearAllLights} disabled={lights.length === 0}>
            Clear All
          </button>
          <button 
            onClick={() => {
              if (!engine) return;
              const isActive = engine.is_in_light_drag_mode();
              engine.set_light_drag_mode(!isActive);
            }}
            className={`${styles['mode-button']} ${(typeof engine?.is_in_light_drag_mode === 'function' && engine?.is_in_light_drag_mode()) ? styles.active : ''}`}
          >
            {(typeof engine?.is_in_light_drag_mode === 'function' && engine?.is_in_light_drag_mode()) ? '🔓 Exit Drag' : '🔒 Drag Mode'}
          </button>
        </div>
      </div>

      {/* Light List */}
      <div className={styles['light-list']}>
        <h4>Lights ({lights.length})</h4>
        {lights.length === 0 ? (
          <p className={styles['empty-message']}>No lights placed</p>
        ) : (
          lights.map(light => (
          <div 
            key={light.id} 
            className={`${styles['light-item']} ${selectedLightId === light.id ? styles.selected : ''}`}
            onClick={() => setSelectedLightId(light.id)}
          >
            <div className={styles['light-header']}>
              <span className={styles['light-name']}>{light.id}</span>
              <div className={styles['light-actions']}>
                <button
                  className={`${styles['toggle-button']} ${light.isOn ? styles.on : styles.off}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateLightProperty(light.id, 'isOn', !light.isOn);
                  }}
                >
                  {light.isOn ? '🔆' : '🔅'}
                </button>
                <button
                  className={styles['remove-button']}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLight(light.id);
                  }}
                >
                  ❌
                </button>
              </div>
            </div>
            
            <div className={styles['light-preview']}>
              <div 
                className={styles['color-indicator']}
                style={{ 
                  backgroundColor: `rgba(${Math.round(light.color.r * 255)}, ${Math.round(light.color.g * 255)}, ${Math.round(light.color.b * 255)}, ${light.color.a})`,
                  opacity: light.intensity
                }}
              />
              <span className={styles['light-stats']}>
                R:{light.radius.toFixed(0)} I:{light.intensity.toFixed(2)}
              </span>
            </div>
          </div>
          ))
        )}
      </div>

      {/* Light Properties */}
      {selectedLight && (
        <div className={styles['light-properties']}>
          <h4>Properties: {selectedLight.id}</h4>
          
          <div className={styles['property-group']}>
            <label>Position</label>
            <div className={styles['position-controls']}>
              <input
                type="number"
                placeholder="X"
                value={selectedLight.x}
                onChange={(e) => updateLightProperty(selectedLight.id, 'x', parseFloat(e.target.value) || 0)}
              />
              <input
                type="number"
                placeholder="Y"
                value={selectedLight.y}
                onChange={(e) => updateLightProperty(selectedLight.id, 'y', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className={styles['property-group']}>
            <label>Color</label>
            <div className={styles['color-controls']}>
              <input
                type="color"
                value={`#${Math.round(selectedLight.color.r * 255).toString(16).padStart(2, '0')}${Math.round(selectedLight.color.g * 255).toString(16).padStart(2, '0')}${Math.round(selectedLight.color.b * 255).toString(16).padStart(2, '0')}`}
                onChange={(e) => {
                  const hex = e.target.value;
                  const r = parseInt(hex.slice(1, 3), 16) / 255;
                  const g = parseInt(hex.slice(3, 5), 16) / 255;
                  const b = parseInt(hex.slice(5, 7), 16) / 255;
                  updateLightProperty(selectedLight.id, 'color', { r, g, b, a: selectedLight.color.a });
                }}
              />
              <div className={styles['rgba-inputs']}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={selectedLight.color.r}
                  onChange={(e) => updateLightProperty(selectedLight.id, 'color', { ...selectedLight.color, r: parseFloat(e.target.value) })}
                  title="Red"
                />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={selectedLight.color.g}
                  onChange={(e) => updateLightProperty(selectedLight.id, 'color', { ...selectedLight.color, g: parseFloat(e.target.value) })}
                  title="Green"
                />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={selectedLight.color.b}
                  onChange={(e) => updateLightProperty(selectedLight.id, 'color', { ...selectedLight.color, b: parseFloat(e.target.value) })}
                  title="Blue"
                />
              </div>
            </div>
          </div>

          <div className={styles['property-group']}>
            <label>Intensity: {selectedLight.intensity.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={selectedLight.intensity}
              onChange={(e) => updateLightProperty(selectedLight.id, 'intensity', parseFloat(e.target.value))}
            />
          </div>

          <div className={styles['property-group']}>
            <label>Radius: {selectedLight.radius.toFixed(0)}px</label>
            <input
              type="range"
              min="10"
              max="500"
              step="5"
              value={selectedLight.radius}
              onChange={(e) => updateLightProperty(selectedLight.id, 'radius', parseFloat(e.target.value))}
            />
          </div>
        </div>
      )}
    </div>
  );
};
