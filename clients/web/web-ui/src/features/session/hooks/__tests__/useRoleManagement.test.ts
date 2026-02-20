import { useRoleManagement } from '@features/session';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the session management service
vi.mock('@features/session/services/sessionManagement.service', () => ({
  sessionManagementService: {
    changePlayerRole: vi.fn(),
    kickPlayer: vi.fn()
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

      expect(result.current.changing).toBe(false);
      expect(result.current.error).toBeNull();
      expect(typeof result.current.changeRole).toBe('function');
      expect(typeof result.current.kickPlayer).toBe('function');
    });

    it('handles null session code', () => {
      const { result } = renderHook(() => useRoleManagement(null));

      expect(result.current.changing).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('changeRole', () => {
    it('changes player role successfully', async () => {
      const { sessionManagementService } = await import('@features/session/services/sessionManagement.service');
      vi.mocked(sessionManagementService.changePlayerRole).mockResolvedValue({
        success: true,
        message: 'Role changed',
        new_role: 'trusted_player'
      });

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      let response: any;
      await act(async () => {
        response = await result.current.changeRole(101, 'trusted_player');
      });

      expect(response).toEqual({
        success: true,
        message: 'Role changed',
        new_role: 'trusted_player'
      });
      expect(result.current.changing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('sets changing state during role change', async () => {
      const { sessionManagementService } = await import('@features/session/services/sessionManagement.service');
      let resolveChange: any;
      const changePromise = new Promise(resolve => {
        resolveChange = resolve;
      });
      vi.mocked(sessionManagementService.changePlayerRole).mockReturnValue(changePromise as any);

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      // Start change
      act(() => {
        result.current.changeRole(101, 'co_dm');
      });

      // Should be changing
      expect(result.current.changing).toBe(true);

      // Complete change
      await act(async () => {
        resolveChange({ success: true, message: 'Done', new_role: 'co_dm' });
        await changePromise;
      });

      expect(result.current.changing).toBe(false);
    });

    it('handles role change error', async () => {
      const { sessionManagementService } = await import('@features/session/services/sessionManagement.service');
      vi.mocked(sessionManagementService.changePlayerRole).mockRejectedValue(
        new Error('Permission denied')
      );

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      let response: any;
      await act(async () => {
        response = await result.current.changeRole(101, 'owner');
      });

      expect(response).toBeNull();
      expect(result.current.error).toBe('Permission denied');
      expect(result.current.changing).toBe(false);
    });

    it('returns null when session code is null', async () => {
      const { result } = renderHook(() => useRoleManagement(null));

      let response: any;
      await act(async () => {
        response = await result.current.changeRole(101, 'player');
      });

      expect(response).toBeNull();
    });

    it('clears previous error on successful change', async () => {
      const { sessionManagementService } = await import('@features/session/services/sessionManagement.service');
      
      // First call fails
      vi.mocked(sessionManagementService.changePlayerRole).mockRejectedValueOnce(
        new Error('First error')
      );

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await act(async () => {
        await result.current.changeRole(101, 'player');
      });

      expect(result.current.error).toBe('First error');

      // Second call succeeds
      vi.mocked(sessionManagementService.changePlayerRole).mockResolvedValueOnce({
        success: true,
        message: 'Success',
        new_role: 'trusted_player'
      });

      await act(async () => {
        await result.current.changeRole(101, 'trusted_player');
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('kickPlayer', () => {
    it('kicks player successfully', async () => {
      const { sessionManagementService } = await import('@features/session/services/sessionManagement.service');
      vi.mocked(sessionManagementService.kickPlayer).mockResolvedValue(undefined);

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      let response: boolean;
      await act(async () => {
        response = await result.current.kickPlayer(101);
      });

      expect(response!).toBe(true);
      expect(sessionManagementService.kickPlayer).toHaveBeenCalledWith(mockSessionCode, 101);
      expect(result.current.changing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('sets changing state during kick', async () => {
      const { sessionManagementService } = await import('@features/session/services/sessionManagement.service');
      let resolveKick: any;
      const kickPromise = new Promise(resolve => {
        resolveKick = resolve;
      });
      vi.mocked(sessionManagementService.kickPlayer).mockReturnValue(kickPromise as any);

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      // Start kick
      act(() => {
        result.current.kickPlayer(101);
      });

      // Should be changing
      expect(result.current.changing).toBe(true);

      // Complete kick
      await act(async () => {
        resolveKick(undefined);
        await kickPromise;
      });

      expect(result.current.changing).toBe(false);
    });

    it('handles kick error', async () => {
      const { sessionManagementService } = await import('@features/session/services/sessionManagement.service');
      vi.mocked(sessionManagementService.kickPlayer).mockRejectedValue(
        new Error('Cannot kick owner')
      );

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      let response: boolean;
      await act(async () => {
        response = await result.current.kickPlayer(999);
      });

      expect(response!).toBe(false);
      expect(result.current.error).toBe('Cannot kick owner');
      expect(result.current.changing).toBe(false);
    });

    it('returns false when session code is null', async () => {
      const { result } = renderHook(() => useRoleManagement(null));

      let response: boolean;
      await act(async () => {
        response = await result.current.kickPlayer(101);
      });

      expect(response!).toBe(false);
    });

    it('handles generic error without message', async () => {
      const { sessionManagementService } = await import('@features/session/services/sessionManagement.service');
      vi.mocked(sessionManagementService.kickPlayer).mockRejectedValue('Unknown error');

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await act(async () => {
        await result.current.kickPlayer(101);
      });

      expect(result.current.error).toBe('Failed to kick player');
    });
  });

  describe('Error Handling', () => {
    it('handles network errors gracefully', async () => {
      const { sessionManagementService } = await import('@features/session/services/sessionManagement.service');
      vi.mocked(sessionManagementService.changePlayerRole).mockRejectedValue(
        new Error('Network error: timeout')
      );

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await act(async () => {
        await result.current.changeRole(101, 'player');
      });

      expect(result.current.error).toBe('Network error: timeout');
    });

    it('handles generic errors with fallback message for role change', async () => {
      const { sessionManagementService } = await import('@features/session/services/sessionManagement.service');
      vi.mocked(sessionManagementService.changePlayerRole).mockRejectedValue('Generic error');

      const { result } = renderHook(() => useRoleManagement(mockSessionCode));

      await act(async () => {
        await result.current.changeRole(101, 'player');
      });

      expect(result.current.error).toBe('Failed to change role');
    });
  });
});
