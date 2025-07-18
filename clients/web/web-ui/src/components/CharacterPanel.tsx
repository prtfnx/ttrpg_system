import { useGameStore } from '../store'

export function CharacterPanel() {
  const { characters, selectedSprites } = useGameStore()

  const selectedCharacters = characters.filter(char => 
    selectedSprites.includes(char.sprite.id)
  )

  return (
    <div className="character-section">
      <h2>Character</h2>
      
      {selectedCharacters.length === 0 ? (
        <p style={{ color: '#666', textAlign: 'center', padding: '1rem' }}>
          Select a character to view details
        </p>
      ) : (
        selectedCharacters.map((character) => (
          <div key={character.id} className="character-details">
            <h3>{character.name}</h3>
            
            <div className="character-stats">
              <div className="stat-group">
                <label>HP:</label>
                <span>{character.stats.hp}/{character.stats.maxHp}</span>
              </div>
              
              <div className="stat-group">
                <label>AC:</label>
                <span>{character.stats.ac}</span>
              </div>
              
              <div className="stat-group">
                <label>Speed:</label>
                <span>{character.stats.speed} ft</span>
              </div>
            </div>

            {character.conditions.length > 0 && (
              <div className="conditions">
                <h4>Conditions:</h4>
                <div className="condition-list">
                  {character.conditions.map((condition, index) => (
                    <span key={index} className="condition-tag">
                      {condition}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
