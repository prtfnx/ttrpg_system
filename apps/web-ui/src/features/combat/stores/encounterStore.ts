import { create } from 'zustand';

export interface EncounterChoice {
  id: string;
  text: string;
  requires_roll?: boolean;
  skill?: string;
  dc?: number;
}

export interface EncounterState {
  encounter_id: string;
  title: string;
  description: string;
  phase: string;  // 'idle' | 'pending' | 'rolling' | 'resolved'
  choices: EncounterChoice[];
  result?: string;
  pending_roll?: { skill: string; dc: number; choice_id: string };
}

interface EncounterStore {
  encounter: EncounterState | null;
  setEncounter: (e: EncounterState | null) => void;
}

export const useEncounterStore = create<EncounterStore>((set) => ({
  encounter: null,
  setEncounter: (encounter) => set({ encounter }),
}));
