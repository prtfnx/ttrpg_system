import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionSelector } from '../../features/session/components/SessionSelector';

// Mock authService - using factory function to avoid hoisting issues
vi.mock('../../services/auth.service', () => ({
  authService: {
    getUserSessions: vi.fn(),
    logout: vi.fn(),
  }
}));

vi.mock('@features/auth', () => ({
  authService: {
    getUserSessions: vi.fn(),
    logout: vi.fn(),
  },
  type: {} // Add type export stub
}));

describe('SessionSelector', () => {
  const user = userEvent.setup();
  const mockOnSessionSelected = vi.fn();
  
  const mockSessions = [
    {
      session_code: 'DMG001',
      session_name: 'Dragon Heist Campaign',
      role: 'dm',
      created_at: '2025-01-15T10:00:00Z',
    },
    {
      session_code: 'PLR002',
      session_name: 'Storm King\'s Thunder',
      role: 'player',
      created_at: '2025-01-10T14:30:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: successful session load
    mockAuthService.getUserSessions.mockResolvedValue(mockSessions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading spinner while fetching sessions', () => {
      // Make the promise never resolve to test loading state
      mockAuthService.getUserSessions.mockImplementation(() => new Promise(() => {}));
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      expect(screen.getByText(/loading your game sessions/i)).toBeInTheDocument();
    });

    it('calls getUserSessions on component mount', () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      expect(mockAuthService.getUserSessions).toHaveBeenCalledOnce();
    });
  });

  describe('Session Display', () => {
    it('displays all sessions in a properly structured list', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      // Wait for sessions to load
      await waitFor(() => {
        expect(screen.getByRole('list', { name: /available game sessions/i })).toBeInTheDocument();
      });

      // Verify all sessions are displayed
      expect(screen.getByText('Dragon Heist Campaign')).toBeInTheDocument();
      expect(screen.getByText('Storm King\'s Thunder')).toBeInTheDocument();
    });

    it('shows session details with proper accessibility labels', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        const dmSession = screen.getByRole('listitem', { 
          name: /session: dragon heist campaign, role: dm/i 
        });
        expect(dmSession).toBeInTheDocument();
      });

      const playerSession = screen.getByRole('listitem', { 
        name: /session: storm king's thunder, role: player/i 
      });
      expect(playerSession).toBeInTheDocument();
    });

    it('displays session codes and creation dates', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText(/code: DMG001/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/code: PLR002/i)).toBeInTheDocument();
      
      // Should show formatted creation dates
      const dateElements = screen.getAllByText(/created:/i);
      expect(dateElements).toHaveLength(2);
    });

    it('shows role badges for each session', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('DM')).toBeInTheDocument();
      });

      expect(screen.getByText('PLAYER')).toBeInTheDocument();
    });

    it('provides join buttons with descriptive labels', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        const dmJoinButton = screen.getByRole('button', { 
          name: /join dragon heist campaign as dm/i 
        });
        expect(dmJoinButton).toBeInTheDocument();
      });

      const playerJoinButton = screen.getByRole('button', { 
        name: /join storm king's thunder as player/i 
      });
      expect(playerJoinButton).toBeInTheDocument();
    });
  });

  describe('Session Selection', () => {
    it('selects session when clicking on session card', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        const dmSession = screen.getByRole('listitem', { 
          name: /session: dragon heist campaign, role: dm/i 
        });
        expect(dmSession).toBeInTheDocument();
      });

      const dmSession = screen.getByRole('listitem', { 
        name: /session: dragon heist campaign, role: dm/i 
      });
      await user.click(dmSession);

      expect(mockOnSessionSelected).toHaveBeenCalledWith('DMG001', 'dm');
    });

    it('selects session when clicking join button', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        const joinButton = screen.getByRole('button', { 
          name: /join dragon heist campaign as dm/i 
        });
        expect(joinButton).toBeInTheDocument();
      });

      const joinButton = screen.getByRole('button', { 
        name: /join dragon heist campaign as dm/i 
      });
      await user.click(joinButton);

      expect(mockOnSessionSelected).toHaveBeenCalledWith('DMG001', 'dm');
    });

    it('supports keyboard navigation with Enter key', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        const session = screen.getByRole('listitem', { 
          name: /session: dragon heist campaign, role: dm/i 
        });
        expect(session).toBeInTheDocument();
      });

      const session = screen.getByRole('listitem', { 
        name: /session: dragon heist campaign, role: dm/i 
      });
      
      // Focus and press Enter
      session.focus();
      await user.keyboard('{Enter}');

      expect(mockOnSessionSelected).toHaveBeenCalledWith('DMG001', 'dm');
    });
  });

  describe('Empty State', () => {
    it('shows appropriate message when no sessions are available', async () => {
      mockAuthService.getUserSessions.mockResolvedValue([]);
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('No Game Sessions')).toBeInTheDocument();
      });

      expect(screen.getByText(/contact your dungeon master/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });

    it('allows logging out from empty state', async () => {
      mockAuthService.getUserSessions.mockResolvedValue([]);
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        const logoutButton = screen.getByRole('button', { name: /logout/i });
        expect(logoutButton).toBeInTheDocument();
      });

      const logoutButton = screen.getByRole('button', { name: /logout/i });
      await user.click(logoutButton);

      expect(mockAuthService.logout).toHaveBeenCalledOnce();
    });
  });

  describe('Error Handling', () => {
    it('displays error message when session loading fails', async () => {
      const errorMessage = 'Network connection failed';
      mockAuthService.getUserSessions.mockRejectedValue(new Error(errorMessage));
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Unable to Load Sessions')).toBeInTheDocument();
      });

      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    it('allows retrying when session loading fails', async () => {
      mockAuthService.getUserSessions
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockSessions);
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText('Unable to Load Sessions')).toBeInTheDocument();
      });

      // Click retry
      const retryButton = screen.getByRole('button', { name: /try again/i });
      await user.click(retryButton);

      // Should show sessions after retry
      await waitFor(() => {
        expect(screen.getByText('Dragon Heist Campaign')).toBeInTheDocument();
      });

      expect(mockAuthService.getUserSessions).toHaveBeenCalledTimes(2);
    });

    it('allows logging out from error state', async () => {
      mockAuthService.getUserSessions.mockRejectedValue(new Error('Failed'));
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        const logoutButton = screen.getByRole('button', { name: /logout/i });
        expect(logoutButton).toBeInTheDocument();
      });

      const logoutButton = screen.getByRole('button', { name: /logout/i });
      await user.click(logoutButton);

      expect(mockAuthService.logout).toHaveBeenCalledOnce();
    });
  });

  describe('User Actions', () => {
    it('provides logout functionality from main view', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        const logoutButton = screen.getByRole('button', { name: /logout/i });
        expect(logoutButton).toBeInTheDocument();
      });

      const logoutButton = screen.getByRole('button', { name: /logout/i });
      await user.click(logoutButton);

      expect(mockAuthService.logout).toHaveBeenCalledOnce();
    });
  });
});