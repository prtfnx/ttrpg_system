import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { useWasmRuntime } from '@lib/wasm/runtime';
import { logger } from '@shared/utils/logger';
import { AlertTriangle, Check } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState, type CSSProperties } from 'react';
import styles from './EntitiesPanel.module.css';

interface SyncState {
  status: 'idle' | 'syncing' | 'error' | 'success';
  error?: string;
  lastSync?: Date;
  progress?: number;
}

export function EntitiesPanel() {
  const { sprites, selectedSprites, selectSprite, addSprite, removeSprite, updateSprite } = useGameStore()
  const sessionRole = useGameStore(s => s.sessionRole);
  const visibleLayers = useGameStore(s => s.visibleLayers);
  const wasmRuntime = useWasmRuntime();
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle' })

  // Validate and transform sprite data from WASM
  const validateAndTransformSprite = (rustSprite: Record<string, unknown>) => {
    if (!rustSprite || typeof rustSprite !== 'object') {
      throw new Error('Invalid sprite data object');
    }

    const spriteId = rustSprite.id || rustSprite.sprite_id;
    if (!spriteId) {
      throw new Error('Missing sprite ID');
    }

    return {
      id: String(spriteId),
      name: rustSprite.name || rustSprite.sprite_name || `Sprite ${spriteId}`,
      x: Number(rustSprite.x || rustSprite.world_x || 0),
      y: Number(rustSprite.y || rustSprite.world_y || 0),
      width: Number(rustSprite.width || rustSprite.size_x || 50),
      height: Number(rustSprite.height || rustSprite.size_y || 50),
      layer: String(rustSprite.layer || 'tokens'),
      isSelected: Boolean(rustSprite.isSelected || false),
      isVisible: rustSprite.visible !== false,
    };
  };

  // Function to manually sync sprites from Rust backend with comprehensive error handling
  const syncSpritesFromRust = async () => {
    setSyncState({ status: 'syncing', progress: 0 });
    
    try {
      // Validate WASM availability
      const tableSync = wasmRuntime.getTableSync();
      if (!tableSync) {
        throw new Error('WASM table sync not available');
      }

      setSyncState(prev => ({ ...prev, progress: 25 }));

      const rustSprites = tableSync.get_sprites();
      
      if (!Array.isArray(rustSprites)) {
        throw new Error('Invalid sprite data format from WASM');
      }
      
      setSyncState(prev => ({ ...prev, progress: 50 }));
      
      // Process sprites with validation
      const processedSprites: ReturnType<typeof validateAndTransformSprite>[] = [];
      const errors: string[] = [];
      
      for (const rustSprite of rustSprites) {
        try {
          const sprite = validateAndTransformSprite(rustSprite);
          processedSprites.push(sprite);
        } catch (error) {
          errors.push(`Sprite ${rustSprite.id}: ${error instanceof Error ? error.message : 'Invalid data'}`);
        }
      }
      
      setSyncState(prev => ({ ...prev, progress: 75 }));
      
      // Create a map of existing sprites for efficient lookup
      const existingSprites = new Map(sprites.map(s => [s.id, s]))
      const rustSpriteIds = new Set()
      
      // Process each validated sprite
      processedSprites.forEach((sprite) => {
        rustSpriteIds.add(sprite.id)
        
        if (existingSprites.has(sprite.id)) {
          // Update existing sprite
          updateSprite(sprite.id, sprite as unknown as Parameters<typeof updateSprite>[1])
        } else {
          // Add new sprite
          addSprite(sprite as unknown as Parameters<typeof addSprite>[0])
        }
      })
      
      // Remove sprites that no longer exist in Rust
      sprites.forEach(sprite => {
        if (!rustSpriteIds.has(sprite.id)) {
          removeSprite(sprite.id)
        }
      })

      setSyncState({
        status: 'success',
        lastSync: new Date(),
        progress: 100
      });
      
      if (errors.length > 0) {
        logger.warn('Sprite sync completed with warnings', { errors });
      }
      
      logger.debug('[EntitiesPanel] Successfully synced sprites from Rust', { count: processedSprites.length })
      
    } catch (error) {
      setSyncState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown sync error',
        progress: 0
      });
      logger.error('[EntitiesPanel] Error syncing sprites', error)
    }
  }

  // Auto-sync on mount and when sprite events occur
  useEffect(() => {
    syncSpritesFromRust()
    
    // Listen for custom sprite addition events
    const handleSpriteAdded = () => {
      setTimeout(syncSpritesFromRust, 500) // Small delay to ensure sprite is processed
    }
    
    window.addEventListener('spriteAdded', handleSpriteAdded)
    
    return () => {
      window.removeEventListener('spriteAdded', handleSpriteAdded)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: sync once on mount
  }, []) // Remove dependencies to avoid constant re-syncing

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Entities ({sprites.length})</h2>
        <div className={styles.controls} aria-live="polite">
          {syncState.status === 'error' && (
            <span className={clsx(styles.status, styles.statusError)} title={syncState.error}>
              <AlertTriangle size={12} aria-hidden /> Sync Error
            </span>
          )}
          {syncState.status === 'success' && syncState.lastSync && (
            <span className={clsx(styles.status, styles.statusSuccess)}>
              <Check size={12} aria-hidden /> {new Date(syncState.lastSync).toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={syncSpritesFromRust}
            disabled={syncState.status === 'syncing'}
            className={styles.refreshButton}
          >
            {syncState.status === 'syncing' ? (
              syncState.progress ? `Syncing... ${syncState.progress}%` : 'Syncing...'
            ) : 'Refresh'}
          </button>
        </div>
      </div>
      
      <div className={styles.spriteList}>
        {(() => {
          const visibleSprites = isDM(sessionRole)
            ? sprites
            : sprites.filter(s => {
                if (visibleLayers.length > 0 && !visibleLayers.includes(s.layer)) return false;
                return s.isVisible !== false;
              });
          return visibleSprites.length === 0 ? (
          <div className={styles.emptyState}>
            {syncState.status === 'syncing' ? (
              <div>
                <div>Syncing sprites...</div>
                {syncState.progress && (
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFill}
                      style={{ '--sync-progress': `${syncState.progress}%` } as CSSProperties}
                    />
                  </div>
                )}
              </div>
            ) : (
              <p>No sprites on the map</p>
            )}
          </div>
        ) : (
          visibleSprites.map((sprite) => {
            // Provide fallback for scale if missing
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
        );
        })()}
      </div>
    </section>
  )
}
