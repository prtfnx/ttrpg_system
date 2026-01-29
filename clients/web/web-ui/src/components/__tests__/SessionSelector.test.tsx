import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionSelector } from '@features/session';
import { authService, type SessionInfo } from '@features/auth';

// Mock authService
vi.mock('../../services/auth.service', () => ({
  authService: {
    getUserSessions: vi.fn(),
    logout: vi.fn(),
  },
}));

describe('SessionSelector', () => {
  const mockOnSessionSelected = vi.fn();
  
  const mockSessions: SessionInfo[] = [
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
    {
      session_code: 'PLR003',
      session_name: 'Curse of Strahd',
      role: 'player',
      created_at: '2025-01-05T18:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: successful session load
    vi.mocked(authService.getUserSessions).mockResolvedValue(mockSessions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading spinner initially', () => {
      // Make the promise never resolve to test loading state
      vi.mocked(authService.getUserSessions).mockImplementation(() => new Promise(() => {}));
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      expect(screen.getByText(/loading your game sessions/i)).toBeDefined();
      expect(document.querySelector('[class*="spinner"]')).toBeDefined();
    });

    it('should call getUserSessions on mount', () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      expect(authService.getUserSessions).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sessions Display', () => {
    it('should display all sessions after loading', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Dragon Heist Campaign')).toBeDefined();
      });

      expect(screen.getByText('Dragon Heist Campaign')).toBeDefined();
      expect(screen.getByText('Storm King\'s Thunder')).toBeDefined();
      expect(screen.getByText('Curse of Strahd')).toBeDefined();
    });

    it('should display session codes', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText(/code: DMG001/i)).toBeDefined();
      });

      expect(screen.getByText(/code: DMG001/i)).toBeDefined();
      expect(screen.getByText(/code: PLR002/i)).toBeDefined();
      expect(screen.getByText(/code: PLR003/i)).toBeDefined();
    });

    it('should display role badges', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('DM')).toBeDefined();
      });

      expect(screen.getByText('DM')).toBeDefined();
      expect(screen.getAllByText('PLAYER').length).toBe(2);
    });

    it('should display creation dates', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getAllByText(/created:/i).length).toBeGreaterThan(0);
      });

      // Should format dates as localized strings
      const dateElements = screen.getAllByText(/created:/i);
      expect(dateElements.length).toBe(3); // One for each session
    });

    it('should have join buttons for each session', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getAllByText('Join Game').length).toBe(3);
      });

      expect(screen.getAllByText('Join Game').length).toBe(3);
    });
  });

  describe('Session Selection', () => {
    it('should call onSessionSelected with DM role when DM session is clicked', async () => {
      const user = userEvent.setup();
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Dragon Heist Campaign')).toBeDefined();
      });

      const dmSessionCard = screen.getByText('Dragon Heist Campaign').closest('[class*="sessionCard"]');
      await user.click(dmSessionCard!);

      expect(mockOnSessionSelected).toHaveBeenCalledWith('DMG001', 'dm');
    });

    it('should call onSessionSelected with player role when player session is clicked', async () => {
      const user = userEvent.setup();
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Storm King\'s Thunder')).toBeDefined();
      });

      const playerSessionCard = screen.getByText('Storm King\'s Thunder').closest('[class*="sessionCard"]');
      await user.click(playerSessionCard!);

      expect(mockOnSessionSelected).toHaveBeenCalledWith('PLR002', 'player');
    });

    it('should call onSessionSelected when join button is clicked', async () => {
      const user = userEvent.setup();
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getAllByText('Join Game').length).toBe(3);
      });

      const joinButtons = screen.getAllByText('Join Game');
      await user.click(joinButtons[0]);

      expect(mockOnSessionSelected).toHaveBeenCalledWith('DMG001', 'dm');
    });

    it('should handle multiple session clicks', async () => {
      const user = userEvent.setup();
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Dragon Heist Campaign')).toBeDefined();
      });

      // Click first session
      const session1 = screen.getByText('Dragon Heist Campaign').closest('[class*="sessionCard"]');
      await user.click(session1!);

      // Click second session
      const session2 = screen.getByText('Storm King\'s Thunder').closest('[class*="sessionCard"]');
      await user.click(session2!);

      expect(mockOnSessionSelected).toHaveBeenCalledTimes(2);
      expect(mockOnSessionSelected).toHaveBeenNthCalledWith(1, 'DMG001', 'dm');
      expect(mockOnSessionSelected).toHaveBeenNthCalledWith(2, 'PLR002', 'player');
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no sessions are available', async () => {
      vi.mocked(authService.getUserSessions).mockResolvedValue([]);
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('No Game Sessions')).toBeDefined();
      });

      expect(screen.getByText('No Game Sessions')).toBeDefined();
      expect(screen.getByText(/you don't have access to any game sessions yet/i)).toBeDefined();
      expect(screen.getByText(/contact your dungeon master/i)).toBeDefined();
    });

    it('should show logout button in empty state', async () => {
      vi.mocked(authService.getUserSessions).mockResolvedValue([]);
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Logout')).toBeDefined();
      });

      expect(screen.getByRole('button', { name: /logout/i })).toBeDefined();
    });

    it('should call logout when logout button clicked in empty state', async () => {
      vi.mocked(authService.getUserSessions).mockResolvedValue([]);
      const user = userEvent.setup();
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /logout/i })).toBeDefined();
      });

      await user.click(screen.getByRole('button', { name: /logout/i }));
      expect(authService.logout).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should show error message when session loading fails', async () => {
      const errorMessage = 'Network error: Unable to reach server';
      vi.mocked(authService.getUserSessions).mockRejectedValue(new Error(errorMessage));
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Unable to Load Sessions')).toBeDefined();
      });

      expect(screen.getByText('Unable to Load Sessions')).toBeDefined();
      expect(screen.getByText(errorMessage)).toBeDefined();
    });

    it('should show generic error for non-Error rejections', async () => {
      vi.mocked(authService.getUserSessions).mockRejectedValue('String error');
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load sessions')).toBeDefined();
      });

      expect(screen.getByText('Failed to load sessions')).toBeDefined();
    });

    it('should show retry button on error', async () => {
      vi.mocked(authService.getUserSessions).mockRejectedValue(new Error('Network error'));
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
      });

      expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
    });

    it('should show logout button on error', async () => {
      vi.mocked(authService.getUserSessions).mockRejectedValue(new Error('Network error'));
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /logout/i })).toBeDefined();
      });

      expect(screen.getByRole('button', { name: /logout/i })).toBeDefined();
    });

    it('should retry loading sessions when retry button is clicked', async () => {
      vi.mocked(authService.getUserSessions)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockSessions);
      
      const user = userEvent.setup();
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
      });

      await user.click(screen.getByRole('button', { name: /try again/i }));

      await waitFor(() => {
        expect(screen.getByText('Dragon Heist Campaign')).toBeDefined();
      });

      expect(authService.getUserSessions).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Dragon Heist Campaign')).toBeDefined();
    });

    it('should call logout when logout button clicked in error state', async () => {
      vi.mocked(authService.getUserSessions).mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();
      
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /logout/i })).toBeDefined();
      });

      await user.click(screen.getByRole('button', { name: /logout/i }));
      expect(authService.logout).toHaveBeenCalledTimes(1);
    });
  });

  describe('Logout Functionality', () => {
    it('should show logout button in header when sessions loaded', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Select Game Session')).toBeDefined();
      });

      expect(screen.getByRole('button', { name: /logout/i })).toBeDefined();
    });

    it('should call authService.logout when logout clicked', async () => {
      const user = userEvent.setup();
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /logout/i })).toBeDefined();
      });

      await user.click(screen.getByRole('button', { name: /logout/i }));
      expect(authService.logout).toHaveBeenCalledTimes(1);
    });
  });

  describe('UI States', () => {
    it('should apply DM styling to DM session cards', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Dragon Heist Campaign')).toBeDefined();
      });

      const dmCard = screen.getByText('Dragon Heist Campaign').closest('[class*="sessionCard"]');
      expect(dmCard?.className).toContain('dm');
    });

    it('should apply player styling to player session cards', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Storm King\'s Thunder')).toBeDefined();
      });

      const playerCard = screen.getByText('Storm King\'s Thunder').closest('[class*="sessionCard"]');
      expect(playerCard?.className).toContain('player');
    });

    it('should display header with title', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Select Game Session')).toBeDefined();
      });

      expect(screen.getByRole('heading', { name: /select game session/i })).toBeDefined();
    });
  });

  describe('Accessibility', () => {
    it('should have clickable session cards', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Dragon Heist Campaign')).toBeDefined();
      });

      const sessionCards = document.querySelectorAll('[class*="sessionCard"]');
      expect(sessionCards.length).toBe(3);
    });

    it('should have accessible buttons', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
      });

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0); // At least logout + join buttons
    });

    it('should display role badges with proper text', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('DM')).toBeDefined();
      });

      expect(screen.getByText('DM')).toBeDefined();
      expect(screen.getAllByText('PLAYER').length).toBe(2);
    });
  });

  describe('Data Validation', () => {
    it('should handle session with all required fields', async () => {
      const singleSession: SessionInfo[] = [{
        session_code: 'TST001',
        session_name: 'Test Campaign',
        role: 'dm',
        created_at: '2025-12-17T12:00:00Z',
      }];
      
      vi.mocked(authService.getUserSessions).mockResolvedValue(singleSession);
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Test Campaign')).toBeDefined();
      });

      expect(screen.getByText('Test Campaign')).toBeDefined();
      expect(screen.getByText(/code: TST001/i)).toBeDefined();
      expect(screen.getByText('DM')).toBeDefined();
    });

    it('should render multiple sessions in grid layout', async () => {
      render(<SessionSelector onSessionSelected={mockOnSessionSelected} />);

      await waitFor(() => {
        expect(screen.getByText('Dragon Heist Campaign')).toBeDefined();
      });

      const sessionsGrid = document.querySelector('[class*="sessionsGrid"]');
      expect(sessionsGrid).toBeDefined();
      expect(sessionsGrid?.children.length).toBe(3);
    });
  });
});
