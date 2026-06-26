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
});
