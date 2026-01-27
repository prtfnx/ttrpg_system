/**
 * Character Import Service
 * Imports characters from various formats (JSON, D&D Beyond, Roll20, etc.)
 */

import type { D5eCharacterExport, WizardFormData } from '@features/character';

interface DNDBeyondExport {
  // Placeholder for D&D Beyond export format
  [key: string]: unknown;
}

export interface ImportResult {
  success: boolean;
  character?: WizardFormData;
  errors?: string[];
  warnings?: string[];
}

export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  character?: Partial<WizardFormData>;
}

export class CharacterImportService {
  private static readonly SUPPORTED_FORMATS = ['d5e', 'dndBeyond', 'json'] as const;
  
  /**
   * Detect import format from file content or structure
   */
  static detectFormat(data: any): string | null {
    // Check for our D5e format
    if (data.version && data.source === 'TTRPG_System_Web' && data.character) {
      return 'd5e';
    }
    
    // Check for D&D Beyond format
    if (data.character?.race?.fullName && data.character?.classes && data.character?.stats) {
      return 'dndBeyond';
    }
    
    // Check for basic character data structure
    if (data.race && data.class && data.name && data.strength !== undefined) {
      return 'json';
    }
    
    // Check for Roll20 format characteristics
    if (data.schema_version && data.character && data.character.attribs) {
      return 'roll20';
    }
    
    return null;
  }
  
  /**
   * Import character from D&D 5e export format
   */
  static importFromD5e(data: D5eCharacterExport): ImportResult {
    try {
      const character = data.character;
      
      const wizardData: WizardFormData = {
        name: character.name,
        race: character.race,
        class: character.class,
        background: character.background,
        
        strength: character.abilities.strength,
        dexterity: character.abilities.dexterity,
        constitution: character.abilities.constitution,
        intelligence: character.abilities.intelligence,
        wisdom: character.abilities.wisdom,
        charisma: character.abilities.charisma,
        
        skills: character.skills,
        spells: character.spells ? {
          cantrips: character.spells.cantrips,
          knownSpells: character.spells.knownSpells,
          preparedSpells: character.spells.preparedSpells,
        } : undefined,
        
        bio: character.personality?.bio,
        image: character.personality?.image,
      };
      
      const validation = this.validateCharacterData(wizardData);
      
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
        };
      }
      
      return {
        success: true,
        character: wizardData,
        warnings: validation.warnings,
      };
      
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to parse D5e character: ${(error as Error).message}`],
      };
    }
  }
  
  /**
   * Import character from D&D Beyond export format
   */
  static importFromDNDBeyond(data: DNDBeyondExport): ImportResult {
    try {
      const character = data.character;
      
      if (!character.classes || character.classes.length === 0) {
        return {
          success: false,
          errors: ['D&D Beyond character missing class information'],
        };
      }
      
      if (!character.stats || character.stats.length !== 6) {
        return {
          success: false,
          errors: ['D&D Beyond character missing or invalid ability scores'],
        };
      }
      
      // Map D&D Beyond stats (ID 1-6) to ability scores
      const statsMap = character.stats.reduce((acc, stat) => {
        const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
        acc[abilities[stat.id - 1]] = stat.value;
        return acc;
      }, {} as Record<string, number>);
      
      const primaryClass = character.classes[0];
      
      const wizardData: WizardFormData = {
        name: character.name,
        race: character.race.baseRaceName || character.race.fullName,
        class: primaryClass.definition.name,
        background: character.background?.definition?.name || 'Unknown',
        
        strength: statsMap.strength || 10,
        dexterity: statsMap.dexterity || 10,
        constitution: statsMap.constitution || 10,
        intelligence: statsMap.intelligence || 10,
        wisdom: statsMap.wisdom || 10,
        charisma: statsMap.charisma || 10,
        
        skills: [], // D&D Beyond doesn't provide skill proficiencies in basic format
        spells: undefined, // Would need more complex parsing for spells
      };
      
      const validation = this.validateCharacterData(wizardData);
      
      // Add warnings for missing data
      const warnings = [...(validation.warnings || [])];
      if (!wizardData.skills.length) {
        warnings.push('Skill proficiencies not imported - please select manually');
      }
      if (this.isSpellcaster(wizardData.class) && !wizardData.spells) {
        warnings.push('Spells not imported - please select manually');
      }
      
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
          warnings,
        };
      }
      
      return {
        success: true,
        character: wizardData,
        warnings,
      };
      
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to parse D&D Beyond character: ${(error as Error).message}`],
      };
    }
  }
  
  /**
   * Import character from generic JSON format
   */
  static importFromJSON(data: any): ImportResult {
    try {
      const wizardData: WizardFormData = {
        name: data.name || 'Unnamed Character',
        race: data.race || '',
        class: data.class || data.character_class || '', // Support both formats
        background: data.background || 'Folk Hero',
        
        strength: data.strength || data.ability_scores?.STR || data.abilities?.strength || 10,
        dexterity: data.dexterity || data.ability_scores?.DEX || data.abilities?.dexterity || 10,
        constitution: data.constitution || data.ability_scores?.CON || data.abilities?.constitution || 10,
        intelligence: data.intelligence || data.ability_scores?.INT || data.abilities?.intelligence || 10,
        wisdom: data.wisdom || data.ability_scores?.WIS || data.abilities?.wisdom || 10,
        charisma: data.charisma || data.ability_scores?.CHA || data.abilities?.charisma || 10,
        
        skills: data.skills || data.skill_proficiencies || [],
        spells: data.spells || undefined,
        
        bio: data.bio || data.personality || undefined,
        image: data.image || undefined,
      };
      
      const validation = this.validateCharacterData(wizardData);
      
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
        };
      }
      
      return {
        success: true,
        character: wizardData,
        warnings: validation.warnings,
      };
      
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to parse JSON character: ${(error as Error).message}`],
      };
    }
  }
  
  /**
   * Import character from Roll20 export format
   */
  static importFromRoll20(data: any): ImportResult {
    try {
      if (!data.character || !data.character.attribs) {
        return {
          success: false,
          errors: ['Invalid Roll20 character format - missing character.attribs'],
        };
      }
      
      // Roll20 stores attributes as an array of {name, current, max} objects
      const attribs = data.character.attribs;
      const getAttr = (name: string) => {
        const attr = attribs.find((a: any) => a.name === name);
        return attr ? (attr.current || attr.max || 0) : 0;
      };
      
      const wizardData: WizardFormData = {
        name: getAttr('character_name') || 'Roll20 Character',
        race: getAttr('race') || '',
        class: getAttr('class') || '',
        background: getAttr('background') || 'Folk Hero',
        
        strength: parseInt(getAttr('strength') || '10'),
        dexterity: parseInt(getAttr('dexterity') || '10'),
        constitution: parseInt(getAttr('constitution') || '10'),
        intelligence: parseInt(getAttr('intelligence') || '10'),
        wisdom: parseInt(getAttr('wisdom') || '10'),
        charisma: parseInt(getAttr('charisma') || '10'),
        
        skills: [], // Roll20 skill parsing would be complex, left for manual selection
        spells: undefined, // Roll20 spell parsing would be complex
      };
      
      const validation = this.validateCharacterData(wizardData);
      const warnings = [...(validation.warnings || [])];
      
      warnings.push('Roll20 import: Skills and spells require manual selection');
      
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
          warnings,
        };
      }
      
      return {
        success: true,
        character: wizardData,
        warnings,
      };
      
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to parse Roll20 character: ${(error as Error).message}`],
      };
    }
  }
  
  /**
   * Universal import method that detects format and imports accordingly
   */
  static importCharacter(data: any): ImportResult {
    const format = this.detectFormat(data);
    
    if (!format) {
      return {
        success: false,
        errors: ['Unable to detect character format. Supported formats: D5e JSON, D&D Beyond, Roll20, generic JSON'],
      };
    }
    
    switch (format) {
      case 'd5e':
        return this.importFromD5e(data as D5eCharacterExport);
      case 'dndBeyond':
        return this.importFromDNDBeyond(data as DNDBeyondExport);
      case 'roll20':
        return this.importFromRoll20(data);
      case 'json':
      default:
        return this.importFromJSON(data);
    }
  }
  
  /**
   * Import character from file
   */
  static async importFromFile(file: File): Promise<ImportResult> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      return this.importCharacter(data);
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to read file: ${(error as Error).message}`],
      };
    }
  }
  
  /**
   * Import character from URL
   */
  static async importFromURL(url: string): Promise<ImportResult> {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        return {
          success: false,
          errors: [`Failed to fetch character: ${response.status} ${response.statusText}`],
        };
      }
      
      const data = await response.json();
      return this.importCharacter(data);
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to import from URL: ${(error as Error).message}`],
      };
    }
  }
  
  /**
   * Validate imported character data
   */
  private static validateCharacterData(character: WizardFormData): ImportValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required fields
    if (!character.name || character.name.trim().length === 0) {
      errors.push('Character name is required');
    }
    
    if (!character.race) {
      errors.push('Race is required');
    }
    
    if (!character.class) {
      errors.push('Class is required');
    }
    
    if (!character.background) {
      errors.push('Background is required');
    }
    
    // Ability scores validation
    const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
    for (const ability of abilities) {
      const score = character[ability];
      if (score < 1 || score > 30) {
        errors.push(`${ability} score must be between 1 and 30 (got ${score})`);
      }
      if (score < 8 || score > 15) {
        warnings.push(`${ability} score ${score} is outside typical range (8-15) for character creation`);
      }
    }
    
    // Class validation
    const validClasses = [
      'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 
      'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'
    ];
    if (character.class && !validClasses.includes(character.class)) {
      warnings.push(`Class '${character.class}' may not be fully supported`);
    }
    
    // Race validation
    const validRaces = [
      'Human', 'Elf', 'Dwarf', 'Halfling', 'Dragonborn', 'Gnome', 
      'Half-Elf', 'Half-Orc', 'Tiefling'
    ];
    if (character.race && !validRaces.includes(character.race)) {
      warnings.push(`Race '${character.race}' may not be fully supported`);
    }
    
    // Spellcaster validation
    if (this.isSpellcaster(character.class)) {
      if (!character.spells) {
        warnings.push(`${character.class} is a spellcasting class but no spells are defined`);
      }
    }
    
    // Skills validation
    if (character.skills && character.skills.length === 0) {
      warnings.push('No skills selected - characters typically have skill proficiencies');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      character: errors.length === 0 ? character : undefined,
    };
  }
  
  /**
   * Check if class is a spellcaster
   */
  private static isSpellcaster(className: string): boolean {
    const spellcastingClasses = [
      'Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 
      'Sorcerer', 'Warlock', 'Wizard'
    ];
    return spellcastingClasses.includes(className);
  }
  
  /**
   * Get supported import formats
   */
  static getSupportedFormats(): readonly string[] {
    return this.SUPPORTED_FORMATS;
  }
  
  /**
   * Validate file before import
   */
  static async validateFile(file: File): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      errors.push('File size too large (max 10MB)');
    }
    
    // Check file type
    if (!file.type.includes('json') && !file.name.endsWith('.json')) {
      errors.push('File must be JSON format');
    }
    
    // Try to parse JSON
    try {
      const text = await file.text();
      JSON.parse(text);
    } catch {
      errors.push('File contains invalid JSON');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * Create character backup before import
   */
  static createBackup(existingCharacter: WizardFormData): string {
    const backup = {
      timestamp: new Date().toISOString(),
      character: existingCharacter,
      source: 'pre-import-backup',
    };
    
    return JSON.stringify(backup, null, 2);
  }
}