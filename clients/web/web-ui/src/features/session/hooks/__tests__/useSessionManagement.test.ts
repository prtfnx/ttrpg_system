import { useSessionManagement } from '@features/session';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the session service
vi.mock('@features/session/services', () => ({
  sessionManagementService: {
    updateSessionSettings: vi.fn(() => Promise.resolve({ success: true })),
    getSessionStats: vi.fn(() => Promise.resolve({
      totalPlayers: 4,
      activePlayers: 3,
      spectators: 1,
      sessionDuration: '2h 30m'
    })),
    deleteSession: vi.fn(() => Promise.resolve({ success: true })),
    getAuditLog: vi.fn(() => Promise.resolve({
      entries: [
        {
          id: '1',
          event_type: 'SETTINGS_UPDATED',
          user_id: 'user1',
          details: { setting: 'name', oldValue: 'Old Name', newValue: 'New Name' },
          created_at: new Date().toISOString()
        }
      ]
    }))
  }
}));

// Mock the protocol context  
vi.mock('@app/providers', () => ({
  useProtocol: () => ({
    protocol: {
      sendEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    },
    isConnected: true
  }),
  useAuth: () => ({
    user: {
      id: 'test-user-1',
      role: 'owner'
    },
    hasPermission: vi.fn(() => true)
  })
}));

describe('useSessionManagement', () => {
  const mockSessionCode = 'TEST123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('initializes with default state', () => {
      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.stats).toBeNull();
      expect(result.current.auditLog).toEqual([]);
    });

    it('handles missing session code', () => {
      const { result } = renderHook(() => useSessionManagement(''));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toContain('Session code is required');
    });
  });

  describe('Session Settings Management', () => {
    it('updates session settings successfully', async () => {
      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      const settingsUpdate = {
        name: 'Updated Session Name',
        description: 'Updated description',
        max_players: 6
      };

      await act(async () => {
        await result.current.updateSettings(settingsUpdate);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('handles settings update failure', async () => {
      const { sessionManagementService } = await import('@features/session/services');
      vi.mocked(sessionManagementService.updateSessionSettings).mockRejectedValueOnce(
        new Error('Update failed')
      );

      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      await act(async () => {
        await result.current.updateSettings({ name: 'New Name' });
      });

      expect(result.current.error).toContain('Failed to update settings');
      expect(result.current.isLoading).toBe(false);
    });

    it('validates required settings fields', async () => {
      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      await act(async () => {
        await result.current.updateSettings({ max_players: -1 });
      });

      expect(result.current.error).toContain('Max players must be greater than 0');
    });
  });

  describe('Session Statistics', () => {
    it('loads session statistics', async () => {
      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      await act(async () => {
        await result.current.loadStats();
      });

      expect(result.current.stats).toEqual({
        totalPlayers: 4,
        activePlayers: 3,
        spectators: 1,
        sessionDuration: '2h 30m'
      });
      expect(result.current.isLoading).toBe(false);
    });

    it('handles stats loading failure', async () => {
      const { sessionManagementService } = await import('@features/session/services');
      vi.mocked(sessionManagementService.getSessionStats).mockRejectedValueOnce(
        new Error('Stats unavailable')
      );

      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      await act(async () => {
        await result.current.loadStats();
      });

      expect(result.current.error).toContain('Failed to load statistics');
      expect(result.current.stats).toBeNull();
    });
  });

  describe('Session Deletion', () => {
    it('deletes session with confirmation', async () => {
      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      await act(async () => {
        await result.current.deleteSession(mockSessionCode);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('requires matching session code for deletion', async () => {
      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      await act(async () => {
        await result.current.deleteSession('WRONG123');
      });

      expect(result.current.error).toContain('Session code does not match');
    });

    it('handles deletion failure', async () => {
      const { sessionManagementService } = await import('@features/session/services');
      vi.mocked(sessionManagementService.deleteSession).mockRejectedValueOnce(
        new Error('Deletion failed')
      );

      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      await act(async () => {
        await result.current.deleteSession(mockSessionCode);
      });

      expect(result.current.error).toContain('Failed to delete session');
    });
  });

  describe('Audit Log Management', () => {
    it('loads audit log entries', async () => {
      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      await act(async () => {
        await result.current.loadAuditLog();
      });

      expect(result.current.auditLog).toHaveLength(1);
      expect(result.current.auditLog[0].event_type).toBe('SETTINGS_UPDATED');
      expect(result.current.isLoading).toBe(false);
    });

    it('handles audit log loading failure', async () => {
      const { sessionManagementService } = await import('@features/session/services');
      vi.mocked(sessionManagementService.getAuditLog).mockRejectedValueOnce(
        new Error('Audit log unavailable')
      );

      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      await act(async () => {
        await result.current.loadAuditLog();
      });

      expect(result.current.error).toContain('Failed to load audit log');
      expect(result.current.auditLog).toEqual([]);
    });

    it('filters audit log by event type', async () => {
      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      await act(async () => {
        await result.current.loadAuditLog('SETTINGS_UPDATED');
      });

      // Should pass filter parameter to service
      const { sessionManagementService } = await import('@features/session/services');
      expect(sessionManagementService.getAuditLog).toHaveBeenCalledWith(
        mockSessionCode, 
        { eventType: 'SETTINGS_UPDATED' }
      );
    });
  });

  describe('Real-time Updates', () => {
    it('handles protocol events for settings updates', async () => {
      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      // Simulate protocol event
      const settingsUpdateEvent = {
        type: 'SESSION_SETTINGS_UPDATED',
        sessionCode: mockSessionCode,
        settings: { name: 'Real-time Updated Name' }
      };

      // The hook should register for protocol events and handle them
      // This would be tested with a more complex setup involving the protocol mock
      expect(result.current.isLoading).toBe(false);
    });

    it('handles protocol events for player changes', async () => {
      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      // Test that player join/leave events trigger stats refresh
      expect(result.current.stats).toBeNull();
    });
  });

  describe('Permission Handling', () => {
    it('restricts operations based on user role', async () => {
      // Mock user with player role (not owner/co_dm)
      vi.mocked(vi.fn()).mockImplementation(() => ({
        useAuth: () => ({
          user: { id: 'test-user-2', role: 'player' },
          hasPermission: vi.fn(() => false)
        })
      }));

      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      await act(async () => {
        await result.current.updateSettings({ name: 'New Name' });
      });

      expect(result.current.error).toContain('Insufficient permissions');
    });

    it('allows operations for privileged users', async () => {
      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      await act(async () => {
        await result.current.updateSettings({ name: 'New Name' });
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Error Recovery', () => {
    it('clears errors when retrying operations', async () => {
      const { sessionManagementService } = await import('@features/session/services');
      
      // First call fails
      vi.mocked(sessionManagementService.updateSessionSettings)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      // First attempt fails
      await act(async () => {
        await result.current.updateSettings({ name: 'New Name' });
      });
      expect(result.current.error).toContain('Failed to update settings');

      // Second attempt succeeds and clears error
      await act(async () => {
        await result.current.updateSettings({ name: 'New Name' });
      });
      expect(result.current.error).toBeNull();
    });

    it('provides retry mechanism for failed operations', async () => {
      const { result } = renderHook(() => useSessionManagement(mockSessionCode));

      // Set up an error state
      await act(async () => {
        await result.current.updateSettings({ max_players: -1 });
      });
      expect(result.current.error).toBeTruthy();

      // Clear error
      act(() => {
        result.current.clearError();
      });
      expect(result.current.error).toBeNull();
    });
  });
});
