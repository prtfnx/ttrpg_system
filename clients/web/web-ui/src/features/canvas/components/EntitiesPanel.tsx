import { useGameStore } from '@/store';
import { useRenderEngine } from '@features/canvas';
import { AlertTriangle, Check } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SyncState {
  status: 'idle' | 'syncing' | 'error' | 'success';
  error?: string;
  lastSync?: Date;
  progress?: number;
}

export function EntitiesPanel() {
  const { sprites, selectedSprites, selectSprite, addSprite, removeSprite, updateSprite } = useGameStore()
  const renderEngine = useRenderEngine();
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle' })

  // Validate and transform sprite data from WASM
  const validateAndTransformSprite = (rustSprite: any) => {
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
      const engine = renderEngine || (window as any).rustRenderManager;
      if (!engine) {
        throw new Error('WASM render manager not available');
      }

      setSyncState(prev => ({ ...prev, progress: 25 }));

      // Get sprites with error handling
      const rustSprites = engine.get_all_sprites_network_data();
      
      if (!Array.isArray(rustSprites)) {
        throw new Error('Invalid sprite data format from WASM');
      }
      
      setSyncState(prev => ({ ...prev, progress: 50 }));
      
      // Process sprites with validation
      const processedSprites: any[] = [];
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
          updateSprite(sprite.id, sprite)
        } else {
          // Add new sprite
          addSprite(sprite)
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
        console.warn('Sprite sync completed with warnings:', errors);
      }
      
      console.log(`[EntitiesPanel] Successfully synced ${processedSprites.length} sprites from Rust`)
      
    } catch (error) {
      setSyncState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown sync error',
        progress: 0
      });
      console.error('[EntitiesPanel] Error syncing sprites:', error)
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
  }, []) // Remove dependencies to avoid constant re-syncing

  return (
    <div className="entities-section" style={{ background: 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Entities ({sprites.length})</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {syncState.status === 'error' && (
            <span style={{ color: 'red', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }} title={syncState.error}>
              <AlertTriangle size={12} aria-hidden /> Sync Error
            </span>
          )}
          {syncState.status === 'success' && syncState.lastSync && (
            <span style={{ color: 'green', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Check size={12} aria-hidden /> {new Date(syncState.lastSync).toLocaleTimeString()}
            </span>
          )}
          <button 
            onClick={syncSpritesFromRust}
            disabled={syncState.status === 'syncing'}
            style={{ 
              padding: '4px 8px', 
              fontSize: '12px',
              opacity: syncState.status === 'syncing' ? 0.6 : 1,
              cursor: syncState.status === 'syncing' ? 'wait' : 'pointer'
            }}
          >
            {syncState.status === 'syncing' ? (
              syncState.progress ? `Syncing... ${syncState.progress}%` : 'Syncing...'
            ) : 'Refresh'}
          </button>
        </div>
      </div>
      
      <div className="sprite-list">
        {sprites.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
            {syncState.status === 'syncing' ? (
              <div>
                <div>Syncing sprites...</div>
                {syncState.progress && (
                  <div style={{ 
                    width: '100%', 
                    height: '4px', 
                    backgroundColor: '#eee', 
                    borderRadius: '2px',
                    marginTop: '8px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${syncState.progress}%`,
                      height: '100%',
                      backgroundColor: '#007bff',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                )}
              </div>
            ) : (
              <p>No sprites on the map</p>
            )}
          </div>
        ) : (
          sprites.map((sprite) => {
            // Provide fallback for scale if missing
            const scale = sprite.scale && typeof sprite.scale.x === 'number' && typeof sprite.scale.y === 'number'
              ? sprite.scale
              : { x: 1, y: 1 };
            return (
              <div
                key={sprite.id}
                className={`sprite-item ${selectedSprites.includes(sprite.id) ? 'selected' : ''}`}
                onClick={() => selectSprite(sprite.id)}
              >
                <h3>{sprite.name} ({sprite.id})</h3>
                <p>Position: ({sprite.x}, {sprite.y})</p>
                <p>Layer: {sprite.layer}</p>
                <p>Scale: {scale.x.toFixed(2)} x {scale.y.toFixed(2)}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  )
}
