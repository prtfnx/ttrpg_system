import { useGameStore } from '@/store';
import { useWasmRuntime } from '@lib/wasm/runtime';
import { logger } from '@shared/utils/logger';
import { useCallback, useEffect } from 'react';

function finiteNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function runtimeSpriteId(sprite: Record<string, unknown>): string | null {
  const value = sprite.id ?? sprite.sprite_id;
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function useSpriteSyncing() {
  const addSprite = useGameStore(state => state.addSprite);
  const removeSprite = useGameStore(state => state.removeSprite);
  const updateSprite = useGameStore(state => state.updateSprite);
  const wasmRuntime = useWasmRuntime();

  const syncSprites = useCallback(() => {
    try {
      const tableSync = wasmRuntime.getTableSync();
      if (!tableSync) return;

      // Get current sprites from store
      const sprites = useGameStore.getState().sprites;
      
      const rustSprites = tableSync.get_sprites();
      
      if (!Array.isArray(rustSprites)) return;

      // Convert Rust sprite data to our format
      const convertedSprites = rustSprites.flatMap((rustSprite: Record<string, unknown>) => {
        const id = runtimeSpriteId(rustSprite);
        if (!id) {
          logger.warn('[SpriteSyncing] Ignoring runtime sprite without a stable ID');
          return [];
        }
        return [{
          id,
          tableId: String(rustSprite.table_id || useGameStore.getState().activeTableId || ''),
          characterId: rustSprite.character_id as string | undefined,
          controlledBy: rustSprite.controlled_by as number[] | undefined,
          x: finiteNumber(rustSprite.x, finiteNumber(rustSprite.world_x, 0)),
          y: finiteNumber(rustSprite.y, finiteNumber(rustSprite.world_y, 0)),
          layer: String(rustSprite.layer || 'tokens'),
          texture: String(rustSprite.texture_id || rustSprite.texture || ''),
          scale: {
            x: finiteNumber(rustSprite.scale_x, finiteNumber(rustSprite.width, 32) / 32),
            y: finiteNumber(rustSprite.scale_y, finiteNumber(rustSprite.height, 32) / 32),
          },
          rotation: finiteNumber(rustSprite.rotation, 0),
        }];
      });

      // Update store with current sprites from Rust
      // For now, replace all sprites (can be optimized later for incremental updates)
      const currentSpriteIds = new Set(sprites.map((s) => s.id));
      const rustSpriteIds = new Set(convertedSprites.map(s => s.id));

      // Remove sprites that no longer exist in Rust
      sprites.forEach((sprite) => {
        if (!rustSpriteIds.has(sprite.id)) {
          removeSprite(sprite.id);
        }
      });

      // Add or update sprites from Rust
      convertedSprites.forEach(sprite => {
        const spriteWithName = { ...sprite, name: 'Unnamed Sprite' };
        if (!currentSpriteIds.has(sprite.id)) {
          addSprite(spriteWithName as import('@/types').Sprite);
        } else {
          // IMPORTANT: Only update if WASM-managed fields actually changed
          // WASM manages: x, y, rotation, scale, texture, layer
          // React manages: characterId, hp, maxHp, ac, auraRadius, controlledBy
          const existingSprite = sprites.find((s) => s.id === sprite.id);
          
          if (!existingSprite) return;
          
          // Check if any WASM-managed fields changed
          const hasChanges = 
            existingSprite.x !== spriteWithName.x ||
            existingSprite.y !== spriteWithName.y ||
            existingSprite.rotation !== spriteWithName.rotation ||
            existingSprite.scale?.x !== spriteWithName.scale.x ||
            existingSprite.scale?.y !== spriteWithName.scale.y ||
            existingSprite.texture !== spriteWithName.texture ||
            existingSprite.layer !== spriteWithName.layer ||
            existingSprite.tableId !== spriteWithName.tableId;
          
          // Only update if something changed
          if (hasChanges) {
            updateSprite(sprite.id, {
              x: spriteWithName.x,
              y: spriteWithName.y,
              rotation: spriteWithName.rotation,
              scale: spriteWithName.scale,
              texture: spriteWithName.texture,
              layer: spriteWithName.layer,
              tableId: spriteWithName.tableId,
              // Preserve React-managed fields from existing sprite
              characterId: existingSprite.characterId,
              hp: existingSprite.hp,
              maxHp: existingSprite.maxHp,
              ac: existingSprite.ac,
              auraRadius: existingSprite.auraRadius,
              controlledBy: existingSprite.controlledBy,
              name: existingSprite.name || 'Unnamed Sprite',
            });
          }
        }
      });

    } catch (error) {
      logger.warn('[SpriteSyncing] Error syncing sprites from Rust', error);
    }
  }, [addSprite, removeSprite, updateSprite, wasmRuntime]);

  // Sync sprites from Rust backend
  useEffect(() => {
    // Initial sync only; live updates come via WebSocket events
    syncSprites();
  }, [syncSprites]);

  return {
    manualSync: syncSprites
  };
}
