/**
 * D&D 5e Compendium Data Service
 * Loads and caches compendium data from the backend API
 */

// Base API URL - adjust based on environment
const API_BASE_URL = import.meta.env.MODE === 'development' 
  ? 'http://localhost:12345/api/compendium'
  : '/api/compendium';

// Type definitions based on compendium data structure
export interface AbilityScoreIncrease {
  ability: string;
  increase: number;
}

export interface RaceTrait {
  name: string;
  description: string;
  source?: string;
}

export interface Race {
  name: string;
  size: string;
  speed: number;
  ability_score_increases: AbilityScoreIncrease[];
  spell_ability?: string | null;
  skill_proficiencies: string[];
  traits: RaceTrait[];
  languages: string[];
  source: string;
  darkvision?: number;
  damage_resistances: string[];
  damage_immunities: string[];
  condition_immunities: string[];
}

export interface CharacterClass {
  name: string;
  hit_die: number; // Just the number (e.g., 12 for d12)
  primary_abilities: string[];
  saving_throw_proficiencies: string[]; // Renamed from saving_throws
  skill_proficiencies?: string[];
  num_skills?: number;
  spell_ability?: string | null;
  armor_proficiencies?: string[];
  weapon_proficiencies?: string[];
  // Add more class properties as needed
}

export interface BackgroundFeature {
  name: string;
  description: string;
  feature_type: string;
}

export interface Background {
  name: string;
  skill_proficiencies: string[];
  language_proficiencies: string[];
  tool_proficiencies: string[];
  equipment: string[];
  features: BackgroundFeature[];
}

export interface Spell {
  name: string;
  level: number;
  school: string;
  ritual: boolean;
  casting_time: string;
  range: string;
  duration: string;
  concentration: boolean;
  components: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
    material_description: string;
    material_consumed: boolean;
    material_cost?: number | null;
  };
  classes: string[];
  description: string;
  higher_levels?: string;
}

export interface CompendiumStatus {
  status: string;
  data_availability: {
    character_data: boolean;
    spell_data: boolean;
    equipment_data: boolean;
    bestiary_data: boolean;
  };
  counts: {
    races: number;
    classes: number;
    spells: number;
    monsters: number;
  };
}

export interface RacesResponse {
  races: Race[];
  count: number;
}

export interface ClassesResponse {
  classes: CharacterClass[];
  count: number;
}

export interface BackgroundsResponse {
  backgrounds: Background[];
  count: number;
}

export interface SpellsResponse {
  spells: Record<string, Spell>;
  count: number;
  metadata: {
    export_date: string;
    format_version: string;
    spell_count: number;
    generator: string;
  };
}

class CompendiumService {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Clear cache periodically
    setInterval(() => {
      this.clearExpiredCache();
    }, 60 * 1000); // Check every minute
  }

  private clearExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_DURATION) {
        this.cache.delete(key);
      }
    }
  }

  private async fetchWithCache<T>(endpoint: string): Promise<T> {
    const cacheKey = endpoint;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error(`Error fetching compendium data from ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Get compendium API status and data availability
   */
  async getStatus(): Promise<CompendiumStatus> {
    return this.fetchWithCache<CompendiumStatus>('/status');
  }

  /**
   * Get all races
   */
  async getRaces(): Promise<RacesResponse> {
    return this.fetchWithCache<RacesResponse>('/races');
  }

  /**
   * Get specific race by name
   */
  async getRace(raceName: string): Promise<Race> {
    return this.fetchWithCache<Race>(`/races/${encodeURIComponent(raceName)}`);
  }

  /**
   * Get all classes
   */
  async getClasses(): Promise<ClassesResponse> {
    return this.fetchWithCache<ClassesResponse>('/classes');
  }

  /**
   * Get specific class by name
   */
  async getClass(className: string): Promise<CharacterClass> {
    return this.fetchWithCache<CharacterClass>(`/classes/${encodeURIComponent(className)}`);
  }

  /**
   * Get all backgrounds
   */
  async getBackgrounds(): Promise<BackgroundsResponse> {
    return this.fetchWithCache<BackgroundsResponse>('/backgrounds');
  }

  /**
   * Get specific background by name
   */
  async getBackground(backgroundName: string): Promise<Background> {
    return this.fetchWithCache<Background>(`/backgrounds/${encodeURIComponent(backgroundName)}`);
  }

  /**
   * Get spells with optional filtering
   */
  async getSpells(filters: {
    level?: number;
    school?: string;
    class?: string;
    limit?: number;
  } = {}): Promise<SpellsResponse> {
    const params = new URLSearchParams();
    
    if (filters.level !== undefined) params.append('level', filters.level.toString());
    if (filters.school) params.append('school', filters.school);
    if (filters.class) params.append('class', filters.class);
    if (filters.limit) params.append('limit', filters.limit.toString());

    const queryString = params.toString();
    const endpoint = `/spells${queryString ? `?${queryString}` : ''}`;
    
    return this.fetchWithCache<SpellsResponse>(endpoint);
  }

  /**
   * Get specific spell by name
   */
  async getSpell(spellName: string): Promise<Spell> {
    return this.fetchWithCache<Spell>(`/spells/${encodeURIComponent(spellName)}`);
  }

  /**
   * Convert backend race format to frontend format
   * This bridges the gap between the compendium format and the existing frontend race format
   */
  convertRaceFormat(backendRace: Race): any {
    const abilityScoreIncrease: Record<string, number> = {};
    
    // Convert ability score increases to frontend format
    backendRace.ability_score_increases.forEach(asi => {
      const ability = asi.ability.toLowerCase();
      abilityScoreIncrease[ability] = asi.increase;
    });

    // Convert traits to frontend format
    const traits = backendRace.traits.map(trait => ({
      name: trait.name,
      description: trait.description
    }));

    return {
      name: backendRace.name,
      abilityScoreIncrease,
      size: backendRace.size as 'Small' | 'Medium',
      speed: backendRace.speed,
      languages: backendRace.languages,
      traits,
      proficiencies: {
        skills: backendRace.skill_proficiencies
      },
      darkvision: backendRace.darkvision,
      // No subraces in backend format yet - could be added later
      subraces: {}
    };
  }

  /**
   * Get all races in frontend format
   */
  async getRacesForFrontend(): Promise<Record<string, any>> {
    const racesResponse = await this.getRaces();
    const frontendRaces: Record<string, any> = {};
    
    racesResponse.races.forEach(race => {
      frontendRaces[race.name] = this.convertRaceFormat(race);
    });
    
    return frontendRaces;
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clear();
  }
}

// Export the class for instantiation
export { CompendiumService };

// Singleton instance
export const compendiumService = new CompendiumService();

// Export default for convenience
export default compendiumService;