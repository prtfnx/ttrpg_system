import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRoleManagement } from './useRoleManagement';
import * as sessionAPI from '../api/sessionManagement';

vi.mock('../api/sessionManagement');

describe('useRoleManagement', () => {
  const mockPlayers = [
    { id: 1, username: 'player1', character_name: 'Aragorn', is_online: true, role: 'player' },
    { id: 2, username: 'player2', character_name: null, is_online: false, role: 'spectator' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (sessionAPI.getSessionPlayers as any).mockResolvedValue({ data: mockPlayers });
  });

  it('loads players on mount', async () => {
    const { result } = renderHook(() => useRoleManagement(1, 'dm'));
    
    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(result.current.players).toEqual(mockPlayers);
  });

  it('handles load error', async () => {
    (sessionAPI.getSessionPlayers as any).mockRejectedValue(new Error('Failed'));
    
    const { result } = renderHook(() => useRoleManagement(1, 'dm'));
    
    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load players');
    });
  });

  it('changes player role', async () => {
    (sessionAPI.changePlayerRole as any).mockResolvedValue({ data: { ...mockPlayers[0], role: 'spectator' } });
    
    const { result } = renderHook(() => useRoleManagement(1, 'dm'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await act(async () => {
      await result.current.changeRole(1, 'spectator');
    });
    
    expect(sessionAPI.changePlayerRole).toHaveBeenCalledWith(1, 1, 'spectator');
  });

  it('kicks player', async () => {
    (sessionAPI.kickPlayer as any).mockResolvedValue({});
    
    const { result } = renderHook(() => useRoleManagement(1, 'dm'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await act(async () => {
      await result.current.kickPlayer(2);
    });
    
    expect(sessionAPI.kickPlayer).toHaveBeenCalledWith(1, 2);
    expect(result.current.players).toHaveLength(1);
  });

  it('checks kick permissions for DM', async () => {
    const { result } = renderHook(() => useRoleManagement(1, 'dm'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(result.current.canKick(2)).toBe(true);
  });

  it('checks kick permissions for non-DM', async () => {
    const { result } = renderHook(() => useRoleManagement(1, 'player'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(result.current.canKick(2)).toBe(false);
  });

  it('checks role change permissions', async () => {
    const { result } = renderHook(() => useRoleManagement(1, 'dm'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(result.current.canChangeRole(2)).toBe(true);
  });

  it('prevents kicking self', async () => {
    const { result } = renderHook(() => useRoleManagement(1, 'dm'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    result.current.currentPlayerId = 1;
    expect(result.current.canKick(1)).toBe(false);
  });

  it('updates players from WebSocket event', async () => {
    const { result } = renderHook(() => useRoleManagement(1, 'dm'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    act(() => {
      result.current.handlePlayerUpdate({
        type: 'ROLE_CHANGED',
        playerId: 1,
        role: 'spectator',
      });
    });
    
    expect(result.current.players[0].role).toBe('spectator');
  });

  it('removes player on kick event', async () => {
    const { result } = renderHook(() => useRoleManagement(1, 'dm'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    act(() => {
      result.current.handlePlayerUpdate({
        type: 'PLAYER_KICKED',
        playerId: 2,
      });
    });
    
    expect(result.current.players).toHaveLength(1);
  });
});
