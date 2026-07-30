import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import styles from './SpellManager.module.css';
import type { WizardFormData } from './WizardFormData';

interface SpellManagerProps {
  character: WizardFormData;
  onClose?: () => void;
  onUpdateCharacter?: (character: WizardFormData) => void;
}

interface SpellSlotTracker {
  [key: string]: {
    total: number;
    used: number;
  };
}

interface SpellData {
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  damage?: string;
  savingThrow?: string;
  spellAttack?: boolean;
}

export const SpellManager: React.FC<SpellManagerProps> = ({ 
  character, 
  onClose, 
  onUpdateCharacter 
}) => {
  const [activeTab, setActiveTab] = useState<'slots' | 'prepare' | 'cast' | 'library'>('slots');
  const [spellSlots, setSpellSlots] = useState<SpellSlotTracker>({});
  const [selectedSpell, setSelectedSpell] = useState<SpellData | null>(null);
  const [castingLevel, setCastingLevel] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<number | null>(null);
  const [filterSchool, setFilterSchool] = useState<string>('');

  // Initialize spell slots based on character class and level
  useEffect(() => {
    if (character.class && (character.class === 'Wizard' || character.class === 'Sorcerer' || 
                           character.class === 'Cleric' || character.class === 'Druid' || 
                           character.class === 'Bard')) {
      const level = character.advancement?.currentLevel || 1;
      const slots: SpellSlotTracker = {};
      
      // D&D 5e spell slot progression
      const spellSlotProgression = getSpellSlotProgression(character.class, level);
      
      Object.entries(spellSlotProgression).forEach(([slotLevel, total]) => {
        if ((total as number) > 0) {
          slots[`level${slotLevel}`] = { total: total as number, used: 0 };
        }
      });
      
      setSpellSlots(slots);
    }
  }, [character.class, character.advancement?.currentLevel]);

  // Spell slot progression helper function
  const getSpellSlotProgression = (className: string, level: number): Record<string, number> => {
    const progressions: Record<string, number[][]> = {
      'Wizard': [
        // [1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th]
        [2, 0, 0, 0, 0, 0, 0, 0, 0], // Level 1
        [3, 0, 0, 0, 0, 0, 0, 0, 0], // Level 2
        [4, 2, 0, 0, 0, 0, 0, 0, 0], // Level 3
        [4, 3, 0, 0, 0, 0, 0, 0, 0], // Level 4
        [4, 3, 2, 0, 0, 0, 0, 0, 0], // Level 5
        [4, 3, 3, 0, 0, 0, 0, 0, 0], // Level 6
        [4, 3, 3, 1, 0, 0, 0, 0, 0], // Level 7
        [4, 3, 3, 2, 0, 0, 0, 0, 0], // Level 8
        [4, 3, 3, 3, 1, 0, 0, 0, 0], // Level 9
        [4, 3, 3, 3, 2, 0, 0, 0, 0], // Level 10
        [4, 3, 3, 3, 2, 1, 0, 0, 0], // Level 11
        [4, 3, 3, 3, 2, 1, 0, 0, 0], // Level 12
        [4, 3, 3, 3, 2, 1, 1, 0, 0], // Level 13
        [4, 3, 3, 3, 2, 1, 1, 0, 0], // Level 14
        [4, 3, 3, 3, 2, 1, 1, 1, 0], // Level 15
        [4, 3, 3, 3, 2, 1, 1, 1, 0], // Level 16
        [4, 3, 3, 3, 2, 1, 1, 1, 1], // Level 17
        [4, 3, 3, 3, 3, 1, 1, 1, 1], // Level 18
        [4, 3, 3, 3, 3, 2, 1, 1, 1], // Level 19
        [4, 3, 3, 3, 3, 2, 2, 1, 1]  // Level 20
      ],
      'Sorcerer': [
        // Same progression as Wizard
        [2, 0, 0, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0, 0, 0], [4, 2, 0, 0, 0, 0, 0, 0, 0], [4, 3, 0, 0, 0, 0, 0, 0, 0],
        [4, 3, 2, 0, 0, 0, 0, 0, 0], [4, 3, 3, 0, 0, 0, 0, 0, 0], [4, 3, 3, 1, 0, 0, 0, 0, 0], [4, 3, 3, 2, 0, 0, 0, 0, 0],
        [4, 3, 3, 3, 1, 0, 0, 0, 0], [4, 3, 3, 3, 2, 0, 0, 0, 0], [4, 3, 3, 3, 2, 1, 0, 0, 0], [4, 3, 3, 3, 2, 1, 0, 0, 0],
        [4, 3, 3, 3, 2, 1, 1, 0, 0], [4, 3, 3, 3, 2, 1, 1, 0, 0], [4, 3, 3, 3, 2, 1, 1, 1, 0], [4, 3, 3, 3, 2, 1, 1, 1, 0],
        [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]
      ],
      'Bard': [
        // Same progression as Wizard
        [2, 0, 0, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0, 0, 0], [4, 2, 0, 0, 0, 0, 0, 0, 0], [4, 3, 0, 0, 0, 0, 0, 0, 0],
        [4, 3, 2, 0, 0, 0, 0, 0, 0], [4, 3, 3, 0, 0, 0, 0, 0, 0], [4, 3, 3, 1, 0, 0, 0, 0, 0], [4, 3, 3, 2, 0, 0, 0, 0, 0],
        [4, 3, 3, 3, 1, 0, 0, 0, 0], [4, 3, 3, 3, 2, 0, 0, 0, 0], [4, 3, 3, 3, 2, 1, 0, 0, 0], [4, 3, 3, 3, 2, 1, 0, 0, 0],
        [4, 3, 3, 3, 2, 1, 1, 0, 0], [4, 3, 3, 3, 2, 1, 1, 0, 0], [4, 3, 3, 3, 2, 1, 1, 1, 0], [4, 3, 3, 3, 2, 1, 1, 1, 0],
        [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]
      ],
      'Cleric': [
        // Same progression as Wizard
        [2, 0, 0, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0, 0, 0], [4, 2, 0, 0, 0, 0, 0, 0, 0], [4, 3, 0, 0, 0, 0, 0, 0, 0],
        [4, 3, 2, 0, 0, 0, 0, 0, 0], [4, 3, 3, 0, 0, 0, 0, 0, 0], [4, 3, 3, 1, 0, 0, 0, 0, 0], [4, 3, 3, 2, 0, 0, 0, 0, 0],
        [4, 3, 3, 3, 1, 0, 0, 0, 0], [4, 3, 3, 3, 2, 0, 0, 0, 0], [4, 3, 3, 3, 2, 1, 0, 0, 0], [4, 3, 3, 3, 2, 1, 0, 0, 0],
        [4, 3, 3, 3, 2, 1, 1, 0, 0], [4, 3, 3, 3, 2, 1, 1, 0, 0], [4, 3, 3, 3, 2, 1, 1, 1, 0], [4, 3, 3, 3, 2, 1, 1, 1, 0],
        [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]
      ],
      'Druid': [
        // Same progression as Wizard
        [2, 0, 0, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0, 0, 0], [4, 2, 0, 0, 0, 0, 0, 0, 0], [4, 3, 0, 0, 0, 0, 0, 0, 0],
        [4, 3, 2, 0, 0, 0, 0, 0, 0], [4, 3, 3, 0, 0, 0, 0, 0, 0], [4, 3, 3, 1, 0, 0, 0, 0, 0], [4, 3, 3, 2, 0, 0, 0, 0, 0],
        [4, 3, 3, 3, 1, 0, 0, 0, 0], [4, 3, 3, 3, 2, 0, 0, 0, 0], [4, 3, 3, 3, 2, 1, 0, 0, 0], [4, 3, 3, 3, 2, 1, 0, 0, 0],
        [4, 3, 3, 3, 2, 1, 1, 0, 0], [4, 3, 3, 3, 2, 1, 1, 0, 0], [4, 3, 3, 3, 2, 1, 1, 1, 0], [4, 3, 3, 3, 2, 1, 1, 1, 0],
        [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]
      ]
    };

    const progression = progressions[className];
    if (!progression || level < 1 || level > 20) {
      return {};
    }

    const levelSlots = progression[level - 1];
    const result: Record<string, number> = {};
    
    levelSlots.forEach((slots, index) => {
      if (slots > 0) {
        result[String(index + 1)] = slots;
      }
    });
    
    return result;
  };

  // Spells derived from character's known/prepared spells
  const knownSpellNames = [
    ...(character.spells?.cantrips || []),
    ...(character.spells?.preparedSpells || []),
    ...(character.spells?.knownSpells || [])
  ];

  const getFilteredSpells = (): SpellData[] => {
    // Spell search is over known spells only — compendium lookup done in Phase 2
    return knownSpellNames
      .map(name => ({ name, level: 1, school: '', castingTime: '1 action', range: '', components: '', duration: '', description: '' } as SpellData))
      .filter(spell => {
        const matchesSearch = spell.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesLevel = filterLevel === null || spell.level === filterLevel;
        const matchesSchool = filterSchool === '' || spell.school === filterSchool;
        return matchesSearch && matchesLevel && matchesSchool;
      });
  };

  const consumeSpellSlot = (level: number) => {
    const slotKey = `level${level}`;
    if (spellSlots[slotKey] && spellSlots[slotKey].used < spellSlots[slotKey].total) {
      setSpellSlots(prev => ({
        ...prev,
        [slotKey]: {
          ...prev[slotKey],
          used: prev[slotKey].used + 1
        }
      }));
    }
  };

  const restoreSpellSlot = (level: number) => {
    const slotKey = `level${level}`;
    if (spellSlots[slotKey] && spellSlots[slotKey].used > 0) {
      setSpellSlots(prev => ({
        ...prev,
        [slotKey]: {
          ...prev[slotKey],
          used: prev[slotKey].used - 1
        }
      }));
    }
  };

  const shortRest = () => {
    // Some classes recover spell slots on short rest (like Warlocks)
    // For now, just show the action is available
  };

  const longRest = () => {
    setSpellSlots(prev => {
      const reset = { ...prev };
      Object.keys(reset).forEach(key => {
        reset[key].used = 0;
      });
      return reset;
    });
  };

  const castSpell = (spell: SpellData) => {
    if (spell.level === 0) {
      // Cantrips don't use spell slots
      return;
    }

    const requiredLevel = Math.max(spell.level, castingLevel);
    const slotKey = `level${requiredLevel}`;
    
    if (!spellSlots[slotKey] || spellSlots[slotKey].used >= spellSlots[slotKey].total) {
      alert(`No level ${requiredLevel} spell slots available!`);
      return;
    }

    consumeSpellSlot(requiredLevel);
  };

  const renderSlotsTab = () => (
    <div className={styles.slotsTab}>
      <div className={styles.spellSlotsHeader}>
        <h3>Spell Slots</h3>
        <div className={styles.restButtons}>
          <button className={clsx(styles.restBtn, styles.restBtnShort)} onClick={shortRest}>Short Rest</button>
          <button className={clsx(styles.restBtn, styles.restBtnLong)} onClick={longRest}>Long Rest</button>
        </div>
      </div>

      <div className={styles.spellSlotsGrid}>
        {Object.entries(spellSlots).map(([level, slots]) => {
          const levelNum = parseInt(level.replace('level', ''));
          const available = slots.total - slots.used;
          
          return (
            <div key={level} className={styles.spellSlotLevel}>
              <div className={styles.slotHeader}>
                <h4>Level {levelNum}</h4>
                <div className={styles.slotCounter}>{available}/{slots.total}</div>
              </div>
              
              <div className={styles.slotCircles}>
                {Array.from({ length: slots.total }, (_, i) => (
                  <div
                    key={i}
                    className={clsx(styles.slotCircle, i < slots.used ? styles.used : styles.available)}
                    onClick={() => {
                      if (i < slots.used) {
                        restoreSpellSlot(levelNum);
                      } else if (i === slots.used && slots.used < slots.total) {
                        consumeSpellSlot(levelNum);
                      }
                    }}
                  />
                ))}
              </div>
              
              <div className={styles.slotControls}>
                <button 
                  className={styles.useSlotBtn}
                  onClick={() => consumeSpellSlot(levelNum)}
                  disabled={available === 0}
                >
                  Use Slot
                </button>
                <button 
                  className={styles.restoreSlotBtn}
                  onClick={() => restoreSpellSlot(levelNum)}
                  disabled={slots.used === 0}
                >
                  Restore
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {Object.keys(spellSlots).length === 0 && (
        <div className={styles.noSlots}>
          This character class doesn't have spell slots.
        </div>
      )}
    </div>
  );

  const renderPrepareTab = () => (
    <div className={styles.prepareTab}>
      <h3>Prepare Spells</h3>
      
      <div className={styles.spellCategories}>
        <div className={styles.cantripsSection}>
          <h4>Cantrips</h4>
          <div className={styles.spellList}>
            {character.spells?.cantrips?.map((spell, index) => (
              <div key={index} className={clsx(styles.preparedSpell, styles.cantrip)}>
                <span className={styles.spellName}>{spell}</span>
                <button className={styles.removeSpell} onClick={() => {
                  // Remove cantrip logic
                  if (onUpdateCharacter) {
                    const updated = { ...character };
                    updated.spells!.cantrips = updated.spells!.cantrips.filter((_, i) => i !== index);
                    onUpdateCharacter(updated);
                  }
                }}>×</button>
              </div>
            )) || <div className={styles.noSpells}>No cantrips prepared</div>}
          </div>
        </div>

        <div className={styles.knownSpellsSection}>
          <h4>Known Spells</h4>
          <div className={styles.spellList}>
            {character.spells?.knownSpells?.map((spell, index) => (
              <div key={index} className={clsx(styles.preparedSpell, styles.known)}>
                <span className={styles.spellName}>{spell}</span>
                <button className={styles.removeSpell} onClick={() => {
                  // Remove known spell logic
                  if (onUpdateCharacter) {
                    const updated = { ...character };
                    updated.spells!.knownSpells = updated.spells!.knownSpells.filter((_, i) => i !== index);
                    onUpdateCharacter(updated);
                  }
                }}>×</button>
              </div>
            )) || <div className={styles.noSpells}>No spells known</div>}
          </div>
        </div>

        <div className={styles.preparedSpellsSection}>
          <h4>Prepared Spells</h4>
          <div className={styles.spellList}>
            {character.spells?.preparedSpells?.map((spell, index) => (
              <div key={index} className={clsx(styles.preparedSpell, styles.prepared)}>
                <span className={styles.spellName}>{spell}</span>
                <button className={styles.removeSpell} onClick={() => {
                  // Remove prepared spell logic
                  if (onUpdateCharacter) {
                    const updated = { ...character };
                    updated.spells!.preparedSpells = updated.spells!.preparedSpells.filter((_, i) => i !== index);
                    onUpdateCharacter(updated);
                  }
                }}>×</button>
              </div>
            )) || <div className={styles.noSpells}>No spells prepared</div>}
          </div>
        </div>
      </div>
    </div>
  );

  const renderCastTab = () => (
    <div className={styles.castTab}>
      <div className={styles.castingControls}>
        <h3>Cast Spell</h3>
        <div className={styles.castingLevel}>
          <label htmlFor="casting-level">Casting Level:</label>
          <select 
            id="casting-level"
            className={styles.castingLevelSelect}
            value={castingLevel} 
            onChange={(e) => setCastingLevel(parseInt(e.target.value))}
          >
            {Object.keys(spellSlots).map(level => {
              const levelNum = parseInt(level.replace('level', ''));
              const available = spellSlots[level].total - spellSlots[level].used;
              return (
                <option 
                  key={level} 
                  value={levelNum}
                  disabled={available === 0}
                >
                  Level {levelNum} ({available} available)
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className={styles.castableSpells}>
        <h4>Available Spells to Cast</h4>
        <div className={styles.spellGrid}>
          {knownSpellNames.map((spellName, index) => {
            const spellData: SpellData = {
              name: spellName,
              level: 1,
              school: 'Unknown',
              castingTime: '1 action',
              range: 'Unknown',
              components: 'Unknown',
              duration: 'Unknown',
              description: 'Spell details not available'
            };
            
            return (
              <div key={index} className={styles.castableSpellCard}>
                <div className={styles.spellHeader}>
                  <h5>{spellData.name}</h5>
                  <div className={styles.spellLevel}>
                    {spellData.level === 0 ? 'Cantrip' : `Level ${spellData.level}`}
                  </div>
                </div>
                <div className={styles.spellSchool}>{spellData.school}</div>
                <div className={styles.spellCastingInfo}>
                  <div>Time: {spellData.castingTime}</div>
                  <div>Range: {spellData.range}</div>
                </div>
                <button 
                  className={styles.castSpellBtn}
                  onClick={() => castSpell(spellData)}
                  disabled={spellData.level > 0 && castingLevel < spellData.level}
                >
                  Cast Spell
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderLibraryTab = () => (
    <div className={styles.libraryTab}>
      <div className={styles.libraryHeader}>
        <h3>Spell Library</h3>
        <div className={styles.libraryFilters}>
          <input
            type="text"
            placeholder="Search spells..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
          <select 
            value={filterLevel || ''} 
            onChange={(e) => setFilterLevel(e.target.value ? parseInt(e.target.value) : null)}
            className={styles.filterSelect}
          >
            <option value="">All Levels</option>
            <option value={0}>Cantrips</option>
            {[1,2,3,4,5,6,7,8,9].map(level => (
              <option key={level} value={level}>Level {level}</option>
            ))}
          </select>
          <select 
            value={filterSchool} 
            onChange={(e) => setFilterSchool(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">All Schools</option>
            <option value="Abjuration">Abjuration</option>
            <option value="Conjuration">Conjuration</option>
            <option value="Divination">Divination</option>
            <option value="Enchantment">Enchantment</option>
            <option value="Evocation">Evocation</option>
            <option value="Illusion">Illusion</option>
            <option value="Necromancy">Necromancy</option>
            <option value="Transmutation">Transmutation</option>
          </select>
        </div>
      </div>

      <div className={styles.spellLibraryGrid}>
        {getFilteredSpells().map((spell, index) => (
          <div key={index} className={styles.librarySpellCard}>
            <div className={styles.spellHeader}>
              <h4>{spell.name}</h4>
              <div className={styles.spellLevel}>
                {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}
              </div>
            </div>
            <div className={styles.spellSchool}>{spell.school}</div>
            <div className={styles.spellStats}>
              <div className={styles.spellStatItem}><strong>Time:</strong> {spell.castingTime}</div>
              <div className={styles.spellStatItem}><strong>Range:</strong> {spell.range}</div>
              <div className={styles.spellStatItem}><strong>Duration:</strong> {spell.duration}</div>
              <div className={styles.spellStatItem}><strong>Components:</strong> {spell.components}</div>
            </div>
            {spell.damage && (
              <div className={styles.spellDamage}><strong>Damage:</strong> {spell.damage}</div>
            )}
            {spell.savingThrow && (
              <div className={styles.spellSave}><strong>Save:</strong> {spell.savingThrow}</div>
            )}
            <div className={styles.spellDescription}>{spell.description}</div>
            <button 
              className={styles.viewSpellBtn}
              onClick={() => setSelectedSpell(spell)}
            >
              View Details
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={styles.spellManager}>
      {/* Header */}
      <div className={styles.managerHeader}>
        <div>
          <h2 className={styles.managerTitleHeading}>Spell Manager</h2>
          <div className={styles.characterInfo}>
            {character.name} - {character.class} Level {character.advancement?.currentLevel || 1}
          </div>
        </div>
        {onClose && (
          <button className={styles.closeManager} onClick={onClose}>
            <span>×</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className={styles.managerTabs}>
        <button 
          className={clsx(styles.spellTabButton, activeTab === 'slots' && styles.spellTabButtonActive)}
          onClick={() => setActiveTab('slots')}
        >
          Spell Slots
        </button>
        <button 
          className={clsx(styles.spellTabButton, activeTab === 'prepare' && styles.spellTabButtonActive)}
          onClick={() => setActiveTab('prepare')}
        >
          Prepare
        </button>
        <button 
          className={clsx(styles.spellTabButton, activeTab === 'cast' && styles.spellTabButtonActive)}
          onClick={() => setActiveTab('cast')}
        >
          Cast
        </button>
        <button 
          className={clsx(styles.spellTabButton, activeTab === 'library' && styles.spellTabButtonActive)}
          onClick={() => setActiveTab('library')}
        >
          Library
        </button>
      </div>

      {/* Content */}
      <div className={styles.managerContent}>
        {activeTab === 'slots' && renderSlotsTab()}
        {activeTab === 'prepare' && renderPrepareTab()}
        {activeTab === 'cast' && renderCastTab()}
        {activeTab === 'library' && renderLibraryTab()}
      </div>

      {/* Spell Detail Modal */}
      {selectedSpell && (
        <div className={styles.spellModalOverlay} onClick={() => setSelectedSpell(null)}>
          <div className={styles.spellModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{selectedSpell.name}</h3>
              <button className={styles.closeModal} onClick={() => setSelectedSpell(null)}>×</button>
            </div>
            <div className={styles.modalContent}>
              <div className={styles.spellLevelSchool}>
                {selectedSpell.level === 0 ? 'Cantrip' : `Level ${selectedSpell.level}`} {selectedSpell.school}
              </div>
              <div className={styles.spellStatsDetailed}>
                <div><strong>Casting Time:</strong> {selectedSpell.castingTime}</div>
                <div><strong>Range:</strong> {selectedSpell.range}</div>
                <div><strong>Components:</strong> {selectedSpell.components}</div>
                <div><strong>Duration:</strong> {selectedSpell.duration}</div>
              </div>
              {selectedSpell.damage && (
                <div className={styles.spellDamage}><strong>Damage:</strong> {selectedSpell.damage}</div>
              )}
              {selectedSpell.savingThrow && (
                <div className={styles.spellSave}><strong>Saving Throw:</strong> {selectedSpell.savingThrow}</div>
              )}
              <div className={styles.spellDescriptionDetailed}>{selectedSpell.description}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
