import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSendMessage = vi.fn();
const mockStopPlanning = vi.fn();
const mockNextSequenceId = vi.fn(() => 42);
const mockSetPendingCombatCommand = vi.fn();

vi.mock('../stores/planningStore', () => ({
  usePlanningStore: vi.fn(),
}));
vi.mock('../stores/gameModeStore', () => ({
  useGameModeStore: vi.fn(() => 'free_roam'),
}));
vi.mock('../stores/oaStore', () => ({
  useOAStore: vi.fn((selector) => selector({
    setPendingCombatCommand: mockSetPendingCombatCommand,
  })),
}));
vi.mock('@/store', () => ({
  useGameStore: vi.fn((selector) => selector({
    activeTableId: 'table-1',
    sprites: [{ id: 'sprite-1', tableId: 'table-1', x: 10, y: 20 }],
  })),
}));
vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => ({ protocol: { sendMessage: mockSendMessage } })),
}));
vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, data) => ({ type, data })),
  MessageType: { COMBAT_COMMAND: 'combat_command' },
}));
vi.mock('../services/planning.service', () => ({
  planningService: { clearAll: vi.fn() },
}));
vi.mock('../components/CommitButton.module.css', () => ({ default: {} }));

import { CommitButton } from '../components/CommitButton';
import { usePlanningStore } from '../stores/planningStore';

function setup(overrides: Record<string, unknown> = {}) {
  vi.mocked(usePlanningStore).mockReturnValue({
    queue: [],
    isPlanningMode: true,
    selectedSpriteId: 'sprite-1',
    stopPlanning: mockStopPlanning,
    nextSequenceId: mockNextSequenceId,
    ...overrides,
  } as never);
}

describe('CommitButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when queue is empty', () => {
    setup({ queue: [] });
    const { container } = render(<CommitButton />);
    expect(container.firstChild).toBeNull();
  });

  it('shows commit button with queued actions', () => {
    setup({
      queue: [{ id: 'a1', action_type: 'move', label: 'Move', sequence_index: 0 }],
    });
    render(<CommitButton />);
    expect(screen.getByRole('button', { name: /commit/i })).toBeInTheDocument();
  });

  it('sends combat_command and leaves planning cleanup to server response', async () => {
    const user = userEvent.setup();
    setup({
      queue: [{ id: 'a1', action_type: 'move', target_x: 64, target_y: 64,
                cost_ft: 10, label: 'Move', sequence_index: 0 }],
    });
    render(<CommitButton />);
    await user.click(screen.getByRole('button', { name: /commit/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'combat_command',
        data: expect.objectContaining({
          sequence_id: 42,
          commands: [expect.objectContaining({
            type: 'move',
            actor_id: 'sprite-1',
            table_id: 'table-1',
            from_x: 10,
            from_y: 20,
            target_x: 64,
            target_y: 64,
            cost_ft: 10,
          })],
        }),
      })
    );
    expect(mockSetPendingCombatCommand).toHaveBeenCalledWith(expect.objectContaining({
      sequence_id: 42,
      commands: [expect.objectContaining({ type: 'move' })],
    }));
    // Planning cleared by ACTION_RESULT / ACTION_REJECTED, not optimistically on commit
    expect(mockStopPlanning).not.toHaveBeenCalled();
  });
});
