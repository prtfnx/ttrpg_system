/**
 * NPC Character Service
 * Handles creation of NPC characters from compendium monster data
 * Production-ready service with full D&D 5e integration
 */

import type { Character } from '../types';

// Extended Monster interface with all compendium data fields
export interface ExtendedMonster {
  id: string;
  name: string;
  challenge_rating: any;
  type: string;
  hp?: any;
  ac?: any;
  size?: string;
  alignment?: string;
  description?: string;
  token_url?: string;  // Token image URL from backend
  token_source?: string;  // Source of token: "r2" | "local" | "fallback" | "none"
  
  // Extended attributes from compendium
  [key: string]: any; // Allow any additional properties from compendium
}

export interface NPCCreationOptions {
  customName?: string;
  userId: number;
  sessionId: string;
  position?: { x: number; y: number };
}

export class NPCCharacterService {
  /**
   * Resolve token URL for a monster
   * Uses backend API to get the correct token with fallback chain
   */
  static async resolveTokenUrl(monsterName: string, monsterType: string): Promise<string | null> {
    try {
      const response = await fetch(`/api/tokens/resolve/${encodeURIComponent(monsterName)}?monster_type=${encodeURIComponent(monsterType)}&redirect=false`);
      
      if (!response.ok) {
        console.warn(`Failed to resolve token for ${monsterName}: ${response.statusText}`);
        return null;
      }
      
      const data = await response.json();
      return data.url || null;
    } catch (error) {
      console.error(`Error resolving token for ${monsterName}:`, error);
      return null;
    }
  }

  /**
   * Convert compendium monster to NPC character
   * Maps monster stat block format to character data structure
   */
  static createNPCFromMonster(monster: ExtendedMonster, options: NPCCreationOptions): Character {
    const { customName, userId, sessionId, position } = options;
    
    // Generate unique ID for the character
    const characterId = `npc-${monster.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Parse hit points
    let hp = 1;
    let hitDice = '1d4';
    if (monster.hp) {
      if (typeof monster.hp === 'number') {
        hp = monster.hp;
      } else if (typeof monster.hp === 'string') {
        // Parse "7 (2d6)" format
        const hpMatch = monster.hp.match(/(\d+)\s*\(([^)]+)\)/);
        if (hpMatch) {
          hp = parseInt(hpMatch[1]);
          hitDice = hpMatch[2];
        } else {
          hp = parseInt(monster.hp) || 1;
        }
      }
    }
    
    // Parse armor class
    let ac = 10;
    let acNotes = '';
    if (monster.ac) {
      if (typeof monster.ac === 'number') {
        ac = monster.ac;
      } else if (typeof monster.ac === 'string') {
        // Parse "15 (natural armor)" format
        const acMatch = monster.ac.match(/(\d+)\s*(?:\(([^)]+)\))?/);
        if (acMatch) {
          ac = parseInt(acMatch[1]);
          acNotes = acMatch[2] || '';
        }
      }
    }
    
    // Parse speed (convert to number, default to 30)
    let speed = 30;
    if (monster.speed) {
      if (typeof monster.speed === 'number') {
        speed = monster.speed;
      } else if (typeof monster.speed === 'string') {
        // Parse "30 ft." or "30" format
        const speedMatch = monster.speed.match(/(\d+)/);
        if (speedMatch) {
          speed = parseInt(speedMatch[1]);
        }
      } else if (typeof monster.speed === 'object' && monster.speed.walk) {
        speed = parseInt(monster.speed.walk) || 30;
      }
    }
    
    // Parse ability scores
    const abilityScores = {
      strength: monster.strength || 10,
      dexterity: monster.dexterity || 10,
      constitution: monster.constitution || 10,
      intelligence: monster.intelligence || 10,
      wisdom: monster.wisdom || 10,
      charisma: monster.charisma || 10
    };
    
    // Parse skills (only include proficient skills)
    const skills: Record<string, { proficient: boolean; bonus: number }> = {};
    if (monster.skills) {
      Object.entries(monster.skills).forEach(([skill, bonus]) => {
        skills[skill] = {
          proficient: true,
          bonus: typeof bonus === 'number' ? bonus : parseInt(bonus as string) || 0
        };
      });
    }
    
    // Parse senses
    const senses: Record<string, number> = {};
    let passivePerception = 10;
    if (monster.senses) {
      if (typeof monster.senses === 'object') {
        Object.assign(senses, monster.senses);
        passivePerception = monster.senses.passive_perception || 10;
      } else if (typeof monster.senses === 'string') {
        // Parse "darkvision 60 ft., passive Perception 9" format
        const darkvisionMatch = monster.senses.match(/darkvision\s+(\d+)/i);
        if (darkvisionMatch) {
          senses.darkvision = parseInt(darkvisionMatch[1]);
        }
        const passiveMatch = monster.senses.match(/passive\s+perception\s+(\d+)/i);
        if (passiveMatch) {
          passivePerception = parseInt(passiveMatch[1]);
        }
      }
    }
    
    // Parse languages
    let languages: string[] = [];
    if (monster.languages) {
      if (Array.isArray(monster.languages)) {
        languages = monster.languages;
      } else if (typeof monster.languages === 'string') {
        languages = monster.languages.split(',').map(l => l.trim()).filter(Boolean);
      }
    }
    
    // Parse traits (special abilities)
    const traits: any[] = [];
    if (monster.traits && Array.isArray(monster.traits)) {
      monster.traits.forEach((trait: any) => {
        if (typeof trait === 'object') {
          traits.push({
            name: trait.name || 'Unknown Trait',
            description: trait.description || trait.desc || ''
          });
        }
      });
    }
    
    // Parse actions
    const actions: any[] = [];
    if (monster.actions && Array.isArray(monster.actions)) {
      monster.actions.forEach((action: any) => {
        if (typeof action === 'object') {
          actions.push({
            name: action.name || 'Unknown Action',
            type: action.attack_type || action.type || 'action',
            attackBonus: action.attack_bonus,
            reach: action.reach,
            range: action.range,
            targets: action.targets || 'one target',
            damage: action.damage || action.damage_dice,
            damageType: action.damage_type,
            description: action.description || action.desc || ''
          });
        }
      });
    }
    
    // Parse legendary actions
    const legendaryActions: any[] = [];
    if (monster.legendary_actions && Array.isArray(monster.legendary_actions)) {
      monster.legendary_actions.forEach((action: any) => {
        if (typeof action === 'object') {
          legendaryActions.push({
            name: action.name || 'Unknown Legendary Action',
            cost: action.cost || 1,
            description: action.description || action.desc || ''
          });
        }
      });
    }
    
    // Create NPC character data based on NPC_TEMPLATE structure
    const npcData = {
      // Basic info
      name: customName || monster.name,
      type: monster.type || 'humanoid',
      subtype: monster.subtype,
      size: monster.size || 'Medium',
      alignment: monster.alignment || 'Unaligned',
      
      // Stats
      stats: {
        ac,
        acNotes,
        hp,
        maxHp: hp,
        hitDice,
        speed
      },
      
      // Ability scores
      abilityScores,
      
      // Skills (only proficient ones)
      skills,
      
      // Resistances & immunities
      damageVulnerabilities: monster.damage_vulnerabilities || [],
      damageResistances: monster.damage_resistances || [],
      damageImmunities: monster.damage_immunities || [],
      conditionImmunities: monster.condition_immunities || [],
      
      // Senses
      senses: {
        ...senses,
        passivePerception
      },
      
      // Languages
      languages,
      
      // Challenge rating
      challengeRating: monster.challenge_rating?.toString() || '0',
      experiencePoints: monster.xp || this.calculateXP(monster.challenge_rating),
      proficiencyBonus: this.calculateProficiencyBonus(monster.challenge_rating),
      
      // Special abilities
      traits,
      
      // Actions
      actions,
      
      // Bonus actions
      bonusActions: [],
      
      // Reactions
      reactions: monster.reactions || [],
      
      // Legendary actions
      legendaryActions,
      legendaryActionsPerRound: monster.legendary_actions_per_round || (legendaryActions.length > 0 ? 3 : 0),
      
      // Description
      description: monster.description || `A ${monster.type} of ${monster.size} size.`,
      
      // Token image URL (use from monster data if available)
      tokenUrl: monster.token_url || undefined,
      tokenSource: monster.token_source || 'none',
      
      // Position (if provided)
      ...(position && { position })
    };
    
    // Create the character object
    const character: Character = {
      id: characterId,
      sessionId,
      name: customName || monster.name,
      ownerId: userId,
      controlledBy: [userId],
      data: { ...npcData, characterType: 'npc' },
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'local' as const
    };
    
    return character;
  }
  
  /**
   * Calculate XP based on challenge rating
   */
  private static calculateXP(cr: any): number {
    const xpTable: Record<string, number> = {
      '0': 0,
      '1/8': 25,
      '1/4': 50,
      '1/2': 100,
      '1': 200,
      '2': 450,
      '3': 700,
      '4': 1100,
      '5': 1800,
      '6': 2300,
      '7': 2900,
      '8': 3900,
      '9': 5000,
      '10': 5900,
      '11': 7200,
      '12': 8400,
      '13': 10000,
      '14': 11500,
      '15': 13000,
      '16': 15000,
      '17': 18000,
      '18': 20000,
      '19': 22000,
      '20': 25000,
      '21': 33000,
      '22': 41000,
      '23': 50000,
      '24': 62000,
      '25': 75000,
      '26': 90000,
      '27': 105000,
      '28': 120000,
      '29': 135000,
      '30': 155000
    };
    
    const crString = cr?.toString() || '0';
    return xpTable[crString] || 0;
  }
  
  /**
   * Calculate proficiency bonus based on challenge rating
   */
  private static calculateProficiencyBonus(cr: any): number {
    const crNumber = typeof cr === 'string' ? this.parseCR(cr) : (cr || 0);
    
    if (crNumber <= 0) return 2;
    if (crNumber <= 4) return 2;
    if (crNumber <= 8) return 3;
    if (crNumber <= 12) return 4;
    if (crNumber <= 16) return 5;
    if (crNumber <= 20) return 6;
    if (crNumber <= 24) return 7;
    if (crNumber <= 28) return 8;
    return 9;
  }
  
  /**
   * Parse CR string to number
   */
  private static parseCR(cr: string): number {
    if (cr.includes('/')) {
      const [num, denom] = cr.split('/').map(n => parseInt(n));
      return num / denom;
    }
    return parseInt(cr) || 0;
  }
}
