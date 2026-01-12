import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as invitationService from '../services/invitationService';
import type { SessionInvitation } from '../types/invitations';
import { useInvitations } from './useInvitations';

vi.mock('../services/invitationService');

describe('useInvitations', () => {
  const mockInvitations: SessionInvitation[] = [
    {
      id: 1,
      invite_code: 'CODE123',
      session_code: 'TEST123',
      pre_assigned_role: 'player',
      created_at: '2026-01-01T00:00:00Z',
      expires_at: '2026-01-02T00:00:00Z',
      max_uses: 5,
      uses_count: 2,
      is_active: true,
      is_valid: true,
      invite_url: 'http://localhost/join/CODE123',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (invitationService.getInvitations as any).mockResolvedValue(mockInvitations);
  });

  it('fetches invitations on mount', async () => {
    const { result } = renderHook(() => useInvitations('TEST123'));
    
    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(result.current.invitations).toEqual(mockInvitations);
    expect(invitationService.getInvitations).toHaveBeenCalledWith('TEST123');
  });

  it('handles fetch error', async () => {
    (invitationService.getInvitations as any).mockRejectedValue(new Error('Failed to fetch'));
    
    const { result } = renderHook(() => useInvitations('TEST123'));
    
    await waitFor(() => {
      expect(result.current.error).toBe('Failed to fetch');
    });
  });

  it('creates invitation successfully', async () => {
    const newInvitation: SessionInvitation = {
      id: 2,
      invite_code: 'CODE456',
      session_code: 'TEST123',
      pre_assigned_role: 'spectator',
      created_at: '2026-01-01T00:00:00Z',
      expires_at: null,
      max_uses: 10,
      uses_count: 0,
      is_active: true,
      is_valid: true,
      invite_url: 'http://localhost/join/CODE456',
    };
    
    (invitationService.createInvitation as any).mockResolvedValue(newInvitation);
    
    const { result } = renderHook(() => useInvitations('TEST123'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    let response;
    await act(async () => {
      response = await result.current.createInvitation({
        session_code: 'TEST123',
        pre_assigned_role: 'spectator',
        max_uses: 10,
      });
    });
    
    expect(response).toEqual(newInvitation);
    await waitFor(() => {
      expect(result.current.invitations).toHaveLength(2);
    });
  });

  it('handles creation error', async () => {
    (invitationService.createInvitation as any).mockRejectedValue(new Error('Failed to create'));
    
    const { result } = renderHook(() => useInvitations('TEST123'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await act(async () => {
      try {
        await result.current.createInvitation({
          session_code: 'TEST123',
          pre_assigned_role: 'player',
        });
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    });
    
    await waitFor(() => {
      expect(result.current.error).toBe('Failed to create');
    });
  });

  it('revokes invitation successfully', async () => {
    (invitationService.revokeInvitation as any).mockResolvedValue(undefined);
    
    const { result } = renderHook(() => useInvitations('TEST123'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await act(async () => {
      await result.current.revokeInvitation(1);
    });
    
    expect(invitationService.revokeInvitation).toHaveBeenCalledWith('TEST123', 1);
    await waitFor(() => {
      expect(result.current.invitations).toHaveLength(1);
    });
  });

  it('handles revoke error', async () => {
    (invitationService.revokeInvitation as any).mockRejectedValue(new Error('Failed to revoke'));
    
    const { result } = renderHook(() => useInvitations('TEST123'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await act(async () => {
      try {
        await result.current.revokeInvitation(1);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    });
    
    await waitFor(() => {
      expect(result.current.error).toBe('Failed to revoke');
    });
  });

  it('refetches invitations manually', async () => {
    const { result } = renderHook(() => useInvitations('TEST123'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    (invitationService.getInvitations as any).mockClear();
    
    await act(async () => {
      await result.current.refetch();
    });
    
    expect(invitationService.getInvitations).toHaveBeenCalledWith('TEST123');
  });

  it('handles null sessionCode', () => {
    const { result } = renderHook(() => useInvitations(null));
    
    expect(result.current.invitations).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(invitationService.getInvitations).not.toHaveBeenCalled();
  });

  it('refetches when sessionCode changes', async () => {
    const { result, rerender } = renderHook(
      ({ sessionCode }) => useInvitations(sessionCode),
      { initialProps: { sessionCode: 'TEST123' } }
    );
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    (invitationService.getInvitations as any).mockClear();
    
    rerender({ sessionCode: 'TEST456' });
    
    await waitFor(() => {
      expect(invitationService.getInvitations).toHaveBeenCalledWith('TEST456');
    });
  });
});
