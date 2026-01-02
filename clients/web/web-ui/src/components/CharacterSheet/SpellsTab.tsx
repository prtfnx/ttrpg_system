/**
 * Spells Tab Component for Character Sheet
 * Handles spell list display and drag-drop from compendium
 * Uses WebSocket protocol for all operations (Phase 2.2)
 */

import React, { useEffect, useState } from 'react';
import { createMessage, MessageType } from '../../protocol/message';
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
  const [showBrowser, setShowBrowser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableSpells, setAvailableSpells] = useState<CharacterSpell[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
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
        showToast.error('Only spells can be added to the spell list');
        return;
      }

      const spell = dragData.data;
      
      // Check if spell already exists
      if (spells.some(s => s.name === spell.name)) {
        showToast.warning(`${spell.name} is already in your spell list`);
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
        protocol.updateCharacter(
          character.id,
          { spells: updatedSpells },
          character.version
        );
      }

      // Update local state
      onSave({
        data: {
          ...character.data,
          spells: updatedSpells
        }
      });

      showToast.success(`Added ${spell.name} to spell list`);
    } catch (error) {
      console.error('Error handling spell drop:', error);
      showToast.error('Failed to add spell');
    }
  };

  const handleRemoveSpell = (spellName: string) => {
    const updatedSpells = spells.filter(s => s.name !== spellName);

    // Send update via WebSocket
    if (protocol) {
      protocol.updateCharacter(
        character.id,
        { spells: updatedSpells },
        character.version
      );
    }

    onSave({
      data: {
        ...character.data,
        spells: updatedSpells
      }
    });

    showToast.success(`Removed ${spellName}`);
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

  const handleAddSpellFromBrowser = (spell: CharacterSpell) => {
    // Check if spell already exists
    if (spells.some(s => s.name === spell.name)) {
      showToast.warning(`${spell.name} is already in your spell list`);
      return;
    }

    const newSpell: CharacterSpell = {
      ...spell,
      prepared: false
    };

    const updatedSpells = [...spells, newSpell];

    // Send update via WebSocket
    if (protocol) {
      protocol.updateCharacter(
        character.id,
        { spells: updatedSpells },
        character.version
      );
    }

    onSave({
      data: {
        ...character.data,
        spells: updatedSpells
      }
    });

    showToast.success(`Added ${spell.name}`);
  };

  const searchSpells = async () => {
    if (!searchQuery.trim()) {
      setAvailableSpells([]);
      return;
    }

    setIsLoading(true);
    try {
      if (protocol) {
        // Send COMPENDIUM_SEARCH message via WebSocket
        const message = createMessage(MessageType.COMPENDIUM_SEARCH, {
          query: searchQuery,
          category: 'spell'
        });

        // Send search request
        protocol.sendMessage(message);

        // Listen for response
        const handleSearchResponse = (event: CustomEvent) => {
          const response = event.detail;
          if (response.results && response.results.spells) {
            const spellResults: CharacterSpell[] = response.results.spells.map((spell: any) => ({
              name: spell.name,
              level: spell.level,
              school: spell.school
            }));
            setAvailableSpells(spellResults);
          }
          setIsLoading(false);
          window.removeEventListener('compendium-search-response', handleSearchResponse as EventListener);
        };

        window.addEventListener('compendium-search-response', handleSearchResponse as EventListener);

        // Timeout after 5 seconds
        setTimeout(() => {
          window.removeEventListener('compendium-search-response', handleSearchResponse as EventListener);
          if (isLoading) {
            setIsLoading(false);
            showToast.error('Search timeout');
          }
        }, 5000);
      }
    } catch (error) {
      console.error('Error searching spells:', error);
      showToast.error('Failed to search spells');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (showBrowser && searchQuery) {
      const debounce = setTimeout(searchSpells, 300);
      return () => clearTimeout(debounce);
    }
  }, [searchQuery, showBrowser]);

  const getLevelLabel = (level: number): string => {
    if (level === 0) return 'Cantrips';
    if (level === 1) return '1st Level';
    if (level === 2) return '2nd Level';
    if (level === 3) return '3rd Level';
    return `${level}th Level`;
  };

  return (
    <div className={styles.spellsTab}>
      {/* Header with Browse Button */}
      <div className={styles.tabHeader}>
        <h3>Spells</h3>
        <button 
          onClick={() => setShowBrowser(!showBrowser)}
          className={styles.browseBtn}
        >
          {showBrowser ? '✕ Close Browser' : '🔍 Browse Spells'}
        </button>
      </div>

      {/* Mini Spell Browser */}
      {showBrowser && (
        <div className={styles.spellBrowser}>
          <div className={styles.browserHeader}>
            <input
              type="text"
              placeholder="Search spells..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
              autoFocus
            />
          </div>
          <div className={styles.browserResults}>
            {isLoading && <p className={styles.browserLoading}>Searching...</p>}
            {!isLoading && searchQuery && availableSpells.length === 0 && (
              <p className={styles.browserEmpty}>No spells found</p>
            )}
            {!isLoading && !searchQuery && (
              <p className={styles.browserHint}>Type to search for spells</p>
            )}
            {!isLoading && availableSpells.map(spell => (
              <div key={spell.name} className={styles.browserItem}>
                <div className={styles.browserItemInfo}>
                  <span className={styles.browserItemName}>{spell.name}</span>
                  <span className={styles.browserItemMeta}>
                    Level {spell.level} • {spell.school}
                  </span>
                </div>
                <button
                  onClick={() => handleAddSpellFromBrowser(spell)}
                  className={styles.addBtn}
                  disabled={spells.some(s => s.name === spell.name)}
                >
                  {spells.some(s => s.name === spell.name) ? '✓ Added' : '+ Add'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <p className={styles.emptyHint}>Drag spells from the compendium or use the browser above</p>
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
        <p>💡 <strong>Tip:</strong> Use the spell browser above or open the compendium panel to drag spells here.</p>
      </div>
    </div>
  );
};
