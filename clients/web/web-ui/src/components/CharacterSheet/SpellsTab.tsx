/**
 * Spells Tab Component for Character Sheet
 * Handles spell list display and drag-drop from compendium
 * Uses WebSocket protocol for all operations (Phase 2.2)
 */

import React, { useState } from 'react';
import { MessageType } from '../../protocol/message';
import { useProtocol } from '../../services/ProtocolContext';
import type { Character } from '../../types';
import { showToast } from '../../utils/toast';
import styles from './SpellsTab.module.css';

interface SpellsTabProps {
  character: Character;
  onSave: (character: Partial<Character>) => void;
}

interface CharacterSpell {
  name: string;
  level: number;
  school: string;
  prepared?: boolean;
}

export const SpellsTab: React.FC<SpellsTabProps> = ({ character, onSave }) => {
  const { protocol } = useProtocol();
  const [dragOver, setDragOver] = useState(false);
  
  // Get spells from character data
  const spells: CharacterSpell[] = character.data?.spells || [];
  const spellcastingAbility = character.data?.spellcastingAbility || 'int';
  const spellSaveDC = character.data?.spellSaveDC || 8;
  const spellAttackBonus = character.data?.spellAttackBonus || 0;

  // Group spells by level
  const spellsByLevel: Record<number, CharacterSpell[]> = {};
  spells.forEach(spell => {
    if (!spellsByLevel[spell.level]) {
      spellsByLevel[spell.level] = [];
    }
    spellsByLevel[spell.level].push(spell);
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;

      const dragData = JSON.parse(data);
      
      // Only handle spell drops
      if (dragData.type !== 'spell') {
        showToast('Only spells can be added to the spell list', 'error');
        return;
      }

      const spell = dragData.data;
      
      // Check if spell already exists
      if (spells.some(s => s.name === spell.name)) {
        showToast(`${spell.name} is already in your spell list`, 'warning');
        return;
      }

      // Add spell to character
      const newSpell: CharacterSpell = {
        name: spell.name,
        level: spell.level,
        school: spell.school,
        prepared: false
      };

      const updatedSpells = [...spells, newSpell];

      // Send CHARACTER_UPDATE via WebSocket
      if (protocol) {
        const updateMessage = {
          type: MessageType.CHARACTER_UPDATE,
          data: {
            character_id: character.id,
            updates: {
              spells: updatedSpells
            }
          }
        };

        protocol.send(updateMessage);
      }

      // Update local state
      onSave({
        data: {
          ...character.data,
          spells: updatedSpells
        }
      });

      showToast(`Added ${spell.name} to spell list`, 'success');
    } catch (error) {
      console.error('Error handling spell drop:', error);
      showToast('Failed to add spell', 'error');
    }
  };

  const handleRemoveSpell = (spellName: string) => {
    const updatedSpells = spells.filter(s => s.name !== spellName);

    // Send update via WebSocket
    if (protocol) {
      const updateMessage = {
        type: MessageType.CHARACTER_UPDATE,
        data: {
          character_id: character.id,
          updates: {
            spells: updatedSpells
          }
        }
      };

      protocol.send(updateMessage);
    }

    onSave({
      data: {
        ...character.data,
        spells: updatedSpells
      }
    });

    showToast(`Removed ${spellName}`, 'success');
  };

  const handleTogglePrepared = (spellName: string) => {
    const updatedSpells = spells.map(s => 
      s.name === spellName ? { ...s, prepared: !s.prepared } : s
    );

    onSave({
      data: {
        ...character.data,
        spells: updatedSpells
      }
    });
  };

  const getLevelLabel = (level: number): string => {
    if (level === 0) return 'Cantrips';
    if (level === 1) return '1st Level';
    if (level === 2) return '2nd Level';
    if (level === 3) return '3rd Level';
    return `${level}th Level`;
  };

  return (
    <div className={styles.spellsTab}>
      {/* Spellcasting Stats */}
      <div className={styles.spellcastingStats}>
        <div className={styles.statBox}>
          <span className={styles.statLabel}>Spellcasting Ability</span>
          <span className={styles.statValue}>{spellcastingAbility.toUpperCase()}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statLabel}>Spell Save DC</span>
          <span className={styles.statValue}>{spellSaveDC}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statLabel}>Spell Attack Bonus</span>
          <span className={styles.statValue}>+{spellAttackBonus}</span>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        className={`${styles.dropZone} ${dragOver ? styles.dragOver : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {spells.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyIcon}>📜</p>
            <p className={styles.emptyText}>No spells yet</p>
            <p className={styles.emptyHint}>Drag spells from the compendium to add them</p>
          </div>
        ) : (
          <div className={styles.spellList}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
              const levelSpells = spellsByLevel[level] || [];
              if (levelSpells.length === 0) return null;

              return (
                <div key={level} className={styles.spellLevel}>
                  <h4 className={styles.levelHeader}>
                    {getLevelLabel(level)}
                    <span className={styles.spellCount}>({levelSpells.length})</span>
                  </h4>
                  <div className={styles.spellGrid}>
                    {levelSpells.map(spell => (
                      <div key={spell.name} className={styles.spellItem}>
                        {level > 0 && (
                          <input
                            type="checkbox"
                            checked={spell.prepared || false}
                            onChange={() => handleTogglePrepared(spell.name)}
                            className={styles.preparedCheckbox}
                            title="Prepared"
                          />
                        )}
                        <div className={styles.spellInfo}>
                          <span className={styles.spellName}>{spell.name}</span>
                          <span className={styles.spellSchool}>{spell.school}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveSpell(spell.name)}
                          className={styles.removeBtn}
                          title="Remove spell"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className={styles.instructions}>
        <p>💡 <strong>Tip:</strong> Open the compendium search and drag spells here to add them to your spell list.</p>
      </div>
    </div>
  );
};
