import type { UserInfo } from './auth.service';

export interface CompendiumEntry {
  id: string;
  name: string;
  type: 'spell' | 'monster' | 'item' | 'class' | 'race' | 'background' | 'feat';
  source: string;
  level?: number;
  school?: string;
  challengeRating?: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary' | 'artifact';
  description: string;
  tags: string[];
  data: any; // Specific data structure per type
}

export interface SearchFilters {
  type?: string[];
  level?: number[];
  school?: string[];
  source?: string[];
  challengeRating?: string[];
  rarity?: string[];
  tags?: string[];
  searchText?: string;
}

export interface CompendiumResponse {
  entries: CompendiumEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export class CompendiumManager {
  private cache: Map<string, CompendiumEntry[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private static CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private baseUrl: string;

  constructor(baseUrl: string = '/api/compendium') {
    this.baseUrl = baseUrl;
  }

  /**
   * Search compendium entries with filters
   */
  async search(filters: SearchFilters = {}, page: number = 1, pageSize: number = 50): Promise<CompendiumResponse> {
    const cacheKey = this.getCacheKey('search', filters, page, pageSize);
    
    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString()
      });

      // Add filter parameters
      if (filters.type?.length) queryParams.append('type', filters.type.join(','));
      if (filters.level?.length) queryParams.append('level', filters.level.join(','));
      if (filters.school?.length) queryParams.append('school', filters.school.join(','));
      if (filters.source?.length) queryParams.append('source', filters.source.join(','));
      if (filters.challengeRating?.length) queryParams.append('cr', filters.challengeRating.join(','));
      if (filters.rarity?.length) queryParams.append('rarity', filters.rarity.join(','));
      if (filters.tags?.length) queryParams.append('tags', filters.tags.join(','));
      if (filters.searchText) queryParams.append('q', filters.searchText);

      const response = await fetch(`${this.baseUrl}/search?${queryParams}`);
      
      if (!response.ok) {
        throw new Error(`Failed to search compendium: ${response.statusText}`);
      }

      const result: CompendiumResponse = await response.json();
      
      // Cache the result
      this.setCache(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('Compendium search failed:', error);
      throw error;
    }
  }

  /**
   * Get specific entry by ID
   */
  async getEntry(id: string): Promise<CompendiumEntry | null> {
    const cacheKey = this.getCacheKey('entry', { id });
    
    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(`${this.baseUrl}/entry/${id}`);
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`Failed to get compendium entry: ${response.statusText}`);
      }

      const entry: CompendiumEntry = await response.json();
      
      // Cache the result
      this.setCache(cacheKey, entry);
      
      return entry;
    } catch (error) {
      console.error('Failed to get compendium entry:', error);
      throw error;
    }
  }

  /**
   * Get spells for a specific class and level
   */
  async getSpellsForClass(className: string, level?: number): Promise<CompendiumEntry[]> {
    const filters: SearchFilters = {
      type: ['spell'],
      tags: [className.toLowerCase()]
    };
    
    if (level !== undefined) {
      filters.level = [level];
    }

    const response = await this.search(filters, 1, 200);
    return response.entries;
  }

  /**
   * Get monsters by challenge rating range
   */
  async getMonstersByCR(minCR: string, maxCR: string): Promise<CompendiumEntry[]> {
    const filters: SearchFilters = {
      type: ['monster'],
      challengeRating: this.getCRRange(minCR, maxCR)
    };

    const response = await this.search(filters, 1, 200);
    return response.entries;
  }

  /**
   * Get items by rarity
   */
  async getItemsByRarity(rarity: CompendiumEntry['rarity']): Promise<CompendiumEntry[]> {
    const filters: SearchFilters = {
      type: ['item'],
      rarity: rarity ? [rarity] : undefined
    };

    const response = await this.search(filters, 1, 200);
    return response.entries;
  }

  /**
   * Get available spell schools
   */
  async getSpellSchools(): Promise<string[]> {
    const cacheKey = 'spell_schools';
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(`${this.baseUrl}/metadata/spell-schools`);
      if (!response.ok) {
        throw new Error(`Failed to get spell schools: ${response.statusText}`);
      }

      const schools: string[] = await response.json();
      this.setCache(cacheKey, schools);
      return schools;
    } catch (error) {
      console.error('Failed to get spell schools:', error);
      // Fallback to standard D&D 5e schools
      return [
        'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
        'Evocation', 'Illusion', 'Necromancy', 'Transmutation'
      ];
    }
  }

  /**
   * Get available sources
   */
  async getSources(): Promise<string[]> {
    const cacheKey = 'sources';
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(`${this.baseUrl}/metadata/sources`);
      if (!response.ok) {
        throw new Error(`Failed to get sources: ${response.statusText}`);
      }

      const sources: string[] = await response.json();
      this.setCache(cacheKey, sources);
      return sources;
    } catch (error) {
      console.error('Failed to get sources:', error);
      // Fallback to core D&D 5e sources
      return [
        "Player's Handbook", "Dungeon Master's Guide", "Monster Manual",
        "Xanathar's Guide to Everything", "Tasha's Cauldron of Everything",
        "Volo's Guide to Monsters", "Mordenkainen's Tome of Foes"
      ];
    }
  }

  /**
   * Create custom entry (for DMs)
   */
  async createCustomEntry(entry: Omit<CompendiumEntry, 'id'>, userInfo: UserInfo): Promise<CompendiumEntry> {
    if (userInfo.role !== 'dm') {
      throw new Error('Only DMs can create custom compendium entries');
    }

    try {
      const response = await fetch(`${this.baseUrl}/custom`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...entry,
          createdBy: userInfo.id,
          createdAt: new Date().toISOString()
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to create custom entry: ${response.statusText}`);
      }

      const created: CompendiumEntry = await response.json();
      
      // Clear relevant caches
      this.clearCacheByPattern('search');
      
      return created;
    } catch (error) {
      console.error('Failed to create custom entry:', error);
      throw error;
    }
  }

  /**
   * Update custom entry (for DMs)
   */
  async updateCustomEntry(id: string, updates: Partial<CompendiumEntry>, userInfo: UserInfo): Promise<CompendiumEntry> {
    if (userInfo.role !== 'dm') {
      throw new Error('Only DMs can update custom compendium entries');
    }

    try {
      const response = await fetch(`${this.baseUrl}/custom/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...updates,
          updatedBy: userInfo.id,
          updatedAt: new Date().toISOString()
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to update custom entry: ${response.statusText}`);
      }

      const updated: CompendiumEntry = await response.json();
      
      // Clear relevant caches
      this.clearCacheByPattern('search');
      this.cache.delete(this.getCacheKey('entry', { id }));
      
      return updated;
    } catch (error) {
      console.error('Failed to update custom entry:', error);
      throw error;
    }
  }

  /**
   * Delete custom entry (for DMs)
   */
  async deleteCustomEntry(id: string, userInfo: UserInfo): Promise<void> {
    if (userInfo.role !== 'dm') {
      throw new Error('Only DMs can delete custom compendium entries');
    }

    try {
      const response = await fetch(`${this.baseUrl}/custom/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to delete custom entry: ${response.statusText}`);
      }

      // Clear relevant caches
      this.clearCacheByPattern('search');
      this.cache.delete(this.getCacheKey('entry', { id }));
    } catch (error) {
      console.error('Failed to delete custom entry:', error);
      throw error;
    }
  }

  /**
   * Get random entries by type
   */
  async getRandomEntries(type: CompendiumEntry['type'], count: number = 5): Promise<CompendiumEntry[]> {
    try {
      const response = await fetch(`${this.baseUrl}/random?type=${type}&count=${count}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get random entries: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get random entries:', error);
      throw error;
    }
  }

  /**
   * Cache management
   */
  private getCacheKey(operation: string, params: any, ...extra: any[]): string {
    return `${operation}_${JSON.stringify(params)}_${extra.join('_')}`;
  }

  private getFromCache(key: string): any {
    const expiry = this.cacheExpiry.get(key);
    if (expiry && Date.now() > expiry) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
      return null;
    }
    return this.cache.get(key) || null;
  }

  private setCache(key: string, value: any): void {
    this.cache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + CompendiumManager.CACHE_DURATION);
  }

  private clearCacheByPattern(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        this.cacheExpiry.delete(key);
      }
    }
  }

  private getCRRange(minCR: string, maxCR: string): string[] {
    const crValues = [
      '0', '1/8', '1/4', '1/2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
      '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30'
    ];
    
    const minIndex = crValues.indexOf(minCR);
    const maxIndex = crValues.indexOf(maxCR);
    
    if (minIndex === -1 || maxIndex === -1) {
      return [minCR, maxCR];
    }
    
    return crValues.slice(minIndex, maxIndex + 1);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }
}

// Singleton instance
export const compendiumManager = new CompendiumManager();
export default CompendiumManager;