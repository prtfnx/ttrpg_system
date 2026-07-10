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
import { EncounterBuilder } from './EncounterBuilder';
import { GameModeSwitch } from './GameModeSwitch';
import { InitiativePanel } from './InitiativePanel';
import { MovementPlanner } from './MovementPlanner';
import { PlanningQueue } from './PlanningQueue';
import styles from './CombatDock.module.css';
import { usePlanningStore } from '../stores/planningStore';

export function CombatDock() {
  const combat = useCombatStore((state) => state.combat);
  const role = useGameStore((state) => state.sessionRole);
  const userId = useGameStore((state) => state.userId);
  const sprites = useGameStore((state) => state.sprites);
  const dmMode = isDM(role);
  const [expanded, setExpanded] = useState(true);
  const { selectedCombatant, selectedCombatantId, selectCombatant } = useCombatSelection();
  const isPlanningMode = usePlanningStore((state) => state.isPlanningMode);
  const selectedSpriteId = usePlanningStore((state) => state.selectedSpriteId);
  const startPlanning = usePlanningStore((state) => state.startPlanning);
  const stopPlanning = usePlanningStore((state) => state.stopPlanning);
  const addAction = usePlanningStore((state) => state.addAction);

  if (!combat && !dmMode) return null;

  const activeCombatants = combat?.combatants.filter((combatant) => !combatant.is_defeated) ?? [];
  const current = combat && activeCombatants.length > 0
    ? activeCombatants[combat.current_turn_index % activeCombatants.length]
    : null;
  const canPlan = !!current && (
    dmMode
    || (userId !== null && current.controlled_by.includes(String(userId)))
  );
  const planningSprite = selectedSpriteId
    ? sprites.find((sprite) => sprite.id === selectedSpriteId)
    : undefined;

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
              {canPlan && (
                <div className={styles.planningControls}>
                  <button
                    type="button"
                    onClick={() => (
                      isPlanningMode
                        ? stopPlanning()
                        : startPlanning(current.entity_id)
                    )}
                  >
                    {isPlanningMode ? 'Stop planning' : 'Plan turn'}
                  </button>
                </div>
              )}
              <div className={styles.combatGrid}>
                <div className={styles.initiative}>
                  <InitiativePanel />
                </div>
                <div className={styles.actions}>
                  {isPlanningMode && planningSprite && current && (
                    <MovementPlanner
                      spriteId={planningSprite.id}
                      realX={planningSprite.x}
                      realY={planningSprite.y}
                      speedFt={current.movement_remaining}
                      onConfirm={(targetX, targetY, costFt) => addAction({
                        id: globalThis.crypto?.randomUUID?.() ?? `move-${Date.now()}`,
                        action_type: 'move',
                        label: 'Move',
                        target_x: targetX,
                        target_y: targetY,
                        cost_ft: costFt,
                        cost_type: 'movement',
                      })}
                      onCancel={stopPlanning}
                    />
                  )}
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
              <EncounterBuilder />
              <DMCombatPanel />
            </details>
          )}
        </div>
      )}
    </section>
  );
}
