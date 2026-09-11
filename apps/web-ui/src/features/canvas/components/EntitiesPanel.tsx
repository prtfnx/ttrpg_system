import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { useWasmStatus } from '@lib/wasm/runtime';
import { AlertTriangle, Check, LoaderCircle } from 'lucide-react';
import clsx from 'clsx';
import styles from './EntitiesPanel.module.css';

export function EntitiesPanel() {
  const sprites = useGameStore(state => state.sprites);
  const selectedSprites = useGameStore(state => state.selectedSprites);
  const selectSprite = useGameStore(state => state.selectSprite);
  const activeTableId = useGameStore(state => state.activeTableId);
  const switchToTable = useGameStore(state => state.switchToTable);
  const sessionRole = useGameStore(state => state.sessionRole);
  const visibleLayers = useGameStore(state => state.visibleLayers);
  const wasmStatus = useWasmStatus();

  const isHydrated = activeTableId !== null && wasmStatus.hydratedTableId === activeTableId;
  const isWaiting = activeTableId !== null && !isHydrated && !wasmStatus.tableHydrationError;
  const visibleSprites = isDM(sessionRole)
    ? sprites
    : sprites.filter(sprite => {
        if (visibleLayers.length > 0 && !visibleLayers.includes(sprite.layer)) return false;
        return sprite.isVisible !== false;
      });

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Entities ({visibleSprites.length})</h2>
        <div className={styles.controls} aria-live="polite">
          {wasmStatus.tableHydrationError && (
            <>
              <span
                className={clsx(styles.status, styles.statusError)}
                title={wasmStatus.tableHydrationError.message}
              >
                <AlertTriangle size={12} aria-hidden /> Load failed
              </span>
              {activeTableId && (
                <button
                  type="button"
                  onClick={() => switchToTable(activeTableId)}
                  className={styles.refreshButton}
                >
                  Retry
                </button>
              )}
            </>
          )}
          {isWaiting && (
            <span className={styles.status}>
              <LoaderCircle size={12} aria-hidden /> Loading table…
            </span>
          )}
          {isHydrated && (
            <span className={clsx(styles.status, styles.statusSuccess)}>
              <Check size={12} aria-hidden /> Synchronized
            </span>
          )}
        </div>
      </div>

      <div className={styles.spriteList}>
        {visibleSprites.length === 0 ? (
          <div className={styles.emptyState}>
            <p>{isWaiting ? 'Waiting for the table snapshot…' : 'No sprites on the map'}</p>
          </div>
        ) : (
          visibleSprites.map(sprite => {
            const scale = sprite.scale && typeof sprite.scale.x === 'number' && typeof sprite.scale.y === 'number'
              ? sprite.scale
              : { x: 1, y: 1 };
            return (
              <button
                type="button"
                key={sprite.id}
                className={clsx(styles.spriteItem, selectedSprites.includes(sprite.id) && styles.spriteItemSelected)}
                onClick={() => selectSprite(sprite.id)}
                aria-pressed={selectedSprites.includes(sprite.id)}
              >
                <span className={styles.spriteName}>{sprite.name} ({sprite.id})</span>
                <span className={styles.spriteMeta}>Position: ({sprite.x}, {sprite.y})</span>
                <span className={styles.spriteMeta}>Layer: {sprite.layer}</span>
                <span className={styles.spriteMeta}>Scale: {scale.x.toFixed(2)} x {scale.y.toFixed(2)}</span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
