import { useCallback, useEffect, useState } from 'react';

export interface LayerSettings {
  visible: boolean;
  opacity: number;
  color: [number, number, number, number];
  blend_mode: 'Alpha' | 'Additive' | 'Modulate' | 'Multiply';
  z_order: number;
}

export interface LayerInfo {
  name: string;
  displayName: string;
  settings: LayerSettings;
  spriteCount: number;
  icon: string;
}

const LAYER_CONFIG = [
  { name: 'map', displayName: 'Background Map', icon: '🗺️' },
  { name: 'tokens', displayName: 'Tokens/Characters', icon: '⚔️' },
  { name: 'dungeon_master', displayName: 'DM Layer', icon: '🎭' },
  { name: 'light', displayName: 'Lighting', icon: '💡' },
  { name: 'height', displayName: 'Height/Terrain', icon: '⛰️' },
  { name: 'obstacles', displayName: 'Obstacles', icon: '🚧' },
  { name: 'fog_of_war', displayName: 'Fog of War', icon: '🌫️' },
];

export const useLayerManager = () => {
  const [renderManager, setRenderManager] = useState<any>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [activeLayer, setActiveLayer] = useState<string>('tokens');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initLayerManager = async () => {
      try {
        // Wait for the global WASM module to be ready using event-based approach
        const waitForWasm = (): Promise<void> => {
          return new Promise((resolve, reject) => {
            // Check if already loaded
            if (window.ttrpg_rust_core && (window as any).gameAPI?.renderManager) {
              resolve();
              return;
            }
            
            // Set timeout for safety
            const timeoutId = setTimeout(() => {
              window.removeEventListener('wasm-ready', handleReady);
              reject(new Error('WASM initialization timeout (10s)'));
            }, 10000);
            
            // Listen for ready event
            const handleReady = () => {
              clearTimeout(timeoutId);
              // Give gameAPI a moment to be set up after WASM is ready
              queueMicrotask(() => {
                if (window.ttrpg_rust_core && (window as any).gameAPI?.renderManager) {
                  resolve();
                } else {
                  reject(new Error('gameAPI.renderManager not available after WASM ready'));
                }
              });
            };
            
            window.addEventListener('wasm-ready', handleReady, { once: true });
          });
        };

        await waitForWasm();
        console.log('Global WASM module is ready for layer manager');
        
        const manager = (window as any).gameAPI?.renderManager?.();
        if (manager) {
          setRenderManager(manager);
          setIsInitialized(true);
          refreshLayerData(manager);
        }
      } catch (error) {
        console.error('Failed to initialize layer manager:', error);
      }
    };

    initLayerManager();
  }, []);

  const refreshLayerData = useCallback((manager: any = renderManager) => {
    if (!manager) return;

    try {
      const layerData = LAYER_CONFIG.map(config => {
        let settings;
        let spriteCount = 0;
        
        try {
          settings = manager.get_layer_settings?.(config.name);
        } catch (error) {
          console.warn(`Failed to get settings for layer ${config.name}:`, error);
          settings = null;
        }
        
        try {
          spriteCount = manager.get_layer_sprite_count?.(config.name) || 0;
        } catch (error) {
          console.warn(`Failed to get sprite count for layer ${config.name}:`, error);
          spriteCount = 0;
        }
        
        // Handle settings - might be object or string
        let parsedSettings;
        if (settings) {
          if (typeof settings === 'string') {
            try {
              parsedSettings = JSON.parse(settings);
            } catch (parseError) {
              console.warn(`Failed to parse settings for layer ${config.name}:`, settings);
              parsedSettings = null;
            }
          } else if (typeof settings === 'object') {
            parsedSettings = settings;
          } else {
            parsedSettings = null;
          }
        }
        
        return {
          ...config,
          settings: parsedSettings || {
            visible: true,
            opacity: 1.0,
            color: [1.0, 1.0, 1.0, 1.0] as [number, number, number, number],
            blend_mode: (config.name === 'light' ? 'Additive' : 
                       config.name === 'fog_of_war' ? 'Multiply' : 'Alpha') as 'Alpha' | 'Additive' | 'Modulate' | 'Multiply',
            z_order: LAYER_CONFIG.findIndex(l => l.name === config.name)
          },
          spriteCount
        };
      });

      setLayers(layerData);
    } catch (error) {
      console.error('Error refreshing layer data:', error);
    }
  }, [renderManager]);

  const setLayerVisibility = useCallback(async (layerName: string, visible: boolean) => {
    if (!renderManager) return;

    try {
      renderManager.set_layer_visible?.(layerName, visible);
      refreshLayerData();
    } catch (error) {
      console.error('Error setting layer visibility:', error);
    }
  }, [renderManager, refreshLayerData]);

  const setLayerOpacity = useCallback(async (layerName: string, opacity: number) => {
    if (!renderManager) return;

    try {
      renderManager.set_layer_opacity?.(layerName, opacity);
      refreshLayerData();
    } catch (error) {
      console.error('Error setting layer opacity:', error);
    }
  }, [renderManager, refreshLayerData]);

  const setLayerColor = useCallback((layerName: string, color: [number, number, number, number]) => {
    if (!renderManager) return false;

    try {
      renderManager.set_layer_color?.(layerName, color[0], color[1], color[2]);
      refreshLayerData();
      return true;
    } catch (error) {
      console.error('Failed to set layer color:', error);
      return false;
    }
  }, [renderManager, refreshLayerData]);

  const setLayerBlendMode = useCallback(async (layerName: string, blendMode: string) => {
    if (!renderManager) return;

    try {
      renderManager.set_blend_mode?.(layerName, blendMode);
      refreshLayerData();
    } catch (error) {
      console.error('Error setting layer blend mode:', error);
    }
  }, [renderManager, refreshLayerData]);

  const reorderLayers = useCallback((newOrder: string[]) => {
    if (!renderManager) return false;

    try {
      newOrder.forEach((layerName, index) => {
        renderManager.set_layer_z_order?.(layerName, index);
      });
      refreshLayerData();
      return true;
    } catch (error) {
      console.error('Failed to reorder layers:', error);
      return false;
    }
  }, [renderManager, refreshLayerData]);

  const clearLayer = useCallback((layerName: string) => {
    if (!renderManager) return false;

    try {
      renderManager.clear_layer?.(layerName);
      refreshLayerData();
      return true;
    } catch (error) {
      console.error('Failed to clear layer:', error);
      return false;
    }
  }, [renderManager, refreshLayerData]);

  const hideOtherLayers = useCallback((visibleLayerName: string) => {
    if (!renderManager) return false;

    try {
      LAYER_CONFIG.forEach(layer => {
        const visible = layer.name === visibleLayerName;
        renderManager.set_layer_visible?.(layer.name, visible);
      });
      refreshLayerData();
      return true;
    } catch (error) {
      console.error('Failed to hide other layers:', error);
      return false;
    }
  }, [renderManager, refreshLayerData]);

  const showAllLayers = useCallback(() => {
    if (!renderManager) return false;

    try {
      LAYER_CONFIG.forEach(layer => {
        renderManager.set_layer_visible?.(layer.name, true);
      });
      refreshLayerData();
      return true;
    } catch (error) {
      console.error('Failed to show all layers:', error);
      return false;
    }
  }, [renderManager, refreshLayerData]);

  // Utility functions for querying layer state
  const getLayerByName = useCallback((layerName: string): LayerInfo | undefined => {
    return layers.find(layer => layer.name === layerName);
  }, [layers]);

  const getVisibleLayers = useCallback((): LayerInfo[] => {
    return layers.filter(layer => layer.settings.visible);
  }, [layers]);

  const getLayersByZOrder = useCallback((): LayerInfo[] => {
    return [...layers].sort((a, b) => a.settings.z_order - b.settings.z_order);
  }, [layers]);

  // Alias for setLayerVisibility to match common naming convention
  const setLayerVisible = setLayerVisibility;

  // Alias for setLayerBlendMode to match common naming convention
  const setBlendMode = setLayerBlendMode;

  // Combined settings update function
  const updateLayerSettings = useCallback(async (layerName: string, settings: Partial<LayerSettings>) => {
    if (!renderManager) return;

    try {
      // Use set_layer_settings if available, otherwise set individually
      if (renderManager.set_layer_settings) {
        renderManager.set_layer_settings(layerName, settings);
      } else {
        if (settings.visible !== undefined) {
          renderManager.set_layer_visible?.(layerName, settings.visible);
        }
        if (settings.opacity !== undefined) {
          renderManager.set_layer_opacity?.(layerName, settings.opacity);
        }
        if (settings.color !== undefined) {
          renderManager.set_layer_color?.(layerName, settings.color[0], settings.color[1], settings.color[2]);
        }
        if (settings.blend_mode !== undefined) {
          renderManager.set_blend_mode?.(layerName, settings.blend_mode);
        }
      }
      refreshLayerData();
    } catch (error) {
      console.error('Error updating layer settings:', error);
    }
  }, [renderManager, refreshLayerData]);

  return {
    isInitialized,
    layers,
    activeLayer,
    setActiveLayer,
    setLayerVisibility,
    setLayerVisible, // Alias
    setLayerOpacity,
    setLayerColor,
    setLayerBlendMode,
    setBlendMode, // Alias
    updateLayerSettings,
    reorderLayers,
    clearLayer,
    hideOtherLayers,
    showAllLayers,
    refreshLayerData: () => refreshLayerData(),
    // Utility functions
    getLayerByName,
    getVisibleLayers,
    getLayersByZOrder,
  };
};
