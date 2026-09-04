import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionManagementService } from '../services/sessionManagement.service';
import type { SessionPlayer } from '../types';

export const useSessionPlayers = (sessionCode: string | null) => {
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(0);
  const sessionCodeRef = useRef(sessionCode);
  sessionCodeRef.current = sessionCode;

  const fetchPlayers = useCallback(async () => {
    if (sessionCode !== sessionCodeRef.current) return;
    const requestId = ++latestRequestRef.current;
    if (!sessionCode) {
      setPlayers([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await sessionManagementService.getPlayers(sessionCode);
      if (requestId === latestRequestRef.current && sessionCode === sessionCodeRef.current) {
        setPlayers(data);
      }
    } catch (err) {
      if (requestId === latestRequestRef.current && sessionCode === sessionCodeRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch players');
      }
    } finally {
      if (requestId === latestRequestRef.current && sessionCode === sessionCodeRef.current) {
        setLoading(false);
      }
    }
  }, [sessionCode]);

  useEffect(() => {
    void fetchPlayers();
    return () => {
      latestRequestRef.current += 1;
    };
  }, [fetchPlayers]);

  return { players, loading, error, refetch: fetchPlayers };
};
