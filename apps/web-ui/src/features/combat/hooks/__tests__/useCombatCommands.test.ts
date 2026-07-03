import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCombatCommands } from '../useCombatCommands';

const mockSendMessage = vi.fn();

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => ({ protocol: { sendMessage: mockSendMessage } })),
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, data) => ({ type, data })),
  MessageType: {
    COMBAT_COMMAND: 'combat_command',
    DEATH_SAVE_ROLL: 'death_save_roll',
    INITIATIVE_REMOVE: 'initiative_remove',
    INITIATIVE_ROLL: 'initiative_roll',
    TURN_SKIP: 'turn_skip',
  },
}));

describe('useCombatCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends utility actions as combat_command batches', () => {
    const { result } = renderHook(() => useCombatCommands());

    expect(result.current.sendUtilityAction('cmb-1', 'dash')).toBe(true);

    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'combat_command',
      data: expect.objectContaining({
        commands: [expect.objectContaining({
          type: 'dash',
          actor_id: 'cmb-1',
        })],
      }),
    }));
  });

  it('sends end turn through the same command envelope', () => {
    const { result } = renderHook(() => useCombatCommands());

    result.current.endTurn('cmb-2');

    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        commands: [expect.objectContaining({
          type: 'end_turn',
          actor_id: 'cmb-2',
        })],
      }),
    }));
  });

  it('sends attacks with target and resolution fields', () => {
    const { result } = renderHook(() => useCombatCommands());

    result.current.sendAttack({
      actorId: 'attacker-1',
      targetId: 'target-1',
      tableId: 'table-1',
      attackBonus: 5,
      damageFormula: '1d8+3',
      damageType: 'slashing',
      attackType: 'melee',
      rangeFt: 5,
    });

    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'combat_command',
      data: expect.objectContaining({
        commands: [expect.objectContaining({
          type: 'attack',
          actor_id: 'attacker-1',
          target_id: 'target-1',
          table_id: 'table-1',
          attack_bonus: 5,
          damage_formula: '1d8+3',
          damage_type: 'slashing',
          attack_type: 'melee',
          range_ft: 5,
        })],
      }),
    }));
  });

  it('sends spells with slot and target data', () => {
    const { result } = renderHook(() => useCombatCommands());

    result.current.sendSpell({
      actorId: 'caster-1',
      spellName: 'Burning Hands',
      spellLevel: 1,
      targetIds: ['target-1'],
      damageFormula: '3d6',
      saveAbility: 'dex',
      saveDc: 13,
      damageType: 'fire',
    });

    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'combat_command',
      data: expect.objectContaining({
        commands: [expect.objectContaining({
          type: 'cast_spell',
          actor_id: 'caster-1',
          spell_name: 'Burning Hands',
          spell_level: 1,
          target_ids: ['target-1'],
          damage_formula: '3d6',
          save_ability: 'dex',
          save_dc: 13,
          damage_type: 'fire',
        })],
      }),
    }));
  });

  it('sends typed DM overrides through combat_command', () => {
    const { result } = renderHook(() => useCombatCommands());

    result.current.sendDMOverride({
      actorId: 'target-1',
      overrideType: 'apply_damage',
      value: 8,
      damageType: 'force',
    });

    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'combat_command',
      data: expect.objectContaining({
        commands: [expect.objectContaining({
          type: 'dm_override',
          actor_id: 'target-1',
          override_type: 'apply_damage',
          value: 8,
          damage_type: 'force',
        })],
      }),
    }));
  });

  it('sends multiple DM status overrides as one atomic command batch', () => {
    const { result } = renderHook(() => useCombatCommands());

    result.current.sendDMOverrides([
      {
        actorId: 'target-1',
        overrideType: 'set_surprised',
        surprised: true,
      },
      {
        actorId: 'target-2',
        overrideType: 'set_surprised',
        surprised: true,
      },
    ]);

    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'combat_command',
      data: expect.objectContaining({
        commands: [
          expect.objectContaining({
            actor_id: 'target-1',
            override_type: 'set_surprised',
            surprised: true,
          }),
          expect.objectContaining({
            actor_id: 'target-2',
            override_type: 'set_surprised',
            surprised: true,
          }),
        ],
      }),
    }));
  });

  it('sends initiative and death-save protocol messages', () => {
    const { result } = renderHook(() => useCombatCommands());

    result.current.rollInitiative('cmb-1');
    result.current.rollDeathSave('cmb-1');

    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'initiative_roll',
      data: { combatant_id: 'cmb-1' },
    }));
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'death_save_roll',
      data: { combatant_id: 'cmb-1' },
    }));
  });

  it('sends DM initiative controls through protocol helpers', () => {
    const { result } = renderHook(() => useCombatCommands());

    result.current.skipTurn('cmb-2');
    result.current.removeCombatant('cmb-2');

    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'turn_skip',
      data: { combatant_id: 'cmb-2' },
    }));
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'initiative_remove',
      data: { combatant_id: 'cmb-2' },
    }));
  });
});
