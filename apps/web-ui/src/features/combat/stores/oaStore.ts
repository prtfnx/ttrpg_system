import { create } from 'zustand';
import type { CombatCommandBatch } from '../hooks/useCombatCommands';

interface OATrigger {
  combatant_id: string;
  name: string;
}

interface OAPromptData {
  target_combatant_id: string;
  target_name: string;
  attacker_combatant_id: string;
}

export type PendingCombatCommand = CombatCommandBatch;

interface OAStore {
  warningEntityId: string | null;
  warningTriggers: OATrigger[];
  prompt: OAPromptData | null;
  pendingCombatCommand: PendingCombatCommand | null;
  setWarning(entityId: string, triggers: OATrigger[]): void;
  setPrompt(data: OAPromptData): void;
  setPendingCombatCommand(data: PendingCombatCommand): void;
  clearPendingCombatCommand(): void;
  clearAll(): void;
}

export const useOAStore = create<OAStore>((set) => ({
  warningEntityId: null,
  warningTriggers: [],
  prompt: null,
  pendingCombatCommand: null,
  setWarning: (warningEntityId, warningTriggers) => set({ warningEntityId, warningTriggers }),
  setPrompt: (prompt) => set({ prompt }),
  setPendingCombatCommand: (pendingCombatCommand) => set({ pendingCombatCommand }),
  clearPendingCombatCommand: () => set({ pendingCombatCommand: null }),
  clearAll: () => set({ warningEntityId: null, warningTriggers: [], prompt: null, pendingCombatCommand: null }),
}));
