import { useEffect, useState } from 'react';
import { sessionManagementService } from '../services/sessionManagement.service';
import type { PlayerPermissions } from '../types/roles';

export function useSessionPermissions(sessionCode: string, userId: number) {
  const [permissions, setPermissions] = useState<PlayerPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const data = await sessionManagementService.getPlayerPermissions(sessionCode, userId);
        setPermissions(data);
      } catch (error) {
        console.error('Failed to fetch permissions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [sessionCode, userId]);

  const hasPermission = (permission: string): boolean => {
    return permissions?.all_permissions.includes(permission) ?? false;
  };

  return { permissions, loading, hasPermission };
}
