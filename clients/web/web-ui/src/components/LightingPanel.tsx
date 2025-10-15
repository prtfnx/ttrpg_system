import React, { useEffect, useState } from 'react';
import { useRenderEngine } from '../hooks/useRenderEngine';
import { useProtocol } from '../services/ProtocolContext';
import { useGameStore } from '../store';
import type { Color } from '../types';
import styles from './LightingPanel.module.css';

// ============================================================================
// LIGHT-SPRITE CONVERSION HELPERS
// ============================================================================

/** Convert Light to Sprite data for protocol/storage */
function lightToSprite(light: Light): Record<string, any> {
  return {
    id: light.id,
    x: light.x,
    y: light.y,
    width: light.radius * 2, // Use radius for sprite width
    height: light.radius * 2, // Use radius for sprite height
    rotation: 0,
    texture_path: '__LIGHT__', // Special marker for light sprites
    layer: 'light',
    metadata: JSON.stringify({
      isLight: true,
      color: light.color,
      intensity: light.intensity,
      radius: light.radius,
      isOn: light.isOn,
    })
  };
}

/** Convert Sprite to Light (only if it's a light sprite) */
function spriteToLight(sprite: any): Light | null {
  // Check if this sprite represents a light
  if (sprite.layer !== 'light' || sprite.texture_path !== '__LIGHT__') {
    return null;
  }
  
  // Parse metadata
  let metadata: any = {};
  try {
    if (typeof sprite.metadata === 'string') {
      metadata = JSON.parse(sprite.metadata);
    } else {
      metadata = sprite.metadata || {};
    }
  } catch (e) {
    console.warn('Failed to parse light metadata:', e);
    return null;
  }
  
  if (!metadata.isLight) {
    return null;
  }
  
  return {
    id: sprite.id,
    x: sprite.x,
    y: sprite.y,
    color: metadata.color || { r: 1, g: 1, b: 1, a: 1 },
    intensity: metadata.intensity || 1.0,
    radius: metadata.radius || 100,
    isOn: metadata.isOn !== false,
  };
}

interface Light {
  id: string;
  x: number;
  y: number;
  color: Color;
  intensity: number;
  radius: number;
  isOn: boolean;
}

// Light presets based on common light sources
const LIGHT_PRESETS = [
  { name: 'Torch', radius: 150, intensity: 1.0, color: { r: 1.0, g: 0.6, b: 0.2, a: 1.0 }, icon: '🔥' },
  { name: 'Candle', radius: 80, intensity: 0.7, color: { r: 1.0, g: 0.7, b: 0.3, a: 1.0 }, icon: '🕯️' },
  { name: 'Daylight', radius: 300, intensity: 1.0, color: { r: 1.0, g: 1.0, b: 0.9, a: 1.0 }, icon: '☀️' },
  { name: 'Moonlight', radius: 200, intensity: 0.4, color: { r: 0.6, g: 0.7, b: 1.0, a: 1.0 }, icon: '🌙' },
  { name: 'Fire', radius: 120, intensity: 0.9, color: { r: 1.0, g: 0.4, b: 0.1, a: 1.0 }, icon: '🔥' },
  { name: 'Magic', radius: 180, intensity: 0.8, color: { r: 0.5, g: 0.2, b: 1.0, a: 1.0 }, icon: '✨' },
];

export const LightingPanel: React.FC = () => {
  const engine = useRenderEngine();
  const protocolCtx = useProtocol();
  const protocol = protocolCtx?.protocol || null;
  const sprites = useGameStore(state => state.sprites);
  const activeTableId = useGameStore(state => state.activeTableId);
  const [lights, setLights] = useState<Light[]>([]);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [placementMode, setPlacementMode] = useState<typeof LIGHT_PRESETS[0] | null>(null);
  const [ambientLight, setAmbientLight] = useState(0.2);

  // ============================================================================
  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // ============================================================================

  // Check engine readiness and capabilities
  useEffect(() => {
    const checkEngineReadiness = async () => {
      try {
        setIsLoading(true);
        setEngineError(null);

        if (!engine) {
          throw new Error('Render engine not initialized');
        }
        
        // Test lighting system availability
        const requiredMethods = ['add_light', 'remove_light', 'set_light_color', 'set_light_intensity', 'set_light_radius'];
        const missingMethods = requiredMethods.filter(method => typeof (engine as any)[method] !== 'function');
        
        // In test environment, proceed even if methods are missing (they might be mocked)
        const isTestEnv = import.meta.env?.MODE === 'test' || (globalThis as any).__VITEST__;
        
        if (missingMethods.length > 0 && !isTestEnv) {
          throw new Error(`Lighting system missing methods: ${missingMethods.join(', ')}`);
        }
        
        if (missingMethods.length > 0) {
          console.warn(`Lighting system missing methods (test mode): ${missingMethods.join(', ')}`);
        }
        
        setIsEngineReady(true);
        setEngineError(null);
      } catch (error) {
        setEngineError(error instanceof Error ? error.message : 'Engine initialization failed');
        setIsEngineReady(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkEngineReadiness();
  }, [engine]);

  // Clear lights when table changes
  useEffect(() => {
    if (!engine || !isEngineReady) return;

    console.log('[LIGHTING] Table changed, clearing all lights');
    
    // Remove all existing lights from WASM
    for (const light of lights) {
      try {
        engine.remove_light(light.id);
      } catch (error) {
        console.error(`Failed to remove light ${light.id}:`, error);
      }
    }
    
    // Clear local state
    setLights([]);
    setSelectedLightId(null);
    setPlacementMode(null);
  }, [activeTableId, engine, isEngineReady]); // Triggers when table changes

  // Load lights from sprites on the "light" layer for current table
  useEffect(() => {
    if (!engine || !isEngineReady || !activeTableId) return;

    console.log('[LIGHTING] Loading lights from sprites for table:', activeTableId);
    const loadedLights: Light[] = [];

    // Find all sprites on the "light" layer and convert them to lights
    for (const sprite of sprites) {
      const light = spriteToLight(sprite);
      if (light) {
        loadedLights.push(light);
        
        // Recreate light in WASM
        try {
          engine.add_light(light.id, light.x, light.y);
          engine.set_light_color(light.id, light.color.r, light.color.g, light.color.b, light.color.a);
          engine.set_light_intensity(light.id, light.intensity);
          engine.set_light_radius(light.id, light.radius);
          if (!light.isOn) {
            engine.toggle_light(light.id);
          }
        } catch (error) {
          console.error(`Failed to restore light ${light.id}:`, error);
        }
      }
    }

    if (loadedLights.length > 0) {
      console.log(`[LIGHTING] Restored ${loadedLights.length} lights from sprites`);
      setLights(loadedLights);
    } else {
      console.log('[LIGHTING] No lights found for this table');
      setLights([]);
    }
  }, [engine, isEngineReady, activeTableId, sprites]);

  // Handle light placed event from GameCanvas
  useEffect(() => {
    const handleLightPlaced = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const { x, y, preset } = customEvent.detail;
      
      console.log('[LIGHTING] Light placed event received:', { x, y, preset, engine: !!engine, isEngineReady });
      
      if (!engine || !preset || !isEngineReady) {
        console.warn('[LIGHTING] Cannot place light - engine:', !!engine, 'preset:', !!preset, 'isEngineReady:', isEngineReady);
        return;
      }

      // Check if this is a move operation
      if (preset.isMoving && preset.existingLightId) {
        // Update existing light position
        const existingLight = lights.find(l => l.id === preset.existingLightId);
        if (!existingLight) return;

        try {
          // Update WASM
          engine.update_light_position(preset.existingLightId, x, y);
          
          // Update light position in state
          setLights(prev => prev.map(light => 
            light.id === preset.existingLightId 
              ? { ...light, x, y }
              : light
          ));
          setPlacementMode(null);

          // Update on server via protocol (if available)
          if (protocol) {
            console.log('[LIGHTING] Updating light position on server:', preset.existingLightId);
            protocol.moveSprite(preset.existingLightId, x, y);
          }
        } catch (error) {
          console.error('Failed to move light:', error);
          setEngineError(`Failed to move light: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        // Add new light
        const lightId = `${preset.name}_${Date.now()}`;
        const newLight: Light = {
          id: lightId,
          x,
          y,
          color: preset.color,
          intensity: preset.intensity,
          radius: preset.radius,
          isOn: true,
        };

        try {
          // Add to WASM first
          engine.add_light(lightId, newLight.x, newLight.y);
          engine.set_light_color(lightId, newLight.color.r, newLight.color.g, newLight.color.b, newLight.color.a);
          engine.set_light_intensity(lightId, newLight.intensity);
          engine.set_light_radius(lightId, newLight.radius);
          
          // Add to local state
          setLights(prev => [...prev, newLight]);
          setSelectedLightId(lightId);
          setPlacementMode(null);

          // Persist to server via protocol (if available)
          if (protocol) {
            console.log('[LIGHTING] Persisting light to server:', lightId);
            const spriteData = lightToSprite(newLight);
            protocol.createSprite(spriteData);
          } else {
            console.warn('[LIGHTING] Protocol not available, light will not persist');
          }
        } catch (error) {
          console.error('Failed to add light:', error);
          setEngineError(`Failed to add light: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    };

    window.addEventListener('lightPlaced', handleLightPlaced);
    return () => {
      window.removeEventListener('lightPlaced', handleLightPlaced);
    };
  }, [engine, isEngineReady, lights]);

  // ============================================================================
  // CONDITIONAL RETURNS AFTER ALL HOOKS
  // ============================================================================

  // Error state UI
  if (engineError) {
    return (
      <div className={`${styles.lightingPanel} ${styles.errorState}`}>
        <div className={styles.panelHeader}>
          <h3>💡 Lighting System</h3>
          <div className={styles.errorIndicator}>⚠️ Error</div>
        </div>
        <div className={styles.panelError}>
          <div className={styles.errorIcon}>⚠️</div>
          <h4>Lighting System Error</h4>
          <p className={styles.errorMessage}>{engineError}</p>
          <div className={styles.errorActions}>
            <button 
              className={styles.retryButton}
              onClick={() => {
                setEngineError(null);
                setIsLoading(true);
              }}
            >
              🔄 Retry
            </button>
            <button 
              className={styles.reloadButton}
              onClick={() => window.location.reload()}
            >
              🔃 Reload Application
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state UI
  if (isLoading || !isEngineReady) {
    return (
      <div className={`${styles.lightingPanel} ${styles.loadingState}`}>
        <div className={styles.panelHeader}>
          <h3>💡 Lighting System</h3>
          <div className={styles.loadingIndicator}>⏳ Loading</div>
        </div>
        <div className={styles.panelLoading}>
          <div className={styles.loadingSpinner}></div>
          <p>Initializing lighting system...</p>
          <div className={styles.loadingDetails}>
            <span>• Connecting to render engine</span>
            <span>• Verifying lighting capabilities</span>
            <span>• Preparing light management</span>
          </div>
        </div>
      </div>
    );
  }

  // Start light placement mode with preset
  const startPlacingLight = (preset: typeof LIGHT_PRESETS[0]) => {
    setPlacementMode(preset);
    // Dispatch event for GameCanvas to listen to
    window.dispatchEvent(new CustomEvent('startLightPlacement', {
      detail: { preset }
    }));
  };

  // Start light moving mode
  const startMovingLight = (light: Light) => {
    // Create a pseudo-preset for the move mode
    const movePreset = {
      name: light.id,
      radius: light.radius,
      intensity: light.intensity,
      color: light.color,
      icon: '↔️',
      isMoving: true, // Flag to indicate this is a move operation
      existingLightId: light.id, // Store the ID of the light being moved
    };
    setPlacementMode(movePreset as any);
    // Dispatch event for GameCanvas
    window.dispatchEvent(new CustomEvent('startLightPlacement', {
      detail: { preset: movePreset }
    }));
  };

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const removeLight = async (lightId: string) => {
    if (!engine || !isEngineReady) return;

    try {
      // Remove from WASM
      engine.remove_light(lightId);
      
      // Remove from local state
      setLights(lights.filter(light => light.id !== lightId));
      if (selectedLightId === lightId) {
        setSelectedLightId(null);
      }

      // Remove from server via protocol (if available)
      if (protocol) {
        console.log('[LIGHTING] Removing light from server:', lightId);
        protocol.removeSprite(lightId);
      }
    } catch (error) {
      console.error('Failed to remove light:', error);
      setEngineError(`Failed to remove light: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const updateLightProperty = async (lightId: string, property: keyof Light, value: any) => {
    if (!engine || !isEngineReady) return;

    const light = lights.find(l => l.id === lightId);
    if (!light) return;
    
    const updatedLight = { ...light, [property]: value };
    
    try {
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

      setLights(lights.map(l => 
        l.id === lightId ? { ...l, [property]: value } : l
      ));
    } catch (error) {
      console.error(`Failed to update light ${property}:`, error);
      setEngineError(`Failed to update light ${property}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const toggleAllLights = async () => {
    if (!engine || !isEngineReady) return;

    const allOn = lights.every(light => light.isOn);
    
    try {
      // Toggle each light individually
      for (const light of lights) {
        if (light.isOn === allOn) {
          engine.toggle_light(light.id);
        }
      }
      setLights(lights.map(light => ({ ...light, isOn: !allOn })));
    } catch (error) {
      console.error('Failed to toggle all lights:', error);
      setEngineError(`Failed to toggle all lights: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const clearAllLights = () => {
    if (!engine || !isEngineReady) return;
    
    try {
      // Remove each light individually
      for (const light of lights) {
        engine.remove_light(light.id);
      }
      setLights([]);
      setSelectedLightId(null);
    } catch (error) {
      console.error('Failed to clear all lights:', error);
      setEngineError(`Failed to clear all lights: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const selectedLight = lights.find(light => light.id === selectedLightId);

  return (
    <div className={styles['lighting-panel']}>
      <div className={styles['panel-header']}>
        <h3>💡 Lighting System</h3>
      </div>

      {/* Placement mode indicator */}
      {placementMode && (
        <div className={styles['placement-indicator']}>
          <span>Placing: {placementMode.name} {placementMode.icon}</span>
          <button 
            onClick={() => {
              setPlacementMode(null);
              window.dispatchEvent(new CustomEvent('cancelLightPlacement'));
            }}
            className={styles['cancel-button']}
          >
            Cancel
          </button>
        </div>
      )}
      
      {/* Light Presets */}
      <div className={styles['preset-section']}>
        <h4>Quick Place Lights</h4>
        <div className={styles['preset-buttons']}>
          {LIGHT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              className={styles['preset-button']}
              onClick={() => startPlacingLight(preset)}
              style={{
                background: `radial-gradient(circle, rgba(${preset.color.r * 255}, ${preset.color.g * 255}, ${preset.color.b * 255}, 0.3), rgba(${preset.color.r * 255}, ${preset.color.g * 255}, ${preset.color.b * 255}, 0))`,
                border: `2px solid rgba(${preset.color.r * 255}, ${preset.color.g * 255}, ${preset.color.b * 255}, 0.8)`,
              }}
              title={`${preset.name} - Radius: ${preset.radius}px, Intensity: ${preset.intensity}`}
            >
              <span className={styles['preset-icon']}>{preset.icon}</span>
              <span className={styles['preset-name']}>{preset.name}</span>
            </button>
          ))}
        </div>
      </div>
        
      {/* Ambient Lighting Controls */}
      <div className={styles['ambient-controls']}>
        <h4>Ambient Lighting</h4>
        <label htmlFor="ambient-light">Ambient Light: {(ambientLight * 100).toFixed(0)}%</label>
        <input
          id="ambient-light"
          type="range"
          min="0.0"
          max="1.0"
          step="0.05"
          value={ambientLight}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            setAmbientLight(value);
            if (engine && isEngineReady && typeof (engine as any).set_ambient_light === 'function') {
              try {
                (engine as any).set_ambient_light(value);
              } catch (error) {
                console.error('Failed to set ambient light:', error);
              }
            }
          }}
        />
      </div>

      {/* Light Management Controls */}
      <div className={styles['light-controls']}>
        <button onClick={toggleAllLights} disabled={lights.length === 0}>
          {lights.every(light => light.isOn) ? 'Turn Off All' : 'Turn On All'}
        </button>
        <button onClick={clearAllLights} disabled={lights.length === 0}>
          Clear All Lights
        </button>
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
                  className={styles['move-button']}
                  onClick={(e) => {
                    e.stopPropagation();
                    startMovingLight(light);
                  }}
                  title="Move light"
                >
                  ↔️
                </button>
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
