import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Asset {
  id: string;
  name: string;
  url: string;
  hash?: string;
  type?: string;
  lastUsed?: number;
}

export interface Character {
  id: string;
  name: string;
  data: Record<string, unknown>;
  lastUsed?: number;
}

interface CacheState {
  assets: Record<string, Asset>;
  characters: Record<string, Character>;
  upsertAsset: (asset: Asset) => void;
  upsertCharacter: (character: Character) => void;
  bulkLoadAssets: (assets: Asset[]) => void;
  bulkLoadCharacters: (characters: Character[]) => void;
  evictUnused: () => void;
  clearCache: () => void;
}

export const useAssetCharacterCache = create<CacheState>()(
  persist(
  (set) => ({
      assets: {},
      characters: {},
      upsertAsset: (asset) => {
        set((state) => ({
          assets: {
            ...state.assets,
            [asset.id]: { ...asset, lastUsed: Date.now() },
          },
        }));
      },
      upsertCharacter: (character) => {
        set((state) => ({
          characters: {
            ...state.characters,
            [character.id]: { ...character, lastUsed: Date.now() },
          },
        }));
      },
      bulkLoadAssets: (assets) => {
        const now = Date.now();
        set((state) => ({
          assets: {
            ...state.assets,
            ...Object.fromEntries(assets.map((a) => [a.id, { ...a, lastUsed: now }])),
          },
        }));
      },
      bulkLoadCharacters: (characters) => {
        const now = Date.now();
        set((state) => ({
          characters: {
            ...state.characters,
            ...Object.fromEntries(characters.map((c) => [c.id, { ...c, lastUsed: now }])),
          },
        }));
      },
      evictUnused: () => {
        // Simple LRU: evict assets/characters not used in last 24h, keep max 100 each
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        set((state) => ({
          assets: Object.fromEntries(
            Object.entries(state.assets)
              .filter(([_, a]) => a.lastUsed && a.lastUsed > cutoff)
              .slice(-100)
          ),
          characters: Object.fromEntries(
            Object.entries(state.characters)
              .filter(([_, c]) => c.lastUsed && c.lastUsed > cutoff)
              .slice(-100)
          ),
        }));
      },
      clearCache: () => set(() => ({ assets: {}, characters: {} })),
    }),
    {
      name: 'ttrpg-asset-character-cache',
    }
  )
);
