import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerRoleSelector } from './PlayerRoleSelector';

describe('PlayerRoleSelector', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders current role when canEdit is false', () => {
    render(<PlayerRoleSelector currentRole="player" canEdit={false} onChange={mockOnChange} />);
    expect(screen.getByText('Player')).toBeInTheDocument();
  });

  it('opens dropdown on click when canEdit is true', () => {
    render(<PlayerRoleSelector currentRole="player" canEdit={true} onChange={mockOnChange} />);
    const trigger = screen.getByRole('button', { name: /Player/i });
    fireEvent.click(trigger);
    
    expect(screen.getByText('Co-DM')).toBeInTheDocument();
    expect(screen.getByText('Trusted Player')).toBeInTheDocument();
    expect(screen.getByText('Spectator')).toBeInTheDocument();
  });

  it('calls onChange when role selected', () => {
    render(<PlayerRoleSelector currentRole="player" canEdit={true} onChange={mockOnChange} />);
    
    fireEvent.click(screen.getByRole('button', { name: /Player/i }));
    fireEvent.click(screen.getByText('Spectator'));
    
    expect(mockOnChange).toHaveBeenCalledWith('spectator');
  });

  it('closes dropdown after selection', () => {
    render(<PlayerRoleSelector currentRole="player" canEdit={true} onChange={mockOnChange} />);
    
    fireEvent.click(screen.getByRole('button', { name: /Player/i }));
    fireEvent.click(screen.getByText('Spectator'));
    
    expect(screen.queryByText('Read-only access')).not.toBeInTheDocument();
  });

  it('highlights active role in dropdown', () => {
    render(<PlayerRoleSelector currentRole="player" canEdit={true} onChange={mockOnChange} />);
    
    fireEvent.click(screen.getByRole('button', { name: /Player/i }));
    
    const playerOption = screen.getByText('Standard player permissions').closest('button');
    expect(playerOption?.className).toMatch(/active/);
  });

  it('disables when disabled prop is true', () => {
    render(<PlayerRoleSelector currentRole="player" canEdit={true} onChange={mockOnChange} disabled />);
    const trigger = screen.getByRole('button');
    expect(trigger).toBeDisabled();
  });

  it('shows label only when canEdit is false', () => {
    render(<PlayerRoleSelector currentRole="co_dm" canEdit={false} onChange={mockOnChange} />);
    expect(screen.getByText('Co-DM')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
