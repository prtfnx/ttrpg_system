import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionRulesStore } from '../../stores/sessionRulesStore';
import { planningService } from '../../services/planning.service';
import { MovementPlanner } from '../MovementPlanner';

vi.mock('../../services/planning.service', () => ({
  planningService: {
    movementRange: vi.fn().mockResolvedValue({}),
    clearGhost: vi.fn(),
    startGhost: vi.fn().mockResolvedValue(15),
    getGhost: vi.fn().mockResolvedValue({ preview_x: 25, preview_y: 75, path: [[100, 100], [25, 75]] }),
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

    expect(onConfirm).toHaveBeenCalledWith(25, 75, 15, [[100, 100], [25, 75]]);
    expect(screen.getByText('Destination: 25, 75')).toBeInTheDocument();
  });

  it('cannot confirm a blocked route', async () => {
    vi.mocked(planningService.startGhost).mockResolvedValueOnce(Infinity);
    const onConfirm = vi.fn();
    render(<><canvas data-testid="game-canvas" /><MovementPlanner {...baseProps} onConfirm={onConfirm} /></>);
    fireEvent.click(screen.getByTestId('game-canvas'), { clientX: 25, clientY: 50 });
    expect(await screen.findByRole('alert')).toHaveTextContent('No clear path');
    expect(screen.getByText('Confirm')).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows hint text', () => {
    render(<MovementPlanner {...baseProps} />);
    expect(screen.getByText(/Click on canvas/)).toBeInTheDocument();
  });
});
