import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  combat: null as Record<string, unknown> | null,
  setPendingCombatCommand: vi.fn(),
}));

vi.mock('../../stores/combatStore', () => ({
  useCombatStore: {
    getState: () => ({ combat: mocks.combat }),
  },
}));

vi.mock('../../stores/oaStore', () => ({
  useOAStore: {
    getState: () => ({ setPendingCombatCommand: mocks.setPendingCombatCommand }),
  },
}));

import { sendSpriteMovement } from '../movementCommand.service';

describe('sendSpriteMovement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.combat = null;
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
});
