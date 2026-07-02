import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { ChevronDown, ChevronUp, Swords } from 'lucide-react';
import { useState } from 'react';
import { useCombatStore } from '../stores/combatStore';
import { ActionEconomyBar } from './ActionEconomyBar';
import { ActionPanel } from './ActionPanel';
import { CommitButton } from './CommitButton';
import { DMCombatPanel } from './DMCombatPanel';
import { InitiativePanel } from './InitiativePanel';
import { PlanningQueue } from './PlanningQueue';
import styles from './CombatDock.module.css';

export function CombatDock() {
  const combat = useCombatStore((state) => state.combat);
  const role = useGameStore((state) => state.sessionRole);
  const dmMode = isDM(role);
  const [expanded, setExpanded] = useState(true);

  if (!combat && !dmMode) return null;

  const activeCombatants = combat?.combatants.filter((combatant) => !combatant.is_defeated) ?? [];
  const current = combat && activeCombatants.length > 0
    ? activeCombatants[combat.current_turn_index % activeCombatants.length]
    : null;

  return (
    <section className={styles.dock} aria-label="Combat dock">
      <button
        type="button"
        className={styles.header}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={styles.heading}>
          <Swords size={15} aria-hidden />
          {combat ? `Combat · Round ${combat.round_number}` : 'Combat setup'}
        </span>
        <span className={styles.currentName}>
          {current ? `${current.name}'s turn` : 'No active actor'}
        </span>
        {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
      </button>

      {expanded && (
        <div className={styles.body}>
          {combat && (
            <>
              {current && (
                <div className={styles.actorSummary}>
                  <strong>{current.name}</strong>
                  {current.hp != null && current.max_hp != null && (
                    <span>{current.hp}/{current.max_hp} HP</span>
                  )}
                  {current.armor_class != null && <span>AC {current.armor_class}</span>}
                  <span>{current.movement_remaining}ft move</span>
                </div>
              )}
              <ActionEconomyBar />
              <div className={styles.combatGrid}>
                <div className={styles.initiative}>
                  <InitiativePanel />
                </div>
                <div className={styles.actions}>
                  <ActionPanel />
                  <PlanningQueue />
                  <CommitButton />
                </div>
              </div>
            </>
          )}

          {dmMode && (
            <details className={styles.dmTools} open={!combat}>
              <summary>DM controls</summary>
              <DMCombatPanel />
            </details>
          )}
        </div>
      )}
    </section>
  );
}
