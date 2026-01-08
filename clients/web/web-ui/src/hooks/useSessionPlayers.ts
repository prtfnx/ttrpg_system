import { useEffect, useState } from 'react';
import { sessionManagementService } from '../services/sessionManagement.service';
import type { SessionPlayer } from '../types/roles';

export const useSessionPlayers = (sessionCode: string | null) => {
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlayers = async () => {
    if (!sessionCode) return;

    setLoading(true);
    setError(null);

    try {
      const data = await sessionManagementService.getPlayers(sessionCode);
      setPlayers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch players');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, [sessionCode]);

  return { players, loading, error, refetch: fetchPlayers };
};
