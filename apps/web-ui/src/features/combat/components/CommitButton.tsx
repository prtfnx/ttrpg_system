import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './CommitButton.module.css';
import { usePlanningStore } from '../stores/planningStore';
import { planningService } from '../services/planning.service';
import { buildPlannedCombatCommands } from '../services/plannedCommand.service';
import { useCombatCommands } from '../hooks/useCombatCommands';
import { useGameModeStore } from '../stores/gameModeStore';
import { useOAStore } from '../stores/oaStore';
import { useCombatStore } from '../stores/combatStore';
import { useGameStore } from '@/store';

export function CommitButton() {
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waitingSequence = useRef<number | null>(null);
  const committedPlan = useRef<string[]>([]);
  const { queue, isPlanningMode, selectedSpriteId, stopPlanning, nextSequenceId,
    markSubmitted, finishSubmission, pendingSubmission, submissionOutcome, recoveryStatus, recoveryError } = usePlanningStore();
  const mode = useGameModeStore((s) => s.mode);
  const activeTableId = useGameStore((s) => s.activeTableId);
  const pendingMovement = useCombatStore((s) => s.combat?.pending_movement);
  const combatId = useCombatStore((s) => s.combat?.combat_id);
  const combatTableId = useCombatStore((s) => s.combat?.table_id);
  const stateVersion = useCombatStore((s) => s.combat?.state_version);
  const selectedSprite = useGameStore((s) => selectedSpriteId ? s.sprites.find((sprite) => sprite.id === selectedSpriteId) : undefined);
  const { sendCommandBatch, sendCommand } = useCombatCommands();

  const sendNext = useCallback(() => {
    if (pendingSubmission || pendingMovement || recoveryStatus) return;
    const remaining = queue.filter((action) => committedPlan.current.includes(action.id));
    if (remaining.length === 0) { setCommitting(false); return; }
    // Each movement is an atomic envelope; it may open a durable reaction window.
    const firstMove = remaining.findIndex((action) => action.action_type === 'move');
    const batch = remaining.slice(0, Math.min(50, firstMove === 0 ? 1 : firstMove < 0 ? remaining.length : firstMove));
    const built = buildPlannedCombatCommands(batch, {
      actorId: selectedSpriteId, tableId: combatTableId ?? activeTableId ?? selectedSprite?.tableId ?? null,
      actorPosition: selectedSprite ? { x: selectedSprite.x, y: selectedSprite.y } : undefined,
    });
    if (!built.ok) { setError(built.error); setCommitting(false); return; }
    const sequenceId = nextSequenceId();
    const payload = { commands: built.commands, sequence_id: sequenceId, ...(combatId ? { combat_id: combatId, expected_state_version: stateVersion } : {}) };
    if (built.commands.some((command) => command.type === 'move')) useOAStore.getState().setPendingCombatCommand(payload);
    waitingSequence.current = sequenceId;
    if (markSubmitted(sequenceId, batch.map((action) => action.id), payload) === false) {
      setCommitting(false); waitingSequence.current = null;
      setError(recoveryError ?? 'The plan must be recovered before sending another step.'); return;
    }
    if (!sendCommandBatch(payload)) {
      finishSubmission(sequenceId, false);
      setCommitting(false);
      setError('Connect to the session before committing your plan.');
    }
  }, [pendingSubmission, pendingMovement, queue, selectedSpriteId, activeTableId, selectedSprite,
    nextSequenceId, markSubmitted, sendCommandBatch, finishSubmission, recoveryStatus, recoveryError, combatId, combatTableId, stateVersion]);

  useEffect(() => {
    if (recoveryStatus) { setCommitting(false); waitingSequence.current = null; return; }
    if (!committing || pendingSubmission) return;
    if (waitingSequence.current !== null) {
      if (submissionOutcome?.sequenceId !== waitingSequence.current) return;
      waitingSequence.current = null;
      if (!submissionOutcome.accepted) {
        setError('The server rejected this step. Review the remaining plan.');
        setCommitting(false); return;
      }
    }
    sendNext();
  }, [committing, pendingSubmission, submissionOutcome, sendNext, recoveryStatus]);

  if (recoveryStatus) return null;
  if ((!isPlanningMode && mode !== 'free_roam' && !pendingMovement?.actor_id) || (queue.length === 0 && !pendingMovement?.actor_id)) return null;
  return <div className={styles.wrapper}>
    {error && <p className={styles.error}>{error}</p>}
    <button className={[styles.btn, pendingSubmission ? styles.pending : ''].join(' ')}
      disabled={committing || Boolean(pendingSubmission) || Boolean(pendingMovement)} onClick={() => {
        committedPlan.current = queue.map((action) => action.id);
        setError(null); setCommitting(true);
      }}>
      {pendingMovement ? 'Waiting for reactions...' : committing ? 'Committing...' : `Commit Turn (${queue.length} action${queue.length !== 1 ? 's' : ''})`}
    </button>
    <button className={styles.cancelBtn} disabled={Boolean(pendingSubmission)} onClick={() => {
      setCommitting(false); waitingSequence.current = null;
      if (pendingMovement?.actor_id) sendCommand({ type: 'cancel_pending_move', actor_id: pendingMovement.actor_id,
        movement_id: pendingMovement.movement_id });
      useOAStore.getState().clearAll();
      stopPlanning(); planningService.clearAll();
    }}>Cancel</button>
    <p>Steps commit in order. Reactions pause movement; a rejected step keeps the remaining plan.</p>
  </div>;
}
