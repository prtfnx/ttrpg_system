import { useState } from 'react';
import styles from './CommitButton.module.css';
import { usePlanningStore } from '../stores/planningStore';
import { planningService } from '../services/planning.service';
import { useCombatCommands } from '../hooks/useCombatCommands';
import { useGameModeStore } from '../stores/gameModeStore';
import { useOAStore } from '../stores/oaStore';
import { useGameStore } from '@/store';

export function CommitButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { queue, isPlanningMode, selectedSpriteId, stopPlanning, nextSequenceId } = usePlanningStore();
  const mode = useGameModeStore((s) => s.mode);
  const activeTableId = useGameStore((s) => s.activeTableId);
  const { sendCommandBatch } = useCombatCommands();
  const setPendingCombatCommand = useOAStore((s) => s.setPendingCombatCommand);
  const selectedSprite = useGameStore((s) =>
    selectedSpriteId ? s.sprites.find((sprite) => sprite.id === selectedSpriteId) : undefined
  );

  // Only visible in planning mode with queued actions, or in FREE_ROAM always
  if (!isPlanningMode && mode !== 'free_roam') return null;
  if (queue.length === 0) return null;

  const commit = async () => {
    setError(null);
    setPending(true);

    const sequenceId = nextSequenceId();
    const actorId = selectedSpriteId;
    const tableId = activeTableId ?? selectedSprite?.tableId;

    if (!actorId || !tableId || !selectedSprite) {
      setError('Select a token before committing movement.');
      setPending(false);
      return;
    }

    const commands: Array<Record<string, unknown>> = [];
    for (const action of queue) {
      if (action.action_type !== 'move') {
        setError(`Unsupported planned action: ${action.action_type}`);
        setPending(false);
        return;
      }
      if (action.target_x == null || action.target_y == null || action.cost_ft == null) {
        setError('Movement plan is missing destination or cost.');
        setPending(false);
        return;
      }
      commands.push({
        type: 'move',
        actor_id: actorId,
        table_id: tableId,
        from_x: selectedSprite.x,
        from_y: selectedSprite.y,
        target_x: action.target_x,
        target_y: action.target_y,
        cost_ft: action.cost_ft,
        path: action.path ?? [],
      });
    }

    const payload = {
      commands,
      sequence_id: sequenceId,
    };

    setPendingCombatCommand(payload);
    sendCommandBatch(payload);

    // Queue cleared and planning stopped by ACTION_RESULT / ACTION_REJECTED handlers
    setPending(false);
  };

  return (
    <div className={styles.wrapper}>
      {error && <p className={styles.error}>{error}</p>}
      <button
        className={[styles.btn, pending ? styles.pending : ''].join(' ')}
        onClick={commit}
        disabled={pending}
      >
        {pending ? 'Sending...' : `Commit Turn (${queue.length} action${queue.length !== 1 ? 's' : ''})`}
      </button>
      <button className={styles.cancelBtn} onClick={() => {
        stopPlanning();
        planningService.clearAll();
      }}>
        Cancel
      </button>
    </div>
  );
}

