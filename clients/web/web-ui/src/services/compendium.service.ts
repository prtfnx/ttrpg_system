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

// Mock D&D 5e data for testing and development
const mockMonsters: Monster[] = [
  {
    id: '1',
    name: 'Goblin',
    challenge_rating: 0.25,
    type: 'humanoid',
    hp: 7,
    ac: 15,
    stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }
  },
  {
    id: '2',
    name: 'Orc',
    challenge_rating: 0.5,
    type: 'humanoid', 
    hp: 15,
    ac: 13,
    stats: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 }
  },
  {
    id: '3',
    name: 'Dragon',
    challenge_rating: 15,
    type: 'dragon', 
    hp: 256,
    ac: 19,
    stats: { str: 27, dex: 14, con: 25, int: 16, wis: 15, cha: 19 }
  },
  {
    id: '4',
    name: 'Hill Giant',
    challenge_rating: 5,
    type: 'giant',
    size: 'Huge',
    alignment: 'chaotic evil',
    hp: 105,
    ac: 13,
    stats: { str: 21, dex: 8, con: 19, int: 5, wis: 9, cha: 6 },
    description: 'Huge giant, chaotic evil. Armor Class 13 (Natural Armor). Hit Points 105 (10d12 + 30).'
  },
  {
    id: '5',
    name: 'Flesh Golem',
    challenge_rating: 5,
    type: 'construct',
    hp: 93,
    ac: 9,
    stats: { str: 19, dex: 9, con: 18, int: 6, wis: 10, cha: 5 }
  }
];const mockSpells: Spell[] = [
  {
    id: '1',
    name: 'Fireball',
    level: 3,
    school: 'evocation',
    description: '8d6 fire damage in 20-foot radius'
  },
  {
    id: '2',
    name: 'Magic Missile',
    level: 1, 
    school: 'evocation',
    description: 'Three darts of magical force, each dealing 1d4+1 damage'
  },
  {
    id: '3',
    name: 'Healing Word',
    level: 1,
    school: 'evocation',
    description: 'Heal a creature for 1d4 + spellcasting modifier hit points'
  },
  {
    id: '4',
    name: 'Lightning Bolt',
    level: 3,
    school: 'evocation',
    description: '8d6 lightning damage in 100-foot line'
  }
];

const mockEquipment: Equipment[] = [
  {
    id: '1',
    name: 'Longsword',
    type: 'weapon',
    cost: '15 gp',
    description: 'Versatile melee weapon (1d8/1d10 slashing)'
  },
  {
    id: '2', 
    name: 'Chain Mail',
    type: 'armor',
    cost: '75 gp',
    description: 'Heavy armor, AC 16, Stealth disadvantage'
  },
  {
    id: '3',
    name: 'Healing Potion',
    type: 'potion',
    cost: '50 gp', 
    description: 'Restore 2d4+2 hit points'
  }
];

export const compendiumService = {
  async searchMonsters(query?: string): Promise<Monster[]> {
    if (!query) return mockMonsters;
    
    const lowerQuery = query.toLowerCase();
    return mockMonsters.filter(monster => 
      monster.name.toLowerCase().includes(lowerQuery) ||
      monster.type.toLowerCase().includes(lowerQuery)
    );
  },

  async searchSpells(query?: string): Promise<Spell[]> {
    if (!query) return mockSpells;
    
    const lowerQuery = query.toLowerCase();
    return mockSpells.filter(spell =>
      spell.name.toLowerCase().includes(lowerQuery) ||
      spell.school.toLowerCase().includes(lowerQuery)
    );
  },

  async searchEquipment(query?: string): Promise<Equipment[]> {
    if (!query) return mockEquipment;
    
    const lowerQuery = query.toLowerCase();
    return mockEquipment.filter(item =>
      item.name.toLowerCase().includes(lowerQuery) ||
      item.type.toLowerCase().includes(lowerQuery)
    );
  },

  async getMonsterDetails(id: string): Promise<Monster | null> {
    return mockMonsters.find(monster => monster.id === id) || null;
  }
};