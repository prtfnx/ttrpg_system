import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommitButton } from '../CommitButton';
import { usePlanningStore } from '../../stores/planningStore';
import { useGameModeStore } from '../../stores/gameModeStore';

vi.mock('@lib/api', () => ({
  ProtocolService: {
    getProtocol: vi.fn(() => ({ sendMessage: vi.fn() })),
  },
}));
vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type: string, payload: unknown) => ({ type, payload })),
  MessageType: { ACTION_COMMIT: 'ACTION_COMMIT' },
}));
vi.mock('../../services/planning.service', () => ({
  planningService: { clearAll: vi.fn() },
}));

const makeAction = (id: string) => ({
  id,
  action_type: 'move' as const,
  label: 'Move',
  sequence_index: 0,
});

beforeEach(() => {
  usePlanningStore.setState({ queue: [], isPlanningMode: false, sequenceId: 0, nextSequenceId: () => 1 } as never);
  useGameModeStore.setState({ mode: 'combat' } as never);
});

describe('CommitButton', () => {
  it('renders nothing when queue is empty', () => {
    usePlanningStore.setState({ queue: [], isPlanningMode: true } as never);
    const { container } = render(<CommitButton />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when not in planning mode and not free_roam', () => {
    const { container } = render(<CommitButton />);
    expect(container.firstChild).toBeNull();
  });

  it('renders commit button in planning mode with queue', () => {
    usePlanningStore.setState({ queue: [makeAction('a1')], isPlanningMode: true } as never);
    render(<CommitButton />);
    expect(screen.getByRole('button', { name: /Commit Turn/i })).toBeTruthy();
  });

  it('shows action count in button label', () => {
    usePlanningStore.setState({ queue: [makeAction('a1'), makeAction('a2')], isPlanningMode: true } as never);
    render(<CommitButton />);
    expect(screen.getByText(/2 actions/)).toBeTruthy();
  });

  it('shows singular "action" for 1 item', () => {
    usePlanningStore.setState({ queue: [makeAction('a1')], isPlanningMode: true } as never);
    render(<CommitButton />);
    expect(screen.getByText(/1 action\b/)).toBeTruthy();
  });

  it('renders in free_roam mode with queue', () => {
    useGameModeStore.setState({ mode: 'free_roam' } as never);
    usePlanningStore.setState({ queue: [makeAction('a1')], isPlanningMode: false } as never);
    render(<CommitButton />);
    expect(screen.getByRole('button', { name: /Commit Turn/i })).toBeTruthy();
  });

  it('cancel button calls stopPlanning', async () => {
    const stopPlanning = vi.fn();
    usePlanningStore.setState({ queue: [makeAction('a1')], isPlanningMode: true, stopPlanning } as never);
    render(<CommitButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(stopPlanning).toHaveBeenCalled();
  });
});
