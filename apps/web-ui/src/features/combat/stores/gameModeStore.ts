import { create } from 'zustand';

export type GameMode = 'free_roam' | 'explore' | 'fight' | 'custom';

interface GameModeStore {
  mode: GameMode;
  roundNumber: number;
  setMode: (mode: GameMode) => void;
  setRoundNumber: (n: number) => void;
  isFreeRoam: boolean;
  isExplore: boolean;
  isFight: boolean;
  isCustom: boolean;
}

export const useGameModeStore = create<GameModeStore>((set, get) => ({
  mode: 'free_roam',
  roundNumber: 0,
  setMode: (mode) => set({ mode }),
  setRoundNumber: (roundNumber) => set({ roundNumber }),
  get isFreeRoam() { return get().mode === 'free_roam'; },
  get isExplore() { return get().mode === 'explore'; },
  get isFight() { return get().mode === 'fight'; },
  get isCustom() { return get().mode === 'custom'; },
}));
