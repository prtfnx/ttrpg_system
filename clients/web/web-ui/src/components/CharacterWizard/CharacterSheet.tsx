import React, { useMemo, useState } from 'react';
import { CombatSystemService } from '../../services/combatSystem.service';
import './Charac          }) || []}
          
          {(!character.equipment?.items || character.equipment.items.filter(item => 
            item.equipment.name.toLowerCase().includes('sword') ||
            item.equipment.name.toLowerCase().includes('bow') ||
            item.equipment.name.toLowerCase().includes('dagger') ||
            item.equipment.name.toLowerCase().includes('weapon')
          ).length === 0) && (
            <div className="attack-item">
              <div className="attack-name">Unarmed Strike</div>
              <div className="attack-bonus">{formatBonus(combatStats.proficiencyBonus + Math.floor(((character.strength || 10) - 10) / 2))} to hit</div>
              <div className="attack-damage">1{formatBonus(Math.floor(((character.strength || 10) - 10) / 2))} bludgeoning</div>
            </div>
          )}css';
import type { WizardFormData } from './WizardFormData';

interface CharacterSheetProps {
  character: WizardFormData;
  onClose?: () => void;
}

export const CharacterSheet: React.FC<CharacterSheetProps> = ({ character, onClose }) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'combat' | 'spells' | 'equipment' | 'notes'>('stats');
  
  // Calculate all combat statistics
  const combatStats = useMemo(() => {
    return CombatSystemService.generateCombatStats(character);
  }, [character]);

  const formatModifier = (score: number): string => {
    const modifier = Math.floor((score - 10) / 2);
    return modifier >= 0 ? `+${modifier}` : `${modifier}`;
  };

  const formatBonus = (bonus: number): string => {
    return bonus >= 0 ? `+${bonus}` : `${bonus}`;
  };

  const renderStatsTab = () => (
    <div className="stats-tab">
      {/* Ability Scores */}
      <div className="ability-scores">
        <h3>Ability Scores</h3>
        <div className="abilities-grid">
          {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map(ability => (
            <div key={ability} className="ability-card">
              <div className="ability-name">{ability.toUpperCase()}</div>
              <div className="ability-score">{character.abilityScores?.[ability] || 10}</div>
              <div className="ability-modifier">{formatModifier(character.abilityScores?.[ability] || 10)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Skills */}
      <div className="skills-section">
        <h3>Skills</h3>
        <div className="skills-grid">
          {Object.entries(combatStats.skills).map(([skill, bonus]) => {
            return (
              <div key={skill} className="skill-item">
                <span className="skill-name">{skill.replace(/([A-Z])/g, ' $1').trim()}</span>
                <span className="skill-bonus">{formatBonus(bonus as number)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Saving Throws */}
      <div className="saves-section">
        <h3>Saving Throws</h3>
        <div className="saves-grid">
          {Object.entries(combatStats.savingThrows).map(([save, bonus]) => {
            return (
              <div key={save} className="save-item">
                <span className="save-name">{save.toUpperCase()}</span>
                <span className="save-bonus">{formatBonus(bonus as number)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderCombatTab = () => (
    <div className="combat-tab">
      {/* Combat Stats */}
      <div className="combat-stats-section">
        <h3>Combat Statistics</h3>
        <div className="combat-stats-grid">
          <div className="combat-stat">
            <div className="stat-label">Armor Class</div>
            <div className="stat-value">{combatStats.armorClass}</div>
          </div>
          <div className="combat-stat">
            <div className="stat-label">Hit Points</div>
            <div className="stat-value">{combatStats.hitPoints}</div>
          </div>
          <div className="combat-stat">
            <div className="stat-label">Hit Dice</div>
            <div className="stat-value">{combatStats.hitDice.join(', ')}</div>
          </div>
          <div className="combat-stat">
            <div className="stat-label">Speed</div>
            <div className="stat-value">{character.race === 'Halfling' || character.race === 'Dwarf' || character.race === 'Gnome' ? 25 : 30} ft</div>
          </div>
          <div className="combat-stat">
            <div className="stat-label">Initiative</div>
            <div className="stat-value">{formatBonus(combatStats.initiative)}</div>
          </div>
          <div className="combat-stat">
            <div className="stat-label">Proficiency Bonus</div>
            <div className="stat-value">{formatBonus(combatStats.proficiencyBonus)}</div>
          </div>
        </div>
      </div>

      {/* Attack Information */}
      <div className="attacks-section">
        <h3>Attacks</h3>
        <div className="attacks-list">
          {character.equipment?.weapons?.map((weapon, index) => {
            const isFinesse = weapon.toLowerCase().includes('rapier') || 
                            weapon.toLowerCase().includes('dagger') || 
                            weapon.toLowerCase().includes('shortsword');
            const isRanged = weapon.toLowerCase().includes('bow') || 
                           weapon.toLowerCase().includes('crossbow') ||
                           weapon.toLowerCase().includes('dart');
            
            let attackBonus = combatStats.proficiencyBonus;
            let damageBonus = 0;
            
            if (isRanged || (isFinesse && (character.abilityScores?.dexterity || 10) > (character.abilityScores?.strength || 10))) {
              attackBonus += Math.floor(((character.abilityScores?.dexterity || 10) - 10) / 2);
              damageBonus = Math.floor(((character.abilityScores?.dexterity || 10) - 10) / 2);
            } else {
              attackBonus += Math.floor(((character.abilityScores?.strength || 10) - 10) / 2);
              damageBonus = Math.floor(((character.abilityScores?.strength || 10) - 10) / 2);
            }

            const damageType = weapon.toLowerCase().includes('sword') || weapon.toLowerCase().includes('dagger') ? 'slashing/piercing' :
                              weapon.toLowerCase().includes('mace') || weapon.toLowerCase().includes('hammer') ? 'bludgeoning' :
                              weapon.toLowerCase().includes('bow') || weapon.toLowerCase().includes('crossbow') ? 'piercing' :
                              'bludgeoning';

            return (
              <div key={index} className="attack-item">
                <div className="attack-name">{weapon}</div>
                <div className="attack-bonus">{formatBonus(attackBonus)} to hit</div>
                <div className="attack-damage">1d8{formatBonus(damageBonus)} {damageType}</div>
              </div>
            );
          }) || (
            <div className="no-weapons">
              <div className="attack-item">
                <div className="attack-name">Unarmed Strike</div>
                <div className="attack-bonus">{formatBonus(combatStats.proficiencyBonus + Math.floor(((character.abilityScores?.strength || 10) - 10) / 2))} to hit</div>
                <div className="attack-damage">1{formatBonus(Math.floor(((character.abilityScores?.strength || 10) - 10) / 2))} bludgeoning</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderSpellsTab = () => (
    <div className="spells-tab">
      {/* Spell Slots */}
      {combatStats.spellSlots && Object.keys(combatStats.spellSlots).length > 0 && (
        <div className="spell-slots-section">
          <h3>Spell Slots</h3>
          <div className="spell-slots-grid">
            {Object.entries(combatStats.spellSlots).map(([level, slots]) => (
              <div key={level} className="spell-slot-level">
                <div className="slot-level">Level {level}</div>
                <div className="slot-count">{slots} slots</div>
                <div className="slot-tracker">
                  {Array.from({ length: slots }, (_, i) => (
                    <div key={i} className="slot-circle available"></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spellcasting Info */}
      {(character.class === 'Wizard' || character.class === 'Sorcerer' || character.class === 'Cleric' || character.class === 'Druid' || character.class === 'Bard') && (
        <div className="spellcasting-section">
          <h3>Spellcasting</h3>
          <div className="spellcasting-stats">
            <div className="spellcasting-stat">
              <div className="stat-label">Spellcasting Ability</div>
              <div className="stat-value">
                {character.class === 'Wizard' ? 'Intelligence' :
                 character.class === 'Sorcerer' ? 'Charisma' :
                 character.class === 'Cleric' || character.class === 'Druid' ? 'Wisdom' :
                 character.class === 'Bard' ? 'Charisma' : 'None'}
              </div>
            </div>
            <div className="spellcasting-stat">
              <div className="stat-label">Spell Save DC</div>
              <div className="stat-value">{combatStats.spellSaveDC}</div>
            </div>
            <div className="spellcasting-stat">
              <div className="stat-label">Spell Attack Bonus</div>
              <div className="stat-value">{formatBonus(combatStats.spellAttackBonus)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Spells Known/Prepared */}
      <div className="spells-known-section">
        <h3>Spells</h3>
        <div className="spells-list">
          {character.spells && character.spells.length > 0 ? (
            character.spells.map((spell, index) => (
              <div key={index} className="spell-item">
                <div className="spell-name">{spell}</div>
              </div>
            ))
          ) : (
            <div className="no-spells">No spells selected</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderEquipmentTab = () => (
    <div className="equipment-tab">
      {/* Armor */}
      <div className="equipment-section">
        <h3>Armor</h3>
        <div className="equipment-list">
          {character.equipment?.armor && character.equipment.armor.length > 0 ? (
            character.equipment.armor.map((armor, index) => (
              <div key={index} className="equipment-item">
                <div className="item-name">{armor}</div>
              </div>
            ))
          ) : (
            <div className="no-equipment">No armor equipped</div>
          )}
        </div>
      </div>

      {/* Weapons */}
      <div className="equipment-section">
        <h3>Weapons</h3>
        <div className="equipment-list">
          {character.equipment?.weapons && character.equipment.weapons.length > 0 ? (
            character.equipment.weapons.map((weapon, index) => (
              <div key={index} className="equipment-item">
                <div className="item-name">{weapon}</div>
              </div>
            ))
          ) : (
            <div className="no-equipment">No weapons equipped</div>
          )}
        </div>
      </div>

      {/* Other Equipment */}
      <div className="equipment-section">
        <h3>Other Equipment</h3>
        <div className="equipment-list">
          {character.equipment?.other && character.equipment.other.length > 0 ? (
            character.equipment.other.map((item, index) => (
              <div key={index} className="equipment-item">
                <div className="item-name">{item}</div>
              </div>
            ))
          ) : (
            <div className="no-equipment">No other equipment</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderNotesTab = () => (
    <div className="notes-tab">
      <div className="character-background">
        <h3>Character Background</h3>
        <div className="background-info">
          <div className="background-item">
            <strong>Background:</strong> {character.background || 'Not selected'}
          </div>
          {character.personalityTraits && (
            <div className="background-item">
              <strong>Personality Traits:</strong> {character.personalityTraits}
            </div>
          )}
          {character.ideals && (
            <div className="background-item">
              <strong>Ideals:</strong> {character.ideals}
            </div>
          )}
          {character.bonds && (
            <div className="background-item">
              <strong>Bonds:</strong> {character.bonds}
            </div>
          )}
          {character.flaws && (
            <div className="background-item">
              <strong>Flaws:</strong> {character.flaws}
            </div>
          )}
        </div>
      </div>

      <div className="character-features">
        <h3>Features & Traits</h3>
        <div className="features-list">
          {character.features && character.features.length > 0 ? (
            character.features.map((feature, index) => (
              <div key={index} className="feature-item">
                <div className="feature-name">{feature.name}</div>
                <div className="feature-description">{feature.description}</div>
              </div>
            ))
          ) : (
            <div className="no-features">No features selected</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="character-sheet">
      {/* Header */}
      <div className="sheet-header">
        <div className="character-title">
          <h1>{character.name || 'Unnamed Character'}</h1>
          <div className="character-subtitle">
            Level {character.level || 1} {character.race || 'Unknown'} {character.class || 'Unknown'}
            {character.subclass && ` (${character.subclass})`}
          </div>
        </div>
        {onClose && (
          <button className="close-sheet" onClick={onClose}>
            <span>×</span>
          </button>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="sheet-tabs">
        <button 
          className={`tab-button ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Stats & Skills
        </button>
        <button 
          className={`tab-button ${activeTab === 'combat' ? 'active' : ''}`}
          onClick={() => setActiveTab('combat')}
        >
          Combat
        </button>
        <button 
          className={`tab-button ${activeTab === 'spells' ? 'active' : ''}`}
          onClick={() => setActiveTab('spells')}
        >
          Spells
        </button>
        <button 
          className={`tab-button ${activeTab === 'equipment' ? 'active' : ''}`}
          onClick={() => setActiveTab('equipment')}
        >
          Equipment
        </button>
        <button 
          className={`tab-button ${activeTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          Notes
        </button>
      </div>

      {/* Tab Content */}
      <div className="sheet-content">
        {activeTab === 'stats' && renderStatsTab()}
        {activeTab === 'combat' && renderCombatTab()}
        {activeTab === 'spells' && renderSpellsTab()}
        {activeTab === 'equipment' && renderEquipmentTab()}
        {activeTab === 'notes' && renderNotesTab()}
      </div>
    </div>
  );
};