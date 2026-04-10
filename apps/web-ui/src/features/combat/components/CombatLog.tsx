import { useEffect, useRef } from 'react';
import styles from './CombatLog.module.css';
import { useCombatStore } from '../stores/combatStore';

interface LogEntry {
  round?: number;
  turn?: number;
  action_type?: string;
  actor_name?: string;
  target_name?: string;
  result?: string;
  damage?: number;
  healing?: number;
  timestamp?: number;
  [key: string]: unknown;
}

export function CombatLog() {
  const log = useCombatStore((s) => s.combat?.action_log ?? []) as LogEntry[];
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  if (!log.length) return <div className={styles.empty}>No actions yet.</div>;

  return (
    <div className={styles.log}>
      {log.map((entry, i) => (
        <div key={i} className={styles.entry}>
          {entry.round != null && (
            <span className={styles.round}>R{entry.round}</span>
          )}
          <span className={styles.actor}>{entry.actor_name ?? '?'}</span>
          {entry.action_type && (
            <span className={styles.action}>{entry.action_type}</span>
          )}
          {entry.target_name && (
            <span className={styles.target}>→ {entry.target_name}</span>
          )}
          {entry.damage != null && (
            <span className={styles.damage}>-{entry.damage} dmg</span>
          )}
          {entry.healing != null && (
            <span className={styles.healing}>+{entry.healing} hp</span>
          )}
          {entry.result && (
            <span className={styles.result}>{entry.result}</span>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
