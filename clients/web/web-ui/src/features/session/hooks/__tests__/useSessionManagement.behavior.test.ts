import { useSessionManagement } from '@features/session';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the session service to control system responses
const mockSessionService = {
  updateSessionSettings: vi.fn(),
  getSessionStats: vi.fn(),
  deleteSession: vi.fn(),
  getAuditLog: vi.fn(),
  transferOwnership: vi.fn()
};

vi.mock('../../services/sessionManagement.service', () => ({
  sessionManagementService: mockSessionService
}));

// Mock protocol for real-time communication
const mockProtocol = {
  sendEvent: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
};

vi.mock('@shared/test-utils/ProtocolTestWrapper', () => ({
  useProtocol: () => ({
    protocol: mockProtocol,
    isConnected: true
  })
}));

// Mock auth for different user roles
const mockAuth = {
  user: { id: 'session-owner', username: 'GameMaster', role: 'owner' },
  hasPermission: vi.fn(() => true)
};

vi.mock('@features/auth', () => ({
  useAuth: () => mockAuth
}));

// Mock toast notifications
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
};

vi.mock('react-toastify', () => ({
  toast: mockToast
}));

describe('useSessionManagement - Game session administration', () => {
  const sessionCode = 'DEMO123';
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default successful responses
    mockSessionService.getSessionStats.mockResolvedValue({
      totalPlayers: 4,
      activePlayers: 3,
      spectators: 1,
      sessionDuration: '2h 15m',
      tablesCreated: 2,
      averageSessionLength: '3h 30m'
    });

    mockSessionService.updateSessionSettings.mockResolvedValue({ success: true });
  });

  describe('When a game master views session overview', () => {
    it('shows current session statistics', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await waitFor(() => {
        expect(result.current.sessionStats).toEqual({
          totalPlayers: 4,
          activePlayers: 3,
          spectators: 1,
          sessionDuration: '2h 15m',
          tablesCreated: 2,
          averageSessionLength: '3h 30m'
        });
      });

      // Should have loaded stats automatically
      expect(mockSessionService.getSessionStats).toHaveBeenCalledWith(sessionCode);
    });

    it('handles empty sessions gracefully', async () => {
      mockSessionService.getSessionStats.mockResolvedValue({
        totalPlayers: 0,
        activePlayers: 0,
        spectators: 0,
        sessionDuration: '0m',
        tablesCreated: 0,
        averageSessionLength: 'N/A'
      });

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await waitFor(() => {
        expect(result.current.sessionStats?.totalPlayers).toBe(0);
      });

      // Should still work with zero values
      expect(result.current.error).toBeNull();
    });

    it('shows error when stats cannot be loaded', async () => {
      mockSessionService.getSessionStats.mockRejectedValue(new Error('Database unavailable'));

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await waitFor(() => {
        expect(result.current.error).toContain('Failed to load session statistics');
      });

      expect(mockToast.error).toHaveBeenCalledWith('Failed to load session statistics');
    });
  });

  describe('When a game master changes session settings', () => {
    it('successfully updates session name and notifies players', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await act(async () => {
        await result.current.updateSessionName('Epic Dragon Campaign');
      });

      // Should update via service
      expect(mockSessionService.updateSessionSettings).toHaveBeenCalledWith(sessionCode, {
        name: 'Epic Dragon Campaign'
      });

      // Should notify all players via protocol
      expect(mockProtocol.sendEvent).toHaveBeenCalledWith('session_settings_updated', {
        field: 'name',
        value: 'Epic Dragon Campaign'
      });

      // User should see success feedback
      expect(mockToast.success).toHaveBeenCalledWith('Session name updated');
    });

    it('updates description with character limit validation', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await act(async () => {
        await result.current.updateSessionDescription('A thrilling D&D adventure with dragons!');
      });

      expect(mockSessionService.updateSessionSettings).toHaveBeenCalledWith(sessionCode, {
        description: 'A thrilling D&D adventure with dragons!'
      });
      
      expect(mockToast.success).toHaveBeenCalledWith('Session description updated');
    });

    it('rejects description that is too long', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));
      const tooLongDescription = 'x'.repeat(1001); // Exceed limit

      await act(async () => {
        await result.current.updateSessionDescription(tooLongDescription);
      });

      // Should not call service
      expect(mockSessionService.updateSessionSettings).not.toHaveBeenCalled();
      
      // Should show validation error
      expect(mockToast.error).toHaveBeenCalledWith('Description must be less than 1000 characters');
    });

    it('handles update failures gracefully', async () => {
      mockSessionService.updateSessionSettings.mockRejectedValue(new Error('Permission denied'));

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await act(async () => {
        await result.current.updateSessionName('New Name');
      });

      expect(mockToast.error).toHaveBeenCalledWith('Failed to update session: Permission denied');
      expect(result.current.error).toBe('Failed to update session: Permission denied');
    });

    it('toggles session visibility (public/private)', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await act(async () => {
        await result.current.toggleSessionVisibility(false); // Make private
      });

      expect(mockSessionService.updateSessionSettings).toHaveBeenCalledWith(sessionCode, {
        public: false
      });

      expect(mockToast.success).toHaveBeenCalledWith('Session is now private');
    });

    it('configures player limits', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await act(async () => {
        await result.current.setMaxPlayers(6);
      });

      expect(mockSessionService.updateSessionSettings).toHaveBeenCalledWith(sessionCode, {
        maxPlayers: 6
      });

      // Should notify existing players of the change
      expect(mockProtocol.sendEvent).toHaveBeenCalledWith('session_settings_updated', {
        field: 'maxPlayers',
        value: 6
      });

      expect(mockToast.success).toHaveBeenCalledWith('Player limit updated');
    });
  });

  describe('When a game master needs to end a session', () => {
    it('warns about permanent deletion before proceeding', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));

      // First call should not delete without confirmation
      await act(async () => {
        await result.current.initiateSessionDeletion();
      });

      expect(mockSessionService.deleteSession).not.toHaveBeenCalled();
      expect(result.current.isDeleteConfirmationPending).toBe(true);
    });

    it('permanently deletes session after confirmation', async () => {
      mockSessionService.deleteSession.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      // Initiate deletion
      await act(async () => {
        await result.current.initiateSessionDeletion();
      });

      // Confirm deletion
      await act(async () => {
        await result.current.confirmSessionDeletion();
      });

      expect(mockSessionService.deleteSession).toHaveBeenCalledWith(sessionCode, {
        permanent: true,
        notifyPlayers: true
      });

      expect(mockToast.success).toHaveBeenCalledWith('Session deleted successfully');
    });

    it('cancels deletion if game master changes mind', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));

      // Initiate then cancel
      await act(async () => {
        await result.current.initiateSessionDeletion();
      });

      act(() => {
        result.current.cancelSessionDeletion();
      });

      expect(result.current.isDeleteConfirmationPending).toBe(false);
      expect(mockSessionService.deleteSession).not.toHaveBeenCalled();
    });

    it('handles deletion failures appropriately', async () => {
      mockSessionService.deleteSession.mockRejectedValue(new Error('Session has active players'));

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await act(async () => {
        await result.current.initiateSessionDeletion();
      });

      await act(async () => {
        await result.current.confirmSessionDeletion();
      });

      expect(mockToast.error).toHaveBeenCalledWith('Failed to delete session: Session has active players');
    });
  });

  describe('When transferring session ownership', () => {
    const newOwner = {
      id: 'new-owner-id',
      username: 'ExperiencedPlayer',
      role: 'co_dm'
    };

    it('transfers ownership to another player', async () => {
      mockSessionService.transferOwnership.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await act(async () => {
        await result.current.transferOwnership(newOwner.id);
      });

      expect(mockSessionService.transferOwnership).toHaveBeenCalledWith(
        sessionCode, 
        newOwner.id
      );

      // Should notify all players of ownership change
      expect(mockProtocol.sendEvent).toHaveBeenCalledWith('ownership_transferred', {
        newOwnerId: newOwner.id,
        previousOwnerId: 'session-owner'
      });

      expect(mockToast.success).toHaveBeenCalledWith('Session ownership transferred');
    });

    it('requires confirmation for ownership transfer', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));

      // First call should require confirmation
      await act(async () => {
        await result.current.initiateOwnershipTransfer(newOwner.id);
      });

      expect(result.current.pendingOwnershipTransfer).toBe(newOwner.id);
      expect(mockSessionService.transferOwnership).not.toHaveBeenCalled();
    });

    it('prevents transfer to invalid users', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await act(async () => {
        await result.current.transferOwnership('non-existent-user');
      });

      expect(mockToast.error).toHaveBeenCalledWith('Cannot transfer to invalid user');
      expect(mockSessionService.transferOwnership).not.toHaveBeenCalled();
    });
  });

  describe('When reviewing session activity', () => {
    const sampleAuditLog = [
      {
        id: '1',
        event_type: 'PLAYER_JOINED',
        user_id: 'player1',
        details: { username: 'NewPlayer', role: 'player' },
        created_at: new Date().toISOString()
      },
      {
        id: '2',
        event_type: 'SETTINGS_UPDATED',
        user_id: 'session-owner',
        details: { setting: 'name', oldValue: 'Old Name', newValue: 'New Name' },
        created_at: new Date(Date.now() - 60000).toISOString() // 1 minute ago
      },
      {
        id: '3',
        event_type: 'CHARACTER_CREATED',
        user_id: 'player1',
        details: { characterName: 'Gandalf the Grey' },
        created_at: new Date(Date.now() - 120000).toISOString() // 2 minutes ago
      }
    ];

    it('loads recent activity log', async () => {
      mockSessionService.getAuditLog.mockResolvedValue({
        entries: sampleAuditLog,
        totalCount: 3,
        hasMore: false
      });

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await act(async () => {
        await result.current.loadAuditLog();
      });

      expect(result.current.auditLog).toHaveLength(3);
      expect(result.current.auditLog[0].event_type).toBe('PLAYER_JOINED');

      // Should have loaded automatically on mount
      expect(mockSessionService.getAuditLog).toHaveBeenCalledWith(sessionCode, {
        limit: 50,
        offset: 0
      });
    });

    it('filters activity by type', async () => {
      mockSessionService.getAuditLog.mockResolvedValue({
        entries: sampleAuditLog.filter(entry => entry.event_type === 'SETTINGS_UPDATED')
      });

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      await act(async () => {
        await result.current.loadAuditLog({ eventType: 'SETTINGS_UPDATED' });
      });

      expect(mockSessionService.getAuditLog).toHaveBeenCalledWith(sessionCode, {
        eventType: 'SETTINGS_UPDATED',
        limit: 50,
        offset: 0
      });
    });

    it('loads more activity when requested', async () => {
      const moreEntries = [
        {
          id: '4',
          event_type: 'PLAYER_LEFT',
          user_id: 'player2',
          details: { username: 'FormerPlayer' },
          created_at: new Date(Date.now() - 300000).toISOString()
        }
      ];

      mockSessionService.getAuditLog
        .mockResolvedValueOnce({ entries: sampleAuditLog, hasMore: true })
        .mockResolvedValueOnce({ entries: moreEntries, hasMore: false });

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      // Load initial
      await act(async () => {
        await result.current.loadAuditLog();
      });

      // Load more
      await act(async () => {
        await result.current.loadMoreAuditLog();
      });

      expect(result.current.auditLog).toHaveLength(4); // Original 3 + 1 more
      expect(mockSessionService.getAuditLog).toHaveBeenCalledTimes(2);
    });
  });

  describe('Real-time session monitoring', () => {
    it('receives and processes player join events', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));

      // Simulate real-time event
      const playerJoinEvent = {
        type: 'PLAYER_JOINED',
        data: {
          playerId: 'new-player',
          username: 'FreshPlayer',
          role: 'player'
        }
      };

      await act(async () => {
        // Simulate the protocol event listener being called
        result.current.handleRealtimeEvent(playerJoinEvent);
      });

      // Should show notification to game master
      expect(mockToast.info).toHaveBeenCalledWith('FreshPlayer joined the session');

      // Should refresh session stats
      expect(mockSessionService.getSessionStats).toHaveBeenCalledTimes(2); // initial + refresh
    });

    it('handles player disconnect gracefully', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));

      const playerLeaveEvent = {
        type: 'PLAYER_LEFT',
        data: {
          playerId: 'leaving-player',
          username: 'DepartingPlayer',
          reason: 'voluntary'
        }
      };

      await act(async () => {
        result.current.handleRealtimeEvent(playerLeaveEvent);
      });

      expect(mockToast.info).toHaveBeenCalledWith('DepartingPlayer left the session');
    });
  });

  describe('Permission handling and security', () => {
    it('prevents unauthorized users from managing session', () => {
      mockAuth.hasPermission.mockReturnValue(false);
      mockAuth.user.role = 'player';

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      // Management functions should not be available
      expect(result.current.canManageSession).toBe(false);

      act(() => {
        result.current.updateSessionName('Hacked Name');
      });

      expect(mockSessionService.updateSessionSettings).not.toHaveBeenCalled();
      expect(mockToast.error).toHaveBeenCalledWith('Insufficient permissions');
    });

    it('allows co-DMs to perform most management tasks', () => {
      mockAuth.user.role = 'co_dm';
      mockAuth.hasPermission.mockImplementation(perm => 
        perm !== 'DELETE_SESSION' && perm !== 'TRANSFER_OWNERSHIP'
      );

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      // Should be able to update settings but not delete
      expect(result.current.canManageSession).toBe(true);
      expect(result.current.canDeleteSession).toBe(false);
      expect(result.current.canTransferOwnership).toBe(false);
    });
  });

  describe('Error recovery and user experience', () => {
    it('retries failed operations when requested', async () => {
      mockSessionService.getSessionStats
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          totalPlayers: 2,
          activePlayers: 2,
          spectators: 0,
          sessionDuration: '30m'
        });

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      // Should fail initially
      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // Retry should succeed
      await act(async () => {
        await result.current.retryLoadStats();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.sessionStats?.totalPlayers).toBe(2);
    });

    it('clears errors after successful operations', async () => {
      mockSessionService.updateSessionSettings
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      // Cause an error
      await act(async () => {
        await result.current.updateSessionName('Test');
      });

      expect(result.current.error).toBeTruthy();

      // Successful operation should clear error
      await act(async () => {
        await result.current.updateSessionName('Test 2');
      });

      expect(result.current.error).toBeNull();
    });

    it('maintains loading states during async operations', () => {
      let resolveStats: any;
      mockSessionService.getSessionStats.mockImplementation(
        () => new Promise(resolve => { resolveStats = resolve; })
      );

      const { result } = renderHook(() => useSessionManagement(sessionCode));

      // Should be loading
      expect(result.current.isLoading).toBe(true);

      // Resolve the promise
      act(() => {
        resolveStats({ totalPlayers: 1 });
      });

      // Should no longer be loading
      waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });
});
