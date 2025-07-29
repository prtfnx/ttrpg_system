console.log('[CharacterPanel] Component function invoked');
import React, { useState } from 'react';
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '',
    hp: '',
    maxHp: '',
    ac: '',
    speed: '',
  });
  const resetForm = () => {
    setForm({ name: '', hp: '', maxHp: '', ac: '', speed: '' });
    setStep(1);
  };
  const selectedCharacters = characters.filter((char: any) =>
    selectedSprites.includes(char.sprite.id)
  );

  return (
    <div className="character-section">
      <div style={{ background: '#ffeeba', color: '#856404', padding: 8, marginBottom: 8, borderRadius: 4, fontWeight: 600 }}>
        [DEBUG] CharacterPanel is mounted and rendering
      </div>
      <h2>Character</h2>
      <button
        style={{ marginBottom: '1rem', padding: '0.5rem 1rem', fontWeight: 600 }}
        onClick={() => setShowCreateModal(true)}
      >
        + Create Character
      </button>

      {showCreateModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            background: '#fff',
            borderRadius: 8,
            padding: 32,
            minWidth: 340,
            boxShadow: '0 2px 16px rgba(0,0,0,0.2)'
          }}>
            <h3>Create New Character</h3>
            <div>
              {/* Multi-step form */}
              {step === 1 && (
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8 }}>Name:</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    style={{ width: '100%', marginBottom: 16, padding: 8, color: '#222', background: '#fff' }}
                    autoFocus
                  />
                  <div style={{ marginTop: 24, textAlign: 'right' }}>
                    <button onClick={() => setShowCreateModal(false)} style={{ marginRight: 8, padding: '0.5rem 1rem' }}>Cancel</button>
                    <button
                      onClick={() => setStep(2)}
                      style={{ padding: '0.5rem 1rem' }}
                      disabled={!form.name.trim()}
                    >Next</button>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8 }}>HP:</label>
                  <input
                    type="number"
                    value={form.hp}
                    onChange={e => setForm(f => ({ ...f, hp: e.target.value }))}
                    style={{ width: '100%', marginBottom: 8, padding: 8, color: '#222', background: '#fff' }}
                    min={1}
                  />
                  <label style={{ display: 'block', marginBottom: 8 }}>Max HP:</label>
                  <input
                    type="number"
                    value={form.maxHp}
                    onChange={e => setForm(f => ({ ...f, maxHp: e.target.value }))}
                    style={{ width: '100%', marginBottom: 8, padding: 8, color: '#222', background: '#fff' }}
                    min={1}
                  />
                  <label style={{ display: 'block', marginBottom: 8 }}>AC:</label>
                  <input
                    type="number"
                    value={form.ac}
                    onChange={e => setForm(f => ({ ...f, ac: e.target.value }))}
                    style={{ width: '100%', marginBottom: 8, padding: 8, color: '#222', background: '#fff' }}
                    min={0}
                  />
                  <label style={{ display: 'block', marginBottom: 8 }}>Speed (ft):</label>
                  <input
                    type="number"
                    value={form.speed}
                    onChange={e => setForm(f => ({ ...f, speed: e.target.value }))}
                    style={{ width: '100%', marginBottom: 8, padding: 8, color: '#222', background: '#fff' }}
                    min={0}
                  />
                  <div style={{ marginTop: 24, textAlign: 'right' }}>
                    <button onClick={() => setStep(1)} style={{ marginRight: 8, padding: '0.5rem 1rem' }}>Back</button>
                    <button
                      onClick={() => setStep(3)}
                      style={{ padding: '0.5rem 1rem' }}
                      disabled={!(form.hp && form.maxHp && form.ac && form.speed)}
                    >Next</button>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div style={{ marginTop: 16 }}>
                  <h4>Review</h4>
                  <div>
                    <div style={{ marginBottom: 8 }}><b>Name:</b> {form.name}</div>
                    <div style={{ marginBottom: 8 }}><b>HP:</b> {form.hp} / {form.maxHp}</div>
                    <div style={{ marginBottom: 8 }}><b>AC:</b> {form.ac}</div>
                    <div style={{ marginBottom: 8 }}><b>Speed:</b> {form.speed} ft</div>
                  </div>
                  <div style={{ marginTop: 24, textAlign: 'right' }}>
                    <button onClick={() => setStep(2)} style={{ marginRight: 8, padding: '0.5rem 1rem' }}>Back</button>
                    <button
                      onClick={() => {
                        const newCharacter = {
                          id: genId(),
                          name: form.name,
                          sprite: {
                            id: genId(),
                            name: form.name,
                            x: 0,
                            y: 0,
                            width: 1,
                            height: 1,
                            isSelected: false,
                            isVisible: true,
                            layer: 0,
                          },
                          stats: {
                            hp: Number(form.hp),
                            maxHp: Number(form.maxHp),
                            ac: Number(form.ac),
                            speed: Number(form.speed),
                          },
                          conditions: [],
                        };
                        addCharacter(newCharacter);
                        setShowCreateModal(false);
                        resetForm();
                      }}
                      style={{ padding: '0.5rem 1rem', fontWeight: 600 }}
                    >Create</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedCharacters.length === 0 ? (
        <p style={{ color: '#666', textAlign: 'center', padding: '1rem' }}>
          Select a character to view details
        </p>
      ) : (
        <EditableCharacterList characters={selectedCharacters} />
      )}
    </div>
  );
}
