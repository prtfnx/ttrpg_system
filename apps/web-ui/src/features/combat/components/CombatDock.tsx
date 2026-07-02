import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { ChevronDown, ChevronUp, Swords } from 'lucide-react';
import { useState } from 'react';
import { useCombatSelection } from '../hooks/useCombatSelection';
import { useCombatStore } from '../stores/combatStore';
import { ActionEconomyBar } from './ActionEconomyBar';
import { ActionPanel } from './ActionPanel';
import { CommitButton } from './CommitButton';
import { DMCombatPanel } from './DMCombatPanel';
import { GameModeSwitch } from './GameModeSwitch';
import { InitiativePanel } from './InitiativePanel';
import { PlanningQueue } from './PlanningQueue';
import styles from './CombatDock.module.css';

export function CombatDock() {
  const combat = useCombatStore((state) => state.combat);
  const role = useGameStore((state) => state.sessionRole);
  const dmMode = isDM(role);
  const [expanded, setExpanded] = useState(true);
  const { selectedCombatant, selectedCombatantId, selectCombatant } = useCombatSelection();

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
                  <select
                    aria-label="Inspect combatant"
                    value={selectedCombatantId}
                    onChange={(event) => selectCombatant(event.target.value)}
                  >
                    {combat.combatants.map((combatant) => (
                      <option key={combatant.combatant_id} value={combatant.combatant_id}>
                        {combatant.name}
                      </option>
                    ))}
                  </select>
                  {selectedCombatant?.hp != null && selectedCombatant.max_hp != null && (
                    <span>{selectedCombatant.hp}/{selectedCombatant.max_hp} HP</span>
                  )}
                  {selectedCombatant?.armor_class != null && <span>AC {selectedCombatant.armor_class}</span>}
                  {selectedCombatant && <span>{selectedCombatant.movement_remaining}ft move</span>}
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
              <GameModeSwitch />
              <DMCombatPanel />
            </details>
          )}
        </div>
      )}
    </section>
  );
}
