import { useState } from 'react';
import styles from './CommitButton.module.css';
import { usePlanningStore } from '../stores/planningStore';
import { ProtocolService } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import { planningService } from '../services/planning.service';
import { useGameModeStore } from '../stores/gameModeStore';

export function CommitButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { queue, isPlanningMode, stopPlanning, nextSequenceId } = usePlanningStore();
  const mode = useGameModeStore((s) => s.mode);

  // Only visible in planning mode with queued actions, or in FREE_ROAM always
  if (!isPlanningMode && mode !== 'free_roam') return null;
  if (queue.length === 0) return null;

  const commit = async () => {
    setError(null);
    setPending(true);

    const sequenceId = nextSequenceId();
    const actions = queue.map((a) => ({
      action_type: a.action_type,
      target_x: a.target_x,
      target_y: a.target_y,
      target_id: a.target_id,
      spell_id: a.spell_id,
      item_id: a.item_id,
      path: a.path,
      sequence_index: a.sequence_index,
    }));

    ProtocolService.getProtocol()?.sendMessage(
      createMessage(MessageType.ACTION_COMMIT, {
        actions,
        sequence_id: sequenceId,
      })
    );

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
        {pending ? 'Sending…' : `Commit Turn (${queue.length} action${queue.length !== 1 ? 's' : ''})`}
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

