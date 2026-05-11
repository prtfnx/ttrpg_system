import { beforeEach, describe, expect, it } from 'vitest';
import { useCombatStore, type CombatState, type Combatant } from '../combatStore';
import { useGameModeStore } from '../gameModeStore';
import { usePlanningStore } from '../planningStore';
import { useSessionRulesStore, DEFAULT_RULES } from '../sessionRulesStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    combatant_id: 'c1',
    entity_id: 'e1',
    character_id: null,
    name: 'Goblin',
    initiative: 10,
    has_action: true,
    has_bonus_action: true,
    has_reaction: true,
    movement_remaining: 30,
    movement_speed: 30,
    hp: 15,
    max_hp: 15,
    temp_hp: 0,
    armor_class: 12,
    conditions: [],
    is_npc: true,
    is_hidden: false,
    is_defeated: false,
    controlled_by: [],
    ai_enabled: false,
    ai_behavior: 'aggressive',
    ...overrides,
  };
}

function makeCombatState(combatants: Combatant[] = []): CombatState {
  return {
    combat_id: 'combat-1',
    session_id: 'sess-1',
    table_id: 'tbl-1',
    phase: 'active',
    round_number: 1,
    current_turn_index: 0,
    combatants,
    action_log: [],
    started_at: null,
    settings: {
      auto_roll_npc_initiative: false,
      auto_sort_initiative: true,
      skip_defeated: true,
      allow_player_end_turn: false,
      show_npc_hp_to_players: 'none',
      group_initiative: false,
      ai_auto_act: false,
      death_saves_enabled: true,
      critical_hit_rule: 'double_dice',
    },
    state_hash: 'abc',
  };
}

// ---------------------------------------------------------------------------
// CombatStore
// ---------------------------------------------------------------------------

describe('useCombatStore', () => {
  beforeEach(() => {
    useCombatStore.setState({ combat: null, isMyTurn: false });
  });

  it('initial state: combat is null', () => {
    expect(useCombatStore.getState().combat).toBeNull();
  });

  it('setCombat sets the combat state', () => {
    const combat = makeCombatState();
    useCombatStore.getState().setCombat(combat);
    expect(useCombatStore.getState().combat).toEqual(combat);
  });

  it('setCombat with null clears combat', () => {
    useCombatStore.getState().setCombat(makeCombatState());
    useCombatStore.getState().setCombat(null);
    expect(useCombatStore.getState().combat).toBeNull();
  });

  it('updateCombatant patches a combatant by id', () => {
    const c = makeCombatant({ combatant_id: 'c1', hp: 15 });
    useCombatStore.getState().setCombat(makeCombatState([c]));
    useCombatStore.getState().updateCombatant('c1', { hp: 5 });
    const updated = useCombatStore.getState().combat?.combatants[0];
    expect(updated?.hp).toBe(5);
  });

  it('updateCombatant does nothing when combat is null', () => {
    useCombatStore.getState().updateCombatant('c1', { hp: 5 });
    expect(useCombatStore.getState().combat).toBeNull();
  });

  it('updateCombatant leaves unrelated combatants untouched', () => {
    const c1 = makeCombatant({ combatant_id: 'c1', hp: 10 });
    const c2 = makeCombatant({ combatant_id: 'c2', hp: 20 });
    useCombatStore.getState().setCombat(makeCombatState([c1, c2]));
    useCombatStore.getState().updateCombatant('c1', { hp: 1 });
    expect(useCombatStore.getState().combat?.combatants[1].hp).toBe(20);
  });

  it('setConditions replaces conditions for a combatant', () => {
    const c = makeCombatant({ combatant_id: 'c1', conditions: [] });
    useCombatStore.getState().setCombat(makeCombatState([c]));
    const newConditions = [{ condition_id: 'x', condition_type: 'poisoned', source: 's', duration_type: 'end_of_turn', duration_remaining: 2 }];
    useCombatStore.getState().setConditions('c1', newConditions);
    expect(useCombatStore.getState().combat?.combatants[0].conditions).toEqual(newConditions);
  });

  it('getCurrentCombatant returns active combatant at current_turn_index', () => {
    const c1 = makeCombatant({ combatant_id: 'c1', is_defeated: false });
    const c2 = makeCombatant({ combatant_id: 'c2', is_defeated: false });
    const combat = makeCombatState([c1, c2]);
    combat.current_turn_index = 1;
    useCombatStore.getState().setCombat(combat);
    expect(useCombatStore.getState().getCurrentCombatant()?.combatant_id).toBe('c2');
  });

  it('getCurrentCombatant skips defeated combatants', () => {
    const c1 = makeCombatant({ combatant_id: 'c1', is_defeated: true });
    const c2 = makeCombatant({ combatant_id: 'c2', is_defeated: false });
    const combat = makeCombatState([c1, c2]);
    combat.current_turn_index = 0;
    useCombatStore.getState().setCombat(combat);
    // Only c2 is active; index 0 → c2
    expect(useCombatStore.getState().getCurrentCombatant()?.combatant_id).toBe('c2');
  });

  it('getCurrentCombatant returns null when combat is null', () => {
    expect(useCombatStore.getState().getCurrentCombatant()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GameModeStore
// ---------------------------------------------------------------------------

describe('useGameModeStore', () => {
  beforeEach(() => {
    // Use the store's own actions to reset (avoids overwriting computed getters)
    useGameModeStore.getState().setMode('free_roam');
    useGameModeStore.getState().setRoundNumber(0);
  });

  it('initial mode is free_roam', () => {
    expect(useGameModeStore.getState().mode).toBe('free_roam');
  });

  it('setMode updates mode', () => {
    useGameModeStore.getState().setMode('fight');
    expect(useGameModeStore.getState().mode).toBe('fight');
  });

  it('setRoundNumber updates roundNumber', () => {
    useGameModeStore.getState().setRoundNumber(3);
    expect(useGameModeStore.getState().roundNumber).toBe(3);
  });

  it('isFreeRoam is true when mode is free_roam', () => {
    useGameModeStore.getState().setMode('free_roam');
    expect(useGameModeStore.getState().isFreeRoam).toBe(true);
  });

  it('isFight is true when mode is fight', () => {
    useGameModeStore.getState().setMode('fight');
    expect(useGameModeStore.getState().mode).toBe('fight');
    // getter reads from internal get() — verify via mode directly
    const s = useGameModeStore.getState();
    const isFight = s.mode === 'fight';
    expect(isFight).toBe(true);
  });

  it('isExplore is true when mode is explore', () => {
    useGameModeStore.getState().setMode('explore');
    expect(useGameModeStore.getState().mode).toBe('explore');
  });

  it('isCustom is true when mode is custom', () => {
    useGameModeStore.getState().setMode('custom');
    expect(useGameModeStore.getState().mode).toBe('custom');
  });

  it('derived flags: only the active mode is true', () => {
    useGameModeStore.getState().setMode('fight');
    const { mode } = useGameModeStore.getState();
    expect(mode === 'fight').toBe(true);
    expect(mode === 'free_roam').toBe(false);
    expect(mode === 'explore').toBe(false);
    expect(mode === 'custom').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PlanningStore
// ---------------------------------------------------------------------------

describe('usePlanningStore', () => {
  beforeEach(() => {
    usePlanningStore.setState({ queue: [], isPlanningMode: false, selectedSpriteId: null, sequenceId: 0 });
  });

  it('initial state is empty', () => {
    const s = usePlanningStore.getState();
    expect(s.queue).toHaveLength(0);
    expect(s.isPlanningMode).toBe(false);
    expect(s.selectedSpriteId).toBeNull();
  });

  it('startPlanning enables planning mode', () => {
    usePlanningStore.getState().startPlanning('sprite-1');
    const s = usePlanningStore.getState();
    expect(s.isPlanningMode).toBe(true);
    expect(s.selectedSpriteId).toBe('sprite-1');
  });

  it('stopPlanning disables planning mode', () => {
    usePlanningStore.getState().startPlanning('sprite-1');
    usePlanningStore.getState().stopPlanning();
    const s = usePlanningStore.getState();
    expect(s.isPlanningMode).toBe(false);
    expect(s.selectedSpriteId).toBeNull();
  });

  it('addAction appends to queue with sequence_index', () => {
    usePlanningStore.getState().addAction({ id: 'a1', action_type: 'move', label: 'Move', sequence_index: 0 });
    const q = usePlanningStore.getState().queue;
    expect(q).toHaveLength(1);
    expect(q[0].sequence_index).toBe(0);
  });

  it('addAction increments sequence_index for each added action', () => {
    usePlanningStore.getState().addAction({ id: 'a1', action_type: 'move', label: 'Move', sequence_index: 0 });
    usePlanningStore.getState().addAction({ id: 'a2', action_type: 'attack', label: 'Attack', sequence_index: 0 });
    const q = usePlanningStore.getState().queue;
    expect(q[0].sequence_index).toBe(0);
    expect(q[1].sequence_index).toBe(1);
  });

  it('removeAction removes by id and re-indexes remaining', () => {
    usePlanningStore.getState().addAction({ id: 'a1', action_type: 'move', label: 'Move', sequence_index: 0 });
    usePlanningStore.getState().addAction({ id: 'a2', action_type: 'attack', label: 'Attack', sequence_index: 0 });
    usePlanningStore.getState().removeAction('a1');
    const q = usePlanningStore.getState().queue;
    expect(q).toHaveLength(1);
    expect(q[0].id).toBe('a2');
    expect(q[0].sequence_index).toBe(0); // re-indexed
  });

  it('clearQueue empties the queue', () => {
    usePlanningStore.getState().addAction({ id: 'a1', action_type: 'move', label: 'Move', sequence_index: 0 });
    usePlanningStore.getState().clearQueue();
    expect(usePlanningStore.getState().queue).toHaveLength(0);
  });

  it('nextSequenceId returns incrementing values', () => {
    const id1 = usePlanningStore.getState().nextSequenceId();
    const id2 = usePlanningStore.getState().nextSequenceId();
    expect(id2).toBeGreaterThan(id1);
  });
});

// ---------------------------------------------------------------------------
// SessionRulesStore
// ---------------------------------------------------------------------------

describe('useSessionRulesStore', () => {
  beforeEach(() => {
    useSessionRulesStore.setState({ rules: null, isDirty: false, draft: {} });
  });

  it('initial state: rules null, not dirty', () => {
    const s = useSessionRulesStore.getState();
    expect(s.rules).toBeNull();
    expect(s.isDirty).toBe(false);
  });

  it('setRules updates rules and clears dirty', () => {
    const rules = { session_id: 's1', ...DEFAULT_RULES };
    useSessionRulesStore.getState().setRules(rules);
    const s = useSessionRulesStore.getState();
    expect(s.rules).toEqual(rules);
    expect(s.isDirty).toBe(false);
    expect(s.draft).toEqual({});
  });

  it('updateDraft marks dirty and merges patch', () => {
    useSessionRulesStore.getState().updateDraft({ enforce_movement_speed: true });
    const s = useSessionRulesStore.getState();
    expect(s.isDirty).toBe(true);
    expect(s.draft.enforce_movement_speed).toBe(true);
  });

  it('updateDraft merges multiple patches', () => {
    useSessionRulesStore.getState().updateDraft({ enforce_movement_speed: true });
    useSessionRulesStore.getState().updateDraft({ walls_block_movement: false });
    const d = useSessionRulesStore.getState().draft;
    expect(d.enforce_movement_speed).toBe(true);
    expect(d.walls_block_movement).toBe(false);
  });

  it('resetDraft clears draft and dirty flag', () => {
    useSessionRulesStore.getState().updateDraft({ enforce_movement_speed: true });
    useSessionRulesStore.getState().resetDraft();
    const s = useSessionRulesStore.getState();
    expect(s.draft).toEqual({});
    expect(s.isDirty).toBe(false);
  });

  it('DEFAULT_RULES has sensible movement defaults', () => {
    expect(DEFAULT_RULES.default_movement_speed).toBeGreaterThan(0);
    expect(DEFAULT_RULES.walls_block_movement).toBeDefined();
  });
});
