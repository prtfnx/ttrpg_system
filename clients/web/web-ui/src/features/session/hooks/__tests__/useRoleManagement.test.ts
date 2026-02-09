import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoleManagement } from '../useRoleManagement';

// Mock the role management service
vi.mock('../../services/roleManagement.service', () => ({
  roleManagementService: {
    bulkRoleChange: vi.fn(() => Promise.resolve({
      updated: 2,
      failed: [],
      success: true
    })),
    removePlayer: vi.fn(() => Promise.resolve({ success: true })),
    getPlayerRoles: vi.fn(() => Promise.resolve([
      { userId: 'user1', role: 'player', username: 'Player1' },
      { userId: 'user2', role: 'trusted_player', username: 'Player2' },
      { userId: 'user3', role: 'spectator', username: 'Spectator1' }
    ])),
    updatePlayerRole: vi.fn(() => Promise.resolve({ success: true }))
  }
}));

// Mock protocol context for real-time updates
vi.mock('@shared/test-utils/ProtocolTestWrapper', () => ({
  useProtocol: () => ({
    protocol: {
      sendEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    },
    isConnected: true
  })
}));

// Mock auth context
vi.mock('@features/auth', () => ({
  useAuth: () => ({
    user: {
      id: 'test-owner',
      role: 'owner',
      username: 'TestOwner'
    },
    hasPermission: vi.fn(() => true)
  })
}));

// Mock toast notifications
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  }
}));

describe('useRoleManagement', () => {
  const mockSessionCode = 'TEST123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('initializes with default state', () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      expect(result.current.players).toEqual([]);
      expect(result.current.selectedPlayers).toEqual(new Set());
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.bulkMode).toBe(false);
    });

    it('loads players on mount', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      expect(result.current.players[0].username).toBe('Player1');
      expect(result.current.players[0].role).toBe('player');
      expect(result.current.isLoading).toBe(false);
    });

    it('handles loading failure', async () => {
      const { roleManagementService } = await import('../../services/roleManagement.service');
      vi.mocked(roleManagementService.getPlayerRoles).mockRejectedValueOnce(
        new Error('Failed to load players')
      );

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.error).toContain('Failed to load players');
      });

      expect(result.current.players).toEqual([]);
    });
  });

  describe('Individual Role Management', () => {
    it('updates single player role', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      await act(async () => {
        await result.current.updatePlayerRole('user1', 'trusted_player');
      });

      // Should update the local state optimistically
      const updatedPlayer = result.current.players.find(p => p.userId === 'user1');
      expect(updatedPlayer?.role).toBe('trusted_player');
      expect(result.current.error).toBeNull();
    });

    it('handles role update failure', async () => {
      const { roleManagementService } = await import('../../services/roleManagement.service');
      vi.mocked(roleManagementService.updatePlayerRole).mockRejectedValueOnce(
        new Error('Update failed')
      );

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      await act(async () => {
        await result.current.updatePlayerRole('user1', 'trusted_player');
      });

      expect(result.current.error).toContain('Failed to update player role');
      // Should revert optimistic update
      const player = result.current.players.find(p => p.userId === 'user1');
      expect(player?.role).toBe('player'); // Original role
    });

    it('validates role changes', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await act(async () => {
        await result.current.updatePlayerRole('user1', 'owner' as any);
      });

      expect(result.current.error).toContain('Cannot assign owner role');
    });

    it('prevents demoting session owner', async () => {
      // Mock owner in player list
      const { roleManagementService } = await import('../../services/roleManagement.service');
      vi.mocked(roleManagementService.getPlayerRoles).mockResolvedValueOnce([
        { userId: 'owner-user', role: 'owner', username: 'SessionOwner' },
        { userId: 'user1', role: 'player', username: 'Player1' }
      ]);

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(2);
      });

      await act(async () => {
        await result.current.updatePlayerRole('owner-user', 'player');
      });

      expect(result.current.error).toContain('Cannot change owner role');
    });
  });

  describe('Bulk Role Management', () => {
    it('enables and disables bulk mode', () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      act(() => {
        result.current.toggleBulkMode();
      });

      expect(result.current.bulkMode).toBe(true);
      expect(result.current.selectedPlayers.size).toBe(0);

      act(() => {
        result.current.toggleBulkMode();
      });

      expect(result.current.bulkMode).toBe(false);
      expect(result.current.selectedPlayers.size).toBe(0);
    });

    it('selects and deselects players', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      act(() => {
        result.current.toggleBulkMode();
        result.current.togglePlayerSelection('user1');
      });

      expect(result.current.selectedPlayers.has('user1')).toBe(true);

      act(() => {
        result.current.togglePlayerSelection('user2');
      });

      expect(result.current.selectedPlayers.size).toBe(2);
      expect(result.current.selectedPlayers.has('user2')).toBe(true);

      act(() => {
        result.current.togglePlayerSelection('user1');
      });

      expect(result.current.selectedPlayers.has('user1')).toBe(false);
      expect(result.current.selectedPlayers.size).toBe(1);
    });

    it('selects all players', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      act(() => {
        result.current.toggleBulkMode();
        result.current.selectAll();
      });

      expect(result.current.selectedPlayers.size).toBe(3);
      expect(result.current.allSelected).toBe(true);
    });

    it('clears all selections', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      act(() => {
        result.current.toggleBulkMode();
        result.current.selectAll();
        result.current.clearSelection();
      });

      expect(result.current.selectedPlayers.size).toBe(0);
      expect(result.current.allSelected).toBe(false);
    });

    it('performs bulk role change', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      act(() => {
        result.current.toggleBulkMode();
        result.current.togglePlayerSelection('user1');
        result.current.togglePlayerSelection('user2');
      });

      await act(async () => {
        await result.current.bulkRoleChange('trusted_player');
      });

      expect(result.current.error).toBeNull();
      // Should clear selections after successful bulk change
      expect(result.current.selectedPlayers.size).toBe(0);
    });

    it('handles partial bulk role change success', async () => {
      const { roleManagementService } = await import('../../services/roleManagement.service');
      vi.mocked(roleManagementService.bulkRoleChange).mockResolvedValueOnce({
        updated: 1,
        failed: ['user2'],
        success: false
      });

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      act(() => {
        result.current.toggleBulkMode();
        result.current.togglePlayerSelection('user1');
        result.current.togglePlayerSelection('user2');
      });

      await act(async () => {
        await result.current.bulkRoleChange('trusted_player');
      });

      expect(result.current.error).toContain('Some role changes failed');
    });

    it('handles bulk role change failure', async () => {
      const { roleManagementService } = await import('../../services/roleManagement.service');
      vi.mocked(roleManagementService.bulkRoleChange).mockRejectedValueOnce(
        new Error('Bulk operation failed')
      );

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      act(() => {
        result.current.toggleBulkMode();
        result.current.selectAll();
      });

      await act(async () => {
        await result.current.bulkRoleChange('player');
      });

      expect(result.current.error).toContain('Failed to update roles');
    });
  });

  describe('Player Removal', () => {
    it('removes player from session', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      await act(async () => {
        await result.current.removePlayer('user1');
      });

      expect(result.current.players).toHaveLength(2);
      expect(result.current.players.find(p => p.userId === 'user1')).toBeUndefined();
    });

    it('handles player removal failure', async () => {
      const { roleManagementService } = await import('../../services/roleManagement.service');
      vi.mocked(roleManagementService.removePlayer).mockRejectedValueOnce(
        new Error('Removal failed')
      );

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      await act(async () => {
        await result.current.removePlayer('user1');
      });

      expect(result.current.error).toContain('Failed to remove player');
      expect(result.current.players).toHaveLength(3); // Should not remove on failure
    });

    it('prevents removing session owner', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await act(async () => {
        await result.current.removePlayer('test-owner');
      });

      expect(result.current.error).toContain('Cannot remove session owner');
    });

    it('confirms removal with name verification', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      // Should require username confirmation for removal
      await act(async () => {
        await result.current.removePlayer('user1', 'WrongName');
      });

      expect(result.current.error).toContain('Username confirmation does not match');
    });
  });

  describe('Role Filtering and Stats', () => {
    it('provides role-based filtering', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      const playerRolePlayers = result.current.getPlayersByRole('player');
      expect(playerRolePlayers).toHaveLength(1);
      expect(playerRolePlayers[0].role).toBe('player');

      const spectators = result.current.getPlayersByRole('spectator');
      expect(spectators).toHaveLength(1);
      expect(spectators[0].role).toBe('spectator');
    });

    it('calculates role statistics', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      const stats = result.current.roleStats;
      expect(stats.player).toBe(1);
      expect(stats.trusted_player).toBe(1);
      expect(stats.spectator).toBe(1);
      expect(stats.total).toBe(3);
    });

    it('provides selection statistics', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      act(() => {
        result.current.toggleBulkMode();
        result.current.togglePlayerSelection('user1');
        result.current.togglePlayerSelection('user2');
      });

      expect(result.current.selectedCount).toBe(2);
      expect(result.current.hasSelection).toBe(true);
      expect(result.current.allSelected).toBe(false);
    });
  });

  describe('Real-time Updates and Protocol Events', () => {
    it('handles player joined events', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      // Simulate protocol event for new player
      act(() => {
        result.current.handlePlayerJoined({
          userId: 'user4',
          username: 'NewPlayer',
          role: 'player'
        });
      });

      expect(result.current.players).toHaveLength(4);
      const newPlayer = result.current.players.find(p => p.userId === 'user4');
      expect(newPlayer?.username).toBe('NewPlayer');
    });

    it('handles player left events', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      // Simulate protocol event for player leaving
      act(() => {
        result.current.handlePlayerLeft('user1');
      });

      expect(result.current.players).toHaveLength(2);
      expect(result.current.players.find(p => p.userId === 'user1')).toBeUndefined();
    });

    it('handles role change events from other clients', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      // Simulate protocol event for role change
      act(() => {
        result.current.handleRoleChanged({
          userId: 'user1',
          newRole: 'co_dm'
        });
      });

      const updatedPlayer = result.current.players.find(p => p.userId === 'user1');
      expect(updatedPlayer?.role).toBe('co_dm');
    });
  });

  describe('Permission and Authorization', () => {
    it('restricts operations based on user role', async () => {
      // Mock user with limited permissions
      vi.mocked(vi.fn()).mockImplementation(() => ({
        useAuth: () => ({
          user: { id: 'limited-user', role: 'co_dm' },
          hasPermission: vi.fn((permission) => {
            return !['remove_player', 'change_owner_role'].includes(permission);
          })
        })
      }));

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await act(async () => {
        await result.current.removePlayer('user1');
      });

      expect(result.current.error).toContain('Insufficient permissions');
    });

    it('validates role hierarchy restrictions', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      // Co-DM should not be able to change owner to lower role
      await act(async () => {
        await result.current.updatePlayerRole('owner-user', 'player');
      });

      expect(result.current.error).toContain('Insufficient permissions');
    });

    it('allows role changes within permission scope', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      // Owner should be able to change any player role
      await act(async () => {
        await result.current.updatePlayerRole('user1', 'co_dm');
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Data Persistence and Sync', () => {
    it('refreshes data after operations', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await act(async () => {
        result.current.refreshData();
      });

      const { roleManagementService } = await import('../../services/roleManagement.service');
      expect(roleManagementService.getPlayerRoles).toHaveBeenCalledTimes(2); // Initial + refresh
    });

    it('handles concurrent modifications gracefully', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      // Simulate concurrent role change operations
      await act(async () => {
        await Promise.all([
          result.current.updatePlayerRole('user1', 'trusted_player'),
          result.current.updatePlayerRole('user2', 'spectator')
        ]);
      });

      // Should handle both operations without conflicts
      expect(result.current.error).toBeNull();
    });
  });

  describe('Error Recovery and Cleanup', () => {
    it('provides error clearing mechanism', () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      // Set error state
      act(() => {
        (result.current as any).setError('Test error');
      });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });

    it('clears selections when exiting bulk mode', async () => {
      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await waitFor(() => {
        expect(result.current.players).toHaveLength(3);
      });

      act(() => {
        result.current.toggleBulkMode();
        result.current.selectAll();
      });

      expect(result.current.selectedPlayers.size).toBe(3);

      act(() => {
        result.current.toggleBulkMode(); // Exit bulk mode
      });

      expect(result.current.selectedPlayers.size).toBe(0);
      expect(result.current.bulkMode).toBe(false);
    });

    it('handles component unmounting gracefully', () => {
      const { result, unmount } = renderHook(() => useRoleManagement(mockSessionCode));

      act(() => {
        result.current.toggleBulkMode();
      });

      // Should not throw when unmounting
      expect(() => unmount()).not.toThrow();
    });
  });
});