import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoleManagement } from '../../hooks/useRoleManagement';
import { PlayerList } from './PlayerList';

vi.mock('../../hooks/useRoleManagement');

describe('PlayerList', () => {
  const mockKickPlayer = vi.fn();
  const mockChangeRole = vi.fn();
  const mockPlayers = [
    {
      id: 1,
      username: 'player1',
      character_name: 'Aragorn',
      is_online: true,
      role: 'player',
    },
    {
      id: 2,
      username: 'player2',
      character_name: null,
      is_online: false,
      role: 'spectator',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useRoleManagement as any).mockReturnValue({
      players: mockPlayers,
      currentPlayerId: 1,
      kickPlayer: mockKickPlayer,
      changeRole: mockChangeRole,
      canKick: vi.fn().mockReturnValue(true),
      canChangeRole: vi.fn().mockReturnValue(true),
    });
  });

  it('renders player list', () => {
    render(<PlayerList />);
    expect(screen.getByText('player1')).toBeInTheDocument();
    expect(screen.getByText('player2')).toBeInTheDocument();
  });

  it('shows online/offline status', () => {
    render(<PlayerList />);
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('displays character name when present', () => {
    render(<PlayerList />);
    expect(screen.getByText('Playing as Aragorn')).toBeInTheDocument();
  });

  it('marks current player', () => {
    render(<PlayerList />);
    expect(screen.getByText('(you)')).toBeInTheDocument();
  });

  it('shows role selector for authorized users', () => {
    render(<PlayerList />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('calls kickPlayer when kick button clicked', () => {
    render(<PlayerList />);
    const kickButtons = screen.getAllByText('×');
    fireEvent.click(kickButtons[1]);
    expect(mockKickPlayer).toHaveBeenCalledWith(2);
  });

  it('disables kick for current player', () => {
    render(<PlayerList />);
    const kickButtons = screen.getAllByText('×');
    expect(kickButtons[0]).toBeDisabled();
  });

  it('handles empty player list', () => {
    (useRoleManagement as any).mockReturnValue({
      players: [],
      currentPlayerId: null,
      kickPlayer: mockKickPlayer,
      changeRole: mockChangeRole,
      canKick: vi.fn(),
      canChangeRole: vi.fn(),
    });
    render(<PlayerList />);
    expect(screen.queryByRole('list')).toBeInTheDocument();
  });
});
