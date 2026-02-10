import { useInvitations } from '@features/session';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the invitation service to simulate different system responses
const mockInvitationService = {
  getInvitations: vi.fn(),
  createInvitation: vi.fn(),
  deleteInvitation: vi.fn(),
  refreshInvitation: vi.fn()
};

vi.mock('../../services/invitation.service', () => ({
  invitationService: mockInvitationService
}));

// Mock toast notifications to verify user feedback
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
};

vi.mock('react-toastify', () => ({
  toast: mockToast
}));

// Mock auth for permission testing
const mockAuth = {
  user: { id: 'session-owner', username: 'GameMaster', role: 'owner' },
  hasPermission: vi.fn(() => true)
};

vi.mock('@features/auth', () => ({
  useAuth: () => mockAuth
}));

describe('useInvitations - Player invitation management', () => {
  const sessionCode = 'DEMO123';
  
  // Sample invitations representing real scenarios
  const activeInvitations = [
    {
      id: 'player-invite',
      role: 'player',
      inviteCode: 'JOIN456',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      used: false,
      createdBy: 'session-owner'
    },
    {
      id: 'dm-invite', 
      role: 'co_dm',
      inviteCode: 'DM789',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      used: false,
      createdBy: 'session-owner'
    }
  ];

  const expiredInvitation = {
    id: 'old-invite',
    role: 'spectator',
    inviteCode: 'OLD123',
    expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // expired 1 hour ago
    used: false,
    createdBy: 'session-owner'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvitationService.getInvitations.mockResolvedValue(activeInvitations);
  });

  describe('When a game master loads invitation management', () => {
    it('shows all current invitations', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));

      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      // User should see both invitations
      expect(result.current.invitations[0].role).toBe('player');
      expect(result.current.invitations[1].role).toBe('co_dm');
    });

    it('indicates when no invitations exist', async () => {
      mockInvitationService.getInvitations.mockResolvedValue([]);
      
      const { result } = renderHook(() => useInvitations(sessionCode));

      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(0);
      });
      
      expect(result.current.isLoading).toBe(false);
    });

    it('shows error message when loading fails', async () => {
      mockInvitationService.getInvitations.mockRejectedValue(new Error('Network timeout'));
      
      const { result } = renderHook(() => useInvitations(sessionCode));

      await waitFor(() => {
        expect(result.current.error).toContain('Failed to load invitations');
      });

      expect(mockToast.error).toHaveBeenCalledWith('Failed to load invitations');
    });
  });

  describe('When a game master creates a new invitation', () => {
    const newInvitation = {
      id: 'new-invite',
      role: 'trusted_player',
      inviteCode: 'TRUST999',
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      used: false,
      createdBy: 'session-owner'
    };

    it('successfully creates invitation and shows success message', async () => {
      mockInvitationService.createInvitation.mockResolvedValue(newInvitation);
      
      const { result } = renderHook(() => useInvitations(sessionCode));

      await act(async () => {
        await result.current.createInvitation('trusted_player');
      });

      // User should see success feedback
      expect(mockToast.success).toHaveBeenCalledWith('Invitation created successfully');
      
      // Invitations should be refreshed to include the new one
      expect(mockInvitationService.getInvitations).toHaveBeenCalledTimes(2); // initial + refresh
    });

    it('shows error when creation fails', async () => {
      mockInvitationService.createInvitation.mockRejectedValue(new Error('Server busy'));
      
      const { result } = renderHook(() => useInvitations(sessionCode));

      await act(async () => {
        await result.current.createInvitation('player');
      });

      // User should see error feedback
      expect(mockToast.error).toHaveBeenCalledWith('Failed to create invitation: Server busy');
      expect(result.current.error).toBe('Failed to create invitation: Server busy');
    });

    it('prevents creation when user lacks permission', async () => {
      mockAuth.hasPermission.mockReturnValue(false);
      
      const { result } = renderHook(() => useInvitations(sessionCode));

      await act(async () => {
        await result.current.createInvitation('player');
      });

      // Should not attempt to create invitation
      expect(mockInvitationService.createInvitation).not.toHaveBeenCalled();
      expect(mockToast.error).toHaveBeenCalledWith('Insufficient permissions to create invitations');
    });
  });

  describe('When a game master removes an invitation', () => {
    it('successfully deletes invitation and updates list', async () => {
      mockInvitationService.deleteInvitation.mockResolvedValue({ success: true });
      
      const { result } = renderHook(() => useInvitations(sessionCode));
      
      // Wait for initial load
      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      await act(async () => {
        await result.current.deleteInvitation('player-invite');
      });

      // User should see success feedback
      expect(mockToast.success).toHaveBeenCalledWith('Invitation deleted');
      
      // List should refresh
      expect(mockInvitationService.getInvitations).toHaveBeenCalledTimes(2);
    });

    it('shows error when deletion fails', async () => {
      mockInvitationService.deleteInvitation.mockRejectedValue(new Error('Not found'));
      
      const { result } = renderHook(() => useInvitations(sessionCode));

      await act(async () => {
        await result.current.deleteInvitation('non-existent');
      });

      expect(mockToast.error).toHaveBeenCalledWith('Failed to delete invitation: Not found');
    });
  });

  describe('When filtering invitations by type', () => {
    beforeEach(() => {
      mockInvitationService.getInvitations.mockResolvedValue([
        ...activeInvitations,
        expiredInvitation,
        { ...activeInvitations[0], id: 'used-invite', used: true }
      ]);
    });

    it('shows only active invitations by default', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));

      await waitFor(() => {
        const active = result.current.invitations.filter(inv => 
          !inv.used && new Date(inv.expiresAt) > new Date()
        );
        expect(active).toHaveLength(2); // Two active invitations
      });
    });

    it('can show expired invitations when requested', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));

      await waitFor(() => {
        const expired = result.current.invitations.filter(inv => 
          new Date(inv.expiresAt) <= new Date()
        );
        expect(expired).toHaveLength(1); // One expired invitation
      });
    });

    it('can show used invitations when requested', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));

      await waitFor(() => {
        const used = result.current.invitations.filter(inv => inv.used);
        expect(used).toHaveLength(1); // One used invitation
      });
    });
  });

  describe('When sharing invitation links with players', () => {
    const mockClipboard = {
      writeText: vi.fn(() => Promise.resolve())
    };
    
    beforeEach(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: mockClipboard,
        writable: true
      });
    });

    it('copies invitation URL to clipboard', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));
      
      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      await act(async () => {
        await result.current.copyInvitationUrl('player-invite');
      });

      // Should copy the full URL
      expect(mockClipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('JOIN456')
      );
      
      // User should see confirmation
      expect(mockToast.success).toHaveBeenCalledWith('Invitation link copied to clipboard');
    });

    it('shows error when clipboard access fails', async () => {
      mockClipboard.writeText.mockRejectedValue(new Error('Clipboard blocked'));
      
      const { result } = renderHook(() => useInvitations(sessionCode));
      
      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      await act(async () => {
        await result.current.copyInvitationUrl('player-invite');
      });

      expect(mockToast.error).toHaveBeenCalledWith('Failed to copy to clipboard');
    });
  });

  describe('When refreshing expired invitations', () => {
    it('generates new invite code and extends expiration', async () => {
      const refreshedInvitation = {
        ...expiredInvitation,
        inviteCode: 'FRESH456',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };
      
      mockInvitationService.refreshInvitation.mockResolvedValue(refreshedInvitation);
      
      const { result } = renderHook(() => useInvitations(sessionCode));

      await act(async () => {
        await result.current.refreshInvitation('old-invite');
      });

      // User should see success message
      expect(mockToast.success).toHaveBeenCalledWith('Invitation refreshed with new code');
      
      // Should refresh the list
      expect(mockInvitationService.getInvitations).toHaveBeenCalledTimes(2);
    });

    it('handles refresh failures gracefully', async () => {
      mockInvitationService.refreshInvitation.mockRejectedValue(new Error('Unable to refresh'));
      
      const { result } = renderHook(() => useInvitations(sessionCode));

      await act(async () => {
        await result.current.refreshInvitation('old-invite');
      });

      expect(mockToast.error).toHaveBeenCalledWith('Failed to refresh invitation: Unable to refresh');
    });
  });

  describe('Real-time invitation status updates', () => {
    it('handles invitation being used by a player', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));
      
      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      // Simulate real-time update that invitation was used
      await act(async () => {
        result.current.markInvitationAsUsed('player-invite');
      });

      // User should see updated status and feedback
      expect(mockToast.info).toHaveBeenCalledWith('Player joined using invitation');
      
      // Should refresh list to get latest status
      expect(mockInvitationService.getInvitations).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error recovery and user experience', () => {
    it('clears errors after successful operations', async () => {
      // Start with an error
      mockInvitationService.getInvitations.mockRejectedValue(new Error('Network error'));
      
      const { result } = renderHook(() => useInvitations(sessionCode));
      
      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // Fix the service and retry
      mockInvitationService.getInvitations.mockResolvedValue(activeInvitations);
      
      await act(async () => {
        await result.current.refreshInvitations();
      });

      // Error should clear after successful operation
      expect(result.current.error).toBe(null);
    });

    it('provides manual error clearing', () => {
      const { result } = renderHook(() => useInvitations(sessionCode));
      
      // Set error state
      act(() => {
        result.current.setError('Test error');
      });
      
      expect(result.current.error).toBe('Test error');
      
      // Clear error
      act(() => {
        result.current.clearError();
      });
      
      expect(result.current.error).toBe(null);
    });
  });

  describe('Loading states and user feedback', () => {
    it('shows loading state during async operations', () => {
      // Make service hang to test loading state
      mockInvitationService.getInvitations.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      
      const { result } = renderHook(() => useInvitations(sessionCode));

      expect(result.current.isLoading).toBe(true);
    });

    it('stops loading after operations complete', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });
});
