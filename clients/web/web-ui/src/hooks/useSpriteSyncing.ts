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
        name: rustSprite.name || rustSprite.sprite_name || 'Unnamed Sprite',
        x: rustSprite.x || rustSprite.world_x || 0,
        y: rustSprite.y || rustSprite.world_y || 0,
        width: rustSprite.width || rustSprite.size_x || 50,
        height: rustSprite.height || rustSprite.size_y || 50,
        layer: rustSprite.layer || 'tokens',
        isSelected: false,
        isVisible: rustSprite.visible !== false,
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
        if (!currentSpriteIds.has(sprite.id)) {
          addSprite(sprite);
        } else {
          updateSprite(sprite.id, sprite);
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
