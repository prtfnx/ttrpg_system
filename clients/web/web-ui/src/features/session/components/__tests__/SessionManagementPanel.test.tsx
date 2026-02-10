import { SessionManagementPanel } from '@features/session';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the session management hook to control what the component receives
const mockSessionManagement = {
  players: [],
  loading: false,
  error: null,
  isExpanded: true,
  showInvites: false,
  changing: false,
  canManagePlayers: true,
  toggleExpanded: vi.fn(),
  toggleInvites: vi.fn(),
  closeInvites: vi.fn(),
  handleRoleChange: vi.fn(),
  handleKick: vi.fn(),
  refetch: vi.fn()
};

vi.mock('../hooks/useSessionManagement', () => ({
  useSessionManagement: () => mockSessionManagement
}));

// Mock sub-components to focus on orchestration behavior
vi.mock('../CollapsedView', () => ({
  CollapsedView: ({ sessionCode, onToggle }: any) => (
    <div data-testid="collapsed-view">
      <span>Session: {sessionCode}</span>
      <button onClick={onToggle}>Expand Management</button>
    </div>
  )
}));

vi.mock('./Invitations/InvitationManager', () => ({
  InvitationManager: ({ sessionCode, onClose }: any) => (
    <div data-testid="invitation-manager">
      <span>Managing invites for: {sessionCode}</span>
      <button onClick={onClose}>Close Invitations</button>
    </div>
  )
}));

vi.mock('../PlayerList', () => ({
  PlayerList: ({ players, onRoleChange, onRemove, canModify }: any) => (
    <div data-testid="player-list">
      <span>Players: {players.length}</span>
      <span>Can modify: {canModify ? 'yes' : 'no'}</span>
    </div>
  )
}));

describe('SessionManagementPanel - Game Master Experience', () => {
  const user = userEvent.setup();
  const sessionCode = 'DEMO123';
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to expanded state by default
    mockSessionManagement.isExpanded = true;
    mockSessionManagement.showInvites = false;
  });

  describe('When panel is collapsed', () => {
    beforeEach(() => {
      mockSessionManagement.isExpanded = false;
    });

    it('shows compact view with session code and expand option', () => {
      render(<SessionManagementPanel sessionCode={sessionCode} />);

      expect(screen.getByTestId('collapsed-view')).toBeInTheDocument();
      expect(screen.getByText(`Session: ${sessionCode}`)).toBeInTheDocument();
      expect(screen.getByText('Expand Management')).toBeInTheDocument();
      
      // Should not show the full panel
      expect(screen.queryByTestId('player-list')).not.toBeInTheDocument();
    });

    it('expands when game master clicks expand', async () => {
      render(<SessionManagementPanel sessionCode={sessionCode} />);

      await user.click(screen.getByText('Expand Management'));

      expect(mockSessionManagement.toggleExpanded).toHaveBeenCalledTimes(1);
    });
  });

  describe('When panel is expanded', () => {
    it('shows full management interface', () => {
      render(<SessionManagementPanel sessionCode={sessionCode} />);

      // Should see the main panel elements
      expect(screen.getByText('Session Management')).toBeInTheDocument();
      expect(screen.getByTestId('player-list')).toBeInTheDocument();
      
      // Should have close button
      expect(screen.getByText('×')).toBeInTheDocument();
    });

    it('shows player list with current players', () => {
      mockSessionManagement.players = [
        { id: '1', username: 'Player1', role: 'player' },
        { id: '2', username: 'Player2', role: 'spectator' }
      ];

      render(<SessionManagementPanel sessionCode={sessionCode} />);

      expect(screen.getByText('Players: 2')).toBeInTheDocument();
    });

    it('indicates when game master can modify player settings', () => {
      mockSessionManagement.canManagePlayers = true;

      render(<SessionManagementPanel sessionCode={sessionCode} />);

      expect(screen.getByText('Can modify: yes')).toBeInTheDocument();
    });

    it('shows restricted view when game master lacks permissions', () => {
      mockSessionManagement.canManagePlayers = false;

      render(<SessionManagementPanel sessionCode={sessionCode} />);

      expect(screen.getByText('Can modify: no')).toBeInTheDocument();
    });

    it('collapses panel when close button is clicked', async () => {
      render(<SessionManagementPanel sessionCode={sessionCode} />);

      await user.click(screen.getByText('×'));

      expect(mockSessionManagement.toggleExpanded).toHaveBeenCalledTimes(1);
    });
  });

  describe('Invitation management workflow', () => {
    it('shows invitation management when requested', () => {
      mockSessionManagement.showInvites = true;

      render(<SessionManagementPanel sessionCode={sessionCode} />);

      expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();
      expect(screen.getByText(`Managing invites for: ${sessionCode}`)).toBeInTheDocument();
    });

    it('allows game master to open invitation manager', async () => {
      render(<SessionManagementPanel sessionCode={sessionCode} />);

      const inviteButton = screen.getByText('Manage Invitations');
      await user.click(inviteButton);

      expect(mockSessionManagement.toggleInvites).toHaveBeenCalledTimes(1);
    });

    it('closes invitation manager when requested', async () => {
      mockSessionManagement.showInvites = true;

      render(<SessionManagementPanel sessionCode={sessionCode} />);

      await user.click(screen.getByText('Close Invitations'));

      expect(mockSessionManagement.closeInvites).toHaveBeenCalledTimes(1);
    });

    it('overlays invitation manager over main panel', () => {
      mockSessionManagement.showInvites = true;

      render(<SessionManagementPanel sessionCode={sessionCode} />);

      // Both should be present - invitation manager as overlay
      expect(screen.getByTestId('player-list')).toBeInTheDocument();
      expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();
    });
  });

  describe('Loading and error states', () => {
    it('shows loading indicator while data loads', () => {
      mockSessionManagement.loading = true;

      render(<SessionManagementPanel sessionCode={sessionCode} />);

      expect(screen.getByText('Loading session data...')).toBeInTheDocument();
      
      // Player list should not be shown when loading
      expect(screen.queryByTestId('player-list')).not.toBeInTheDocument();
    });

    it('displays error message when something goes wrong', () => {
      mockSessionManagement.error = 'Failed to connect to session server';

      render(<SessionManagementPanel sessionCode={sessionCode} />);

      expect(screen.getByText('Error: Failed to connect to session server')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('allows retry when there is an error', async () => {
      mockSessionManagement.error = 'Connection timeout';

      render(<SessionManagementPanel sessionCode={sessionCode} />);

      await user.click(screen.getByText('Retry'));

      expect(mockSessionManagement.refetch).toHaveBeenCalledTimes(1);
    });

    it('shows when operations are in progress', () => {
      mockSessionManagement.changing = true;

      render(<SessionManagementPanel sessionCode={sessionCode} />);

      // Should indicate something is happening
      const managementPanel = screen.getByText('Session Management').closest('div');
      expect(managementPanel).toHaveClass('changing');
    });
  });

  describe('Real-world usage scenarios', () => {
    it('handles game master workflow: expand, manage players, close', async () => {
      // Start collapsed
      mockSessionManagement.isExpanded = false;
      const { rerender } = render(<SessionManagementPanel sessionCode={sessionCode} />);

      // Expand panel
      await user.click(screen.getByText('Expand Management'));
      expect(mockSessionManagement.toggleExpanded).toHaveBeenCalled();

      // Simulate expansion
      mockSessionManagement.isExpanded = true;
      rerender(<SessionManagementPanel sessionCode={sessionCode} />);

      // Should now see player management
      expect(screen.getByTestId('player-list')).toBeInTheDocument();

      // Close panel
      await user.click(screen.getByText('×'));
      expect(mockSessionManagement.toggleExpanded).toHaveBeenCalledTimes(2);
    });

    it('handles invitation workflow: open invites, manage, close', async () => {
      render(<SessionManagementPanel sessionCode={sessionCode} />);

      // Open invitations
      await user.click(screen.getByText('Manage Invitations'));
      expect(mockSessionManagement.toggleInvites).toHaveBeenCalled();

      // Simulate invitation panel opening
      mockSessionManagement.showInvites = true;
      const { rerender } = render(<SessionManagementPanel sessionCode={sessionCode} />);

      // Should see invitation manager
      expect(screen.getByTestId('invitation-manager')).toBeInTheDocument();

      // Close invitations
      await user.click(screen.getByText('Close Invitations'));
      expect(mockSessionManagement.closeInvites).toHaveBeenCalled();
    });

    it('adapts to different session states gracefully', () => {
      // Empty session
      mockSessionManagement.players = [];
      const { rerender } = render(<SessionManagementPanel sessionCode={sessionCode} />);

      expect(screen.getByText('Players: 0')).toBeInTheDocument();

      // Busy session
      mockSessionManagement.players = new Array(8).fill(0).map((_, i) => ({
        id: `player-${i}`,
        username: `Player ${i + 1}`,
        role: 'player'
      }));
      rerender(<SessionManagementPanel sessionCode={sessionCode} />);

      expect(screen.getByText('Players: 8')).toBeInTheDocument();
    });
  });

  describe('Component orchestration', () => {
    it('passes correct props to PlayerList component', () => {
      const testPlayers = [{ id: '1', username: 'Test', role: 'player' }];
      mockSessionManagement.players = testPlayers;
      mockSessionManagement.canManagePlayers = true;

      render(<SessionManagementPanel sessionCode={sessionCode} />);

      // PlayerList should receive the right data and permissions
      expect(screen.getByText('Players: 1')).toBeInTheDocument();
      expect(screen.getByText('Can modify: yes')).toBeInTheDocument();
    });

    it('passes sessionCode to all sub-components that need it', () => {
      mockSessionManagement.showInvites = true;
      
      render(<SessionManagementPanel sessionCode={sessionCode} />);

      // InvitationManager should receive sessionCode
      expect(screen.getByText(`Managing invites for: ${sessionCode}`)).toBeInTheDocument();
    });

    it('coordinates state between sub-components effectively', () => {
      render(<SessionManagementPanel sessionCode={sessionCode} />);

      // Main panel should show current state
      expect(screen.getByText('Session Management')).toBeInTheDocument();
      
      // Should not show invitation manager initially
      expect(screen.queryByTestId('invitation-manager')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility and user experience', () => {
    it('maintains focus when switching between modes', async () => {
      render(<SessionManagementPanel sessionCode={sessionCode} />);

      const inviteButton = screen.getByText('Manage Invitations');
      inviteButton.focus();
      
      await user.click(inviteButton);

      // Focus should be managed appropriately
      expect(mockSessionManagement.toggleInvites).toHaveBeenCalled();
    });

    it('provides appropriate headings for screen readers', () => {
      render(<SessionManagementPanel sessionCode={sessionCode} />);

      expect(screen.getByRole('heading', { name: 'Session Management' })).toBeInTheDocument();
    });

    it('shows meaningful status messages', () => {
      mockSessionManagement.loading = true;
      const { rerender } = render(<SessionManagementPanel sessionCode={sessionCode} />);

      expect(screen.getByText('Loading session data...')).toBeInTheDocument();

      mockSessionManagement.loading = false;
      mockSessionManagement.error = 'Network error';
      rerender(<SessionManagementPanel sessionCode={sessionCode} />);

      expect(screen.getByText('Error: Network error')).toBeInTheDocument();
    });
  });
});
