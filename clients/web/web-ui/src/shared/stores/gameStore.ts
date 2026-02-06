import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  color: string;
}

interface GameState {
  // Layer management
  layers: Layer[];
  activeLayer: string;
  
  // Actions
  setActiveLayer: (layerId: string) => void;
  addLayer: (layer: Layer) => void;
  removeLayer: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
  
  // Table state
  currentTableId: string | null;
  setCurrentTableId: (tableId: string | null) => void;
  
  // Tool state
  activeTool: string;
  setActiveTool: (tool: string) => void;
}

const defaultLayers: Layer[] = [
  {
    id: 'background',
    name: 'Background',
    visible: true,
    opacity: 1,
    locked: false,
    color: '#4CAF50'
  },
  {
    id: 'tokens',
    name: 'Tokens',
    visible: true,
    opacity: 1,
    locked: false,
    color: '#2196F3'
  },
  {
    id: 'text',
    name: 'Text',
    visible: true,
    opacity: 1,
    locked: false,
    color: '#FF9800'
  },
  {
    id: 'effects',
    name: 'Effects',
    visible: true,
    opacity: 1,
    locked: false,
    color: '#9C27B0'
  }
];

export const useGameStore = create<GameState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    layers: defaultLayers,
    activeLayer: 'tokens',
    currentTableId: null,
    activeTool: 'select',
    
    // Layer actions
    setActiveLayer: (layerId: string) => {
      const layers = get().layers;
      const layer = layers.find(l => l.id === layerId);
      if (layer && !layer.locked) {
        set({ activeLayer: layerId });
      }
    },
    
    addLayer: (layer: Layer) => {
      set(state => ({
        layers: [...state.layers, layer]
      }));
    },
    
    removeLayer: (layerId: string) => {
      const { layers, activeLayer } = get();
      if (layers.length <= 1) return; // Keep at least one layer
      
      const newLayers = layers.filter(l => l.id !== layerId);
      const newActiveLayer = activeLayer === layerId 
        ? newLayers[0]?.id || 'background'
        : activeLayer;
        
      set({
        layers: newLayers,
        activeLayer: newActiveLayer
      });
    },
    
    updateLayer: (layerId: string, updates: Partial<Layer>) => {
      set(state => ({
        layers: state.layers.map(layer =>
          layer.id === layerId
            ? { ...layer, ...updates }
            : layer
        )
      }));
    },
    
    // Table actions
    setCurrentTableId: (tableId: string | null) => {
      set({ currentTableId: tableId });
    },
    
    // Tool actions
    setActiveTool: (tool: string) => {
      set({ activeTool: tool });
    }
  }))
);

// Selectors for better performance
export const useActiveLayer = () => useGameStore(state => 
  state.layers.find(l => l.id === state.activeLayer)
);

export const useVisibleLayers = () => useGameStore(state => 
  state.layers.filter(l => l.visible)
);

export const useCanvasLayers = () => useGameStore(state => 
  state.layers.filter(l => l.visible && !l.locked)
);