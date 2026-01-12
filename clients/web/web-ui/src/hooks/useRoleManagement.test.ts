import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as sessionManagementService from '../services/sessionManagementService';
import { useRoleManagement } from './useRoleManagement';

vi.mock('../services/sessionManagementService');

describe('useRoleManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null functions when sessionCode is null', () => {
    const { result } = renderHook(() => useRoleManagement(null));
    
    expect(result.current.changing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('changes player role successfully', async () => {
    const mockResponse = {
      success: true,
      new_role: 'spectator',
      old_role: 'player',
      permissions_gained: [],
      permissions_lost: ['edit'],
    };
    
    (sessionManagementService.changePlayerRole as any).mockResolvedValue(mockResponse);
    
    const { result } = renderHook(() => useRoleManagement('TEST123'));
    
    let response;
    await act(async () => {
      response = await result.current.changeRole(2, 'spectator');
    });
    
    expect(sessionManagementService.changePlayerRole).toHaveBeenCalledWith('TEST123', 2, 'spectator');
    expect(response).toEqual(mockResponse);
  });

  it('handles changeRole error', async () => {
    (sessionManagementService.changePlayerRole as any).mockRejectedValue(new Error('Failed to change role'));
    
    const { result } = renderHook(() => useRoleManagement('TEST123'));
    
    await act(async () => {
      try {
        await result.current.changeRole(2, 'spectator');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    });
    
    await waitFor(() => {
      expect(result.current.error).toBe('Failed to change role');
    });
  });

  it('kicks player successfully', async () => {
    (sessionManagementService.kickPlayer as any).mockResolvedValue(true);
    
    const { result } = renderHook(() => useRoleManagement('TEST123'));
    
    let response;
    await act(async () => {
      response = await result.current.kickPlayer(2);
    });
    
    expect(sessionManagementService.kickPlayer).toHaveBeenCalledWith('TEST123', 2);
    expect(response).toBe(true);
  });

  it('handles kickPlayer error', async () => {
    (sessionManagementService.kickPlayer as any).mockRejectedValue(new Error('Failed to kick player'));
    
    const { result } = renderHook(() => useRoleManagement('TEST123'));
    
    await act(async () => {
      try {
        await result.current.kickPlayer(2);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    });
    
    await waitFor(() => {
      expect(result.current.error).toBe('Failed to kick player');
    });
  });

  it('sets changing state during operations', async () => {
    (sessionManagementService.changePlayerRole as any).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
    );
    
    const { result } = renderHook(() => useRoleManagement('TEST123'));
    
    expect(result.current.changing).toBe(false);
    
    await act(async () => {
      await result.current.changeRole(2, 'spectator');
    });
    
    await waitFor(() => {
      expect(result.current.changing).toBe(false);
    });
  });

  it('clears error on successful operation', async () => {
    (sessionManagementService.changePlayerRole as any)
      .mockRejectedValueOnce(new Error('First error'))
      .mockResolvedValueOnce({ success: true });
    
    const { result } = renderHook(() => useRoleManagement('TEST123'));
    
    await act(async () => {
      try {
        await result.current.changeRole(2, 'spectator');
      } catch (e) {}
    });
    
    await waitFor(() => {
      expect(result.current.error).toBe('First error');
    });
    
    await act(async () => {
      await result.current.changeRole(2, 'player');
    });
    
    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });
});
