import React, { useState } from 'react';
import { useGameStore } from '../store';
import DiceRoller from '../tools/DiceRoller';
import type { DetailedCharacter } from '../types';
import CharacterCreationWizard from './CharacterWizard/CharacterCreationWizard';

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
  // --- Store access ---
  const { characters, selectedSprites, addCharacter, selectSprite } = useGameStore();

  // --- Demo/test character on first load ---
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
        inventory: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Character-sprite binding: always keep selection in sync ---
  // If a sprite is selected, select the corresponding character
  const selectedCharacter = React.useMemo(() => {
    // Find the first character whose sprite is selected
    return characters.find(c => selectedSprites.includes(c.sprite.id)) || null;
  }, [characters, selectedSprites]);

  // --- Modal state for character creation ---
  // (already declared below with wizardKey)
  const [wizardKey, setWizardKey] = useState(0);

  // When a character is clicked in the UI, select its sprite (and only its sprite)
  const handleCharacterClick = (char: DetailedCharacter) => {
    // Select only this character's sprite
    selectSprite(char.sprite.id, false);
  };

  // --- Future: If a sprite is selected on the map, this will update selectedSprites and thus selectedCharacter

  // --- Modal state for character creation ---
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="character-section">
      <h2>Characters</h2>
      <button
        style={{ marginBottom: '1rem', padding: '0.5rem 1rem', fontWeight: 600 }}
        onClick={() => { setShowCreateModal(true); setWizardKey(k => k + 1); }}
      >
        + Add Character
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
            <CharacterCreationWizard
              key={wizardKey}
              onFinish={(data) => {
                const spriteId = genId();
                const defaultName = `${data.race} ${data.class}`;
                const newCharacter = {
                  id: genId(),
                  name: defaultName,
                  race: data.race,
                  class: data.class,
                  level: 1,
                  sprite: {
                    id: spriteId,
                    name: defaultName,
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
              onCancel={() => setShowCreateModal(false)}
            />
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

        {/* Character Sheet with Tabs */}
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

              {/* Tabs for Social, Exploration, Combat */}
              <CharacterSheetTabs character={selectedCharacter} />
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


// CharacterSheetTabs: Tabs for Social, Exploration, Combat
function CharacterSheetTabs({ character }: { character: DetailedCharacter }) {
  const [tab, setTab] = React.useState<'social' | 'exploration' | 'combat'>('social');
  const [newItem, setNewItem] = React.useState('');
  const { addInventoryItem } = useGameStore();
  // Add item to inventory (if not empty)
  const handleAddItem = () => {
    if (newItem.trim() && character && addInventoryItem) {
      addInventoryItem(character.id, newItem.trim());
      setNewItem('');
    }
  };
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab('social')} style={{ flex: 1, padding: 8, background: tab === 'social' ? '#6366f1' : '#f3f4f6', color: tab === 'social' ? '#fff' : '#222', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Social</button>
        <button onClick={() => setTab('exploration')} style={{ flex: 1, padding: 8, background: tab === 'exploration' ? '#6366f1' : '#f3f4f6', color: tab === 'exploration' ? '#fff' : '#222', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Exploration</button>
        <button onClick={() => setTab('combat')} style={{ flex: 1, padding: 8, background: tab === 'combat' ? '#6366f1' : '#f3f4f6', color: tab === 'combat' ? '#fff' : '#222', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Combat</button>
      </div>
      <div style={{ minHeight: 120 }}>
        {tab === 'social' && (
          <div>
            <strong>Background:</strong> <span style={{ color: '#555' }}>{character.background || '—'}</span><br />
            <strong>Personality:</strong> <span style={{ color: '#555' }}>{character.personality || '—'}</span><br />
            <strong>Languages:</strong> <span style={{ color: '#555' }}>{character.languages?.join(', ') || '—'}</span><br />
            {/* Add more social features as needed */}
          </div>
        )}
        {tab === 'exploration' && (
          <div>
            <strong>Skills:</strong> <span style={{ color: '#555' }}>{character.skills?.join(', ') || '—'}</span><br />
            <strong>Inventory:</strong>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {(character.inventory || []).length > 0 ? character.inventory.map((item: string, idx: number) => (
                <li key={idx}>{item}</li>
              )) : <li style={{ color: '#aaa' }}>No items</li>}
            </ul>
            {/* Add item input */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                type="text"
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                placeholder="Add item..."
                style={{ flex: 1, padding: 6, borderRadius: 4, border: '1px solid #ccc' }}
              />
              <button onClick={handleAddItem} style={{ padding: '6px 12px', borderRadius: 4, background: '#6366f1', color: '#fff', border: 'none', fontWeight: 600 }}>Add</button>
            </div>
            {/* Add more exploration features as needed */}
          </div>
        )}
        {tab === 'combat' && (
          <div>
            <strong>Abilities:</strong>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {character.abilities ? (
                Object.entries(character.abilities).map(([ability, score]) => (
                  <li key={ability}>{ability.charAt(0).toUpperCase() + ability.slice(1)}: {score}</li>
                ))
              ) : <li style={{ color: '#aaa' }}>No abilities</li>}
            </ul>
            <strong>Actions:</strong>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {character.actions && character.actions.length > 0 ? character.actions.map((act: string, idx: number) => (
                <li key={idx}>{act}</li> 
              )) : <li style={{ color: '#aaa' }}>No actions</li>}
            </ul>
            {/* Dice Roller */}
            <DiceRoller />
            {/* Add more combat features as needed */}
          </div>
        )}

      </div>
    </div>
  );
}

export default CharacterPanel;






