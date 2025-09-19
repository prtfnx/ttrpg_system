/**
 * Character Export Service
 * Exports characters to various formats for sharing and backup
 */

import type { WizardFormData } from '../components/CharacterWizard/WizardFormData';

export interface D5eCharacterExport {
  version: string;
  timestamp: string;
  character: {
    // Basic Identity
    name: string;
    race: string;
    class: string;
    level: number;
    background: string;
    
    // Ability Scores
    abilities: {
      strength: number;
      dexterity: number;
      constitution: number;
      intelligence: number;
      wisdom: number;
      charisma: number;
    };
    
    // Skills & Proficiencies
    skills: string[];
    
    // Spellcasting (if applicable)
    spells?: {
      cantrips: string[];
      knownSpells: string[];
      preparedSpells: string[];
      spellcastingAbility?: 'intelligence' | 'wisdom' | 'charisma';
    };
    
    // Roleplay Information
    personality?: {
      bio?: string;
      image?: string;
    };
    
    // Calculated Values
    calculated: {
      hitPoints: number;
      armorClass: number;
      proficiencyBonus: number;
      speed: number;
      abilityModifiers: {
        strength: number;
        dexterity: number;
        constitution: number;
        intelligence: number;
        wisdom: number;
        charisma: number;
      };
      savingThrows: {
        strength: { value: number; proficient: boolean };
        dexterity: { value: number; proficient: boolean };
        constitution: { value: number; proficient: boolean };
        intelligence: { value: number; proficient: boolean };
        wisdom: { value: number; proficient: boolean };
        charisma: { value: number; proficient: boolean };
      };
      skillModifiers: Record<string, { value: number; proficient: boolean }>;
    };
    
    // Equipment (when implemented)
    equipment?: {
      weapons: string[];
      armor: string[];
      items: string[];
      gold: number;
    };
    
    // Feats (when implemented)
    feats?: Array<{
      name: string;
      source?: string;
      prerequisites?: string;
    }>;
  };
  
  // Metadata
  source: 'TTRPG_System_Web';
  exportedBy?: string;
  notes?: string;
}

export interface DNDBeyondExport {
  // D&D Beyond compatible format structure
  character: {
    id?: string;
    readonlyUrl?: string;
    decorations?: any;
    
    // Core character data matching D&D Beyond structure
    name: string;
    race: {
      fullName: string;
      baseRaceName: string;
    };
    classes: Array<{
      definition: {
        name: string;
        hitDie: number;
      };
      level: number;
      hitDieUsed: number;
      subclassDefinition?: {
        name: string;
      };
    }>;
    
    background: {
      definition: {
        name: string;
      };
    };
    
    stats: Array<{
      id: number; // 1-6 for STR, DEX, CON, INT, WIS, CHA
      value: number;
      bonus?: number;
    }>;
    
    modifiers: any[];
    classSpells?: any[];
    spells?: any;
    
    // Additional D&D Beyond fields
    baseHitPoints: number;
    bonusHitPoints: number;
    overrideHitPoints?: number;
    removedHitPoints: number;
    temporaryHitPoints: number;
  };
}

export interface CharacterSheetExport {
  // Simplified format for character sheet display
  character: {
    name: string;
    classAndLevel: string;
    background: string;
    race: string;
    
    abilityScores: {
      strength: number;
      dexterity: number;
      constitution: number;
      intelligence: number;
      wisdom: number;
      charisma: number;
    };
    
    modifiers: {
      strength: number;
      dexterity: number;
      constitution: number;
      intelligence: number;
      wisdom: number;
      charisma: number;
    };
    
    proficiencyBonus: number;
    armorClass: number;
    hitPoints: number;
    speed: number;
    
    skills: Array<{
      name: string;
      modifier: number;
      proficient: boolean;
    }>;
    
    savingThrows: Array<{
      name: string;
      modifier: number;
      proficient: boolean;
    }>;
    
    spells?: {
      spellcastingAbility?: string;
      spellAttackBonus?: number;
      spellSaveDC?: number;
      cantrips: string[];
      spells: Array<{
        level: number;
        name: string;
        prepared?: boolean;
      }>;
    };
  };
}

export class CharacterExportService {
  private static readonly EXPORT_VERSION = '1.0.0';
  
  /**
   * Calculate ability modifier from ability score
   */
  private static calculateModifier(score: number): number {
    return Math.floor((score - 10) / 2);
  }
  
  /**
   * Calculate proficiency bonus based on character level
   */
  private static calculateProficiencyBonus(level: number): number {
    return Math.ceil(level / 4) + 1;
  }
  
  /**
   * Get saving throw proficiencies for a class
   */
  private static getSavingThrowProficiencies(className: string): string[] {
    const proficiencies: Record<string, string[]> = {
      'Fighter': ['strength', 'constitution'],
      'Wizard': ['intelligence', 'wisdom'],
      'Rogue': ['dexterity', 'intelligence'],
      'Cleric': ['wisdom', 'charisma'],
      'Barbarian': ['strength', 'constitution'],
      'Bard': ['dexterity', 'charisma'],
      'Druid': ['intelligence', 'wisdom'],
      'Monk': ['strength', 'dexterity'],
      'Paladin': ['wisdom', 'charisma'],
      'Ranger': ['strength', 'dexterity'],
      'Sorcerer': ['constitution', 'charisma'],
      'Warlock': ['wisdom', 'charisma'],
    };
    
    return proficiencies[className] || [];
  }
  
  /**
   * Calculate base hit points for character
   */
  private static calculateHitPoints(className: string, level: number, constitutionModifier: number): number {
    const hitDice: Record<string, number> = {
      'Barbarian': 12,
      'Fighter': 10,
      'Paladin': 10,
      'Ranger': 10,
      'Bard': 8,
      'Cleric': 8,
      'Druid': 8,
      'Monk': 8,
      'Rogue': 8,
      'Warlock': 8,
      'Sorcerer': 6,
      'Wizard': 6,
    };
    
    const hitDie = hitDice[className] || 8;
    const baseHitPoints = hitDie + constitutionModifier;
    const additionalLevels = level - 1;
    const avgHitPointsPerLevel = Math.floor(hitDie / 2) + 1 + constitutionModifier;
    
    return baseHitPoints + (additionalLevels * avgHitPointsPerLevel);
  }
  
  /**
   * Calculate armor class (base 10 + Dex modifier without armor)
   */
  private static calculateArmorClass(dexterityModifier: number): number {
    // Base AC calculation - can be enhanced when equipment system is implemented
    return 10 + dexterityModifier;
  }
  
  /**
   * Get base speed for race
   */
  private static getBaseSpeed(race: string): number {
    const speeds: Record<string, number> = {
      'Human': 30,
      'Elf': 30,
      'Dwarf': 25,
      'Halfling': 25,
      'Dragonborn': 30,
      'Gnome': 25,
      'Half-Elf': 30,
      'Half-Orc': 30,
      'Tiefling': 30,
    };
    
    return speeds[race] || 30;
  }
  
  /**
   * Get spellcasting ability for class
   */
  private static getSpellcastingAbility(className: string): 'intelligence' | 'wisdom' | 'charisma' | undefined {
    const abilities: Record<string, 'intelligence' | 'wisdom' | 'charisma'> = {
      'Wizard': 'intelligence',
      'Cleric': 'wisdom',
      'Druid': 'wisdom',
      'Ranger': 'wisdom',
      'Monk': 'wisdom', // Ki save DC
      'Sorcerer': 'charisma',
      'Bard': 'charisma',
      'Warlock': 'charisma',
      'Paladin': 'charisma',
    };
    
    return abilities[className];
  }
  
  /**
   * Export character to comprehensive D&D 5e format
   */
  static exportToD5e(character: WizardFormData, additionalData?: any): D5eCharacterExport {
    const level = additionalData?.level || 1;
    const exportedBy = additionalData?.exportedBy;
    const notes = additionalData?.notes;
    
    // Calculate modifiers
    const abilityModifiers = {
      strength: this.calculateModifier(character.strength),
      dexterity: this.calculateModifier(character.dexterity),
      constitution: this.calculateModifier(character.constitution),
      intelligence: this.calculateModifier(character.intelligence),
      wisdom: this.calculateModifier(character.wisdom),
      charisma: this.calculateModifier(character.charisma),
    };
    
    const proficiencyBonus = this.calculateProficiencyBonus(level);
    const savingThrowProfs = this.getSavingThrowProficiencies(character.class);
    
    // Calculate saving throws
    const savingThrows = {
      strength: {
        value: abilityModifiers.strength + (savingThrowProfs.includes('strength') ? proficiencyBonus : 0),
        proficient: savingThrowProfs.includes('strength'),
      },
      dexterity: {
        value: abilityModifiers.dexterity + (savingThrowProfs.includes('dexterity') ? proficiencyBonus : 0),
        proficient: savingThrowProfs.includes('dexterity'),
      },
      constitution: {
        value: abilityModifiers.constitution + (savingThrowProfs.includes('constitution') ? proficiencyBonus : 0),
        proficient: savingThrowProfs.includes('constitution'),
      },
      intelligence: {
        value: abilityModifiers.intelligence + (savingThrowProfs.includes('intelligence') ? proficiencyBonus : 0),
        proficient: savingThrowProfs.includes('intelligence'),
      },
      wisdom: {
        value: abilityModifiers.wisdom + (savingThrowProfs.includes('wisdom') ? proficiencyBonus : 0),
        proficient: savingThrowProfs.includes('wisdom'),
      },
      charisma: {
        value: abilityModifiers.charisma + (savingThrowProfs.includes('charisma') ? proficiencyBonus : 0),
        proficient: savingThrowProfs.includes('charisma'),
      },
    };
    
    // Calculate skill modifiers
    const skillModifiers = this.calculateSkillModifiers(character.skills, abilityModifiers, proficiencyBonus);
    
    const spellcastingAbility = this.getSpellcastingAbility(character.class);
    
    return {
      version: this.EXPORT_VERSION,
      timestamp: new Date().toISOString(),
      character: {
        name: character.name,
        race: character.race,
        class: character.class,
        level,
        background: character.background,
        
        abilities: {
          strength: character.strength,
          dexterity: character.dexterity,
          constitution: character.constitution,
          intelligence: character.intelligence,
          wisdom: character.wisdom,
          charisma: character.charisma,
        },
        
        skills: character.skills,
        
        spells: character.spells ? {
          ...character.spells,
          spellcastingAbility,
        } : undefined,
        
        personality: {
          bio: character.bio,
          image: character.image,
        },
        
        calculated: {
          hitPoints: this.calculateHitPoints(character.class, level, abilityModifiers.constitution),
          armorClass: this.calculateArmorClass(abilityModifiers.dexterity),
          proficiencyBonus,
          speed: this.getBaseSpeed(character.race),
          abilityModifiers,
          savingThrows,
          skillModifiers,
        },
      },
      
      source: 'TTRPG_System_Web',
      exportedBy,
      notes,
    };
  }
  
  /**
   * Export character to D&D Beyond compatible format
   */
  static exportToDNDBeyond(character: WizardFormData, additionalData?: any): DNDBeyondExport {
    const level = additionalData?.level || 1;
    const abilityModifiers = {
      strength: this.calculateModifier(character.strength),
      dexterity: this.calculateModifier(character.dexterity),
      constitution: this.calculateModifier(character.constitution),
      intelligence: this.calculateModifier(character.intelligence),
      wisdom: this.calculateModifier(character.wisdom),
      charisma: this.calculateModifier(character.charisma),
    };
    
    // Map ability scores to D&D Beyond format (1-6 IDs)
    const stats = [
      { id: 1, value: character.strength },    // STR
      { id: 2, value: character.dexterity },   // DEX
      { id: 3, value: character.constitution }, // CON
      { id: 4, value: character.intelligence }, // INT
      { id: 5, value: character.wisdom },      // WIS
      { id: 6, value: character.charisma },    // CHA
    ];
    
    const hitDice: Record<string, number> = {
      'Barbarian': 12, 'Fighter': 10, 'Paladin': 10, 'Ranger': 10,
      'Bard': 8, 'Cleric': 8, 'Druid': 8, 'Monk': 8, 'Rogue': 8, 'Warlock': 8,
      'Sorcerer': 6, 'Wizard': 6,
    };
    
    return {
      character: {
        name: character.name,
        race: {
          fullName: character.race,
          baseRaceName: character.race,
        },
        classes: [{
          definition: {
            name: character.class,
            hitDie: hitDice[character.class] || 8,
          },
          level,
          hitDieUsed: 0,
        }],
        background: {
          definition: {
            name: character.background,
          },
        },
        stats,
        modifiers: [],
        baseHitPoints: this.calculateHitPoints(character.class, level, abilityModifiers.constitution),
        bonusHitPoints: 0,
        removedHitPoints: 0,
        temporaryHitPoints: 0,
      },
    };
  }
  
  /**
   * Export character to character sheet format
   */
  static exportToCharacterSheet(character: WizardFormData, additionalData?: any): CharacterSheetExport {
    const level = additionalData?.level || 1;
    const abilityModifiers = {
      strength: this.calculateModifier(character.strength),
      dexterity: this.calculateModifier(character.dexterity),
      constitution: this.calculateModifier(character.constitution),
      intelligence: this.calculateModifier(character.intelligence),
      wisdom: this.calculateModifier(character.wisdom),
      charisma: this.calculateModifier(character.charisma),
    };
    
    const proficiencyBonus = this.calculateProficiencyBonus(level);
    const savingThrowProfs = this.getSavingThrowProficiencies(character.class);
    
    // Create skills array
    const skills = this.createSkillsArray(character.skills, abilityModifiers, proficiencyBonus);
    const savingThrows = this.createSavingThrowsArray(savingThrowProfs, abilityModifiers, proficiencyBonus);
    
    const spellcastingAbility = this.getSpellcastingAbility(character.class);
    let spellData;
    
    if (character.spells && spellcastingAbility) {
      const spellAbilityModifier = abilityModifiers[spellcastingAbility];
      spellData = {
        spellcastingAbility: spellcastingAbility.charAt(0).toUpperCase() + spellcastingAbility.slice(1),
        spellAttackBonus: spellAbilityModifier + proficiencyBonus,
        spellSaveDC: 8 + spellAbilityModifier + proficiencyBonus,
        cantrips: character.spells.cantrips,
        spells: [
          ...character.spells.knownSpells.map(name => ({ level: 1, name, prepared: false })),
          ...character.spells.preparedSpells.map(name => ({ level: 1, name, prepared: true })),
        ],
      };
    }
    
    return {
      character: {
        name: character.name,
        classAndLevel: `${character.class} ${level}`,
        background: character.background,
        race: character.race,
        
        abilityScores: {
          strength: character.strength,
          dexterity: character.dexterity,
          constitution: character.constitution,
          intelligence: character.intelligence,
          wisdom: character.wisdom,
          charisma: character.charisma,
        },
        
        modifiers: abilityModifiers,
        proficiencyBonus,
        armorClass: this.calculateArmorClass(abilityModifiers.dexterity),
        hitPoints: this.calculateHitPoints(character.class, level, abilityModifiers.constitution),
        speed: this.getBaseSpeed(character.race),
        
        skills,
        savingThrows,
        spells: spellData,
      },
    };
  }
  
  /**
   * Calculate skill modifiers for all D&D 5e skills
   */
  private static calculateSkillModifiers(
    proficientSkills: string[],
    abilityModifiers: Record<string, number>,
    proficiencyBonus: number
  ): Record<string, { value: number; proficient: boolean }> {
    const skillAbilityMap: Record<string, keyof typeof abilityModifiers> = {
      'Acrobatics': 'dexterity',
      'Animal Handling': 'wisdom',
      'Arcana': 'intelligence',
      'Athletics': 'strength',
      'Deception': 'charisma',
      'History': 'intelligence',
      'Insight': 'wisdom',
      'Intimidation': 'charisma',
      'Investigation': 'intelligence',
      'Medicine': 'wisdom',
      'Nature': 'intelligence',
      'Perception': 'wisdom',
      'Performance': 'charisma',
      'Persuasion': 'charisma',
      'Religion': 'intelligence',
      'Sleight of Hand': 'dexterity',
      'Stealth': 'dexterity',
      'Survival': 'wisdom',
    };
    
    const result: Record<string, { value: number; proficient: boolean }> = {};
    
    for (const [skill, ability] of Object.entries(skillAbilityMap)) {
      const isProficient = proficientSkills.includes(skill);
      const baseModifier = abilityModifiers[ability];
      const totalModifier = baseModifier + (isProficient ? proficiencyBonus : 0);
      
      result[skill] = {
        value: totalModifier,
        proficient: isProficient,
      };
    }
    
    return result;
  }
  
  /**
   * Create skills array for character sheet
   */
  private static createSkillsArray(
    proficientSkills: string[],
    abilityModifiers: Record<string, number>,
    proficiencyBonus: number
  ): Array<{ name: string; modifier: number; proficient: boolean }> {
    const skillModifiers = this.calculateSkillModifiers(proficientSkills, abilityModifiers, proficiencyBonus);
    
    return Object.entries(skillModifiers).map(([name, data]) => ({
      name,
      modifier: data.value,
      proficient: data.proficient,
    }));
  }
  
  /**
   * Create saving throws array for character sheet
   */
  private static createSavingThrowsArray(
    proficiencies: string[],
    abilityModifiers: Record<string, number>,
    proficiencyBonus: number
  ): Array<{ name: string; modifier: number; proficient: boolean }> {
    const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
    
    return abilities.map(ability => {
      const isProficient = proficiencies.includes(ability);
      const modifier = abilityModifiers[ability] + (isProficient ? proficiencyBonus : 0);
      
      return {
        name: ability.charAt(0).toUpperCase() + ability.slice(1),
        modifier,
        proficient: isProficient,
      };
    });
  }
  
  /**
   * Download character data as JSON file
   */
  static downloadAsJSON(characterData: any, filename: string): void {
    const jsonString = JSON.stringify(characterData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  
  /**
   * Generate character sheet filename
   */
  static generateFilename(characterName: string, format: string): string {
    const sanitizedName = characterName.replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = new Date().toISOString().split('T')[0];
    return `${sanitizedName}_${format}_${timestamp}`;
  }
}