import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMessage = vi.fn();
const mockStopPlanning = vi.fn();
const mockNextSequenceId = vi.fn(() => 42);

vi.mock('../stores/planningStore', () => ({
  usePlanningStore: vi.fn(),
}));
vi.mock('../stores/gameModeStore', () => ({
  useGameModeStore: vi.fn(() => 'free_roam'),
}));
vi.mock('@lib/api', () => ({
  ProtocolService: {
    getProtocol: vi.fn(() => ({ sendMessage: mockSendMessage })),
  },
}));
vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, data) => ({ type, data })),
  MessageType: { ACTION_COMMIT: 'action_commit' },
}));
vi.mock('../services/planning.service', () => ({
  planningService: { clearAll: vi.fn() },
}));
vi.mock('../components/CommitButton.module.css', () => ({ default: {} }));

import { usePlanningStore } from '../stores/planningStore';
import { planningService } from '../services/planning.service';
import { CommitButton } from '../components/CommitButton';

function setup(overrides: Record<string, unknown> = {}) {
  vi.mocked(usePlanningStore).mockReturnValue({
    queue: [],
    isPlanningMode: true,
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

  it('sends ACTION_COMMIT and clears planning on commit', async () => {
    const user = userEvent.setup();
    setup({
      queue: [{ id: 'a1', action_type: 'move', target_x: 64, target_y: 64,
                label: 'Move', sequence_index: 0 }],
    });
    render(<CommitButton />);
    await user.click(screen.getByRole('button', { name: /commit/i }));
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action_commit', data: expect.objectContaining({ sequence_id: 42 }) })
    );
    // Planning cleared by ACTION_RESULT / ACTION_REJECTED, not optimistically on commit
    expect(mockStopPlanning).not.toHaveBeenCalled();
  });
});
