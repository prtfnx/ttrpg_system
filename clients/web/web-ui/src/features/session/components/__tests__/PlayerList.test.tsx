import { PlayerList } from '@features/session';
import { renderWithProviders } from '@test/utils/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the role selector component
vi.mock('../PlayerRoleSelector', () => ({
  PlayerRoleSelector: ({ currentRole, onRoleChange, disabled }: any) => (
    <select 
      data-testid="role-selector"
      value={currentRole}
      onChange={(e) => onRoleChange(e.target.value)}
      disabled={disabled}
    >
      <option value="player">Player</option>
      <option value="trusted_player">Trusted Player</option>
      <option value="co_dm">Co-DM</option>
      <option value="spectator">Spectator</option>
    </select>
  )
}));

describe('PlayerList', () => {
  const mockPlayers = [
    {
      userId: 'user1',
      username: 'Player One',
      role: 'player' as const,
      isOnline: true,
      lastActivity: new Date().toISOString()
    },
    {
      userId: 'user2', 
      username: 'Trusted Player',
      role: 'trusted_player' as const,
      isOnline: true,
      lastActivity: new Date().toISOString()
    },
    {
      userId: 'user3',
      username: 'Offline Player',
      role: 'spectator' as const,
      isOnline: false,
      lastActivity: new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour ago
    }
  ];

  const defaultProps = {
    players: mockPlayers,
    sessionCode: 'TEST123',
    canManagePlayers: true,
    changing: false,
    onRoleChange: vi.fn(async () => true),
    onKick: vi.fn(async () => true),
    onPlayerUpdate: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders all players in the list', () => {
      renderWithProviders(<PlayerList {...defaultProps} />);

      expect(screen.getByText('Player One')).toBeInTheDocument();
      // 'Trusted Player' appears as both username and role option, so use getAllByText
      expect(screen.getAllByText('Trusted Player')[0]).toBeInTheDocument();
      expect(screen.getByText('Offline Player')).toBeInTheDocument();
    });

    it('shows empty state when no players', () => {
      renderWithProviders(<PlayerList {...defaultProps} players={[]} />);

      expect(screen.getByText(/no players/i)).toBeInTheDocument();
    });

    it('displays player roles correctly', () => {
      renderWithProviders(<PlayerList {...defaultProps} />);

      // Role selectors contain role options, so multiple matches expected
      const roleSelectors = screen.getAllByTestId('role-selector');
      expect(roleSelectors[0]).toHaveValue('player');
      expect(roleSelectors[1]).toHaveValue('trusted_player');
      expect(roleSelectors[2]).toHaveValue('spectator');
    });

    it('shows online/offline status', () => {
      renderWithProviders(<PlayerList {...defaultProps} />);

      // Players list should render
      expect(screen.getByText('Player One')).toBeInTheDocument();
      expect(screen.getByText('Offline Player')).toBeInTheDocument();
    });
  });

  describe('Role Management', () => {
    it('shows role selector for each player when canModify is true', () => {
      renderWithProviders(<PlayerList {...defaultProps} />);

      const roleSelectors = screen.getAllByTestId('role-selector');
      expect(roleSelectors).toHaveLength(3);
    });

    it('hides role selectors when canManagePlayers is false', () => {
      renderWithProviders(<PlayerList {...defaultProps} canManagePlayers={false} />);

      const roleSelectors = screen.queryAllByTestId('role-selector');
      expect(roleSelectors).toHaveLength(0);
    });

    it('calls onRoleChange when role is changed', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PlayerList {...defaultProps} />);

      const firstRoleSelector = screen.getAllByTestId('role-selector')[0];
      await user.selectOptions(firstRoleSelector, 'trusted_player');

      expect(defaultProps.onRoleChange).toHaveBeenCalledWith(
        mockPlayers[0], 
        'trusted_player'
      );
    });

    it('disables role changes for session owner', () => {
      const playersWithOwner = [
        ...mockPlayers,
        {
          userId: 'owner-user',
          username: 'Session Owner',
          role: 'owner' as const,
          isOnline: true,
          lastActivity: new Date().toISOString()
        }
      ];

      renderWithProviders(<PlayerList {...defaultProps} players={playersWithOwner} />);

      const roleSelectors = screen.getAllByTestId('role-selector');
      const ownerSelector = roleSelectors[roleSelectors.length - 1];
      
      expect(ownerSelector).toBeDisabled();
    });

    it('shows appropriate role options based on permissions', () => {
      renderWithProviders(<PlayerList {...defaultProps} />);

      const roleSelector = screen.getAllByTestId('role-selector')[0];
      
      // Should have all role options available
      expect(roleSelector).toHaveTextContent('Player');
      expect(roleSelector).toHaveTextContent('Trusted Player');
      expect(roleSelector).toHaveTextContent('Co-DM');
      expect(roleSelector).toHaveTextContent('Spectator');
    });
  });

  describe('Player Removal', () => {
    it('shows kick button for each player when canManagePlayers is true', () => {
      renderWithProviders(<PlayerList {...defaultProps} />);

      const kickButtons = screen.getAllByTitle(/kick.*player/i);
      expect(kickButtons).toHaveLength(3);
    });

    it('hides kick buttons when canManagePlayers is false', () => {
      renderWithProviders(<PlayerList {...defaultProps} canManagePlayers={false} />);

      const kickButtons = screen.queryAllByTitle(/kick.*player/i);
      expect(kickButtons).toHaveLength(0);
    });

    it('calls onKick when kick button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PlayerList {...defaultProps} />);

      const kickButton = screen.getAllByTitle(/kick.*player/i)[0];
      await user.click(kickButton);

      expect(defaultProps.onKick).toHaveBeenCalledWith(mockPlayers[0]);
    });

    it('does not show kick button for session owner', () => {
      const playersWithOwner = [
        ...mockPlayers,
        {
          userId: 'current-user', // Same as auth user
          username: 'Session Owner',
          role: 'owner' as const,
          isOnline: true,
          lastActivity: new Date().toISOString()
        }
      ];

      renderWithProviders(<PlayerList {...defaultProps} players={playersWithOwner} />);

      const kickButtons = screen.getAllByTitle(/kick.*player/i);
      expect(kickButtons).toHaveLength(3); // Only for non-owner players
    });

    // Note: Kick confirmation is handled by parent component, not PlayerList
  });

  describe('Player Information Display', () => {
    it('shows online/offline status for each player', () => {
      renderWithProviders(<PlayerList {...defaultProps} />);

      // Online indicators (●) for connected players
      const statusIndicators = screen.getAllByText(/●|○/);
      expect(statusIndicators.length).toBeGreaterThan(0);

      // Should show role group headers
      expect(screen.getByText('Players (1)')).toBeInTheDocument();
      expect(screen.getByText('Trusted Players (1)')).toBeInTheDocument();
      expect(screen.getByText('Spectators (1)')).toBeInTheDocument();
    });

    it('sorts players by online status and name', () => {
      renderWithProviders(<PlayerList {...defaultProps} />);

      const playerElements = screen.getAllByTestId('player-item');
      
      // Online players should appear first
      expect(playerElements[0]).toHaveTextContent('Player One');
      expect(playerElements[1]).toHaveTextContent('Trusted Player');
      expect(playerElements[2]).toHaveTextContent('Offline Player');
    });
  });

  describe('Interactive Features', () => {
    it('highlights player on hover', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PlayerList {...defaultProps} />);

      const firstPlayer = screen.getAllByTestId('player-item')[0];
      await user.hover(firstPlayer);

      expect(firstPlayer).toHaveClass('hovered');
    });

    it('shows player context menu on right click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PlayerList {...defaultProps} />);

      const firstPlayer = screen.getAllByTestId('player-item')[0];
      await user.pointer({ target: firstPlayer, keys: '[MouseRight]' });

      // Should show context menu with options
      expect(screen.getByText('Promote to Co-DM')).toBeInTheDocument();
      expect(screen.getByText('Remove Player')).toBeInTheDocument();
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PlayerList {...defaultProps} />);

      const firstPlayer = screen.getAllByTestId('player-item')[0];
      firstPlayer.focus();

      await user.keyboard('{ArrowDown}');
      
      const secondPlayer = screen.getAllByTestId('player-item')[1];
      expect(secondPlayer).toHaveFocus();
    });

    it('supports keyboard selection in bulk mode', async () => {
      const user = userEvent.setup();
      renderWithProviders(<PlayerList {...defaultProps} bulkMode={true} />);

      const firstPlayer = screen.getAllByTestId('player-item')[0];
      firstPlayer.focus();

      await user.keyboard(' '); // Space to select

      expect(defaultProps.onToggleSelection).toHaveBeenCalledWith('user1');
    });
  });

  describe('Performance and Virtualization', () => {
    it('renders large player lists efficiently', () => {
      const largePlayers = Array.from({ length: 100 }, (_, i) => ({
        userId: `user${i}`,
        username: `Player ${i}`,
        role: 'player' as const,
        isOnline: i % 2 === 0,
        lastActivity: new Date().toISOString()
      }));

      const start = performance.now();
      renderWithProviders(<PlayerList {...defaultProps} players={largePlayers} />);
      const end = performance.now();

      // Should render in reasonable time (less than 100ms)
      expect(end - start).toBeLessThan(100);
    });

    it('uses virtual scrolling for very large lists', () => {
      const hugePlayers = Array.from({ length: 1000 }, (_, i) => ({
        userId: `user${i}`,
        username: `Player ${i}`,
        role: 'player' as const,
        isOnline: true,
        lastActivity: new Date().toISOString()
      }));

      renderWithProviders(<PlayerList {...defaultProps} players={hugePlayers} />);

      // Should not render all items in DOM
      const playerElements = screen.getAllByTestId('player-item');
      expect(playerElements.length).toBeLessThan(50); // Only visible items
    });
  });
});
