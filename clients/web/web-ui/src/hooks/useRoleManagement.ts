import { useState } from 'react';
import { sessionManagementService } from '../services/sessionManagement.service';
import type { RoleChangeResponse, SessionRole } from '../types/roles';

export const useRoleManagement = (sessionCode: string | null) => {
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeRole = async (
    targetUserId: number,
    newRole: SessionRole
  ): Promise<RoleChangeResponse | null> => {
    if (!sessionCode) return null;

    setChanging(true);
    setError(null);

    try {
      const result = await sessionManagementService.changePlayerRole(
        sessionCode,
        targetUserId,
        { new_role: newRole }
      );
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to change role';
      setError(errorMsg);
      return null;
    } finally {
      setChanging(false);
    }
  };

  const kickPlayer = async (targetUserId: number): Promise<boolean> => {
    if (!sessionCode) return false;

    setChanging(true);
    setError(null);

    try {
      await sessionManagementService.kickPlayer(sessionCode, targetUserId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to kick player');
      return false;
    } finally {
      setChanging(false);
    }
  };

  return { changeRole, kickPlayer, changing, error };
};
