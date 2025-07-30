import React, { useState } from 'react';
import { useGameStore } from '../store';
import { CharacterCreationForm } from './CharacterCreationForm';


// Utility to generate unique IDs
function genId(): string {
  return (
    'id-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).substr(2, 9)
  );
}


function CharacterPanel() {
  const { characters, selectedSprites, addCharacter, selectSprite } = useGameStore();
  React.useEffect(() => {
    if (!characters.some(c => c.id === 'test-1')) {
      addCharacter({
        id: 'test-1',
        name: 'Test Character',
        race: 'Human',
        class: 'Fighter',
        level: 1,
        sprite: {
          id: 'sprite-1',
          name: 'Test Character',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          isSelected: false,
          isVisible: true,
          layer: 0,
        },
        stats: {
          hp: 10,
          maxHp: 10,
          ac: 15,
          speed: 30,
        },
        conditions: ['Blessed'],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Character selection state is now bound to selectedSprites
  // Find the character whose sprite is selected
  const selectedCharacter = characters.find(c => selectedSprites.includes(c.sprite.id)) || null;
  const [showCreateModal, setShowCreateModal] = useState(false);

  // When a character is clicked, select its sprite
  const handleCharacterClick = (char: any) => {
    selectSprite(char.sprite.id, false);
  };

  return (
    <div className="character-section">
      <h2>Characters</h2>
      <button
        style={{ marginBottom: '1rem', padding: '0.5rem 1rem', fontWeight: 600 }}
        onClick={() => setShowCreateModal(true)}
      >
        + Create Character
      </button>

      {showCreateModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div className="modal-content" style={{
            background: '#fff',
            color: '#222',
            borderRadius: 12,
            padding: 32,
            minWidth: 340,
            maxWidth: 420,
            boxShadow: '0 4px 32px rgba(0,0,0,0.35)',
            fontSize: 16,
          }}>
            <h3 style={{ color: '#222', marginBottom: 16 }}>Create New Character</h3>
            <CharacterCreationForm
              onCreate={(data) => {
                const newCharacter = {
                  id: genId(),
                  name: data.name,
                  race: data.race,
                  class: data.class,
                  level: data.level,
                  sprite: {
                    id: genId(),
                    name: data.name,
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                    isSelected: false,
                    isVisible: true,
                    layer: 0,
                  },
                  stats: {
                    hp: 10,
                    maxHp: 10,
                    ac: 10,
                    speed: 30,
                  },
                  conditions: [],
                };
                addCharacter(newCharacter);
                setShowCreateModal(false);
              }}
            />
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button onClick={() => setShowCreateModal(false)} style={{ padding: '0.5rem 1rem', background: '#eee', color: '#333', border: 'none', borderRadius: 4 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        {/* Character List */}
        <div>
          {characters.length === 0 && <div style={{ color: '#888', fontStyle: 'italic' }}>No characters yet.</div>}
          {characters.map((char) => {
            const isSelected = selectedCharacter && selectedCharacter.id === char.id;
            return (
              <div
                key={char.id}
                style={{
                  border: isSelected ? '2px solid #6366f1' : '1px solid #ddd',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  background: isSelected ? '#eef2ff' : '#fff',
                  cursor: 'pointer',
                  boxShadow: isSelected ? '0 2px 8px #6366f133' : 'none',
                }}
                onClick={() => handleCharacterClick(char)}
              >
                <div style={{ fontWeight: 700, fontSize: 18 }}>{char.name}</div>
                <div style={{ color: '#666', fontSize: 14 }}>{char.race} {char.class} (Level {char.level})</div>
              </div>
            );
          })}
        </div>

        {/* Character Sheet */}
        <div style={{ marginTop: 24 }}>
          {selectedCharacter ? (
            <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 2px 12px #0001' }}>
              <h3 style={{ marginBottom: 8 }}>{selectedCharacter!.name}</h3>
              <div style={{ color: '#666', marginBottom: 8 }}>{selectedCharacter!.race} {selectedCharacter!.class} (Level {selectedCharacter!.level})</div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                <div><strong>HP:</strong> {selectedCharacter!.stats.hp} / {selectedCharacter!.stats.maxHp}</div>
                <div><strong>AC:</strong> {selectedCharacter!.stats.ac}</div>
                <div><strong>Speed:</strong> {selectedCharacter!.stats.speed} ft</div>
              </div>
              {selectedCharacter!.conditions.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong>Conditions:</strong>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {selectedCharacter!.conditions.map((cond: string, idx: number) => (
                      <li key={idx}>{cond}</li>
                    ))}
                  </ul>
                </div>
              )}
              {/* TODO: Add abilities, inventory, actions, etc. */}
            </div>
          ) : (
            <div style={{ color: '#888', fontStyle: 'italic', textAlign: 'center' }}>
              Select a character to view their sheet.
            </div>
          )}
        </div>
      </div>
    </div>

  );
}

export default CharacterPanel;






