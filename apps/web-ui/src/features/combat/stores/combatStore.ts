import { create } from 'zustand';

export interface ActiveCondition {
  condition_id: string;
  condition_type: string;
  source: string;
  duration_type: string;
  duration_remaining: number | null;
}

export interface Combatant {
  combatant_id: string;
  entity_id: string;
  character_id: string | null;
  name: string;
  initiative: number | null;
  has_action: boolean;
  has_bonus_action: boolean;
  has_reaction: boolean;
  movement_remaining: number;
  movement_speed: number;
  hp: number | null;  // null when server hides it
  max_hp: number | null;
  temp_hp: number;
  armor_class: number;
  conditions: ActiveCondition[];
  is_npc: boolean;
  is_hidden: boolean;
  is_defeated: boolean;
  controlled_by: string[];
  ai_enabled: boolean;
  ai_behavior: string;
  hp_descriptor?: string;  // when hp_visibility='descriptor'
}

export interface CombatSettings {
  auto_roll_npc_initiative: boolean;
  auto_sort_initiative: boolean;
  skip_defeated: boolean;
  allow_player_end_turn: boolean;
  show_npc_hp_to_players: string;
  group_initiative: boolean;
  ai_auto_act: boolean;
  death_saves_enabled: boolean;
  critical_hit_rule: string;
}

export interface CombatState {
  combat_id: string;
  session_id: string;
  table_id: string;
  phase: string;
  round_number: number;
  current_turn_index: number;
  combatants: Combatant[];
  action_log: unknown[];
  started_at: number | null;
  settings: CombatSettings;
  state_hash: string;
}

interface CombatStore {
  combat: CombatState | null;
  isMyTurn: boolean;

  setCombat: (combat: CombatState | null) => void;
  updateCombatant: (combatant_id: string, patch: Partial<Combatant>) => void;
  setConditions: (combatant_id: string, conditions: ActiveCondition[]) => void;
  getCurrentCombatant: () => Combatant | null;
}

export const useCombatStore = create<CombatStore>((set, get) => ({
  combat: null,
  isMyTurn: false,

  setCombat: (combat) => set({ combat }),

  updateCombatant: (combatant_id, patch) =>
    set((s) => ({
      combat: s.combat
        ? {
            ...s.combat,
            combatants: s.combat.combatants.map((c) =>
              c.combatant_id === combatant_id ? { ...c, ...patch } : c
            ),
          }
        : null,
    })),

  setConditions: (combatant_id, conditions) =>
    set((s) => ({
      combat: s.combat
        ? {
            ...s.combat,
            combatants: s.combat.combatants.map((c) =>
              c.combatant_id === combatant_id ? { ...c, conditions } : c
            ),
          }
        : null,
    })),

  getCurrentCombatant: () => {
    const { combat } = get();
    if (!combat) return null;
    const active = combat.combatants.filter((c) => !c.is_defeated);
    return active[combat.current_turn_index % Math.max(active.length, 1)] ?? null;
  },
}));
