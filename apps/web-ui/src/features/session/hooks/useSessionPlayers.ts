import { useEffect, useState } from 'react';
import { sessionManagementService } from '../services/sessionManagement.service';
import type { SessionPlayer } from '../types';

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: fetch once on mount
  }, [sessionCode]);

  return { players, loading, error, refetch: fetchPlayers };
};