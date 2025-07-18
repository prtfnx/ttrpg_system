import { create } from 'zustand';
import type { GameState, Position, Sprite } from '../types';

interface GameStore extends GameState {
  // Actions
  addSprite: (sprite: Sprite) => void;
  removeSprite: (id: string) => void;
  updateSprite: (id: string, updates: Partial<Sprite>) => void;
  selectSprite: (id: string | null) => void;
  moveCamera: (position: Position) => void;
  setZoom: (zoom: number) => void;
  toggleGrid: () => void;
  setGridSize: (size: number) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  // Initial state
  sprites: [],
  selectedSpriteId: null,
  cameraPosition: { x: 0, y: 0 },
  cameraZoom: 1,
  gridSize: 50,
  gridVisible: true,

  // Actions
  addSprite: (sprite) => set((state) => ({
    sprites: [...state.sprites, sprite]
  })),

  removeSprite: (id) => set((state) => ({
    sprites: state.sprites.filter(s => s.id !== id),
    selectedSpriteId: state.selectedSpriteId === id ? null : state.selectedSpriteId
  })),

  updateSprite: (id, updates) => set((state) => ({
    sprites: state.sprites.map(s => s.id === id ? { ...s, ...updates } : s)
  })),

  selectSprite: (id) => set({ selectedSpriteId: id }),

  moveCamera: (position) => set({ cameraPosition: position }),

  setZoom: (zoom) => set({ cameraZoom: Math.max(0.1, Math.min(5, zoom)) }),

  toggleGrid: () => set((state) => ({ gridVisible: !state.gridVisible })),

  setGridSize: (size) => set({ gridSize: Math.max(10, Math.min(200, size)) })
}));
