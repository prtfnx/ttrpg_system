import { getCurrentWasmRuntime } from '@lib/wasm/runtime';
import { useEffect, useState } from 'react';
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

  const [preview, setPreview] = useState<{ x: number; y: number; costFt: number } | null>(null);

  // Pre-compute movement range on mount
  useEffect(() => {
    planningService.movementRange(realX, realY, speedFt, diagonal5105);
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-testid="game-canvas"]');
    const handleCanvasClick = async (event: MouseEvent) => {
      if (!canvas) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      const screenX = (event.clientX - rect.left) * scaleX;
      const screenY = (event.clientY - rect.top) * scaleY;
      const renderer = getCurrentWasmRuntime()?.getRenderEngine();
      const world = renderer?.screen_to_world(screenX, screenY);
      const targetX = Number(world?.[0] ?? screenX);
      const targetY = Number(world?.[1] ?? screenY);
      const costFt = await planningService.startGhost(
        spriteId,
        realX,
        realY,
        targetX,
        targetY,
        speedFt,
      );
      setPreview({ x: targetX, y: targetY, costFt });
    };
    canvas?.addEventListener('click', handleCanvasClick, true);
    return () => {
      canvas?.removeEventListener('click', handleCanvasClick, true);
      planningService.clearGhost(spriteId);
    };
  }, [spriteId, realX, realY, speedFt, diagonal5105]);

  const handleConfirm = () => {
    if (!preview) return;
    onConfirm(preview.x, preview.y, preview.costFt);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Move</span>
        <span className={styles.cost}>
          Cost: <strong>{Math.round(preview?.costFt ?? 0)}ft</strong> / {speedFt}ft
        </span>
      </div>
      <div className={styles.overBudget}>
        {(preview?.costFt ?? 0) > speedFt && (
          <span className={styles.warn}>Over movement speed — uses Dash action</span>
        )}
      </div>
      <div className={styles.actions}>
        <button className={styles.confirmBtn} onClick={handleConfirm} disabled={!preview}>Confirm</button>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
      </div>
      <p className={styles.hint}>Click on canvas to preview movement, then confirm.</p>
    </div>
  );
}
