import { useInvitations } from '@features/session';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invitationService } from '../../services/invitation.service';
import type { SessionInvitation } from '../../types/invitations';

vi.mock('../../services/invitation.service', () => ({
  invitationService: {
    listSessionInvitations: vi.fn(),
    createInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    deleteInvitation: vi.fn(),
  },
}));

const mockInvitations: SessionInvitation[] = [
  {
    id: 1,
    invite_code: 'CODE1',
    session_code: 'TEST123',
    pre_assigned_role: 'player',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    max_uses: 10,
    uses_count: 0,
    is_active: true,
    is_valid: true,
    invite_url: 'http://localhost/join/CODE1',
  },
  {
    id: 2,
    invite_code: 'CODE2',
    session_code: 'TEST123',
    pre_assigned_role: 'spectator',
    created_at: new Date().toISOString(),
    max_uses: 1,
    uses_count: 1,
    is_active: false,
    is_valid: false,
    invite_url: 'http://localhost/join/CODE2',
  },
];

describe('useInvitations', () => {
  const sessionCode = 'TEST123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invitationService.listSessionInvitations).mockResolvedValue([...mockInvitations]);
    vi.mocked(invitationService.createInvitation).mockResolvedValue({ ...mockInvitations[0], id: 3 });
    vi.mocked(invitationService.revokeInvitation).mockResolvedValue({ success: true, message: 'revoked' });
    vi.mocked(invitationService.deleteInvitation).mockResolvedValue({ success: true, message: 'deleted' });
  });

  describe('Initialization', () => {
    it('starts with empty state before fetch completes', () => {
      vi.mocked(invitationService.listSessionInvitations).mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useInvitations(sessionCode));

      expect(result.current.invitations).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('loads invitations on mount', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));

      await waitFor(() => {
        expect(result.current.invitations).toHaveLength(2);
      });

      expect(result.current.invitations[0].pre_assigned_role).toBe('player');
      expect(result.current.invitations[1].pre_assigned_role).toBe('spectator');
      expect(result.current.loading).toBe(false);
    });

    it('does not fetch when sessionCode is null', () => {
      renderHook(() => useInvitations(null));
      expect(invitationService.listSessionInvitations).not.toHaveBeenCalled();
    });

    it('sets error when fetch fails', async () => {
      vi.mocked(invitationService.listSessionInvitations).mockRejectedValueOnce(
        new Error('Network error')
      );
      const { result } = renderHook(() => useInvitations(sessionCode));

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });

      expect(result.current.invitations).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
  });

  describe('createInvitation', () => {
    it('calls service with the provided data', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));
      await waitFor(() => expect(result.current.invitations).toHaveLength(2));

      const createData = { session_code: sessionCode, pre_assigned_role: 'player', max_uses: 5 };

      await act(async () => {
        await result.current.createInvitation(createData);
      });

      expect(invitationService.createInvitation).toHaveBeenCalledWith(createData);
    });

    it('refetches after creation', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));
      await waitFor(() => expect(result.current.invitations).toHaveLength(2));

      await act(async () => {
        await result.current.createInvitation({ session_code: sessionCode, pre_assigned_role: 'player', max_uses: 1 });
      });

      expect(invitationService.listSessionInvitations).toHaveBeenCalledTimes(2);
    });

    it('returns null and sets error on failure', async () => {
      vi.mocked(invitationService.createInvitation).mockRejectedValueOnce(new Error('Create failed'));
      const { result } = renderHook(() => useInvitations(sessionCode));

      let created: SessionInvitation | null = null;
      await act(async () => {
        created = await result.current.createInvitation({ session_code: sessionCode, pre_assigned_role: 'player', max_uses: 1 });
      });

      expect(created).toBeNull();
      expect(result.current.error).toBe('Create failed');
    });
  });

  describe('revokeInvitation', () => {
    it('calls service with invitation id', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));
      await waitFor(() => expect(result.current.invitations).toHaveLength(2));

      await act(async () => {
        await result.current.revokeInvitation(1);
      });

      expect(invitationService.revokeInvitation).toHaveBeenCalledWith(1);
    });

    it('refetches after revoke', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));
      await waitFor(() => expect(result.current.invitations).toHaveLength(2));

      await act(async () => {
        await result.current.revokeInvitation(1);
      });

      expect(invitationService.listSessionInvitations).toHaveBeenCalledTimes(2);
    });

    it('returns false and sets error on failure', async () => {
      vi.mocked(invitationService.revokeInvitation).mockRejectedValueOnce(new Error('Revoke failed'));
      const { result } = renderHook(() => useInvitations(sessionCode));

      let success = true;
      await act(async () => {
        success = await result.current.revokeInvitation(1);
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe('Revoke failed');
    });
  });

  describe('deleteInvitation', () => {
    it('calls service with invitation id', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));
      await waitFor(() => expect(result.current.invitations).toHaveLength(2));

      await act(async () => {
        await result.current.deleteInvitation(2);
      });

      expect(invitationService.deleteInvitation).toHaveBeenCalledWith(2);
    });

    it('refetches after delete', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));
      await waitFor(() => expect(result.current.invitations).toHaveLength(2));

      await act(async () => {
        await result.current.deleteInvitation(2);
      });

      expect(invitationService.listSessionInvitations).toHaveBeenCalledTimes(2);
    });

    it('returns false and sets error on failure', async () => {
      vi.mocked(invitationService.deleteInvitation).mockRejectedValueOnce(new Error('Delete failed'));
      const { result } = renderHook(() => useInvitations(sessionCode));

      let success = true;
      await act(async () => {
        success = await result.current.deleteInvitation(2);
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe('Delete failed');
    });
  });

  describe('refetch', () => {
    it('fetches invitations again when called manually', async () => {
      const { result } = renderHook(() => useInvitations(sessionCode));
      await waitFor(() => expect(result.current.invitations).toHaveLength(2));

      await act(async () => {
        await result.current.refetch();
      });

      expect(invitationService.listSessionInvitations).toHaveBeenCalledTimes(2);
    });
  });
});
