import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionRulesStore } from '../../stores/sessionRulesStore';
import { MovementPlanner } from '../MovementPlanner';

vi.mock('../../services/planning.service', () => ({
  planningService: {
    movementRange: vi.fn().mockResolvedValue({}),
    clearGhost: vi.fn(),
    startGhost: vi.fn().mockResolvedValue(15),
  },
}));

beforeEach(() => {
  useSessionRulesStore.setState({ rules: null });
});

describe('MovementPlanner', () => {
  const baseProps = {
    spriteId: 'spr1',
    realX: 100,
    realY: 100,
    speedFt: 30,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders movement panel', () => {
    render(<MovementPlanner {...baseProps} />);
    expect(screen.getByText('Move')).toBeInTheDocument();
  });

  it('shows speed', () => {
    render(<MovementPlanner {...baseProps} />);
    expect(screen.getByText(/30ft/)).toBeInTheDocument();
  });

  it('calls onCancel when Cancel clicked', () => {
    const onCancel = vi.fn();
    render(<MovementPlanner {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('previews a canvas destination before confirming it', async () => {
    const onConfirm = vi.fn();
    render(
      <>
        <canvas data-testid="game-canvas" width={100} height={100} />
        <MovementPlanner {...baseProps} onConfirm={onConfirm} />
      </>,
    );
    const canvas = screen.getByTestId('game-canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    fireEvent.click(canvas, { clientX: 25, clientY: 50 });
    await waitFor(() => expect(screen.getByText('15ft')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Confirm'));

    expect(onConfirm).toHaveBeenCalledWith(25, 50, 15);
  });

  it('shows hint text', () => {
    render(<MovementPlanner {...baseProps} />);
    expect(screen.getByText(/Click on canvas/)).toBeInTheDocument();
  });
});
