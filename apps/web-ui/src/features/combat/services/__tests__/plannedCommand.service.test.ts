import { describe, expect, it } from 'vitest';
import type { PlannedAction } from '../../stores/planningStore';
import { buildPlannedCombatCommands } from '../plannedCommand.service';

function action(
  value: Omit<PlannedAction, 'id' | 'label' | 'sequence_index'> & Partial<PlannedAction>,
): PlannedAction {
  return {
    id: `action-${value.action_type}`,
    label: value.action_type,
    sequence_index: 0,
    ...value,
  };
}

describe('buildPlannedCombatCommands', () => {
  it('builds an ordered move, attack, and spell command batch', () => {
    const result = buildPlannedCombatCommands([
      action({
        action_type: 'move',
        target_x: 30,
        target_y: 40,
        cost_ft: 10,
        path: [[20, 30], [30, 40]],
      }),
      action({
        action_type: 'attack',
        actor_id: 'combatant-1',
        target_id: 'target-1',
        attack_bonus: 6,
        damage_formula: '1d8+4',
        damage_type: 'slashing',
      }),
      action({
        action_type: 'cast_spell',
        actor_id: 'combatant-1',
        spell_name: 'Burning Hands',
        spell_level: 1,
        target_ids: ['target-1', 'target-2'],
        damage_formula: '3d6',
        save_ability: 'dexterity',
        save_dc: 14,
        damage_type: 'fire',
      }),
    ], {
      actorId: 'token-1',
      tableId: 'table-1',
      actorPosition: { x: 10, y: 20 },
    });

    expect(result).toEqual({
      ok: true,
      commands: [
        {
          type: 'move',
          actor_id: 'token-1',
          table_id: 'table-1',
          from_x: 10,
          from_y: 20,
          target_x: 30,
          target_y: 40,
          cost_ft: 10,
          path: [[20, 30], [30, 40]],
        },
        expect.objectContaining({
          type: 'attack',
          actor_id: 'combatant-1',
          target_id: 'target-1',
          attack_bonus: 6,
          damage_formula: '1d8+4',
          damage_type: 'slashing',
        }),
        expect.objectContaining({
          type: 'cast_spell',
          actor_id: 'combatant-1',
          spell_name: 'Burning Hands',
          spell_level: 1,
          target_ids: ['target-1', 'target-2'],
          damage_formula: '3d6',
          save_ability: 'dexterity',
          save_dc: 14,
        }),
      ],
    });
  });

  it('uses each accepted movement destination as the next movement source', () => {
    const result = buildPlannedCombatCommands([
      action({ action_type: 'move', target_x: 30, target_y: 40, cost_ft: 10 }),
      action({ action_type: 'move', target_x: 50, target_y: 60, cost_ft: 10 }),
    ], {
      actorId: 'token-1',
      tableId: 'table-1',
      actorPosition: { x: 10, y: 20 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.commands[1]).toMatchObject({
      from_x: 30,
      from_y: 40,
      target_x: 50,
      target_y: 60,
    });
  });

  it('keeps an invalid attack in the queue by returning a validation error', () => {
    const result = buildPlannedCombatCommands([
      action({ action_type: 'attack' }),
    ], {
      actorId: 'combatant-1',
      tableId: 'table-1',
    });

    expect(result).toEqual({
      ok: false,
      error: 'attack is missing a target.',
    });
  });
});
