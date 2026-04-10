import styles from './ConditionBadges.module.css';
import type { ActiveCondition } from '../stores/combatStore';

const CONDITION_COLORS: Record<string, string> = {
  poisoned: '#6ab04c',
  blinded: '#888',
  stunned: '#f9ca24',
  paralyzed: '#e55039',
  incapacitated: '#e55039',
  charmed: '#e84393',
  frightened: '#6c5ce7',
  grappled: '#a29bfe',
  prone: '#fdcb6e',
  restrained: '#fd79a8',
  exhaustion: '#b2bec3',
  unconscious: '#2d3436',
  petrified: '#636e72',
  invisible: '#dfe6e9',
  concentration: '#0984e3',
  dead: '#2d3436',
};

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
          style={{ background: CONDITION_COLORS[c.condition_type] ?? '#74b9ff' }}
          title={c.duration_remaining != null ? `${c.condition_type} (${c.duration_remaining}r)` : c.condition_type}
        >
          {c.condition_type.slice(0, 3).toUpperCase()}
        </span>
      ))}
    </div>
  );
}
