import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingCombatCommand } from '../../stores/oaStore';

const mocks = vi.hoisted(() => ({
  combat: null as Record<string, unknown> | null,
  setPendingCombatCommand: vi.fn(),
  clearPendingCombatCommand: vi.fn(),
  pending: null as PendingCombatCommand | null,
}));

vi.mock('../../stores/combatStore', () => ({
  useCombatStore: {
    getState: () => ({ combat: mocks.combat }),
  },
}));

vi.mock('../../stores/oaStore', () => ({
  useOAStore: {
    getState: () => ({ pendingCombatCommand: mocks.pending,
      setPendingCombatCommand: mocks.setPendingCombatCommand, clearPendingCombatCommand: mocks.clearPendingCombatCommand }),
  },
}));

import { sendSpriteMovement } from '../movementCommand.service';

describe('sendSpriteMovement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.combat = null;
    mocks.pending = null;
    mocks.setPendingCombatCommand.mockImplementation(value => { mocks.pending = value; });
    mocks.clearPendingCombatCommand.mockImplementation(() => { mocks.pending = null; });
  });
  afterEach(() => vi.restoreAllMocks());

  it('does not reuse a movement identity after a reload at the same wall-clock time', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    vi.resetModules();
    const firstTab = await import('../movementCommand.service');
    const first = firstTab.nextMovementSequenceId();
    vi.resetModules();
    const secondTab = await import('../movementCommand.service');
    const second = secondTab.nextMovementSequenceId();
    expect(Number.isSafeInteger(first) && first > 0).toBe(true);
    expect(Number.isSafeInteger(second) && second > 0).toBe(true);
    expect(second).not.toBe(first);
  });

  it.each(['-1', '0', '042', '42.0', '1e3', '9007199254740992', ''])('allocates a fresh safe identity instead of using the invalid action ID %j', actionId => {
    mocks.combat = { phase: 'active', table_id: 'table-1', combatants: [{ combatant_id: 'combatant-1', entity_id: 'sprite-1' }] };
    const entropy = vi.spyOn(crypto, 'getRandomValues');
    const protocol = { sendMessage: vi.fn() };
    sendSpriteMovement(protocol as never, {
      spriteId: 'sprite-1', tableId: 'table-1', from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, actionId,
    });
    const sequenceId = protocol.sendMessage.mock.calls[0]![0].data.sequence_id;
    expect(entropy).toHaveBeenCalled();
    expect(Number.isSafeInteger(sequenceId) && sequenceId > 0).toBe(true);
  });

  it('sends encounter actor movement through combat_command and retains it for OA replay', () => {
    mocks.combat = {
      phase: 'active',
      table_id: 'table-1',
      combatants: [{ combatant_id: 'combatant-1', entity_id: 'sprite-1' }],
    };
    const protocol = { sendMessage: vi.fn() };

    const channel = sendSpriteMovement(protocol as never, {
      spriteId: 'sprite-1',
      tableId: 'table-1',
      from: { x: 25, y: 25 },
      to: { x: 75, y: 25 },
      actionId: '42',
    });

    expect(channel).toBe('combat');
    expect(protocol.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'combat_command',
      data: expect.objectContaining({
        sequence_id: 42,
        commands: [expect.objectContaining({
          type: 'move',
          actor_id: 'combatant-1',
          from_x: 25,
          target_x: 75,
        })],
      }),
    }));
    expect(mocks.setPendingCombatCommand).toHaveBeenCalledWith(
      expect.objectContaining({ sequence_id: 42 }),
    );
  });

  it('keeps non-combat sprite movement on the table channel', () => {
    mocks.combat = {
      phase: 'active',
      table_id: 'table-1',
      combatants: [{ combatant_id: 'combatant-1', entity_id: 'sprite-1' }],
    };
    const protocol = { sendMessage: vi.fn() };

    const channel = sendSpriteMovement(protocol as never, {
      spriteId: 'light-1',
      tableId: 'table-1',
      from: { x: 0, y: 0 },
      to: { x: 10, y: 20 },
    });

    expect(channel).toBe('table');
    expect(protocol.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'sprite_move',
    }));
    expect(mocks.setPendingCombatCommand).not.toHaveBeenCalled();
  });

  it.each(['closed', 'throws'])('restores the previous pending move when sending %s fails', failure => {
    mocks.combat = { phase: 'active', combat_id: 'encounter', table_id: 'table-1',
      combatants: [{ combatant_id: 'combatant-1', entity_id: 'sprite-1' }] };
    const previous = { sequence_id: 10, commands: [{ type: 'move', actor_id: 'previous' }] };
    mocks.pending = previous;
    const protocol = { sendMessage: vi.fn(() => {
      if (failure === 'throws') throw new Error('Transport failed');
      return false;
    }) };
    expect(() => sendSpriteMovement(protocol as never, {
      spriteId: 'sprite-1', tableId: 'table-1', from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, actionId: '42',
    })).toThrow();
    expect(mocks.pending).toEqual(previous);
  });

  it('does not leave an unsent move pending after a disconnected send', () => {
    mocks.combat = { phase: 'active', table_id: 'table-1', combatants: [{ combatant_id: 'combatant-1', entity_id: 'sprite-1' }] };
    expect(() => sendSpriteMovement({ sendMessage: () => false } as never, {
      spriteId: 'sprite-1', tableId: 'table-1', from: { x: 0, y: 0 }, to: { x: 10, y: 0 },
    })).toThrow();
    expect(mocks.pending).toBeNull();
  });
});
