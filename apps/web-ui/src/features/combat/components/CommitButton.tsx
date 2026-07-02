import { useState } from 'react';
import styles from './CommitButton.module.css';
import { usePlanningStore } from '../stores/planningStore';
import { planningService } from '../services/planning.service';
import { buildPlannedCombatCommands } from '../services/plannedCommand.service';
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

    const actorId = selectedSpriteId;
    const tableId = activeTableId ?? selectedSprite?.tableId;

    const built = buildPlannedCombatCommands(queue, {
      actorId,
      tableId: tableId ?? null,
      actorPosition: selectedSprite
        ? { x: selectedSprite.x, y: selectedSprite.y }
        : undefined,
    });
    if (!built.ok) {
      setError(built.error);
      setPending(false);
      return;
    }

    const sequenceId = nextSequenceId();
    const payload = {
      commands: built.commands,
      sequence_id: sequenceId,
    };

    if (built.commands.some((command) => command.type === 'move')) {
      setPendingCombatCommand(payload);
    }
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

