import { useGameStore } from '@/store';
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
  tableId?: string;
  onConfirm: (targetX: number, targetY: number, costFt: number, path: [number, number][]) => void;
  onCancel: () => void;
}
export function MovementPlanner({ spriteId, realX, realY, speedFt = 30, tableId, onConfirm, onCancel }: Props) {
  const rules = useSessionRulesStore((s) => s.rules);
  const activeTableId = useGameStore((state) => state.activeTableId);
  const geometry = useGameStore((state) => state.planningGeometry);
  const walls = useGameStore((state) => state.walls);
  const grid = useGameStore((state) => state.gridCellPx);
  const cellDistance = useGameStore((state) => state.cellDistance);
  const distanceUnit = useGameStore((state) => state.distanceUnit);

  const [preview, setPreview] = useState<{ x: number; y: number; costFt: number; path: [number, number][] } | null>(null);

  const [error, setError] = useState<string | null>(null);

  // Preview exactly the route that will be submitted.
  useEffect(() => {
    let requestId = 0;
    let disposed = false;
    setPreview(null);
    setError(null);
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-testid="game-canvas"]');
    const handleCanvasClick = async (event: MouseEvent) => {
      if (!canvas || (tableId && tableId !== activeTableId)) return;
      const currentRequest = ++requestId;
      setPreview(null);
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
      const ghost = await planningService.getGhost(spriteId);
      if (disposed || currentRequest !== requestId) return;
      if (!ghost || !Number.isFinite(costFt) || ghost.path.length < 2 || ghost.path.length > 1000) {
        setError('No clear path is available for this move.'); return;
      }
      setError(null);
      setPreview({ x: ghost.preview_x, y: ghost.preview_y, costFt, path: ghost.path });
    };
    canvas?.addEventListener('click', handleCanvasClick, true);
    return () => {
      disposed = true;
      canvas?.removeEventListener('click', handleCanvasClick, true);
      planningService.clearGhost(spriteId);
    };
  }, [spriteId, realX, realY, speedFt, tableId, activeTableId, geometry, walls, grid, cellDistance, distanceUnit, rules]);

  const handleConfirm = () => {
    if (!preview) return;
    onConfirm(preview.x, preview.y, preview.costFt, preview.path);
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
          <span className={styles.warn}>Over movement budget</span>
        )}
      </div>
      {tableId && tableId !== activeTableId && <p>Open the combat table to plan movement.</p>}
      {error && <p role="alert">{error}</p>}
      {preview && <p>Destination: {preview.x}, {preview.y}</p>}
      <div className={styles.actions}>
        <button className={styles.confirmBtn} onClick={handleConfirm} disabled={!preview}>Confirm</button>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
      </div>
      <p className={styles.hint}>Click on canvas to preview movement, then confirm.</p>
    </div>
  );
}
