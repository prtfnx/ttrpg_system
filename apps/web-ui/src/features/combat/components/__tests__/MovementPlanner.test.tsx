import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MovementPlanner } from '../MovementPlanner';
import { useSessionRulesStore } from '../../stores/sessionRulesStore';

vi.mock('../../services/planning.service', () => ({
  planningService: {
    movementRange: vi.fn().mockResolvedValue({}),
    clearGhost: vi.fn(),
  },
}));

beforeEach(() => {
  useSessionRulesStore.setState({ rules: null } as any);
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

  it('calls onConfirm when Confirm clicked', () => {
    const onConfirm = vi.fn();
    render(<MovementPlanner {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('shows hint text', () => {
    render(<MovementPlanner {...baseProps} />);
    expect(screen.getByText(/Click on canvas/)).toBeInTheDocument();
  });
});
