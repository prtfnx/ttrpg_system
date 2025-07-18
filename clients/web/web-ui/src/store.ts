import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { GameState, Sprite } from './types'

interface GameStore extends GameState {
  // Actions
  moveSprite: (id: string, x: number, y: number) => void;
  selectSprite: (id: string, multiSelect?: boolean) => void;
  updateCamera: (x: number, y: number, zoom?: number) => void;
  setConnection: (connected: boolean, sessionId?: string) => void;
  addSprite: (sprite: Sprite) => void;
  removeSprite: (id: string) => void;
  updateSprite: (id: string, updates: Partial<Sprite>) => void;
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
      sessionId: undefined,

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
          sessionId,
        }));
      },

      addSprite: (sprite: Sprite) => {
        set((state) => ({
          sprites: [...state.sprites, sprite],
        }));
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
    }),
    {
      name: 'ttrpg-game-store',
    }
  )
);
