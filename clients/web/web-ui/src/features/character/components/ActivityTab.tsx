import { ProtocolService } from '@lib/api';
import React, { useCallback, useEffect, useState } from 'react';
import styles from './ActivityTab.module.css';

interface LogEntry {
  id: number;
  action_type: string;
  description: string;
  created_at: string;
}

interface Props {
  characterId: string;
}

const ACTION_ICON: Record<string, string> = {
  hp_change: '❤️',
  spell_cast: '✨',
  slot_recovered: '🔄',
  long_rest: '🌙',
  skill_roll: '🎲',
  item_change: '🎒',
};

export const ActivityTab: React.FC<Props> = ({ characterId }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(() => {
    if (!ProtocolService.hasProtocol()) return;
    setLoading(true);
    ProtocolService.getProtocol().requestCharacterLog(characterId, 50);
  }, [characterId]);

  useEffect(() => {
    fetchLogs();

    function handleLogResponse(e: Event) {
      const data = (e as CustomEvent).detail;
      if (data?.character_id === characterId && Array.isArray(data.logs)) {
        setLogs(data.logs);
        setLoading(false);
      }
    }

    function handleRollResult(e: Event) {
      const data = (e as CustomEvent).detail;
      if (data?.character_id !== characterId) return;
      const entry: LogEntry = {
        id: Date.now(),
        action_type: 'skill_roll',
        description: data.description ?? `Roll: ${data.total}`,
        created_at: new Date().toISOString(),
      };
      setLogs(prev => [entry, ...prev].slice(0, 50));
    }

    window.addEventListener('character-log-response', handleLogResponse);
    window.addEventListener('character-roll-result', handleRollResult);
    return () => {
      window.removeEventListener('character-log-response', handleLogResponse);
      window.removeEventListener('character-roll-result', handleRollResult);
    };
  }, [characterId, fetchLogs]);

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className={styles.tab}>
      <div className={styles.header}>
        <h3 className={styles.title}>Activity Log</h3>
        <button className={styles.refreshBtn} onClick={fetchLogs} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {logs.length === 0 ? (
        <p className={styles.empty}>{loading ? 'Loading…' : 'No activity yet.'}</p>
      ) : (
        <ul className={styles.list}>
          {logs.map(entry => (
            <li key={entry.id} className={styles.entry}>
              <span className={styles.icon} aria-hidden>
                {ACTION_ICON[entry.action_type] ?? '📋'}
              </span>
              <div className={styles.entryBody}>
                <span className={styles.desc}>{entry.description}</span>
                <span className={styles.time}>{formatTime(entry.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
