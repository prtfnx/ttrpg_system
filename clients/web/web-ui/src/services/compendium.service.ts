/**
 * Compendium Service - Production API Integration
 * Connects to FastAPI backend for D&D 5e compendium data
 */

export interface Monster {
  id: string;
  name: string;
  challenge_rating: number;
  type: string;
  hp?: number;
  ac?: number;
  stats?: Record<string, number>;
  size?: string;
  alignment?: string;
  description?: string;
}

export interface Spell {
  id: string;
  name: string;
  level: number;
  school: string;
  description?: string;
}

export interface Equipment {
  id: string;
  name: string;
  type: string;
  cost: string;
  description?: string;
}

class CompendiumServiceAPI {
  private baseURL = '/api/compendium';
  
  private async fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        ...options?.headers
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication required. Please log in.');
      }
      if (response.status === 403) {
        throw new Error('Permission denied. Upgrade your account for access.');
      }
      throw new Error(`API error: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  async searchMonsters(query?: string): Promise<Monster[]> {
    const response = await this.fetchAPI<{monsters: Record<string, any>}>('/monsters');
    const monstersObj = response.monsters;
    
    // Convert object to array and add IDs
    const monsters: Monster[] = Object.entries(monstersObj).map(([key, monster]) => ({
      id: key,
      name: monster.name || key,
      challenge_rating: monster.challenge_rating || monster.cr || 0,
      type: monster.type || 'unknown',
      hp: monster.hp || monster.hit_points,
      ac: monster.armor_class || monster.ac,
      stats: monster.stats,
      size: monster.size,
      alignment: monster.alignment,
      description: monster.description
    }));
    
    if (!query) return monsters;
    
    const lowerQuery = query.toLowerCase();
    return monsters.filter(monster => 
      monster.name.toLowerCase().includes(lowerQuery) ||
      monster.type.toLowerCase().includes(lowerQuery)
    );
  }

  async searchSpells(query?: string, level?: number): Promise<Spell[]> {
    const params = new URLSearchParams();
    if (level !== undefined) params.set('level', level.toString());
    
    const endpoint = `/spells${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await this.fetchAPI<{spells: Record<string, any>}>(endpoint);
    const spellsObj = response.spells;
    
    // Convert object to array and add IDs
    const spells: Spell[] = Object.entries(spellsObj).map(([key, spell]) => ({
      id: key,
      name: spell.name || key,
      level: spell.level || 0,
      school: spell.school || 'unknown',
      description: spell.description || spell.desc?.join(' ')
    }));
    
    if (!query) return spells;
    
    const lowerQuery = query.toLowerCase();
    return spells.filter(spell =>
      spell.name.toLowerCase().includes(lowerQuery) ||
      spell.school.toLowerCase().includes(lowerQuery)
    );
  }

  async searchEquipment(query?: string): Promise<Equipment[]> {
    const response = await this.fetchAPI<{equipment?: any[], items?: any[]}>('/equipment');
    const equipmentList = response.equipment || response.items || [];
    
    if (!Array.isArray(equipmentList)) {
      console.warn('Equipment data is not an array:', equipmentList);
      return [];
    }
    
    const equipment: Equipment[] = equipmentList.map((item, index) => ({
      id: item.id || `eq-${index}`,
      name: item.name || 'Unknown',
      type: item.type || item.equipment_category?.name || 'misc',
      cost: item.cost || item.cost_gp || 'N/A',
      description: item.description || item.desc?.join(' ')
    }));
    
    if (!query) return equipment;
    
    const lowerQuery = query.toLowerCase();
    return equipment.filter(item =>
      item.name.toLowerCase().includes(lowerQuery) ||
      item.type.toLowerCase().includes(lowerQuery)
    );
  }

  async getMonsterDetails(id: string): Promise<Monster | null> {
    try {
      const monster = await this.fetchAPI<any>(`/monsters/${id}`);
      return {
        id,
        name: monster.name || id,
        challenge_rating: monster.challenge_rating || monster.cr || 0,
        type: monster.type || 'unknown',
        hp: monster.hp || monster.hit_points,
        ac: monster.armor_class || monster.ac,
        stats: monster.stats,
        size: monster.size,
        alignment: monster.alignment,
        description: monster.description
      };
    } catch (error) {
      console.error(`Error fetching monster ${id}:`, error);
      return null;
    }
  }
}

export const compendiumService = new CompendiumServiceAPI();