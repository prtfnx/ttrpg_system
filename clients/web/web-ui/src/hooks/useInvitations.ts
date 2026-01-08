import { useState, useEffect } from 'react';
import { invitationService } from '../services/invitation.service';
import type { SessionInvitation, CreateInvitationRequest } from '../types/invitations';

export const useInvitations = (sessionCode: string | null) => {
  const [invitations, setInvitations] = useState<SessionInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInvitations = async () => {
    if (!sessionCode) return;

    setLoading(true);
    setError(null);

    try {
      const data = await invitationService.listSessionInvitations(sessionCode);
      setInvitations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch invitations');
    } finally {
      setLoading(false);
    }
  };

  const createInvitation = async (data: CreateInvitationRequest): Promise<SessionInvitation | null> => {
    setLoading(true);
    setError(null);

    try {
      const result = await invitationService.createInvitation(data);
      await fetchInvitations();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const revokeInvitation = async (invitationId: number): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      await invitationService.revokeInvitation(invitationId);
      await fetchInvitations();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invitation');
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, [sessionCode]);

  return { invitations, loading, error, createInvitation, revokeInvitation, refetch: fetchInvitations };
};
