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

  // Sample spell data - in a real app, this would come from a spell database
  const sampleSpells: SpellData[] = [
    {
      name: "Magic Missile",
      level: 1,
      school: "Evocation",
      castingTime: "1 action",
      range: "120 feet",
      components: "V, S",
      duration: "Instantaneous",
      description: "You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several.",
      damage: "3 × (1d4 + 1) force",
      spellAttack: false
    },
    {
      name: "Cure Wounds",
      level: 1,
      school: "Evocation",
      castingTime: "1 action",
      range: "Touch",
      components: "V, S",
      duration: "Instantaneous",
      description: "A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier. This spell has no effect on undead or constructs.",
      damage: "1d8 + spellcasting modifier healing"
    },
    {
      name: "Fireball",
      level: 3,
      school: "Evocation",
      castingTime: "1 action",
      range: "150 feet",
      components: "V, S, M (a tiny ball of bat guano and sulfur)",
      duration: "Instantaneous",
      description: "A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A creature takes 8d6 fire damage on a failed save, or half as much damage on a successful one.",
      damage: "8d6 fire",
      savingThrow: "Dexterity"
    },
    {
      name: "Shield",
      level: 1,
      school: "Abjuration",
      castingTime: "1 reaction",
      range: "Self",
      components: "V, S",
      duration: "1 round",
      description: "An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from magic missile."
    }
  ];

  const getFilteredSpells = (): SpellData[] => {
    return sampleSpells.filter(spell => {
      const matchesSearch = spell.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           spell.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLevel = filterLevel === null || spell.level === filterLevel;
      const matchesSchool = filterSchool === '' || spell.school === filterSchool;
      
      return matchesSearch && matchesLevel && matchesSchool;
    });
  };

  const useSpellSlot = (level: number) => {
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
    console.log('Short rest taken');
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
      console.log(`Cast cantrip: ${spell.name}`);
      return;
    }

    const requiredLevel = Math.max(spell.level, castingLevel);
    const slotKey = `level${requiredLevel}`;
    
    if (!spellSlots[slotKey] || spellSlots[slotKey].used >= spellSlots[slotKey].total) {
      alert(`No level ${requiredLevel} spell slots available!`);
      return;
    }

    useSpellSlot(requiredLevel);
    console.log(`Cast ${spell.name} using level ${requiredLevel} slot`);
  };

  const renderSlotsTab = () => (
    <div className="slots-tab">
      <div className="spell-slots-header">
        <h3>Spell Slots</h3>
        <div className="rest-buttons">
          <button className="rest-btn short" onClick={shortRest}>Short Rest</button>
          <button className="rest-btn long" onClick={longRest}>Long Rest</button>
        </div>
      </div>

      <div className="spell-slots-grid">
        {Object.entries(spellSlots).map(([level, slots]) => {
          const levelNum = parseInt(level.replace('level', ''));
          const available = slots.total - slots.used;
          
          return (
            <div key={level} className="spell-slot-level">
              <div className="slot-header">
                <h4>Level {levelNum}</h4>
                <div className="slot-counter">{available}/{slots.total}</div>
              </div>
              
              <div className="slot-circles">
                {Array.from({ length: slots.total }, (_, i) => (
                  <div
                    key={i}
                    className={`slot-circle ${i < slots.used ? 'used' : 'available'}`}
                    onClick={() => {
                      if (i < slots.used) {
                        restoreSpellSlot(levelNum);
                      } else if (i === slots.used && slots.used < slots.total) {
                        useSpellSlot(levelNum);
                      }
                    }}
                  />
                ))}
              </div>
              
              <div className="slot-controls">
                <button 
                  className="use-slot-btn"
                  onClick={() => useSpellSlot(levelNum)}
                  disabled={available === 0}
                >
                  Use Slot
                </button>
                <button 
                  className="restore-slot-btn"
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
        <div className="no-slots">
          This character class doesn't have spell slots.
        </div>
      )}
    </div>
  );

  const renderPrepareTab = () => (
    <div className="prepare-tab">
      <h3>Prepare Spells</h3>
      
      <div className="spell-categories">
        <div className="cantrips-section">
          <h4>Cantrips</h4>
          <div className={styles.spellList}>
            {character.spells?.cantrips?.map((spell, index) => (
              <div key={index} className="prepared-spell cantrip">
                <span className="spell-name">{spell}</span>
                <button className="remove-spell" onClick={() => {
                  // Remove cantrip logic
                  if (onUpdateCharacter) {
                    const updated = { ...character };
                    updated.spells!.cantrips = updated.spells!.cantrips.filter((_, i) => i !== index);
                    onUpdateCharacter(updated);
                  }
                }}>×</button>
              </div>
            )) || <div className="no-spells">No cantrips prepared</div>}
          </div>
        </div>

        <div className="known-spells-section">
          <h4>Known Spells</h4>
          <div className={styles.spellList}>
            {character.spells?.knownSpells?.map((spell, index) => (
              <div key={index} className="prepared-spell known">
                <span className="spell-name">{spell}</span>
                <button className="remove-spell" onClick={() => {
                  // Remove known spell logic
                  if (onUpdateCharacter) {
                    const updated = { ...character };
                    updated.spells!.knownSpells = updated.spells!.knownSpells.filter((_, i) => i !== index);
                    onUpdateCharacter(updated);
                  }
                }}>×</button>
              </div>
            )) || <div className="no-spells">No spells known</div>}
          </div>
        </div>

        <div className="prepared-spells-section">
          <h4>Prepared Spells</h4>
          <div className={styles.spellList}>
            {character.spells?.preparedSpells?.map((spell, index) => (
              <div key={index} className="prepared-spell prepared">
                <span className="spell-name">{spell}</span>
                <button className="remove-spell" onClick={() => {
                  // Remove prepared spell logic
                  if (onUpdateCharacter) {
                    const updated = { ...character };
                    updated.spells!.preparedSpells = updated.spells!.preparedSpells.filter((_, i) => i !== index);
                    onUpdateCharacter(updated);
                  }
                }}>×</button>
              </div>
            )) || <div className="no-spells">No spells prepared</div>}
          </div>
        </div>
      </div>
    </div>
  );

  const renderCastTab = () => (
    <div className="cast-tab">
      <div className="casting-controls">
        <h3>Cast Spell</h3>
        <div className="casting-level">
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

      <div className="castable-spells">
        <h4>Available Spells to Cast</h4>
        <div className="spell-grid">
          {[
            ...(character.spells?.cantrips || []),
            ...(character.spells?.preparedSpells || []),
            ...(character.spells?.knownSpells || [])
          ].map((spellName, index) => {
            const spellData = sampleSpells.find(s => s.name === spellName) || {
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
              <div key={index} className="castable-spell-card">
                <div className="spell-header">
                  <h5>{spellData.name}</h5>
                  <div className="spell-level">
                    {spellData.level === 0 ? 'Cantrip' : `Level ${spellData.level}`}
                  </div>
                </div>
                <div className="spell-school">{spellData.school}</div>
                <div className="spell-casting-info">
                  <div>Time: {spellData.castingTime}</div>
                  <div>Range: {spellData.range}</div>
                </div>
                <button 
                  className="cast-spell-btn"
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
    <div className="library-tab">
      <div className="library-header">
        <h3>Spell Library</h3>
        <div className="library-filters">
          <input
            type="text"
            placeholder="Search spells..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <select 
            value={filterLevel || ''} 
            onChange={(e) => setFilterLevel(e.target.value ? parseInt(e.target.value) : null)}
            className="filter-select"
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
            className="filter-select"
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

      <div className="spell-library-grid">
        {getFilteredSpells().map((spell, index) => (
          <div key={index} className="library-spell-card">
            <div className="spell-header">
              <h4>{spell.name}</h4>
              <div className="spell-level">
                {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}
              </div>
            </div>
            <div className="spell-school">{spell.school}</div>
            <div className="spell-stats">
              <div className={styles.spellStatsItem}><strong>Time:</strong> {spell.castingTime}</div>
              <div className={styles.spellStatsItem}><strong>Range:</strong> {spell.range}</div>
              <div className={styles.spellStatsItem}><strong>Duration:</strong> {spell.duration}</div>
              <div className={styles.spellStatsItem}><strong>Components:</strong> {spell.components}</div>
            </div>
            {spell.damage && (
              <div className="spell-damage"><strong>Damage:</strong> {spell.damage}</div>
            )}
            {spell.savingThrow && (
              <div className="spell-save"><strong>Save:</strong> {spell.savingThrow}</div>
            )}
            <div className="spell-description">{spell.description}</div>
            <button 
              className="view-spell-btn"
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
      <div className="manager-header">
        <div className="manager-title">
          <h2>Spell Manager</h2>
          <div className="character-info">
            {character.name} - {character.class} Level {character.advancement?.currentLevel || 1}
          </div>
        </div>
        {onClose && (
          <button className="close-manager" onClick={onClose}>
            <span>×</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="manager-tabs">
        <button 
          className={`tab-button ${activeTab === 'slots' ? 'active' : ''}`}
          onClick={() => setActiveTab('slots')}
        >
          Spell Slots
        </button>
        <button 
          className={`tab-button ${activeTab === 'prepare' ? 'active' : ''}`}
          onClick={() => setActiveTab('prepare')}
        >
          Prepare
        </button>
        <button 
          className={`tab-button ${activeTab === 'cast' ? 'active' : ''}`}
          onClick={() => setActiveTab('cast')}
        >
          Cast
        </button>
        <button 
          className={`tab-button ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          Library
        </button>
      </div>

      {/* Content */}
      <div className="manager-content">
        {activeTab === 'slots' && renderSlotsTab()}
        {activeTab === 'prepare' && renderPrepareTab()}
        {activeTab === 'cast' && renderCastTab()}
        {activeTab === 'library' && renderLibraryTab()}
      </div>

      {/* Spell Detail Modal */}
      {selectedSpell && (
        <div className="spell-modal-overlay" onClick={() => setSelectedSpell(null)}>
          <div className="spell-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedSpell.name}</h3>
              <button className="close-modal" onClick={() => setSelectedSpell(null)}>×</button>
            </div>
            <div className="modal-content">
              <div className="spell-level-school">
                {selectedSpell.level === 0 ? 'Cantrip' : `Level ${selectedSpell.level}`} {selectedSpell.school}
              </div>
              <div className="spell-stats-detailed">
                <div><strong>Casting Time:</strong> {selectedSpell.castingTime}</div>
                <div><strong>Range:</strong> {selectedSpell.range}</div>
                <div><strong>Components:</strong> {selectedSpell.components}</div>
                <div><strong>Duration:</strong> {selectedSpell.duration}</div>
              </div>
              {selectedSpell.damage && (
                <div className="spell-damage"><strong>Damage:</strong> {selectedSpell.damage}</div>
              )}
              {selectedSpell.savingThrow && (
                <div className="spell-save"><strong>Saving Throw:</strong> {selectedSpell.savingThrow}</div>
              )}
              <div className="spell-description-detailed">{selectedSpell.description}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};