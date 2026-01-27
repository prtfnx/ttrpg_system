/**
 * Monster Creation & Management Service
 * Production-quality service for creating and managing monsters from compendium data
 * with D&D 5e integration, combat stats, and table placement
 */

import { EventSystem } from '../../../shared/services/eventSystem.service';

// === Core Types ===

export interface MonsterStats {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface MonsterAbility {
  id: string;
  name: string;
  type: 'action' | 'bonus_action' | 'reaction' | 'legendary_action' | 'lair_action' | 'passive';
  description: string;
  recharge?: string; // e.g., "5-6", "Short Rest", "Long Rest"
  damage?: {
    dice: string;
    type: string;
    bonus?: number;
  };
  attackBonus?: number;
  saveDC?: number;
  saveAbility?: keyof MonsterStats;
  range?: string;
  areaEffect?: {
    type: 'cone' | 'sphere' | 'cylinder' | 'cube' | 'line';
    size: number;
  };
}

export interface MonsterSkill {
  skill: string;
  bonus: number;
  proficient: boolean;
  expertise: boolean;
}

export interface MonsterResistance {
  type: string;
  resistant: boolean;
  immune: boolean;
  vulnerable: boolean;
}

export interface MonsterSense {
  type: string;
  range: number;
  description?: string;
}

export interface MonsterTemplate {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
  alignment: string;
  challengeRating: string;
  experiencePoints: number;
  armorClass: number;
  hitPoints: {
    average: number;
    formula: string;
  };
  speed: Record<string, number>;
  stats: MonsterStats;
  savingThrows?: Partial<Record<keyof MonsterStats, number>>;
  skills?: MonsterSkill[];
  damageResistances?: MonsterResistance[];
  conditionImmunities?: string[];
  senses?: MonsterSense[];
  languages?: string[];
  proficiencyBonus: number;
  abilities: MonsterAbility[];
  spells?: {
    spellcaster: boolean;
    level?: number;
    ability?: keyof MonsterStats;
    saveDC?: number;
    attackBonus?: number;
    slots?: Record<number, number>;
    knownSpells?: string[];
  };
  legendary?: {
    actions: number;
    description: string;
  };
  description: string;
  imageUrl?: string;
  tokenUrl?: string;
  source: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface MonsterInstance {
  id: string;
  templateId: string;
  template: MonsterTemplate;
  name: string; // Custom name for this instance
  currentHitPoints: number;
  maxHitPoints: number;
  temporaryHitPoints: number;
  conditions: string[];
  concentration?: {
    spell: string;
    duration: string;
    saveDC: number;
  };
  initiative?: number;
  position?: {
    x: number;
    y: number;
    tableId?: string;
  };
  customStats?: Partial<MonsterStats>;
  customAbilities?: MonsterAbility[];
  notes: string;
  isVisible: boolean;
  isDefeated: boolean;
  encounter?: string; // Encounter ID this monster belongs to
  createdAt: number;
  updatedAt: number;
}

export interface MonsterSearchFilters {
  name?: string;
  type?: string;
  size?: string[];
  challengeRating?: {
    min?: number;
    max?: number;
  };
  source?: string;
  tags?: string[];
  hasSpells?: boolean;
  hasLegendaryActions?: boolean;
}

export interface EncounterTemplate {
  id: string;
  name: string;
  description: string;
  difficulty: 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';
  partyLevel: number;
  partySize: number;
  monsters: {
    templateId: string;
    count: number;
    customNames?: string[];
  }[];
  totalXP: number;
  adjustedXP: number;
  environment?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

// === Service Class ===

export class MonsterCreationService extends EventSystem {
  private static instance: MonsterCreationService;
  
  // Data storage
  private templates: Map<string, MonsterTemplate> = new Map();
  private instances: Map<string, MonsterInstance> = new Map();
  private encounters: Map<string, EncounterTemplate> = new Map();
  
  // Compendium integration
  private compendiumData: any = null;
  private isCompendiumLoaded = false;
  
  // Search and filtering
  private searchIndex: Map<string, Set<string>> = new Map();
  private lastSearchQuery: string = '';
  private lastSearchResults: MonsterTemplate[] = [];
  
  // Statistics
  private stats = {
    templatesLoaded: 0,
    instancesCreated: 0,
    encountersGenerated: 0,
    monstersOnTables: 0
  };

  private constructor() {
    super();
    this.initializeDefaultTemplates();
  }

  static getInstance(): MonsterCreationService {
    if (!MonsterCreationService.instance) {
      MonsterCreationService.instance = new MonsterCreationService();
    }
    return MonsterCreationService.instance;
  }

  // === Initialization ===

  /**
   * Initialize with compendium data
   */
  async initializeWithCompendium(compendiumData: any): Promise<void> {
    try {
      this.compendiumData = compendiumData;
      
      if (compendiumData?.monsters) {
        await this.loadMonstersFromCompendium(compendiumData.monsters);
      }
      
      this.isCompendiumLoaded = true;
      this.buildSearchIndex();
      
      this.emit('compendiumLoaded', {
        templateCount: this.templates.size,
        compendiumData: !!compendiumData
      });
      
    } catch (error) {
      console.error('Failed to initialize with compendium:', error);
      this.emit('compendiumLoadError', { error });
    }
  }

  /**
   * Load monsters from compendium data
   */
  private async loadMonstersFromCompendium(monsters: any): Promise<void> {
    let loadedCount = 0;
    
    for (const [name, monsterData] of Object.entries(monsters as Record<string, any>)) {
      try {
        const template = this.convertCompendiumMonster(name, monsterData);
        if (template) {
          this.templates.set(template.id, template);
          loadedCount++;
        }
      } catch (error) {
        console.warn(`Failed to convert monster ${name}:`, error);
      }
    }
    
    this.stats.templatesLoaded = loadedCount;
    console.log(`Loaded ${loadedCount} monster templates from compendium`);
  }

  /**
   * Convert compendium monster data to our template format
   */
  private convertCompendiumMonster(name: string, data: any): MonsterTemplate | null {
    try {
      // Parse hit points
      let hitPoints = { average: 1, formula: '1d4' };
      if (data.hit_points) {
        const hpMatch = data.hit_points.toString().match(/(\d+)\s*\(([^)]+)\)/);
        if (hpMatch) {
          hitPoints = {
            average: parseInt(hpMatch[1]),
            formula: hpMatch[2]
          };
        } else {
          hitPoints.average = parseInt(data.hit_points) || 1;
        }
      }

      // Parse stats
      const stats: MonsterStats = {
        strength: data.strength || 10,
        dexterity: data.dexterity || 10,
        constitution: data.constitution || 10,
        intelligence: data.intelligence || 10,
        wisdom: data.wisdom || 10,
        charisma: data.charisma || 10
      };

      // Parse abilities
      const abilities: MonsterAbility[] = [];
      
      // Add actions
      if (data.actions) {
        data.actions.forEach((action: any) => {
          abilities.push({
            id: `action_${action.name.toLowerCase().replace(/\s+/g, '_')}`,
            name: action.name,
            type: 'action',
            description: action.desc || action.description || '',
            attackBonus: action.attack_bonus,
            damage: action.damage ? {
              dice: action.damage_dice || '',
              type: action.damage_type || 'bludgeoning',
              bonus: action.damage_bonus || 0
            } : undefined
          });
        });
      }

      // Add legendary actions
      if (data.legendary_actions) {
        data.legendary_actions.forEach((action: any) => {
          abilities.push({
            id: `legendary_${action.name.toLowerCase().replace(/\s+/g, '_')}`,
            name: action.name,
            type: 'legendary_action',
            description: action.desc || action.description || ''
          });
        });
      }

      // Calculate CR and XP
      const crString = data.challenge_rating?.toString() || '0';
      const xpTable: Record<string, number> = {
        '0': 0, '1/8': 25, '1/4': 50, '1/2': 100,
        '1': 200, '2': 450, '3': 700, '4': 1100,
        '5': 1800, '6': 2300, '7': 2900, '8': 3900,
        '9': 5000, '10': 5900, '11': 7200, '12': 8400,
        '13': 10000, '14': 11500, '15': 13000, '16': 15000,
        '17': 18000, '18': 20000, '19': 22000, '20': 25000,
        '21': 33000, '22': 41000, '23': 50000, '24': 62000,
        '25': 75000, '26': 90000, '27': 105000, '28': 120000,
        '29': 135000, '30': 155000
      };

      const template: MonsterTemplate = {
        id: `monster_${name.toLowerCase().replace(/\s+/g, '_')}`,
        name: name,
        type: data.type || 'humanoid',
        subtype: data.subtype,
        size: (data.size?.toLowerCase() || 'medium') as any,
        alignment: data.alignment || 'neutral',
        challengeRating: crString,
        experiencePoints: xpTable[crString] || 0,
        armorClass: data.armor_class || 10,
        hitPoints,
        speed: this.parseSpeed(data.speed),
        stats,
        savingThrows: this.parseSavingThrows(data.saving_throws),
        skills: this.parseSkills(data.skills),
        damageResistances: this.parseResistances(data.damage_resistances, data.damage_immunities, data.damage_vulnerabilities),
        conditionImmunities: data.condition_immunities || [],
        senses: this.parseSenses(data.senses),
        languages: data.languages || [],
        proficiencyBonus: this.calculateProficiencyBonus(crString),
        abilities,
        spells: data.spellcasting ? this.parseSpellcasting(data.spellcasting) : undefined,
        legendary: data.legendary_actions ? {
          actions: 3,
          description: `The ${name} can take 3 legendary actions, choosing from the options below.`
        } : undefined,
        description: data.desc || data.description || `A ${name.toLowerCase()}.`,
        source: data.source || 'Unknown',
        tags: this.generateTags(data),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      return template;
      
    } catch (error) {
      console.error(`Failed to convert monster ${name}:`, error);
      return null;
    }
  }

  /**
   * Parse speed from various formats
   */
  private parseSpeed(speedData: any): Record<string, number> {
    const speeds: Record<string, number> = { walk: 30 };
    
    if (typeof speedData === 'number') {
      speeds.walk = speedData;
    } else if (typeof speedData === 'string') {
      // Parse "30 ft., fly 60 ft." format
      const matches = speedData.matchAll(/(\w+)\s+(\d+)/g);
      for (const match of matches) {
        const type = match[1].toLowerCase();
        const value = parseInt(match[2]);
        if (type === 'speed') {
          speeds.walk = value;
        } else {
          speeds[type] = value;
        }
      }
    } else if (speedData && typeof speedData === 'object') {
      Object.entries(speedData).forEach(([key, value]) => {
        speeds[key.toLowerCase()] = parseInt(value as string) || 0;
      });
    }
    
    return speeds;
  }

  /**
   * Parse saving throws
   */
  private parseSavingThrows(savingThrows: any): Partial<Record<keyof MonsterStats, number>> | undefined {
    if (!savingThrows) return undefined;
    
    const saves: Partial<Record<keyof MonsterStats, number>> = {};
    const statMap: Record<string, keyof MonsterStats> = {
      'str': 'strength',
      'dex': 'dexterity', 
      'con': 'constitution',
      'int': 'intelligence',
      'wis': 'wisdom',
      'cha': 'charisma'
    };
    
    Object.entries(savingThrows).forEach(([key, value]) => {
      const stat = statMap[key.toLowerCase().substring(0, 3)];
      if (stat) {
        saves[stat] = parseInt(value as string) || 0;
      }
    });
    
    return Object.keys(saves).length > 0 ? saves : undefined;
  }

  /**
   * Parse skills
   */
  private parseSkills(skillsData: any): MonsterSkill[] | undefined {
    if (!skillsData) return undefined;
    
    const skills: MonsterSkill[] = [];
    
    Object.entries(skillsData).forEach(([skill, bonus]) => {
      skills.push({
        skill: skill.replace('_', ' '),
        bonus: parseInt(bonus as string) || 0,
        proficient: true,
        expertise: false
      });
    });
    
    return skills.length > 0 ? skills : undefined;
  }

  /**
   * Parse damage resistances, immunities, and vulnerabilities
   */
  private parseResistances(resistances?: any, immunities?: any, vulnerabilities?: any): MonsterResistance[] | undefined {
    const results: MonsterResistance[] = [];
    
    if (resistances) {
      (Array.isArray(resistances) ? resistances : [resistances]).forEach((type: string) => {
        results.push({ type, resistant: true, immune: false, vulnerable: false });
      });
    }
    
    if (immunities) {
      (Array.isArray(immunities) ? immunities : [immunities]).forEach((type: string) => {
        const existing = results.find(r => r.type === type);
        if (existing) {
          existing.immune = true;
        } else {
          results.push({ type, resistant: false, immune: true, vulnerable: false });
        }
      });
    }
    
    if (vulnerabilities) {
      (Array.isArray(vulnerabilities) ? vulnerabilities : [vulnerabilities]).forEach((type: string) => {
        const existing = results.find(r => r.type === type);
        if (existing) {
          existing.vulnerable = true;
        } else {
          results.push({ type, resistant: false, immune: false, vulnerable: true });
        }
      });
    }
    
    return results.length > 0 ? results : undefined;
  }

  /**
   * Parse senses
   */
  private parseSenses(sensesData: any): MonsterSense[] | undefined {
    if (!sensesData) return undefined;
    
    const senses: MonsterSense[] = [];
    
    if (typeof sensesData === 'string') {
      // Parse "darkvision 120 ft., passive Perception 12" format
      const senseMatches = sensesData.matchAll(/(\w+)\s+(\d+)\s*ft\./g);
      for (const match of senseMatches) {
        senses.push({
          type: match[1].toLowerCase(),
          range: parseInt(match[2])
        });
      }
    } else if (sensesData && typeof sensesData === 'object') {
      Object.entries(sensesData).forEach(([type, range]) => {
        senses.push({
          type: type.toLowerCase(),
          range: parseInt(range as string) || 0
        });
      });
    }
    
    return senses.length > 0 ? senses : undefined;
  }

  /**
   * Parse spellcasting information
   */
  private parseSpellcasting(spellcastingData: any): MonsterTemplate['spells'] | undefined {
    if (!spellcastingData) return undefined;
    
    return {
      spellcaster: true,
      level: spellcastingData.level || 1,
      ability: (spellcastingData.ability?.toLowerCase() || 'intelligence') as keyof MonsterStats,
      saveDC: spellcastingData.dc || 13,
      attackBonus: spellcastingData.modifier || 5,
      slots: spellcastingData.slots || {},
      knownSpells: spellcastingData.spells || []
    };
  }

  /**
   * Calculate proficiency bonus based on challenge rating
   */
  private calculateProficiencyBonus(cr: string): number {
    const crNum = cr.includes('/') ? parseFloat(cr) : parseInt(cr);
    
    if (crNum < 1) return 2;
    if (crNum <= 4) return 2;
    if (crNum <= 8) return 3;
    if (crNum <= 12) return 4;
    if (crNum <= 16) return 5;
    if (crNum <= 20) return 6;
    if (crNum <= 24) return 7;
    if (crNum <= 28) return 8;
    return 9;
  }

  /**
   * Generate tags for monster
   */
  private generateTags(data: any): string[] {
    const tags: string[] = [];
    
    if (data.type) tags.push(data.type);
    if (data.size) tags.push(data.size);
    if (data.challenge_rating) tags.push(`CR ${data.challenge_rating}`);
    if (data.spellcasting) tags.push('spellcaster');
    if (data.legendary_actions) tags.push('legendary');
    if (data.damage_immunities?.length) tags.push('damage immunity');
    if (data.damage_resistances?.length) tags.push('damage resistance');
    if (data.condition_immunities?.length) tags.push('condition immunity');
    
    return tags;
  }

  /**
   * Initialize some default monster templates for testing
   */
  private initializeDefaultTemplates(): void {
    const goblin: MonsterTemplate = {
      id: 'default_goblin',
      name: 'Goblin',
      type: 'humanoid',
      subtype: 'goblinoid',
      size: 'small',
      alignment: 'neutral evil',
      challengeRating: '1/4',
      experiencePoints: 50,
      armorClass: 15,
      hitPoints: { average: 7, formula: '2d6' },
      speed: { walk: 30 },
      stats: { strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
      proficiencyBonus: 2,
      abilities: [
        {
          id: 'scimitar_attack',
          name: 'Scimitar',
          type: 'action',
          description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.',
          attackBonus: 4,
          damage: { dice: '1d6', type: 'slashing', bonus: 2 }
        }
      ],
      description: 'A small, malicious creature that loves to cause trouble.',
      source: 'Default',
      tags: ['humanoid', 'small', 'CR 1/4'],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.templates.set(goblin.id, goblin);
  }

  // === Search and Filtering ===

  /**
   * Build search index for fast text searches
   */
  private buildSearchIndex(): void {
    this.searchIndex.clear();
    
    this.templates.forEach((template) => {
      const searchTerms = new Set<string>();
      
      // Add name terms
      template.name.toLowerCase().split(/\s+/).forEach(term => searchTerms.add(term));
      
      // Add type and subtype
      searchTerms.add(template.type.toLowerCase());
      if (template.subtype) searchTerms.add(template.subtype.toLowerCase());
      
      // Add size and alignment
      searchTerms.add(template.size);
      searchTerms.add(template.alignment.toLowerCase());
      
      // Add tags
      template.tags.forEach(tag => searchTerms.add(tag.toLowerCase()));
      
      // Add CR
      searchTerms.add(`cr${template.challengeRating.replace('/', '')}`);
      
      this.searchIndex.set(template.id, searchTerms);
    });
  }

  /**
   * Search monster templates
   */
  searchMonsters(query: string, filters?: MonsterSearchFilters): MonsterTemplate[] {
    if (query === this.lastSearchQuery && !filters) {
      return this.lastSearchResults;
    }
    
    let results = Array.from(this.templates.values());
    
    // Apply text search
    if (query.trim()) {
      const queryTerms = query.toLowerCase().split(/\s+/);
      results = results.filter(template => {
        const searchTerms = this.searchIndex.get(template.id) || new Set();
        return queryTerms.every(term => 
          Array.from(searchTerms).some(searchTerm => searchTerm.includes(term))
        );
      });
    }
    
    // Apply filters
    if (filters) {
      if (filters.type) {
        results = results.filter(t => t.type.toLowerCase() === filters.type!.toLowerCase());
      }
      
      if (filters.size?.length) {
        results = results.filter(t => filters.size!.includes(t.size));
      }
      
      if (filters.challengeRating) {
        results = results.filter(t => {
          const cr = this.parseChallengeRating(t.challengeRating);
          const min = filters.challengeRating!.min ?? 0;
          const max = filters.challengeRating!.max ?? 30;
          return cr >= min && cr <= max;
        });
      }
      
      if (filters.source) {
        results = results.filter(t => t.source.toLowerCase() === filters.source!.toLowerCase());
      }
      
      if (filters.tags?.length) {
        results = results.filter(t => 
          filters.tags!.every(tag => 
            t.tags.some(tTag => tTag.toLowerCase().includes(tag.toLowerCase()))
          )
        );
      }
      
      if (filters.hasSpells !== undefined) {
        results = results.filter(t => !!t.spells === filters.hasSpells);
      }
      
      if (filters.hasLegendaryActions !== undefined) {
        results = results.filter(t => !!t.legendary === filters.hasLegendaryActions);
      }
    }
    
    // Sort by name
    results.sort((a, b) => a.name.localeCompare(b.name));
    
    if (!filters) {
      this.lastSearchQuery = query;
      this.lastSearchResults = results;
    }
    
    return results;
  }

  /**
   * Parse challenge rating to numeric value for comparison
   */
  private parseChallengeRating(cr: string): number {
    if (cr.includes('/')) {
      const [num, den] = cr.split('/').map(n => parseInt(n));
      return num / den;
    }
    return parseInt(cr) || 0;
  }

  // === Instance Management ===

  /**
   * Create monster instance from template
   */
  createInstance(templateId: string, customName?: string, position?: { x: number; y: number; tableId?: string }): MonsterInstance | null {
    const template = this.templates.get(templateId);
    if (!template) {
      console.error(`Template not found: ${templateId}`);
      return null;
    }
    
    const id = `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const name = customName || template.name;
    
    const instance: MonsterInstance = {
      id,
      templateId,
      template,
      name,
      currentHitPoints: template.hitPoints.average,
      maxHitPoints: template.hitPoints.average,
      temporaryHitPoints: 0,
      conditions: [],
      position,
      notes: '',
      isVisible: true,
      isDefeated: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.instances.set(id, instance);
    this.stats.instancesCreated++;
    
    this.emit('instanceCreated', { instance });
    
    return instance;
  }

  /**
   * Update monster instance
   */
  updateInstance(instanceId: string, updates: Partial<MonsterInstance>): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;
    
    Object.assign(instance, updates, { updatedAt: Date.now() });
    
    this.emit('instanceUpdated', { instance, updates });
    
    return true;
  }

  /**
   * Delete monster instance
   */
  deleteInstance(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;
    
    this.instances.delete(instanceId);
    
    this.emit('instanceDeleted', { instanceId, instance });
    
    return true;
  }

  /**
   * Get all instances
   */
  getInstances(): MonsterInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get instance by ID
   */
  getInstance(instanceId: string): MonsterInstance | undefined {
    return this.instances.get(instanceId);
  }

  // === Template Management ===

  /**
   * Get all templates
   */
  getTemplates(): MonsterTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): MonsterTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Create custom monster template
   */
  createTemplate(template: Omit<MonsterTemplate, 'id' | 'createdAt' | 'updatedAt'>): MonsterTemplate {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const fullTemplate: MonsterTemplate = {
      ...template,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.templates.set(id, fullTemplate);
    this.buildSearchIndex(); // Rebuild search index
    
    this.emit('templateCreated', { template: fullTemplate });
    
    return fullTemplate;
  }

  /**
   * Update monster template
   */
  updateTemplate(templateId: string, updates: Partial<MonsterTemplate>): boolean {
    const template = this.templates.get(templateId);
    if (!template) return false;
    
    Object.assign(template, updates, { updatedAt: Date.now() });
    this.buildSearchIndex(); // Rebuild search index
    
    this.emit('templateUpdated', { template, updates });
    
    return true;
  }

  /**
   * Delete monster template
   */
  deleteTemplate(templateId: string): boolean {
    const template = this.templates.get(templateId);
    if (!template) return false;
    
    // Check if template is in use
    const instancesUsingTemplate = Array.from(this.instances.values())
      .filter(instance => instance.templateId === templateId);
    
    if (instancesUsingTemplate.length > 0) {
      console.warn(`Cannot delete template ${templateId}: ${instancesUsingTemplate.length} instances still use it`);
      return false;
    }
    
    this.templates.delete(templateId);
    this.buildSearchIndex(); // Rebuild search index
    
    this.emit('templateDeleted', { templateId, template });
    
    return true;
  }

  // === Utility Methods ===

  /**
   * Calculate ability modifier
   */
  static calculateModifier(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  /**
   * Get modifier string with + prefix for positive values
   */
  static getModifierString(score: number): string {
    const mod = this.calculateModifier(score);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }

  /**
   * Roll hit points for a monster
   */
  rollHitPoints(template: MonsterTemplate): number {
    const formula = template.hitPoints.formula;
    const match = formula.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/);
    
    if (!match) return template.hitPoints.average;
    
    const numDice = parseInt(match[1]);
    const dieSize = parseInt(match[2]);
    const modifier = match[3] && match[4] ? (match[3] === '+' ? 1 : -1) * parseInt(match[4]) : 0;
    
    let total = 0;
    for (let i = 0; i < numDice; i++) {
      total += Math.floor(Math.random() * dieSize) + 1;
    }
    
    return Math.max(1, total + modifier);
  }

  /**
   * Get compendium status
   */
  getCompendiumStatus(): { loaded: boolean; hasData: boolean } {
    return {
      loaded: this.isCompendiumLoaded,
      hasData: !!this.compendiumData
    };
  }

  /**
   * Get statistics
   */
  getStatistics(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Reset all data (for testing)
   */
  reset(): void {
    this.templates.clear();
    this.instances.clear();
    this.encounters.clear();
    this.searchIndex.clear();
    this.lastSearchQuery = '';
    this.lastSearchResults = [];
    this.stats = {
      templatesLoaded: 0,
      instancesCreated: 0,
      encountersGenerated: 0,
      monstersOnTables: 0
    };
    this.initializeDefaultTemplates();
  }

  /**
   * Export data
   */
  exportData(): {
    templates: MonsterTemplate[];
    instances: MonsterInstance[];
    encounters: EncounterTemplate[];
  } {
    return {
      templates: this.getTemplates(),
      instances: this.getInstances(),
      encounters: Array.from(this.encounters.values())
    };
  }

  /**
   * Import data
   */
  importData(data: {
    templates?: MonsterTemplate[];
    instances?: MonsterInstance[];
    encounters?: EncounterTemplate[];
  }): void {
    if (data.templates) {
      data.templates.forEach(template => {
        this.templates.set(template.id, template);
      });
      this.buildSearchIndex();
    }
    
    if (data.instances) {
      data.instances.forEach(instance => {
        this.instances.set(instance.id, instance);
      });
    }
    
    if (data.encounters) {
      data.encounters.forEach(encounter => {
        this.encounters.set(encounter.id, encounter);
      });
    }
    
    this.emit('dataImported', { data });
  }
}

// Export singleton instance
export const monsterCreationSystem = MonsterCreationService.getInstance();