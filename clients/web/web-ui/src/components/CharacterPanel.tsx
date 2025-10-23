import React, { useState } from 'react';
import { useGameStore } from '../store';
import { EnhancedCharacterWizard } from './CharacterWizard/EnhancedCharacterWizard';
import './CharacterPanelRedesigned.css';

// Utility to generate unique IDs
function genId(): string {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
}



function CharacterPanel() {
  const { characters, selectedSprites, addCharacter, selectSprite, removeCharacter } = useGameStore();
  const [showWizard, setShowWizard] = useState(false);
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [wizardKey, setWizardKey] = useState(0);

  // Find selected character based on sprite selection
  const selectedCharacter = characters.find(c => selectedSprites.includes(c.sprite.id)) || null;

  const handleCharacterClick = (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (char) {
      // Toggle expansion
      setExpandedCharId(expandedCharId === charId ? null : charId);
      // Select sprite
      selectSprite(char.sprite.id, false);
    }
  };

  const handleCreateCharacter = () => {
    setWizardKey(k => k + 1);
    setShowWizard(true);
  };

  const handleWizardFinish = (data: any) => {
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
        layer: 'tokens' as const,
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
                    Lv{char.level} {char.race} {char.class}
                  </div>
                </div>
                <div className="char-stats-compact">
                  <div className="stat-pill">
                    <span className="stat-label">HP</span>
                    <span className="stat-value">{char.stats.hp}/{char.stats.maxHp}</span>
                  </div>
                  <div className="stat-pill">
                    <span className="stat-label">AC</span>
                    <span className="stat-value">{char.stats.ac}</span>
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
                      <span>{char.stats.speed} ft</span>
                    </div>
                    {char.conditions && char.conditions.length > 0 && (
                      <div className="conditions">
                        <strong>Conditions:</strong>
                        <div className="condition-tags">
                          {char.conditions.map((cond, idx) => (
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






