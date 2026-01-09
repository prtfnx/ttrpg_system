import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as invitationAPI from '../api/invitations';
import { useInvitations } from './useInvitations';

vi.mock('../api/invitations');

describe('useInvitations', () => {
  const mockInvitations = [
    {
      token: 'token123',
      role: 'player',
      max_uses: 5,
      uses: 2,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      is_active: true,
    },
    {
      token: 'token456',
      role: 'spectator',
      max_uses: null,
      uses: 0,
      expires_at: null,
      is_active: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (invitationAPI.getInvitations as any).mockResolvedValue({ data: mockInvitations });
  });

  it('loads invitations on mount', async () => {
    const { result } = renderHook(() => useInvitations(1));
    
    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(result.current.invitations).toEqual(mockInvitations);
  });

  it('handles load error', async () => {
    (invitationAPI.getInvitations as any).mockRejectedValue(new Error('Failed'));
    
    const { result } = renderHook(() => useInvitations(1));
    
    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load invitations');
    });
  });

  it('creates invitation', async () => {
    const newInvite = {
      token: 'token789',
      role: 'player',
      max_uses: 10,
      uses: 0,
      expires_at: null,
      is_active: true,
    };
    (invitationAPI.createInvitation as any).mockResolvedValue({ data: newInvite });
    
    const { result } = renderHook(() => useInvitations(1));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await act(async () => {
      await result.current.createInvitation({ role: 'player', max_uses: 10 });
    });
    
    expect(invitationAPI.createInvitation).toHaveBeenCalledWith(1, { role: 'player', max_uses: 10 });
    expect(result.current.invitations).toHaveLength(3);
  });

  it('revokes invitation', async () => {
    (invitationAPI.revokeInvitation as any).mockResolvedValue({});
    
    const { result } = renderHook(() => useInvitations(1));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await act(async () => {
      await result.current.revokeInvitation('token123');
    });
    
    expect(invitationAPI.revokeInvitation).toHaveBeenCalledWith(1, 'token123');
    const revokedInvite = result.current.invitations.find(i => i.token === 'token123');
    expect(revokedInvite?.is_active).toBe(false);
  });

  it('handles creation error', async () => {
    (invitationAPI.createInvitation as any).mockRejectedValue(new Error('Failed'));
    
    const { result } = renderHook(() => useInvitations(1));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await act(async () => {
      try {
        await result.current.createInvitation({ role: 'player' });
      } catch (e) {
        // Expected
      }
    });
    
    expect(result.current.error).toBe('Failed to create invitation');
  });

  it('handles revoke error', async () => {
    (invitationAPI.revokeInvitation as any).mockRejectedValue(new Error('Failed'));
    
    const { result } = renderHook(() => useInvitations(1));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await act(async () => {
      try {
        await result.current.revokeInvitation('token123');
      } catch (e) {
        // Expected
      }
    });
    
    expect(result.current.error).toBe('Failed to revoke invitation');
  });

  it('creates invitation with duration', async () => {
    const newInvite = {
      token: 'token789',
      role: 'player',
      max_uses: null,
      uses: 0,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      is_active: true,
    };
    (invitationAPI.createInvitation as any).mockResolvedValue({ data: newInvite });
    
    const { result } = renderHook(() => useInvitations(1));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await act(async () => {
      await result.current.createInvitation({ role: 'player', hours: 24 });
    });
    
    expect(invitationAPI.createInvitation).toHaveBeenCalledWith(1, { role: 'player', hours: 24 });
  });

  it('sorts invitations by active status', async () => {
    const mixedInvites = [
      { ...mockInvitations[0], is_active: false },
      mockInvitations[1],
    ];
    (invitationAPI.getInvitations as any).mockResolvedValue({ data: mixedInvites });
    
    const { result } = renderHook(() => useInvitations(1));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    expect(result.current.invitations[0].is_active).toBe(true);
    expect(result.current.invitations[1].is_active).toBe(false);
  });
});
