import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ConnectionState, GameState, Sprite } from './types';
import type { ToolType } from './types/tools';

interface GameStore extends GameState {
  // Layer management state
  activeLayer: string;
  layerVisibility: Record<string, boolean>;
  layerOpacity: Record<string, number>;
  
  // Grid system state
  gridEnabled: boolean;
  gridSnapping: boolean;
  gridSize: number;
  
  // Tool system state
  activeTool: ToolType;
  measurementActive: boolean;
  alignmentActive: boolean;
  
  // Actions
  moveSprite: (id: string, x: number, y: number) => void;
  selectSprite: (id: string, multiSelect?: boolean) => void;
  updateCamera: (x: number, y: number, zoom?: number) => void;
  setConnection: (connected: boolean, sessionId?: string) => void;
  updateConnectionState: (state: ConnectionState) => void;
  addSprite: (sprite: Sprite) => void;
  removeSprite: (id: string) => void;
  updateSprite: (id: string, updates: Partial<Sprite>) => void;
  addCharacter: (character: import('./types').Character) => void;
  updateCharacter: (id: string, updates: Partial<import('./types').Character>) => void;
  addInventoryItem: (characterId: string, item: string) => void;
  
  // Layer management actions
  setActiveLayer: (layerName: string) => void;
  setLayerVisibility: (layerName: string, visible: boolean) => void;
  setLayerOpacity: (layerName: string, opacity: number) => void;
  
  // Grid system actions
  setGridEnabled: (enabled: boolean) => void;
  setGridSnapping: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  
  // Tool system actions
  setActiveTool: (tool: ToolType) => void;
  setMeasurementActive: (active: boolean) => void;
  setAlignmentActive: (active: boolean) => void;
}

export const useGameStore = create<GameStore>()(
  devtools(
    (set) => ({
      // Initial state
      sprites: [],
      characters: [],
      selectedSprites: [],
      camera: { x: 0, y: 0, zoom: 1 },
      isConnected: false,
      connectionState: 'disconnected',
      sessionId: undefined,
      
      // Layer management initial state
      activeLayer: 'tokens',
      layerVisibility: {
        'map': true,
        'tokens': true,
        'dungeon_master': true,
        'light': true,
        'height': true,
        'obstacles': true,
        'fog_of_war': true
      },
      layerOpacity: {
        'map': 1.0,
        'tokens': 1.0,
        'dungeon_master': 1.0,
        'light': 0.6,
        'height': 0.7,
        'obstacles': 1.0,
        'fog_of_war': 0.8
      },
      
      // Grid system initial state
      gridEnabled: true,
      gridSnapping: false,
      gridSize: 50,
      
      // Tool system initial state
      activeTool: 'select',
      measurementActive: false,
      alignmentActive: false,

      // Actions
      moveSprite: (id: string, x: number, y: number) => {
        set((state) => ({
          sprites: state.sprites.map((sprite) =>
            sprite.id === id ? { ...sprite, x, y } : sprite
          ),
        }));
      },

      selectSprite: (id: string, multiSelect = false) => {
        set((state) => {
          const currentSelection = state.selectedSprites;
          let newSelection: string[];

          if (multiSelect) {
            newSelection = currentSelection.includes(id)
              ? currentSelection.filter((spriteId) => spriteId !== id)
              : [...currentSelection, id];
          } else {
            newSelection = currentSelection.includes(id) && currentSelection.length === 1
              ? []
              : [id];
          }

          return {
            selectedSprites: newSelection,
            sprites: state.sprites.map((sprite) => ({
              ...sprite,
              isSelected: newSelection.includes(sprite.id),
            })),
          };
        });
      },

      addInventoryItem: (characterId: string, item: string) => {
        set((state) => ({
          characters: state.characters.map((char) =>
            char.id === characterId
              ? { ...char, inventory: [...(char.inventory || []), item] }
              : char
          ),
        }));
      },

      updateCamera: (x: number, y: number, zoom?: number) => {
        set((state) => ({
          camera: {
            x,
            y,
            zoom: zoom ?? state.camera.zoom,
          },
        }));
      },

      setConnection: (connected: boolean, sessionId?: string) => {
        set(() => ({
          isConnected: connected,
          connectionState: connected ? 'connected' : 'disconnected',
          sessionId,
        }));
      },

      updateConnectionState: (state: ConnectionState) => {
        set(() => ({
          connectionState: state,
          isConnected: state === 'connected',
        }));
      },

      addSprite: (sprite: Sprite) => {
        set((state) => {
          // Check if sprite already exists
          const existingSprite = state.sprites.find(s => s.id === sprite.id);
          if (existingSprite) {
            // If it exists, update it instead of adding
            return {
              sprites: state.sprites.map(s => s.id === sprite.id ? sprite : s)
            };
          } else {
            // Add new sprite
            return {
              sprites: [...state.sprites, sprite]
            };
          }
        });
      },

      removeSprite: (id: string) => {
        set((state) => ({
          sprites: state.sprites.filter((sprite) => sprite.id !== id),
          selectedSprites: state.selectedSprites.filter((spriteId) => spriteId !== id),
        }));
      },

      updateSprite: (id: string, updates: Partial<Sprite>) => {
        set((state) => ({
          sprites: state.sprites.map((sprite) =>
            sprite.id === id ? { ...sprite, ...updates } : sprite
          ),
        }));
      },

      addCharacter: (character) => {
        set((state) => ({
          characters: [...state.characters, character],
        }));
      },

      updateCharacter: (id, updates) => {
        set((state) => ({
          characters: state.characters.map((char) =>
            char.id === id ? { ...char, ...updates, stats: { ...char.stats, ...(updates.stats || {}) } } : char
          ),
        }));
      },

      // Layer management actions
      setActiveLayer: (layerName: string) => {
        set(() => ({
          activeLayer: layerName,
        }));
      },

      setLayerVisibility: (layerName: string, visible: boolean) => {
        set((state) => ({
          layerVisibility: {
            ...state.layerVisibility,
            [layerName]: visible,
          },
        }));
      },

      setLayerOpacity: (layerName: string, opacity: number) => {
        set((state) => ({
          layerOpacity: {
            ...state.layerOpacity,
            [layerName]: opacity,
          },
        }));
      },
      
      // Grid system actions
      setGridEnabled: (enabled: boolean) => {
        set(() => ({
          gridEnabled: enabled,
        }));
      },

      setGridSnapping: (enabled: boolean) => {
        set(() => ({
          gridSnapping: enabled,
        }));
      },

      setGridSize: (size: number) => {
        set(() => ({
          gridSize: size,
        }));
      },
      
      // Tool system actions
      setActiveTool: (tool: ToolType) => {
        set(() => ({
          activeTool: tool,
          measurementActive: tool === 'measure',
          alignmentActive: tool === 'align',
        }));
      },

      setMeasurementActive: (active: boolean) => {
        set(() => ({
          measurementActive: active,
        }));
      },

      setAlignmentActive: (active: boolean) => {
        set(() => ({
          alignmentActive: active,
        }));
      },
    }),
    {
      name: 'ttrpg-game-store',
    }
  )
);
