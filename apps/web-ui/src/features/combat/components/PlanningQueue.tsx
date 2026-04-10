import styles from './PlanningQueue.module.css';
import { usePlanningStore } from '../stores/planningStore';
import { useCombatStore } from '../stores/combatStore';

// Icons for action types
const ACTION_ICONS: Record<string, string> = {
  move: '👣',
  attack: '⚔️',
  cast_spell: '✨',
  use_item: '🎒',
  dodge: '🛡️',
  dash: '💨',
  disengage: '↩️',
  hide: '👤',
  help: '🤝',
  ready: '⏱️',
  bonus_action: '⚡',
  reaction: '🔄',
};

export function PlanningQueue() {
  const { queue, removeAction, clearQueue, isPlanningMode } = usePlanningStore();
  const combat = useCombatStore((s) => s.combat);

  if (!isPlanningMode || queue.length === 0) return null;

  // Resource summary
  const usedAction   = queue.some((a) => a.cost_type === 'action');
  const usedBonus    = queue.some((a) => a.cost_type === 'bonus_action');
  const usedReaction = queue.some((a) => a.cost_type === 'reaction');
  const totalMove    = queue.filter((a) => a.action_type === 'move')
                            .reduce((s, a) => s + (a.cost_ft ?? 0), 0);

  const current = combat ? (() => {
    const combatants = combat.combatants || [];
    return combatants[combat.current_turn_index] ?? null;
  })() : null;
  const speedFt = current?.movement_speed ?? 30;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Planned Actions</span>
        <button className={styles.clearBtn} onClick={clearQueue}>Clear All</button>
      </div>

      <ul className={styles.list}>
        {queue.map((action) => (
          <li key={action.id} className={styles.item}>
            <span className={styles.icon}>{ACTION_ICONS[action.action_type] ?? '▸'}</span>
            <span className={styles.label}>{action.label}</span>
            {action.cost_ft != null && (
              <span className={styles.ftCost}>{Math.round(action.cost_ft)}ft</span>
            )}
            <button className={styles.removeBtn} onClick={() => removeAction(action.id)}>✕</button>
          </li>
        ))}
      </ul>

      <div className={styles.footer}>
        <span className={[styles.badge, usedAction   ? styles.used : ''].join(' ')}>Action</span>
        <span className={[styles.badge, usedBonus    ? styles.used : ''].join(' ')}>Bonus</span>
        <span className={[styles.badge, usedReaction ? styles.used : ''].join(' ')}>React</span>
        <span className={[styles.moveBadge, totalMove > speedFt ? styles.overBudget : ''].join(' ')}>
          {Math.round(totalMove)}/{speedFt}ft
        </span>
      </div>
    </div>
  );
}
