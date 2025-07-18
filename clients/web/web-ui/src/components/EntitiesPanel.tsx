import { useGameStore } from '../store'

export function EntitiesPanel() {
  const { sprites, selectedSprites, selectSprite } = useGameStore()

  return (
    <div className="entities-section">
      <h2>Entities</h2>
      
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
