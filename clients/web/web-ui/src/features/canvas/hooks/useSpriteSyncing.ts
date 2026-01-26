import { useCallback, useEffect } from 'react';
import { useGameStore } from '../store';

export function useSpriteSyncing() {
  const addSprite = useGameStore(state => state.addSprite);
  const removeSprite = useGameStore(state => state.removeSprite);
  const updateSprite = useGameStore(state => state.updateSprite);

  const syncSprites = useCallback(() => {
    if (!window.rustRenderManager) return;

    try {
      // Get current sprites from store
      const sprites = useGameStore.getState().sprites;
      
      // Get all sprites from the Rust backend
      const rustSprites = window.rustRenderManager.get_all_sprites_network_data();
      
      if (!Array.isArray(rustSprites)) return;

      // Convert Rust sprite data to our format
      const convertedSprites = rustSprites.map((rustSprite: any) => ({
        id: rustSprite.id || rustSprite.sprite_id || Math.random().toString(),
        tableId: rustSprite.table_id || useGameStore.getState().activeTableId || '',
        characterId: rustSprite.character_id,
        controlledBy: rustSprite.controlled_by,
        x: rustSprite.x || rustSprite.world_x || 0,
        y: rustSprite.y || rustSprite.world_y || 0,
        layer: rustSprite.layer || 'tokens',
        texture: rustSprite.texture_id || rustSprite.texture || '',
        scale: {
          x: rustSprite.scale_x || (rustSprite.width ? rustSprite.width / 32 : 1),
          y: rustSprite.scale_y || (rustSprite.height ? rustSprite.height / 32 : 1)
        },
        rotation: rustSprite.rotation || 0
      }));

      // Update store with current sprites from Rust
      // For now, replace all sprites (can be optimized later for incremental updates)
      const currentSpriteIds = new Set(sprites.map((s: any) => s.id));
      const rustSpriteIds = new Set(convertedSprites.map(s => s.id));

      // Remove sprites that no longer exist in Rust
      sprites.forEach((sprite: any) => {
        if (!rustSpriteIds.has(sprite.id)) {
          removeSprite(sprite.id);
        }
      });

      // Add or update sprites from Rust
      convertedSprites.forEach(sprite => {
        const spriteWithName = { ...sprite, name: 'Unnamed Sprite' };
        if (!currentSpriteIds.has(sprite.id)) {
          addSprite(spriteWithName);
        } else {
          // IMPORTANT: Only update if WASM-managed fields actually changed
          // WASM manages: x, y, rotation, scale, texture, layer
          // React manages: characterId, hp, maxHp, ac, auraRadius, controlledBy
          const existingSprite = sprites.find((s: any) => s.id === sprite.id);
          
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
      console.warn('[SpriteSyncing] Error syncing sprites from Rust:', error);
    }
  }, [addSprite, removeSprite, updateSprite]);

  // Sync sprites from Rust backend
  useEffect(() => {
    // Initial sync
    syncSprites();

    // Set up periodic syncing (every 2 seconds)
    const interval = setInterval(syncSprites, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [syncSprites]);

  return {
    manualSync: syncSprites
  };
}
