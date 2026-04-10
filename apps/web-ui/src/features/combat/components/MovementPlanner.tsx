import { useEffect, useRef } from 'react';
import styles from './MovementPlanner.module.css';
import { planningService } from '../services/planning.service';
import { useSessionRulesStore } from '../stores/sessionRulesStore';

interface Props {
  spriteId: string;
  realX: number;
  realY: number;
  speedFt?: number;
  onConfirm: (targetX: number, targetY: number, costFt: number) => void;
  onCancel: () => void;
}

export function MovementPlanner({ spriteId, realX, realY, speedFt = 30, onConfirm, onCancel }: Props) {
  const rules = useSessionRulesStore((s) => s.rules);
  const diagonal5105 = rules?.diagonal_movement_rule === 'alternate';

  const costRef = useRef(0);
  const targetRef = useRef({ x: realX, y: realY });

  // Pre-compute movement range on mount
  useEffect(() => {
    planningService.movementRange(realX, realY, speedFt, diagonal5105);
    return () => { planningService.clearGhost(spriteId); };
  }, [spriteId, realX, realY, speedFt, diagonal5105]);

  const handleConfirm = () => {
    const ghost = targetRef.current;
    onConfirm(ghost.x, ghost.y, costRef.current);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Move</span>
        <span className={styles.cost}>
          Cost: <strong>{Math.round(costRef.current)}ft</strong> / {speedFt}ft
        </span>
      </div>
      <div className={styles.overBudget}>
        {costRef.current > speedFt && (
          <span className={styles.warn}>Over movement speed — uses Dash action</span>
        )}
      </div>
      <div className={styles.actions}>
        <button className={styles.confirmBtn} onClick={handleConfirm}>Confirm</button>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
      </div>
      <p className={styles.hint}>Click on canvas to preview movement, then confirm.</p>
    </div>
  );
}

MovementPlanner.handleCanvasClick = async (
  spriteId: string,
  realX: number,
  realY: number,
  clickX: number,
  clickY: number,
  speedFt: number
): Promise<number> => {
  return planningService.startGhost(spriteId, realX, realY, clickX, clickY, speedFt);
};
