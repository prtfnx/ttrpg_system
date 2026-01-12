import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../AuthContext';
import { useRoleManagement } from '../../hooks/useRoleManagement';
import { PlayerList } from './PlayerList';
import type { SessionPlayer } from '../../types/roles';

vi.mock('../../hooks/useRoleManagement');
vi.mock('../AuthContext');
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

global.confirm = vi.fn(() => true);

describe('PlayerList', () => {
  const mockChangeRole = vi.fn();
  const mockKickPlayer = vi.fn();
  const mockOnPlayerUpdate = vi.fn();
  
  const mockPlayers: SessionPlayer[] = [
    {
      id: 1,
      user_id: 1,
      username: 'player1',
      character_name: 'Aragorn',
      is_connected: true,
      role: 'owner',
      permissions: ['change_roles', 'kick_players'],
      joined_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      user_id: 2,
      username: 'player2',
      character_name: undefined,
      is_connected: false,
      role: 'player',
      permissions: [],
      joined_at: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    (useAuth as any).mockReturnValue({
      user: { id: 1, username: 'player1' },
    });
    
    (useRoleManagement as any).mockReturnValue({
      changeRole: mockChangeRole,
      kickPlayer: mockKickPlayer,
      changing: false,
      error: null,
    });
    
    mockChangeRole.mockResolvedValue({ 
      success: true, 
      new_role: 'player', 
      old_role: 'player', 
      permissions_gained: [], 
      permissions_lost: [] 
    });
    mockKickPlayer.mockResolvedValue(true);
  });

  it('renders player list', () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    expect(screen.getByText('player1')).toBeInTheDocument();
    expect(screen.getByText('player2')).toBeInTheDocument();
  });

  it('shows online/offline status', () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    const statusElements = screen.getAllByText(/●|○/);
    expect(statusElements.length).toBeGreaterThan(0);
  });

  it('displays character name when present', () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    expect(screen.getByText('Aragorn')).toBeInTheDocument();
  });

  it('marks current player', () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    expect(screen.getByText('(You)')).toBeInTheDocument();
  });

  it('shows role selector for authorized users', () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('calls kickPlayer when kick button clicked', async () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    const kickButton = screen.getByTitle('Kick player');
    fireEvent.click(kickButton);
    
    await waitFor(() => {
      expect(mockKickPlayer).toHaveBeenCalledWith(2);
    });
  });

  it('does not show kick button for current player', () => {
    render(<PlayerList players={mockPlayers} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    const kickButtons = screen.queryAllByTitle('Kick player');
    expect(kickButtons).toHaveLength(1);
  });

  it('handles empty player list', () => {
    render(<PlayerList players={[]} sessionCode="TEST" onPlayerUpdate={mockOnPlayerUpdate} />);
    expect(screen.getByText('Players (0)')).toBeInTheDocument();
  });
});
