import { create } from 'zustand';

export type ActionType = 'move' | 'attack' | 'cast_spell' | 'use_item' | 'dodge' | 'dash' |
  'disengage' | 'hide' | 'help' | 'ready' | 'bonus_action' | 'reaction';

export interface PlannedAction {
  id: string;  // client-side uuid for list key
  action_type: ActionType;
  label: string;          // display name
  actor_id?: string;
  table_id?: string;
  target_x?: number;
  target_y?: number;
  target_id?: string;
  target_ids?: string[];
  spell_id?: string;
  spell_name?: string;
  spell_level?: number;
  item_id?: string;
  cost_ft?: number;       // movement cost if move action
  cost_type?: 'action' | 'bonus_action' | 'reaction' | 'movement' | 'free';
  path?: [number, number][];  // computed waypoints in pixel space
  attack_bonus?: number;
  damage_formula?: string;
  damage_type?: string;
  attack_type?: string;
  range_ft?: number;
  save_ability?: string;
  save_dc?: number;
  requires_attack_roll?: boolean;
  is_concentration?: boolean;
  sequence_index: number;
}

interface PlanningStore {
  queue: PlannedAction[];
  isPlanningMode: boolean;
  selectedSpriteId: string | null;
  sequenceId: number;   // increments each commit - matches server sequence_id

  startPlanning: (spriteId: string) => void;
  stopPlanning: () => void;
  addAction: (action: Omit<PlannedAction, 'sequence_index'>) => void;
  removeAction: (id: string) => void;
  clearQueue: () => void;
  nextSequenceId: () => number;
}

let _seq = 0;

export const usePlanningStore = create<PlanningStore>((set) => ({
  queue: [],
  isPlanningMode: false,
  selectedSpriteId: null,
  sequenceId: 0,

  startPlanning: (spriteId) => set({ isPlanningMode: true, selectedSpriteId: spriteId }),

  stopPlanning: () => set({ isPlanningMode: false, selectedSpriteId: null }),

  addAction: (action) => set((s) => ({
    queue: [...s.queue, { ...action, sequence_index: s.queue.length }],
  })),

  removeAction: (id) => set((s) => ({
    queue: s.queue
      .filter((a) => a.id !== id)
      .map((a, i) => ({ ...a, sequence_index: i })),
  })),

  clearQueue: () => set({ queue: [] }),

  nextSequenceId: () => {
    const id = ++_seq;
    set({ sequenceId: id });
    return id;
  },
}));
