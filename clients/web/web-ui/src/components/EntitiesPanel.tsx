import { useEffect, useState } from 'react'
import { useGameStore } from '../store'

export function EntitiesPanel() {
  const { sprites, selectedSprites, selectSprite, addSprite, removeSprite, updateSprite } = useGameStore()
  const [refreshing, setRefreshing] = useState(false)

  // Function to manually sync sprites from Rust backend
  const syncSpritesFromRust = async () => {
    if (!window.rustRenderManager) return
    
    setRefreshing(true)
    try {
      const rustSprites = window.rustRenderManager.get_all_sprites_network_data()
      
      if (Array.isArray(rustSprites)) {
        // Create a map of existing sprites for efficient lookup
        const existingSprites = new Map(sprites.map(s => [s.id, s]))
        const rustSpriteIds = new Set()
        
        // Process each sprite from Rust
        rustSprites.forEach((rustSprite: any) => {
          const spriteId = rustSprite.id || rustSprite.sprite_id || Math.random().toString()
          rustSpriteIds.add(spriteId)
          
          const sprite = {
            id: spriteId,
            name: rustSprite.name || rustSprite.sprite_name || `Sprite ${spriteId}`,
            x: rustSprite.x || rustSprite.world_x || 0,
            y: rustSprite.y || rustSprite.world_y || 0,
            width: rustSprite.width || rustSprite.size_x || 50,
            height: rustSprite.height || rustSprite.size_y || 50,
            layer: rustSprite.layer || 'tokens',
            isSelected: existingSprites.get(spriteId)?.isSelected || false,
            isVisible: rustSprite.visible !== false,
          }
          
          if (existingSprites.has(spriteId)) {
            // Update existing sprite
            updateSprite(spriteId, sprite)
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
        
        console.log(`[EntitiesPanel] Synced ${rustSprites.length} sprites from Rust`)
      }
    } catch (error) {
      console.warn('[EntitiesPanel] Error syncing sprites:', error)
    }
    setRefreshing(false)
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
    <div className="entities-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Entities ({sprites.length})</h2>
        <button 
          onClick={syncSpritesFromRust}
          disabled={refreshing}
          style={{ 
            padding: '4px 8px', 
            fontSize: '12px',
            opacity: refreshing ? 0.6 : 1 
          }}
        >
          {refreshing ? 'Syncing...' : 'Refresh'}
        </button>
      </div>
      
      <div className="sprite-list">
        {sprites.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
            No sprites on the map
          </p>
        ) : (
          sprites.map((sprite) => (
            <div
              key={sprite.id}
              className={`sprite-item ${selectedSprites.includes(sprite.id) ? 'selected' : ''}`}
              onClick={() => selectSprite(sprite.id)}
            >
              <h3>{sprite.name}</h3>
              <p>Position: ({sprite.x}, {sprite.y})</p>
              <p>Layer: {sprite.layer}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
