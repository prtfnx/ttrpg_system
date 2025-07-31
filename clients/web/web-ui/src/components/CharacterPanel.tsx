
import { useState } from 'react';
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
  const { characters, addCharacter, selectSprite } = useGameStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Minimal character list with fast action buttons
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
                const spriteId = genId();
                const newCharacter = {
                  id: genId(),
                  name: data.name,
                  race: data.race,
                  class: data.class,
                  level: data.level,
                  sprite: {
                    id: spriteId,
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
                  inventory: [],
                };
                addCharacter(newCharacter);
                selectSprite(spriteId, false);
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
        {characters.length === 0 && <div style={{ color: '#888', fontStyle: 'italic' }}>No characters yet.</div>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {characters.map((char) => (
            <li key={char.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #ddd', borderRadius: 8, padding: 8, marginBottom: 8, background: '#fff' }}>
              <span style={{ fontWeight: 700 }}>{char.name}</span>
              <span style={{ color: '#666', fontSize: 13 }}>{char.race} {char.class} (Lv{char.level})</span>
              <button style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 4, background: '#6366f1', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }} onClick={() => selectSprite(char.sprite.id, false)}>Select</button>
              <button style={{ padding: '4px 10px', borderRadius: 4, background: '#f3f4f6', color: '#222', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }} onClick={() => {/* TODO: open character sheet modal */}}>Info</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}




export default CharacterPanel;






