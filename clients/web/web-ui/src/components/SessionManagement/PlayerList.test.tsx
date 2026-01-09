import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoleManagement } from '../../hooks/useRoleManagement';
import { PlayerList } from './PlayerList';

vi.mock('../../hooks/useRoleManagement');

describe('PlayerList', () => {
  const mockKick = vi.fn();
  const mockChangeRole = vi.fn();
  const mockOnPlayerUpdate = vi.fn();
  const mockPlayers = [
    {
      user_id: 1,
      username: 'player1',
      character_name: 'Aragorn',
      is_online: true,
      role: 'owner',
      permissions: ['change_roles', 'kick_players'],
    },
    {
      user_id: 2,
      username: 'player2',
      character_name: null,
      is_online: false,
      role: 'player',
      permissions: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useRoleManagement as any).mockReturnValue({
      changeRole: mockChangeRole,
      kickPlayer: mockKick,
      changing: false,
    });
    mockChangeRole.mockResolvedValue(true);
    mockKick.mockResolvedValue(true);
  });

  it('renders player list', () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    expect(screen.getByText('player1')).toBeInTheDocument();
    expect(screen.getByText('player2')).toBeInTheDocument();
  });

  it('shows online/offline status', () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    expect(screen.getByText(/Online/)).toBeInTheDocument();
    expect(screen.getByText(/Offline/)).toBeInTheDocument();
  });

  it('displays character name when present', () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    expect(screen.getByText(/Aragorn/)).toBeInTheDocument();
  });

  it('marks current player', () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    expect(screen.getByText('(you)')).toBeInTheDocument();
  });

  it('shows role selector for authorized users', () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('calls kickPlayer when kick button clicked', async () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    const kickButtons = screen.getAllByTitle(/Kick player/i);
    fireEvent.click(kickButtons[1]);
    expect(mockKick).toHaveBeenCalledWith(2);
  });

  it('disables kick for current player', () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    const kickButtons = screen.getAllByTitle(/Kick player/i);
    expect(kickButtons[0]).toBeDisabled();
  });

  it('handles empty player list', () => {
    render(<PlayerList players={[]} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    const container = screen.getByText(/No players/i).closest('div');
    expect(container).toBeInTheDocument();
  });
});
