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
        // Wait for the global WASM module to be ready
        const waitForWasm = () => {
          return new Promise<void>((resolve, reject) => {
            const checkWasm = () => {
              if (window.ttrpg_rust_core && (window as any).gameAPI?.renderManager) {
                resolve();
              } else if (Date.now() - startTime > 10000) { // 10 second timeout
                reject(new Error('WASM module not available after timeout'));
              } else {
                setTimeout(checkWasm, 100);
              }
            };
            const startTime = Date.now();
            checkWasm();
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
        const settings = manager.get_layer_settings?.(config.name);
        const spriteCount = manager.get_layer_sprite_count?.(config.name) || 0;
        
        return {
          ...config,
          settings: settings ? JSON.parse(settings) : {
            visible: true,
            opacity: 1.0,
            color: [1.0, 1.0, 1.0, 1.0],
            blend_mode: config.name === 'light' ? 'Additive' : 
                       config.name === 'fog_of_war' ? 'Multiply' : 'Alpha',
            z_order: LAYER_CONFIG.findIndex(l => l.name === config.name)
          },
          spriteCount
        };
      });

      setLayers(layerData);
    } catch (error) {
      console.error('Failed to refresh layer data:', error);
    }
  }, [renderManager]);

  const setLayerVisibility = useCallback((layerName: string, visible: boolean) => {
    if (!renderManager) return false;

    try {
      renderManager.set_layer_visible?.(layerName, visible);
      refreshLayerData();
      return true;
    } catch (error) {
      console.error('Failed to set layer visibility:', error);
      return false;
    }
  }, [renderManager, refreshLayerData]);

  const setLayerOpacity = useCallback((layerName: string, opacity: number) => {
    if (!renderManager) return false;

    try {
      renderManager.set_layer_opacity?.(layerName, opacity);
      refreshLayerData();
      return true;
    } catch (error) {
      console.error('Failed to set layer opacity:', error);
      return false;
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

  const setLayerBlendMode = useCallback((layerName: string, blendMode: string) => {
    if (!renderManager) return false;

    try {
      renderManager.set_layer_blend_mode?.(layerName, blendMode);
      refreshLayerData();
      return true;
    } catch (error) {
      console.error('Failed to set layer blend mode:', error);
      return false;
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

  return {
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
    showAllLayers,
    refreshLayerData: () => refreshLayerData()
  };
};
