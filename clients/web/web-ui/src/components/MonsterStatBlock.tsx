/**
 * Monster Stat Block Component
 * D&D 5e Monster Manual style stat block for NPCs and monsters
 * Production-ready implementation following official D&D stat block format
 */

import React from 'react';
import type { Character } from '../types';
import styles from './MonsterStatBlock.module.css';

interface MonsterStatBlockProps {
  character: Character;
  onClose?: () => void;
  onEdit?: () => void;
}

export const MonsterStatBlock: React.FC<MonsterStatBlockProps> = ({ character, onClose, onEdit }) => {
  const data = character.data || {};
  
  // Extract core stats
  const name = data.name || character.name || 'Unnamed Creature';
  const size = data.size || 'Medium';
  const type = data.type || 'humanoid';
  const subtype = data.subtype;
  const alignment = data.alignment || 'Unaligned';
  
  // Combat stats
  const stats = data.stats || {};
  const ac = stats.ac || 10;
  const acNotes = stats.acNotes || '';
  const hp = stats.hp || 1;
  const maxHp = stats.maxHp || hp;
  const hitDice = stats.hitDice || '1d8';
  const speed = stats.speed || 30;
  
  // Ability scores
  const abilities = data.abilityScores || {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
  };
  
  // Calculate ability modifiers
  const getModifier = (score: number): string => {
    const mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };
  
  // Skills, senses, languages
  const skills = data.skills || {};
  const senses = data.senses || {};
  const languages = data.languages || [];
  
  // Challenge rating
  const cr = data.challengeRating || '0';
  const xp = data.experiencePoints || 0;
  const profBonus = data.proficiencyBonus || 2;
  
  // Resistances and immunities
  const damageVulnerabilities = data.damageVulnerabilities || [];
  const damageResistances = data.damageResistances || [];
  const damageImmunities = data.damageImmunities || [];
  const conditionImmunities = data.conditionImmunities || [];
  
  // Traits, actions, reactions
  const traits = data.traits || [];
  const actions = data.actions || [];
  const bonusActions = data.bonusActions || [];
  const reactions = data.reactions || [];
  const legendaryActions = data.legendaryActions || [];
  
  // Format type string
  const typeString = subtype 
    ? `${size} ${type} (${subtype}), ${alignment}`
    : `${size} ${type}, ${alignment}`;
  
  // Format skills list
  const skillsList = Object.entries(skills)
    .filter(([_, value]: [string, any]) => value.proficient || value.bonus)
    .map(([skill, value]: [string, any]) => {
      const bonus = value.bonus || 0;
      return `${skill.charAt(0).toUpperCase() + skill.slice(1)} ${bonus >= 0 ? '+' : ''}${bonus}`;
    })
    .join(', ');
  
  // Format senses list
  const sensesList = Object.entries(senses)
    .filter(([key, value]) => key !== 'passivePerception' && value)
    .map(([sense, range]) => `${sense} ${range} ft.`)
    .join(', ');
  
  const passivePerception = senses.passivePerception || (10 + Math.floor((abilities.wisdom - 10) / 2));
  const fullSenses = sensesList 
    ? `${sensesList}, passive Perception ${passivePerception}`
    : `passive Perception ${passivePerception}`;
  
  return (
    <div className={styles.statBlock}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h2 className={styles.creatureName}>{name}</h2>
          <div className={styles.creatureType}>{typeString}</div>
        </div>
        {(onClose || onEdit) && (
          <div className={styles.actions}>
            {onEdit && (
              <button className={styles.editBtn} onClick={onEdit} title="Edit">
                ✏️
              </button>
            )}
            {onClose && (
              <button className={styles.closeBtn} onClick={onClose} title="Close">
                ✕
              </button>
            )}
          </div>
        )}
      </div>
      
      <div className={styles.divider} />
      
      {/* Armor Class, Hit Points, Speed */}
      <div className={styles.topStats}>
        <div className={styles.statLine}>
          <strong>Armor Class</strong> {ac}{acNotes && ` (${acNotes})`}
        </div>
        <div className={styles.statLine}>
          <strong>Hit Points</strong> {hp}/{maxHp} ({hitDice})
        </div>
        <div className={styles.statLine}>
          <strong>Speed</strong> {speed} ft.
        </div>
      </div>
      
      <div className={styles.divider} />
      
      {/* Ability Scores */}
      <div className={styles.abilityScores}>
        <div className={styles.ability}>
          <div className={styles.abilityName}>STR</div>
          <div className={styles.abilityScore}>
            {abilities.strength} ({getModifier(abilities.strength)})
          </div>
        </div>
        <div className={styles.ability}>
          <div className={styles.abilityName}>DEX</div>
          <div className={styles.abilityScore}>
            {abilities.dexterity} ({getModifier(abilities.dexterity)})
          </div>
        </div>
        <div className={styles.ability}>
          <div className={styles.abilityName}>CON</div>
          <div className={styles.abilityScore}>
            {abilities.constitution} ({getModifier(abilities.constitution)})
          </div>
        </div>
        <div className={styles.ability}>
          <div className={styles.abilityName}>INT</div>
          <div className={styles.abilityScore}>
            {abilities.intelligence} ({getModifier(abilities.intelligence)})
          </div>
        </div>
        <div className={styles.ability}>
          <div className={styles.abilityName}>WIS</div>
          <div className={styles.abilityScore}>
            {abilities.wisdom} ({getModifier(abilities.wisdom)})
          </div>
        </div>
        <div className={styles.ability}>
          <div className={styles.abilityName}>CHA</div>
          <div className={styles.abilityScore}>
            {abilities.charisma} ({getModifier(abilities.charisma)})
          </div>
        </div>
      </div>
      
      <div className={styles.divider} />
      
      {/* Skills, Senses, Languages, CR */}
      <div className={styles.metadata}>
        {skillsList && (
          <div className={styles.metaLine}>
            <strong>Skills</strong> {skillsList}
          </div>
        )}
        
        {damageVulnerabilities.length > 0 && (
          <div className={styles.metaLine}>
            <strong>Damage Vulnerabilities</strong> {damageVulnerabilities.join(', ')}
          </div>
        )}
        
        {damageResistances.length > 0 && (
          <div className={styles.metaLine}>
            <strong>Damage Resistances</strong> {damageResistances.join(', ')}
          </div>
        )}
        
        {damageImmunities.length > 0 && (
          <div className={styles.metaLine}>
            <strong>Damage Immunities</strong> {damageImmunities.join(', ')}
          </div>
        )}
        
        {conditionImmunities.length > 0 && (
          <div className={styles.metaLine}>
            <strong>Condition Immunities</strong> {conditionImmunities.join(', ')}
          </div>
        )}
        
        <div className={styles.metaLine}>
          <strong>Senses</strong> {fullSenses}
        </div>
        
        <div className={styles.metaLine}>
          <strong>Languages</strong> {languages.length > 0 ? languages.join(', ') : '—'}
        </div>
        
        <div className={styles.metaLine}>
          <strong>Challenge</strong> {cr} ({xp.toLocaleString()} XP, proficiency bonus {profBonus >= 0 ? '+' : ''}{profBonus})
        </div>
      </div>
      
      {traits.length > 0 && (
        <>
          <div className={styles.divider} />
          
          {/* Traits */}
          <div className={styles.traits}>
            {traits.map((trait: any, index: number) => (
              <div key={index} className={styles.trait}>
                <div className={styles.traitName}>{trait.name}.</div>
                <div className={styles.traitDescription}>{trait.description}</div>
              </div>
            ))}
          </div>
        </>
      )}
      
      {actions.length > 0 && (
        <>
          <div className={styles.sectionHeader}>Actions</div>
          
          <div className={styles.actions}>
            {actions.map((action: any, index: number) => (
              <div key={index} className={styles.action}>
                <div className={styles.actionName}>{action.name}.</div>
                <div className={styles.actionDescription}>{action.description}</div>
              </div>
            ))}
          </div>
        </>
      )}
      
      {bonusActions.length > 0 && (
        <>
          <div className={styles.sectionHeader}>Bonus Actions</div>
          
          <div className={styles.actions}>
            {bonusActions.map((action: any, index: number) => (
              <div key={index} className={styles.action}>
                <div className={styles.actionName}>{action.name}.</div>
                <div className={styles.actionDescription}>{action.description}</div>
              </div>
            ))}
          </div>
        </>
      )}
      
      {reactions.length > 0 && (
        <>
          <div className={styles.sectionHeader}>Reactions</div>
          
          <div className={styles.actions}>
            {reactions.map((reaction: any, index: number) => (
              <div key={index} className={styles.action}>
                <div className={styles.actionName}>{reaction.name}.</div>
                <div className={styles.actionDescription}>{reaction.description}</div>
              </div>
            ))}
          </div>
        </>
      )}
      
      {legendaryActions.length > 0 && (
        <>
          <div className={styles.sectionHeader}>Legendary Actions</div>
          
          <div className={styles.legendaryDesc}>
            The {name.toLowerCase()} can take 3 legendary actions, choosing from the options below.
            Only one legendary action can be used at a time and only at the end of another creature's turn.
            The {name.toLowerCase()} regains spent legendary actions at the start of its turn.
          </div>
          
          <div className={styles.actions}>
            {legendaryActions.map((action: any, index: number) => (
              <div key={index} className={styles.action}>
                <div className={styles.actionName}>{action.name}.</div>
                <div className={styles.actionDescription}>{action.description}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
