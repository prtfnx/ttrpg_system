import { describe, expect, it } from 'vitest';
import { decodeCombatState } from '../combatStateAdapter';

const publicState = { combat_id: 'encounter', table_id: 'table', round_number: 1,
  current_turn_index: -1, combatants: [{ combatant_id: 'hidden-stats', entity_id: 'sprite', is_npc: true }] };

describe('combat wire adaptation', () => {
  it('normalizes omitted public fields without inventing health, control or resources', () => {
    const view = decodeCombatState(publicState);
    expect(view?.combatants[0]).toMatchObject({ controlled_by: [], hp: null, max_hp: null, temp_hp: 0,
      has_action: false, has_bonus_action: false, has_reaction: false, movement_remaining: 0 });
    expect(view?.current_turn_index).toBe(-1);
    expect(view?.phase).toBe('inactive');
    expect(view?.settings.show_npc_hp_to_players).toBe('descriptor');
  });

  it('preserves actual public state and accepts an ended encounter', () => {
    const view = decodeCombatState({ ...publicState, phase: 'active', state_version: 7,
      settings: { show_npc_hp_to_players: false },
      pending_movement: { movement_id: 'move', expires_at: 100 },
      combatants: [{ combatant_id: 'actor', entity_id: 'sprite', hp: 9, max_hp: 20, controlled_by: ['1'], has_action: true }] });
    expect(view?.state_version).toBe(7);
    expect(view?.settings.show_npc_hp_to_players).toBe('none');
    expect(view?.combatants[0]).toMatchObject({ hp: 9, max_hp: 20, controlled_by: ['1'], has_action: true });
    expect(view?.pending_movement).toEqual({ movement_id: 'move', expires_at: 100 });
    expect(decodeCombatState(null)).toBeNull();
  });

  it.each([{ ...publicState, round_number: true }, { ...publicState, table_id: '' },
    { ...publicState, combatants: [{ combatant_id: 'actor', entity_id: 'sprite', hp: 'invalid' }] },
    { ...publicState, pending_movement: { movement_id: 'move', expires_at: 1, command: {} } },
  ])('rejects malformed or private fields before normalization', state => {
    expect(() => decodeCombatState(state)).toThrow(/Invalid message/);
  });
});
