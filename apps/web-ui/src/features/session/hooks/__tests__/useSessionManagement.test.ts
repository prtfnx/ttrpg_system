import { useProtocol } from '@app/providers';
import { useSessionManagement } from '@features/session';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/providers', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, username: 'Owner' },
  })),
  useProtocol: vi.fn(() => ({
    protocol: {
      registerHandler: vi.fn(),
      unregisterHandler: vi.fn(),
    },
    isConnected: true,
  })),
}));

const mockRefetch = vi.fn();

vi.mock('../useSessionPlayers', () => ({
  useSessionPlayers: vi.fn(() => ({
    players: [
      { id: 10, user_id: 1, username: 'Owner', role: 'owner', is_connected: true, permissions: ['change_roles', 'kick'] },
      { id: 11, user_id: 2, username: 'Player2', role: 'player', is_connected: true, permissions: [] },
    ],
    loading: false,
    error: null,
    refetch: mockRefetch,
  })),
}));

const mockChangeRole = vi.fn();
const mockKickPlayer = vi.fn();

vi.mock('../useRoleManagement', () => ({
  useRoleManagement: vi.fn(() => ({
    changeRole: mockChangeRole,
    kickPlayer: mockKickPlayer,
    changing: false,
    error: null,
  })),
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('useSessionManagement', () => {
  const sessionCode = 'TEST123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockChangeRole.mockResolvedValue(true);
    mockKickPlayer.mockResolvedValue(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  describe('Initial state', () => {
    it('exposes player list from useSessionPlayers', () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));
      expect(result.current.players).toHaveLength(2);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('resolves currentPlayer from auth user', () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));
      expect(result.current.currentPlayer?.user_id).toBe(1);
      expect(result.current.currentPlayer?.role).toBe('owner');
    });

    it('owner can manage players', () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));
      expect(result.current.canManagePlayers).toBe(true);
    });

    it('panel starts collapsed with invites hidden', () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));
      expect(result.current.isExpanded).toBe(false);
      expect(result.current.showInvites).toBe(false);
    });
  });

  describe('UI state controls', () => {
    it('toggleExpanded flips isExpanded', () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));
      act(() => { result.current.toggleExpanded(); });
      expect(result.current.isExpanded).toBe(true);
      act(() => { result.current.toggleExpanded(); });
      expect(result.current.isExpanded).toBe(false);
    });

    it('toggleInvites shows invite panel', () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));
      act(() => { result.current.toggleInvites(); });
      expect(result.current.showInvites).toBe(true);
    });

    it('closeInvites hides invite panel', () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));
      act(() => { result.current.toggleInvites(); });
      act(() => { result.current.closeInvites(); });
      expect(result.current.showInvites).toBe(false);
    });
  });

  describe('handleRoleChange', () => {
    it('calls changeRole with correct args on success', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));
      const target = { id: 11, user_id: 2, username: 'Player2', role: 'player' as const, is_connected: true, permissions: [] };

      await act(async () => {
        await result.current.handleRoleChange(target, 'co_dm');
      });

      expect(mockChangeRole).toHaveBeenCalledWith(2, 'co_dm');
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('returns false when player lacks change_roles permission', async () => {
      const { useSessionPlayers } = await import('../useSessionPlayers');
      vi.mocked(useSessionPlayers).mockReturnValueOnce({
        players: [{ id: 10, user_id: 1, username: 'Player', role: 'player' as const, is_connected: true, permissions: [] }],
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      const { result } = renderHook(() => useSessionManagement(sessionCode));
      const target = { id: 11, user_id: 2, username: 'Other', role: 'player' as const, is_connected: true, permissions: [] };

      let res = true;
      await act(async () => {
        res = await result.current.handleRoleChange(target, 'owner');
      });

      expect(res).toBe(false);
      expect(mockChangeRole).not.toHaveBeenCalled();
    });
  });

  describe('handleKick', () => {
    it('kicks player on confirmation', async () => {
      const { result } = renderHook(() => useSessionManagement(sessionCode));
      const target = { id: 11, user_id: 2, username: 'Player2', role: 'player' as const, is_connected: true, permissions: [] };

      await act(async () => {
        await result.current.handleKick(target);
      });

      expect(mockKickPlayer).toHaveBeenCalledWith(2);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('does not kick when user cancels confirm', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { result } = renderHook(() => useSessionManagement(sessionCode));
      const target = { id: 11, user_id: 2, username: 'Player2', role: 'player' as const, is_connected: true, permissions: [] };

      let res = true;
      await act(async () => {
        res = await result.current.handleKick(target);
      });

      expect(res).toBe(false);
      expect(mockKickPlayer).not.toHaveBeenCalled();
    });
  });

  describe('Protocol integration', () => {
    it('registers and unregisters event handler', () => {
      const mockRegister = vi.fn();
      const mockUnregister = vi.fn();
      vi.mocked(useProtocol).mockReturnValueOnce({
        protocol: { registerHandler: mockRegister, unregisterHandler: mockUnregister } as unknown as ReturnType<typeof useProtocol>['protocol'],
        isConnected: true,
      } as unknown as ReturnType<typeof useProtocol>);

      const { unmount } = renderHook(() => useSessionManagement(sessionCode));
      expect(mockRegister).toHaveBeenCalledWith('CUSTOM', expect.any(Function));
      unmount();
      expect(mockUnregister).toHaveBeenCalledWith('CUSTOM');
    });
  });
});