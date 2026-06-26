import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCombatCommands } from '../useCombatCommands';

const mockSendMessage = vi.fn();

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => ({ protocol: { sendMessage: mockSendMessage } })),
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, data) => ({ type, data })),
  MessageType: { COMBAT_COMMAND: 'combat_command' },
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
});
