import styles from './ActionEconomyBar.module.css';
import { useCombatStore } from '../stores/combatStore';
import { useGameStore } from '@/store';

export function ActionEconomyBar() {
  const combat = useCombatStore((s) => s.combat);
  const userId = useGameStore((s) => s.userId);

  if (!combat || combat.phase !== 'active') return null;

  const active = combat.combatants.filter((c) => !c.is_defeated);
  const current = active[combat.current_turn_index % Math.max(active.length, 1)];
  if (!current || userId === null || !current.controlled_by.includes(String(userId))) return null;

  return (
    <div className={styles.bar}>
      <Pip label="Action" used={!current.has_action} />
      <Pip label="Bonus" used={!current.has_bonus_action} />
      <Pip label="Reaction" used={!current.has_reaction} />
      <div className={styles.move}>
        <span className={styles.movePips}>
          {Array.from({ length: Math.ceil(current.movement_speed / 5) }).map((_, i) => (
            <span
              key={i}
              className={[
                styles.movePip,
                i < Math.ceil(current.movement_remaining / 5) ? styles.moveAvail : styles.moveUsed,
              ].join(' ')}
            />
          ))}
        </span>
        <span className={styles.moveLabel}>{current.movement_remaining}ft</span>
      </div>
    </div>
  );
}

function Pip({ label, used }: { label: string; used: boolean }) {
  return (
    <div className={[styles.pip, used ? styles.pipUsed : styles.pipAvail].join(' ')}>
      {label}
    </div>
  );
}
