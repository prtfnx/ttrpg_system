import React, { useState } from 'react';
import { useGameStore } from '../store';
import './CharacterPanelRedesigned.css';
import { EnhancedCharacterWizard } from './CharacterWizard/EnhancedCharacterWizard';

// Utility to generate unique IDs
function genId(): string {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
}



function CharacterPanel() {
  const { characters, selectedSprites, addCharacter, selectSprite, removeCharacter, getSpritesForCharacter } = useGameStore();
  const [showWizard, setShowWizard] = useState(false);
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [wizardKey, setWizardKey] = useState(0);

  // Find selected character based on selected sprite(s)
  const selectedCharacter = characters.find(c => {
    const sprites = getSpritesForCharacter(c.id);
    return sprites.some(spr => selectedSprites.includes(spr.id));
  }) || null;

  const handleCharacterClick = (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (char) {
      setExpandedCharId(expandedCharId === charId ? null : charId);
      // Select the first linked sprite if any
      const sprites = getSpritesForCharacter(char.id);
      if (sprites.length > 0) {
        selectSprite(sprites[0].id, false);
      }
    }
  };

  const handleCreateCharacter = () => {
    setWizardKey(k => k + 1);
    setShowWizard(true);
  };

  const handleWizardFinish = (data: any) => {
    const newCharacter = {
      id: genId(),
      sessionId: '', // Set appropriately if needed
      name: `${data.race} ${data.class}`,
      ownerId: 0, // Set appropriately if needed
      controlledBy: [],
      data: {
        class: data.class,
        race: data.race,
        level: 1,
        stats: {
          hp: 10,
          maxHp: 10,
          ac: 10,
          speed: 30,
        },
        conditions: [],
        inventory: [],
      },
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addCharacter(newCharacter);
    setShowWizard(false);
    setExpandedCharId(newCharacter.id);
  };

  const handleDeleteCharacter = (charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this character?')) {
      removeCharacter(charId);
      if (expandedCharId === charId) {
        setExpandedCharId(null);
      }
    }
  };

  return (
    <div className="character-panel-redesigned">
      {/* Header with single create button */}
      <div className="panel-header">
        <h2>Characters</h2>
        <button className="create-btn" onClick={handleCreateCharacter} title="Create New Character">
          +
        </button>
      </div>

      {/* Character List */}
      <div className="character-list">
        {characters.length === 0 && (
          <div className="empty-state">
            No characters yet. Click <strong>+</strong> to create one.
          </div>
        )}

        {characters.map(char => {
          const isExpanded = expandedCharId === char.id;
          const isSelected = selectedCharacter?.id === char.id;
          const data = char.data || {};
          const stats = data.stats || {};
          return (
            <div
              key={char.id}
              className={`character-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
            >
              {/* Compact Header - Always Visible */}
              <div
                className="character-header"
                onClick={() => handleCharacterClick(char.id)}
              >
                <div className="char-avatar">
                  {char.name.charAt(0).toUpperCase()}
                </div>
                <div className="char-info">
                  <div className="char-name">{char.name}</div>
                  <div className="char-details">
                    Lv{data.level} {data.race} {data.class}
                  </div>
                </div>
                <div className="char-stats-compact">
                  <div className="stat-pill">
                    <span className="stat-label">HP</span>
                    <span className="stat-value">{stats.hp}/{stats.maxHp}</span>
                  </div>
                  <div className="stat-pill">
                    <span className="stat-label">AC</span>
                    <span className="stat-value">{stats.ac}</span>
                  </div>
                </div>
                <button
                  className="char-expand-btn"
                  onClick={(e) => { e.stopPropagation(); handleCharacterClick(char.id); }}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
              </div>

              {/* Expanded Details - Shown when clicked */}
              {isExpanded && (
                <div className="character-details">
                  <div className="details-section">
                    <div className="stat-row">
                      <span>Speed:</span>
                      <span>{stats.speed} ft</span>
                    </div>
                    {data.conditions && data.conditions.length > 0 && (
                      <div className="conditions">
                        <strong>Conditions:</strong>
                        <div className="condition-tags">
                          {data.conditions.map((cond: string, idx: number) => (
                            <span key={idx} className="condition-tag">{cond}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="char-actions">
                    <button className="action-btn edit">Edit</button>
                    <button
                      className="action-btn delete"
                      onClick={(e) => handleDeleteCharacter(char.id, e)}
                    >
                      Delete
                    </button>
                    <button className="action-btn">Sheet</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Character Creation Wizard Modal */}
      {showWizard && (
        <EnhancedCharacterWizard
          key={wizardKey}
          isOpen={showWizard}
          onFinish={handleWizardFinish}
          onCancel={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}

export default CharacterPanel;






