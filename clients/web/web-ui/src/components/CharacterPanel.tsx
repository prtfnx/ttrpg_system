import React, { useState } from 'react';
import { useGameStore } from '../store';
import './CharacterPanelRedesigned.css';
import styles from './CharacterPanel.module.css';
import { CharacterSheet } from './CharacterWizard/CharacterSheet';
import { EnhancedCharacterWizard } from './CharacterWizard/EnhancedCharacterWizard';
import type { WizardFormData } from './CharacterWizard/WizardFormData';

// Utility to generate unique IDs
function genId(): string {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
}



function CharacterPanel() {
  const { characters, selectedSprites, addCharacter, selectSprite, removeCharacter, getSpritesForCharacter } = useGameStore();
  const [showWizard, setShowWizard] = useState(false);
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [wizardKey, setWizardKey] = useState(0);
  const [viewingSheetCharId, setViewingSheetCharId] = useState<string | null>(null);

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

  const handleEditCharacter = (charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('🔧 Edit character:', charId);
    // TODO: Implement inline editing or open wizard with pre-filled data
    alert('Edit functionality coming soon!');
  };

  const handleViewSheet = (charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('📋 View character sheet:', charId);
    setViewingSheetCharId(charId);
  };

  return (
    <div className={styles.characterPanelRedesigned}>
      {/* Header with single create button */}
      <div className={styles.panelHeader}>
        <h2>Characters</h2>
        <button className={styles.createBtn} onClick={handleCreateCharacter} title="Create New Character">
          +
        </button>
      </div>

      {/* Character List */}
      <div className={styles.characterList}>
        {characters.length === 0 && (
          <div className={styles.emptyState}>
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
                className={styles.characterHeader}
                onClick={() => handleCharacterClick(char.id)}
              >
                <div className={styles.charAvatar}>
                  {char.name.charAt(0).toUpperCase()}
                </div>
                <div className={styles.charInfo}>
                  <div className={styles.charName}>{char.name}</div>
                  <div className={styles.charDetails}>
                    Lv{data.level} {data.race} {data.class}
                  </div>
                </div>
                <div className={styles.charStatsCompact}>
                  <div className={styles.statPill}>
                    <span className={styles.statLabel}>HP</span>
                    <span className={styles.statValue}>{stats.hp}/{stats.maxHp}</span>
                  </div>
                  <div className={styles.statPill}>
                    <span className={styles.statLabel}>AC</span>
                    <span className={styles.statValue}>{stats.ac}</span>
                  </div>
                </div>
                <button
                  className={styles.charExpandBtn}
                  onClick={(e) => { e.stopPropagation(); handleCharacterClick(char.id); }}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
              </div>

              {/* Expanded Details - Shown when clicked */}
              {isExpanded && (
                <div className={styles.characterDetails}>
                  <div className={styles.detailsSection}>
                    <div className={styles.statRow}>
                      <span>Speed:</span>
                      <span>{stats.speed} ft</span>
                    </div>
                    {data.conditions && data.conditions.length > 0 && (
                      <div className={styles.conditions}>
                        <strong>Conditions:</strong>
                        <div className={styles.conditionTags}>
                          {data.conditions.map((cond: string, idx: number) => (
                            <span key={idx} className={styles.conditionTag}>{cond}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className={styles.charActions}>
                    <button className="action-btn edit" onClick={(e) => handleEditCharacter(char.id, e)}>Edit</button>
                    <button
                      className="action-btn delete"
                      onClick={(e) => handleDeleteCharacter(char.id, e)}
                    >
                      Delete
                    </button>
                    <button className={styles.actionBtn} onClick={(e) => handleViewSheet(char.id, e)}>Sheet</button>
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

      {/* Character Sheet Viewer Modal */}
      {viewingSheetCharId && (() => {
        const char = characters.find(c => c.id === viewingSheetCharId);
        if (!char || !char.data) return null;
        
        // Convert Character to WizardFormData format for CharacterSheet
        const wizardData: WizardFormData = {
          name: char.name,
          race: char.data.race || '',
          class: char.data.class || '',
          level: char.data.level || 1,
          background: char.data.background || '',
          alignment: char.data.alignment || '',
          strength: char.data.strength || 10,
          dexterity: char.data.dexterity || 10,
          constitution: char.data.constitution || 10,
          intelligence: char.data.intelligence || 10,
          wisdom: char.data.wisdom || 10,
          charisma: char.data.charisma || 10,
          abilityScores: {
            strength: char.data.strength || 10,
            dexterity: char.data.dexterity || 10,
            constitution: char.data.constitution || 10,
            intelligence: char.data.intelligence || 10,
            wisdom: char.data.wisdom || 10,
            charisma: char.data.charisma || 10,
          },
          skills: char.data.skills || [],
          spells: Array.isArray(char.data.spells) 
            ? char.data.spells 
            : (char.data.spells || { cantrips: [], knownSpells: [], preparedSpells: [] }),
        };

        return (
          <CharacterSheet 
            character={wizardData} 
            onClose={() => setViewingSheetCharId(null)} 
          />
        );
      })()}
    </div>
  );
}

export default CharacterPanel;







