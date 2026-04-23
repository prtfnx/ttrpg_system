import { create } from 'zustand';

interface OATrigger {
  combatant_id: string;
  name: string;
}

interface OAPromptData {
  target_combatant_id: string;
  target_name: string;
  attacker_combatant_id: string;
}

interface OAStore {
  warningEntityId: string | null;
  warningTriggers: OATrigger[];
  prompt: OAPromptData | null;
  setWarning(entityId: string, triggers: OATrigger[]): void;
  setPrompt(data: OAPromptData): void;
  clearAll(): void;
}

export const useOAStore = create<OAStore>((set) => ({
  warningEntityId: null,
  warningTriggers: [],
  prompt: null,
  setWarning: (warningEntityId, warningTriggers) => set({ warningEntityId, warningTriggers }),
  setPrompt: (prompt) => set({ prompt }),
  clearAll: () => set({ warningEntityId: null, warningTriggers: [], prompt: null }),
}));
