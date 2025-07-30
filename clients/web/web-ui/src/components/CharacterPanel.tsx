console.log('[CharacterPanel] Component function invoked');
import React, { useState } from 'react';
import { CharacterCreationForm } from './CharacterCreationForm';
import { useGameStore } from '../store';

// Utility to generate unique IDs
function genId() {
  return (
    'id-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).substr(2, 9)
  );
}

// Editable character sheet component for in-place editing
function EditableCharacterList({ characters }: { characters: any[] }) {
  const { updateCharacter } = useGameStore();
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const handleEdit = (id: string, field: string, currentValue: number) => {
    setEditing({ id, field });
    setEditValue(currentValue.toString());
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  };
  const handleSave = (id: string, field: string, stats: any) => {
    updateCharacter(id, { stats: { ...stats, [field]: Number(editValue) } });
    setEditing(null);
  };

  return (
    <>
      {characters.map((character: any) => (
        <div key={character.id} className="character-details">
          <h3>{character.name}</h3>
          <div className="character-stats">
            <div className="stat-group">
              <label>HP:</label>
              {editing && editing.id === character.id && editing.field === 'hp' ? (
                <input
                  type="number"
                  value={editValue}
                  onChange={handleChange}
                  style={{ width: 50 }}
                  autoFocus
                  onBlur={() => handleSave(character.id, 'hp', character.stats)}
                  onKeyDown={e => e.key === 'Enter' && handleSave(character.id, 'hp', character.stats)}
                />
              ) : (
                <span onClick={() => handleEdit(character.id, 'hp', character.stats.hp)} style={{ cursor: 'pointer' }}>{character.stats.hp}</span>
              )}
              <span>/</span>
              {editing && editing.id === character.id && editing.field === 'maxHp' ? (
                <input
                  type="number"
                  value={editValue}
                  onChange={handleChange}
                  style={{ width: 50 }}
                  autoFocus
                  onBlur={() => handleSave(character.id, 'maxHp', character.stats)}
                  onKeyDown={e => e.key === 'Enter' && handleSave(character.id, 'maxHp', character.stats)}
                />
              ) : (
                <span onClick={() => handleEdit(character.id, 'maxHp', character.stats.maxHp)} style={{ cursor: 'pointer' }}>{character.stats.maxHp}</span>
              )}
            </div>
            <div className="stat-group">
              <label>AC:</label>
              {editing && editing.id === character.id && editing.field === 'ac' ? (
                <input
                  type="number"
                  value={editValue}
                  onChange={handleChange}
                  style={{ width: 50 }}
                  autoFocus
                  onBlur={() => handleSave(character.id, 'ac', character.stats)}
                  onKeyDown={e => e.key === 'Enter' && handleSave(character.id, 'ac', character.stats)}
                />
              ) : (
                <span onClick={() => handleEdit(character.id, 'ac', character.stats.ac)} style={{ cursor: 'pointer' }}>{character.stats.ac}</span>
              )}
            </div>
            <div className="stat-group">
              <label>Speed:</label>
              {editing && editing.id === character.id && editing.field === 'speed' ? (
                <input
                  type="number"
                  value={editValue}
                  onChange={handleChange}
                  style={{ width: 50 }}
                  autoFocus
                  onBlur={() => handleSave(character.id, 'speed', character.stats)}
                  onKeyDown={e => e.key === 'Enter' && handleSave(character.id, 'speed', character.stats)}
                />
              ) : (
                <span onClick={() => handleEdit(character.id, 'speed', character.stats.speed)} style={{ cursor: 'pointer' }}>{character.stats.speed} ft</span>
              )}
            </div>
          </div>
          {character.conditions.length > 0 && (
            <div className="conditions">
              <h4>Conditions:</h4>
              <div className="condition-list">
                {character.conditions.map((condition: string, index: number) => (
                  <span key={index} className="condition-tag">
                    {condition}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export function CharacterPanel() {
  const { characters, selectedSprites, addCharacter } = useGameStore();

  // DEBUG: Add a test character only once on mount if none exist
  React.useEffect(() => {
    if (characters.length === 0) {
      addCharacter({
        id: 'test-1',
        name: 'Test Character',
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
  // Show all characters, highlight selected
  const selectedIds = new Set(selectedSprites);

  return (
    <div className="character-section">
      <div style={{ background: '#ffeeba', color: '#856404', padding: 8, marginBottom: 8, borderRadius: 4, fontWeight: 600 }}>
        [DEBUG] CharacterPanel is mounted and rendering
      </div>
      <h2>Characters</h2>
      <CharacterCreationForm
        onCreate={(data) => {
          const newCharacter = {
            id: genId(),
            name: data.name,
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
        }}
      />
      <div style={{ marginTop: 24 }}>
        <EditableCharacterList
          characters={characters.map((char) => ({
            ...char,
            isSelected: selectedIds.has(char.sprite.id),
          }))}
        />
      </div>
    </div>
  );
}
