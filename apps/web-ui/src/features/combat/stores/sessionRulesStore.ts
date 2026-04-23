import { create } from 'zustand';

export interface SessionRules {
  session_id: string;
  obstacles_block_movement: boolean;
  walls_block_movement: boolean;
  enforce_movement_speed: boolean;
  diagonal_movement_rule: 'standard' | 'alternate' | 'realistic';
  default_movement_speed: number;
  turn_order: 'none' | 'concurrent' | 'initiative' | 'dm_assigned';
  actions_per_turn: number;
  bonus_actions_per_turn: number;
  reactions_per_turn: number;
  free_actions_per_turn: number;
  allow_player_end_turn: boolean;
  explore_movement_per_round: number;
  explore_actions_per_round: number;
  explore_auto_advance: boolean;
  explore_round_timer: number | null;
  auto_roll_npc_initiative: boolean;
  auto_sort_initiative: boolean;
  skip_defeated_combatants: boolean;
  group_npc_initiative: boolean;
  death_saves_enabled: boolean;
  massive_damage_rule: boolean;
  show_npc_hp_to_players: 'exact' | 'descriptor' | 'none';
  show_npc_ac_to_players: boolean;
  show_npc_conditions: boolean;
  enforce_line_of_sight: boolean;
  enforce_range: boolean;
  enforce_spell_slots: boolean;
  enforce_spell_components: boolean;
  critical_hit_rule: 'double_dice' | 'max_dice' | 'double_total';
  ai_enabled: boolean;
  ai_auto_act: boolean;
  default_ai_behavior: string;
  movement_mode: 'cell' | 'free';
  server_validation_tier: 'trust_client' | 'lightweight' | 'full';
  enforce_cover: boolean;
  enforce_difficult_terrain: boolean;
  opportunity_attacks_enabled: boolean;
  opportunity_attack_timeout_sec: number;
  custom_rules: Record<string, unknown>;
}

export const DEFAULT_RULES: Omit<SessionRules, 'session_id'> = {
  obstacles_block_movement: true,
  walls_block_movement: true,
  enforce_movement_speed: true,
  diagonal_movement_rule: 'standard',
  default_movement_speed: 30,
  turn_order: 'initiative',
  actions_per_turn: 1,
  bonus_actions_per_turn: 1,
  reactions_per_turn: 1,
  free_actions_per_turn: 1,
  allow_player_end_turn: true,
  explore_movement_per_round: 30,
  explore_actions_per_round: 1,
  explore_auto_advance: false,
  explore_round_timer: null,
  auto_roll_npc_initiative: true,
  auto_sort_initiative: true,
  skip_defeated_combatants: true,
  group_npc_initiative: false,
  death_saves_enabled: true,
  massive_damage_rule: true,
  show_npc_hp_to_players: 'descriptor',
  show_npc_ac_to_players: false,
  show_npc_conditions: true,
  enforce_line_of_sight: true,
  enforce_range: true,
  enforce_spell_slots: true,
  enforce_spell_components: false,
  critical_hit_rule: 'double_dice',
  ai_enabled: false,
  ai_auto_act: false,
  default_ai_behavior: 'tactical',
  movement_mode: 'cell',
  server_validation_tier: 'lightweight',
  enforce_cover: true,
  enforce_difficult_terrain: true,
  opportunity_attacks_enabled: true,
  opportunity_attack_timeout_sec: 30,
  custom_rules: {},
};

interface SessionRulesStore {
  rules: SessionRules | null;
  isDirty: boolean;
  // local edits before save
  draft: Partial<SessionRules>;
  setRules: (rules: SessionRules) => void;
  updateDraft: (patch: Partial<SessionRules>) => void;
  resetDraft: () => void;
}

export const useSessionRulesStore = create<SessionRulesStore>((set) => ({
  rules: null,
  isDirty: false,
  draft: {},
  setRules: (rules) => set({ rules, isDirty: false, draft: {} }),
  updateDraft: (patch) =>
    set((s) => ({ draft: { ...s.draft, ...patch }, isDirty: true })),
  resetDraft: () => set({ draft: {}, isDirty: false }),
}));
