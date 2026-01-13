/**
 * Tests for SessionManagementPanel component
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManagementPanel } from '../SessionManagementPanel';

vi.mock('../../../hooks/useSessionPlayers', () => ({
  useSessionPlayers: vi.fn()
}));
vi.mock('../../../services/ProtocolContext', () => ({
  useProtocol: () => ({ protocol: null })
}));

const mockPlayers = [
  {
    id: 1,
    user_id: 1,
    username: 'DungeonMaster',
    role: 'owner',
    is_connected: true,
    joined_at: '2026-01-01T00:00:00Z',
    permissions: []
  },
  {
    id: 2,
    user_id: 2,
    username: 'Player1',
    role: 'player',
    is_connected: true,
    joined_at: '2026-01-01T01:00:00Z',
    permissions: []
  }
];

describe('SessionManagementPanel', () => {
  let mockUseSessionPlayers: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { useSessionPlayers } = await import('../../../hooks/useSessionPlayers');
    mockUseSessionPlayers = useSessionPlayers;
    (mockUseSessionPlayers as any).mockReturnValue({
      players: [],
      loading: false,
      error: null,
      refetch: vi.fn()
    });
  });

  it('renders collapsed by default', () => {
    render(<SessionManagementPanel sessionCode="TEST123" />);
    expect(screen.getByText('👥 Manage Players')).toBeInTheDocument();
  });

  it('expands when clicked', () => {
    render(<SessionManagementPanel sessionCode="TEST123" />);
    const toggleButton = screen.getByText('👥 Manage Players');
    fireEvent.click(toggleButton);
    expect(screen.getByText('Session Management')).toBeInTheDocument();
  });

  it('displays player list when expanded', async () => {
    (mockUseSessionPlayers as any).mockReturnValue({
      players: mockPlayers,
      loading: false,
      error: null,
      refetch: vi.fn()
    });
    
    render(<SessionManagementPanel sessionCode="TEST123" />);
    const toggleButton = screen.getByText('👥 Manage Players');
    fireEvent.click(toggleButton);
    
    await waitFor(() => {
      expect(screen.getByText('DungeonMaster')).toBeInTheDocument();
      expect(screen.getByText('Player1')).toBeInTheDocument();
    });
  });

  it('closes when close button clicked', () => {
    render(<SessionManagementPanel sessionCode="TEST123" />);
    fireEvent.click(screen.getByText('👥 Manage Players'));
    
    const closeButton = screen.getByText('✕');
    fireEvent.click(closeButton);
    
    expect(screen.getByText('👥 Manage Players')).toBeInTheDocument();
    expect(screen.queryByText('Session Management')).not.toBeInTheDocument();
  });

  it('opens invitation manager', () => {
    render(<SessionManagementPanel sessionCode="TEST123" />);
    fireEvent.click(screen.getByText('👥 Manage Players'));
    
    const inviteButton = screen.getByText('📨 Manage Invites');
    fireEvent.click(inviteButton);
    
    expect(screen.getByText(/Invitation/)).toBeInTheDocument();
  });
});
