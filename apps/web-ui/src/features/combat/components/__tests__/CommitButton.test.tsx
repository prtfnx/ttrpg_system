import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/store';
import { useGameModeStore } from '../../stores/gameModeStore';
import { useOAStore } from '../../stores/oaStore';
import { usePlanningStore } from '../../stores/planningStore';
import { CommitButton } from '../CommitButton';

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => ({ protocol: { sendMessage: vi.fn() } })),
}));
vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type: string, payload: unknown) => ({ type, payload })),
  MessageType: { COMBAT_COMMAND: 'COMBAT_COMMAND' },
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
  useGameStore.setState({
    activeTableId: 'table-1',
    sprites: [{ id: 'sprite-1', tableId: 'table-1', x: 10, y: 20, name: 'Hero', layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0 }],
  } as never);
  usePlanningStore.setState({ queue: [], isPlanningMode: false, selectedSpriteId: 'sprite-1', sequenceId: 0, nextSequenceId: () => 1 } as never);
  useOAStore.setState({ pendingCombatCommand: null } as never);
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

  it('stores pending combat command for server opportunity confirmation', async () => {
    usePlanningStore.setState({
      queue: [{ ...makeAction('a1'), target_x: 80, target_y: 90, cost_ft: 10 }],
      isPlanningMode: true,
    } as never);

    render(<CommitButton />);
    await userEvent.click(screen.getByRole('button', { name: /Commit Turn/i }));

    expect(useOAStore.getState().pendingCombatCommand).toMatchObject({
      sequence_id: 1,
      commands: [expect.objectContaining({
        type: 'move',
        actor_id: 'sprite-1',
        table_id: 'table-1',
        target_x: 80,
        target_y: 90,
        cost_ft: 10,
      })],
    });
  });
});
