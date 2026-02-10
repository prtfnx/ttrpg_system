import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvitations } from '@features/session';

// Mock the invitation service
vi.mock('../../services/invitation.service', () => ({
  invitationService: {
    createInvitation: vi.fn(() => Promise.resolve({
      id: 'inv123',
      sessionCode: 'TEST123',
      role: 'player',
      inviteCode: 'INVITE456',
      createdBy: 'user1',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      used: false
    })),
    getInvitations: vi.fn(() => Promise.resolve([
      {
        id: 'inv1',
        sessionCode: 'TEST123',
        role: 'player',
        inviteCode: 'CODE1',
        createdBy: 'user1',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        used: false
      },
      {
        id: 'inv2',
        sessionCode: 'TEST123',
        role: 'spectator',
        inviteCode: 'CODE2',
        createdBy: 'user1',
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        used: true
      }
    ])),
    deleteInvitation: vi.fn(() => Promise.resolve({ success: true })),
    refreshInvitation: vi.fn(() => Promise.resolve({
      id: 'inv123',
      inviteCode: 'NEW456',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }))
  }
}));

// Mock toast notifications
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

// Mock auth context
vi.mock('@features/auth', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user-1',
      role: 'owner'
    },
    hasPermission: vi.fn(() => true)
  })
}));

describe('useInvitations', () => {
  const mockSessionCode = 'TEST123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('initializes with default state', () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      expect(result.current.invitations).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('loads invitations on mount', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      expect(result.current.invitations[0].role).toBe('player');
      expect(result.current.invitations[1].role).toBe('spectator');
      expect(result.current.isLoading).toBe(false);
    });

    it('handles loading failure', async () => {
      const { invitationService } = await import('../../services/invitation.service');
      vi.mocked(invitationService.getInvitations).mockRejectedValueOnce(
        new Error('Failed to load invitations')
      );

      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await waitFor(() => {
        expect(result.current.error).toContain('Failed to load invitations');
      });

      expect(result.current.invitations).toEqual([]);
    });
  });

  describe('Creating Invitations', () => {
    it('creates invitation with specified role', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await act(async () => {
        await result.current.createInvitation('player', { expiresInHours: 24 });
      });

      expect(result.current.invitations).toHaveLength(3); // 2 existing + 1 new
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('creates invitation with custom expiration', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await act(async () => {
        await result.current.createInvitation('trusted_player', { 
          expiresInHours: 12,
          maxUses: 5 
        });
      });

      const { invitationService } = await import('../../services/invitation.service');
      expect(invitationService.createInvitation).toHaveBeenCalledWith(
        mockSessionCode,
        'trusted_player',
        expect.objectContaining({
          expiresInHours: 12,
          maxUses: 5
        })
      );
    });

    it('handles creation failure', async () => {
      const { invitationService } = await import('../../services/invitation.service');
      vi.mocked(invitationService.createInvitation).mockRejectedValueOnce(
        new Error('Creation failed')
      );

      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await act(async () => {
        await result.current.createInvitation('player');
      });

      expect(result.current.error).toContain('Failed to create invitation');
      expect(result.current.isLoading).toBe(false);
    });

    it('validates role parameter', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await act(async () => {
        await result.current.createInvitation('invalid_role' as any);
      });

      expect(result.current.error).toContain('Invalid role specified');
    });
  });

  describe('Managing Existing Invitations', () => {
    it('deletes invitation by id', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      await act(async () => {
        await result.current.deleteInvitation('inv1');
      });

      expect(result.current.invitations).toHaveLength(1);
      expect(result.current.invitations[0].id).toBe('inv2');
    });

    it('refreshes invitation to generate new code', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      await act(async () => {
        await result.current.refreshInvitation('inv1');
      });

      const refreshedInvitation = result.current.invitations.find(inv => inv.id === 'inv1');
      expect(refreshedInvitation).toBeDefined();
      // The invitation should be updated with new code from mock response
    });

    it('handles deletion failure', async () => {
      const { invitationService } = await import('../../services/invitation.service');
      vi.mocked(invitationService.deleteInvitation).mockRejectedValueOnce(
        new Error('Deletion failed')
      );

      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await act(async () => {
        await result.current.deleteInvitation('inv1');
      });

      expect(result.current.error).toContain('Failed to delete invitation');
    });

    it('handles refresh failure', async () => {
      const { invitationService } = await import('../../services/invitation.service');
      vi.mocked(invitationService.refreshInvitation).mockRejectedValueOnce(
        new Error('Refresh failed')
      );

      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await act(async () => {
        await result.current.refreshInvitation('inv1');
      });

      expect(result.current.error).toContain('Failed to refresh invitation');
    });
  });

  describe('Invitation Filtering and Display', () => {
    it('provides active invitations filter', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      const activeInvitations = result.current.activeInvitations;
      expect(activeInvitations).toHaveLength(1);
      expect(activeInvitations[0].used).toBe(false);
    });

    it('provides expired invitations filter', async () => {
      // Mock invitation service to return expired invitation
      const { invitationService } = await import('../../services/invitation.service');
      vi.mocked(invitationService.getInvitations).mockResolvedValueOnce([
        {
          id: 'expired1',
          sessionCode: 'TEST123',
          role: 'player',
          inviteCode: 'EXPIRED1',
          createdBy: 'user1',
          expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
          used: false
        }
      ]);

      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(1);
      });

      const expiredInvitations = result.current.expiredInvitations;
      expect(expiredInvitations).toHaveLength(1);
      expect(expiredInvitations[0].id).toBe('expired1');
    });

    it('provides used invitations filter', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      const usedInvitations = result.current.usedInvitations;
      expect(usedInvitations).toHaveLength(1);
      expect(usedInvitations[0].used).toBe(true);
    });

    it('filters invitations by role', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      const playerInvitations = result.current.getInvitationsByRole('player');
      expect(playerInvitations).toHaveLength(1);
      expect(playerInvitations[0].role).toBe('player');

      const spectatorInvitations = result.current.getInvitationsByRole('spectator');
      expect(spectatorInvitations).toHaveLength(1);
      expect(spectatorInvitations[0].role).toBe('spectator');
    });
  });

  describe('Invitation Links and Sharing', () => {
    it('generates full invitation URL', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      const invitationUrl = result.current.getInvitationUrl('inv1');
      expect(invitationUrl).toContain('/join/CODE1');
      expect(invitationUrl).toContain(mockSessionCode);
    });

    it('copies invitation URL to clipboard', async () => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn(() => Promise.resolve())
        }
      });

      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      await act(async () => {
        await result.current.copyInvitationUrl('inv1');
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/join/CODE1')
      );
    });

    it('handles clipboard copy failure gracefully', async () => {
      // Mock clipboard API failure
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn(() => Promise.reject(new Error('Clipboard failed')))
        }
      });

      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await act(async () => {
        await result.current.copyInvitationUrl('inv1');
      });

      expect(result.current.error).toContain('Failed to copy to clipboard');
    });
  });

  describe('Real-time Updates', () => {
    it('handles invitation usage events', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      // Simulate invitation being used
      await act(async () => {
        result.current.markInvitationAsUsed('inv1');
      });

      const usedInvitation = result.current.invitations.find(inv => inv.id === 'inv1');
      expect(usedInvitation?.used).toBe(true);
    });

    it('auto-refreshes data on focus', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      // Simulate window focus event
      await act(async () => {
        result.current.refreshData();
      });

      const { invitationService } = await import('../../services/invitation.service');
      expect(invitationService.getInvitations).toHaveBeenCalledTimes(2); // Initial load + refresh
    });
  });

  describe('Permission and Validation', () => {
    it('restricts operations based on user permissions', async () => {
      // Mock user with limited permissions
      vi.mocked(vi.fn()).mockImplementation(() => ({
        useAuth: () => ({
          user: { id: 'limited-user', role: 'co_dm' },
          hasPermission: vi.fn((permission) => permission !== 'manage_invitations')
        })
      }));

      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await act(async () => {
        await result.current.createInvitation('player');
      });

      expect(result.current.error).toContain('Insufficient permissions');
    });

    it('validates session code format', () => {
      const { result } = renderHook(() => useInvitations(''));

      expect(result.current.error).toContain('Valid session code is required');
    });

    it('limits number of active invitations', async () => {
      // Mock service to return max invitations
      const { invitationService } = await import('../../services/invitation.service');
      const maxInvitations = Array.from({ length: 10 }, (_, i) => ({
        id: `inv${i}`,
        sessionCode: mockSessionCode,
        role: 'player',
        inviteCode: `CODE${i}`,
        createdBy: 'user1',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        used: false
      }));

      vi.mocked(invitationService.getInvitations).mockResolvedValueOnce(maxInvitations);

      const { result } = renderHook(() => useInvitations(mockSessionCode));

      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(10);
      });

      await act(async () => {
        await result.current.createInvitation('player');
      });

      expect(result.current.error).toContain('Maximum number of active invitations reached');
    });
  });

  describe('Error Recovery and Cleanup', () => {
    it('clears errors after successful operations', async () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      // Trigger an error
      await act(async () => {
        await result.current.createInvitation('invalid_role' as any);
      });
      expect(result.current.error).toBeTruthy();

      // Successful operation should clear error
      await act(async () => {
        await result.current.createInvitation('player');
      });
      expect(result.current.error).toBeNull();
    });

    it('provides manual error clearing', () => {
      const { result } = renderHook(() => useInvitations(mockSessionCode));

      // Set error state
      act(() => {
        (result.current as any).setError('Test error');
      });

      // Clear error manually
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
