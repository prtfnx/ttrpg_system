import styles from './ConditionBadges.module.css';
import type { ActiveCondition } from '../stores/combatStore';

interface Props {
  conditions: ActiveCondition[];
}

export function ConditionBadges({ conditions }: Props) {
  if (!conditions.length) return null;

  return (
    <div className={styles.badges}>
      {conditions.map((c) => (
        <span
          key={c.condition_id}
          className={styles.badge}
          style={{ background: `var(--condition-${c.condition_type}, var(--condition-default))` }}
          title={c.duration_remaining != null ? `${c.condition_type} (${c.duration_remaining}r)` : c.condition_type}
        >
          {c.condition_type.slice(0, 3).toUpperCase()}
        </span>
      ))}
    </div>
  );
}
