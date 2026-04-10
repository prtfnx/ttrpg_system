import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../stores/planningStore', () => ({
  usePlanningStore: vi.fn(),
}));
vi.mock('../stores/combatStore', () => ({
  useCombatStore: vi.fn(() => null),
}));
vi.mock('../components/PlanningQueue.module.css', () => ({ default: {} }));

import { usePlanningStore } from '../stores/planningStore';
import { useCombatStore } from '../stores/combatStore';
import { PlanningQueue } from '../components/PlanningQueue';

const mockRemoveAction = vi.fn();
const mockClearQueue = vi.fn();

function setup(overrides: Record<string, unknown> = {}) {
  vi.mocked(usePlanningStore).mockReturnValue({
    queue: [],
    isPlanningMode: true,
    removeAction: mockRemoveAction,
    clearQueue: mockClearQueue,
    ...overrides,
  } as never);
}

describe('PlanningQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when not in planning mode', () => {
    setup({ isPlanningMode: false, queue: [{ id: '1', label: 'Move' }] });
    const { container } = render(<PlanningQueue />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when queue is empty', () => {
    setup({ queue: [] });
    const { container } = render(<PlanningQueue />);
    expect(container.firstChild).toBeNull();
  });

  it('shows queued actions', () => {
    setup({
      queue: [
        { id: 'a1', label: 'Move to (5,5)', action_type: 'move', cost_ft: 30, cost_type: 'movement', sequence_index: 0 },
      ],
    });
    render(<PlanningQueue />);
    expect(screen.getByText(/Move to/)).toBeInTheDocument();
  });

  it('calls removeAction when remove button is clicked', async () => {
    const user = userEvent.setup();
    setup({
      queue: [
        { id: 'a2', label: 'Attack', action_type: 'attack', cost_type: 'action', sequence_index: 0 },
      ],
    });
    render(<PlanningQueue />);
    await user.click(screen.getByRole('button', { name: /✕/ }));
    expect(mockRemoveAction).toHaveBeenCalledWith('a2');
  });

  it('calls clearQueue when clear all is clicked', async () => {
    const user = userEvent.setup();
    setup({
      queue: [
        { id: 'a3', label: 'Cast Spell', action_type: 'cast_spell', cost_type: 'action', sequence_index: 0 },
      ],
    });
    render(<PlanningQueue />);
    await user.click(screen.getByText(/Clear All/i));
    expect(mockClearQueue).toHaveBeenCalled();
  });
});
