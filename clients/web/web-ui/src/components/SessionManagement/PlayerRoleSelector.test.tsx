import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlayerRoleSelector } from './PlayerRoleSelector';

describe('PlayerRoleSelector', () => {
  const mockOnChange = vi.fn();
  const roles = [
    { value: 'player', label: 'Player', description: 'Standard player' },
    { value: 'spectator', label: 'Spectator', description: 'View only' },
    { value: 'dm', label: 'DM', description: 'Dungeon Master' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders current role', () => {
    render(<PlayerRoleSelector currentRole="player" roles={roles} onChange={mockOnChange} />);
    expect(screen.getByText('Player')).toBeInTheDocument();
  });

  it('opens dropdown on click', () => {
    render(<PlayerRoleSelector currentRole="player" roles={roles} onChange={mockOnChange} />);
    const trigger = screen.getByText('Player');
    fireEvent.click(trigger);
    expect(screen.getByText('Spectator')).toBeInTheDocument();
    expect(screen.getByText('DM')).toBeInTheDocument();
  });

  it('calls onChange when role selected', () => {
    render(<PlayerRoleSelector currentRole="player" roles={roles} onChange={mockOnChange} />);
    fireEvent.click(screen.getByText('Player'));
    fireEvent.click(screen.getByText('Spectator'));
    expect(mockOnChange).toHaveBeenCalledWith('spectator');
  });

  it('closes dropdown after selection', () => {
    render(<PlayerRoleSelector currentRole="player" roles={roles} onChange={mockOnChange} />);
    fireEvent.click(screen.getByText('Player'));
    fireEvent.click(screen.getByText('Spectator'));
    expect(screen.queryByText('View only')).not.toBeInTheDocument();
  });

  it('highlights active role', () => {
    render(<PlayerRoleSelector currentRole="player" roles={roles} onChange={mockOnChange} />);
    fireEvent.click(screen.getByText('Player'));
    const playerOption = screen.getByText('Standard player').closest('button');
    expect(playerOption).toHaveClass('active');
  });

  it('disables when disabled prop is true', () => {
    render(<PlayerRoleSelector currentRole="player" roles={roles} onChange={mockOnChange} disabled />);
    const trigger = screen.getByText('Player');
    expect(trigger).toBeDisabled();
  });

  it('closes dropdown on outside click', () => {
    render(<PlayerRoleSelector currentRole="player" roles={roles} onChange={mockOnChange} />);
    fireEvent.click(screen.getByText('Player'));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('View only')).not.toBeInTheDocument();
  });
});
