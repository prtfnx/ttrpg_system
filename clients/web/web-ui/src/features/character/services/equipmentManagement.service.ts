// Type-safe conversion utilities for equipment <-> wizard item <-> inventory item
// Wizard equipment item type
export type WizardEquipmentItem = {
  equipment: {
    name: string;
    weight: number;
    cost: {
      amount: number;
      unit: string;
    };
  };
  quantity: number;
  equipped?: boolean;
};

/**
 * Convert Equipment to Wizard equipment item
 */
export function equipmentToWizardItem(equipment: Equipment, quantity: number, equipped?: boolean): WizardEquipmentItem {
  return {
    equipment: {
      name: equipment.name,
      weight: equipment.weight,
      cost: {
        amount: equipment.cost.quantity,
        unit: equipment.cost.unit
      }
    },
    quantity,
    ...(equipped !== undefined ? { equipped } : {})
  };
}

/**
 * Convert Wizard equipment item to InventoryItem (using a lookup for full Equipment if needed)
 */
export function wizardItemToInventoryItem(
  item: WizardEquipmentItem,
  equipmentLookup: (name: string) => Equipment
): InventoryItem {
  return {
    equipment: equipmentLookup(item.equipment.name),
    quantity: item.quantity,
    equipped: item.equipped
  };
}

/**
 * Convert InventoryItem to Wizard equipment item
 */
export function inventoryItemToWizardItem(item: InventoryItem): WizardEquipmentItem {
  return equipmentToWizardItem(item.equipment, item.quantity, item.equipped);
}
/**
 * D&D 5e Equipment Management Service
 * Handles equipment selection, inventory management, and starting equipment
 */

// Equipment Categories
export const EquipmentCategory = {
  WEAPON: 'weapon',
  ARMOR: 'armor',
  SHIELD: 'shield',
  TOOL: 'tool',
  GEAR: 'gear',
  MOUNT: 'mount',
  VEHICLE: 'vehicle',
  TREASURE: 'treasure',
  CONSUMABLE: 'consumable'
} as const;

export type EquipmentCategoryType = typeof EquipmentCategory[keyof typeof EquipmentCategory];

export const WeaponType = {
  SIMPLE_MELEE: 'simple_melee',
  SIMPLE_RANGED: 'simple_ranged',
  MARTIAL_MELEE: 'martial_melee',
  MARTIAL_RANGED: 'martial_ranged'
} as const;

export type WeaponTypeType = typeof WeaponType[keyof typeof WeaponType];

export const ArmorType = {
  LIGHT: 'light',
  MEDIUM: 'medium',
  HEAVY: 'heavy'
} as const;

export type ArmorTypeType = typeof ArmorType[keyof typeof ArmorType];

export const DamageType = {
  SLASHING: 'slashing',
  PIERCING: 'piercing',
  BLUDGEONING: 'bludgeoning',
  ACID: 'acid',
  COLD: 'cold',
  FIRE: 'fire',
  FORCE: 'force',
  LIGHTNING: 'lightning',
  NECROTIC: 'necrotic',
  POISON: 'poison',
  PSYCHIC: 'psychic',
  RADIANT: 'radiant',
  THUNDER: 'thunder'
} as const;

export type DamageTypeType = typeof DamageType[keyof typeof DamageType];

export interface Damage {
  dice: string; // e.g., "1d8", "2d6"
  type: DamageTypeType;
}

export interface WeaponProperties {
  light?: boolean;
  finesse?: boolean;
  thrown?: { range_normal: number; range_long: number };
  two_handed?: boolean;
  versatile?: { damage: string }; // e.g., "1d10"
  reach?: boolean;
  heavy?: boolean;
  loading?: boolean;
  ammunition?: boolean;
  special?: string;
}

export interface Equipment {
  name: string;
  category: EquipmentCategoryType;
  cost: {
    quantity: number;
    unit: 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
  };
  weight: number; // in pounds
  description: string;
  source?: string;
}

export interface Weapon extends Equipment {
  category: typeof EquipmentCategory.WEAPON;
  weapon_type: WeaponTypeType;
  damage: Damage;
  properties: WeaponProperties;
  proficiency_required: string; // e.g., "Simple weapons", "Martial weapons"
}

export interface Armor extends Equipment {
  category: typeof EquipmentCategory.ARMOR;
  armor_type: ArmorTypeType;
  armor_class: {
    base: number;
    dex_bonus?: boolean;
    max_bonus?: number;
  };
  stealth_disadvantage?: boolean;
  strength_requirement?: number;
}

export interface Shield extends Equipment {
  category: typeof EquipmentCategory.SHIELD;
  armor_class_bonus: number;
}

export interface AdventuringGear extends Equipment {
  category: typeof EquipmentCategory.GEAR;
  uses?: number;
  special_properties?: string[];
}

export interface Tool extends Equipment {
  category: typeof EquipmentCategory.TOOL;
  tool_type: 'artisan' | 'gaming' | 'musical' | 'other';
  proficiency_type?: string; // e.g., "Thieves' tools", "Smith's tools"
}

// Starting Equipment by Class
export interface StartingEquipmentChoice {
  choose: number;
  from: Equipment[];
  type: 'equipment' | 'equipment_pack';
}

export interface StartingEquipment {
  equipment: Equipment[];
  equipment_choices: StartingEquipmentChoice[];
  starting_wealth?: {
    dice: string; // e.g., "4d4"
    multiplier: number; // multiply by 10 for gp
  };
}

// Character Equipment/Inventory
export interface InventoryItem {
  equipment: Equipment;
  quantity: number;
  equipped?: boolean;
  identified?: boolean;
  notes?: string;
}

export interface CharacterInventory {
  items: InventoryItem[];
  currency: {
    cp: number;
    sp: number;
    ep: number;
    gp: number;
    pp: number;
  };
  carrying_capacity: {
    current_weight: number;
    max_weight: number;
    encumbered_at: number;
    heavily_encumbered_at: number;
  };
}

// Equipment data - D&D 5e SRD equipment
export const WEAPONS: Weapon[] = [
  // Simple Melee Weapons
  {
    name: 'Club',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.SIMPLE_MELEE,
    cost: { quantity: 1, unit: 'sp' },
    damage: { dice: '1d4', type: DamageType.BLUDGEONING },
    weight: 2,
    properties: { light: true },
    description: 'A simple wooden club.',
    proficiency_required: 'Simple weapons'
  },
  {
    name: 'Dagger',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.SIMPLE_MELEE,
    cost: { quantity: 2, unit: 'gp' },
    damage: { dice: '1d4', type: DamageType.PIERCING },
    weight: 1,
    properties: { 
      finesse: true, 
      light: true, 
      thrown: { range_normal: 20, range_long: 60 }
    },
    description: 'A versatile blade, equally useful in melee and at range.',
    proficiency_required: 'Simple weapons'
  },
  {
    name: 'Dart',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.SIMPLE_RANGED,
    cost: { quantity: 5, unit: 'cp' },
    damage: { dice: '1d4', type: DamageType.PIERCING },
    weight: 0.25,
    properties: { 
      finesse: true,
      thrown: { range_normal: 20, range_long: 60 }
    },
    description: 'A small thrown weapon.',
    proficiency_required: 'Simple weapons'
  },
  {
    name: 'Javelin',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.SIMPLE_MELEE,
    cost: { quantity: 5, unit: 'sp' },
    damage: { dice: '1d6', type: DamageType.PIERCING },
    weight: 2,
    properties: { 
      thrown: { range_normal: 30, range_long: 120 }
    },
    description: 'A light spear designed for throwing.',
    proficiency_required: 'Simple weapons'
  },
  {
    name: 'Mace',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.SIMPLE_MELEE,
    cost: { quantity: 5, unit: 'gp' },
    damage: { dice: '1d6', type: DamageType.BLUDGEONING },
    weight: 4,
    properties: {},
    description: 'A heavy club with a weighted head.',
    proficiency_required: 'Simple weapons'
  },
  {
    name: 'Quarterstaff',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.SIMPLE_MELEE,
    cost: { quantity: 2, unit: 'sp' },
    damage: { dice: '1d6', type: DamageType.BLUDGEONING },
    weight: 4,
    properties: { 
      versatile: { damage: '1d8' }
    },
    description: 'A simple wooden staff.',
    proficiency_required: 'Simple weapons'
  },
  // Simple Ranged Weapons
  {
    name: 'Light Crossbow',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.SIMPLE_RANGED,
    cost: { quantity: 25, unit: 'gp' },
    damage: { dice: '1d8', type: DamageType.PIERCING },
    weight: 5,
    properties: { 
      ammunition: true,
      loading: true,
      two_handed: true
    },
    description: 'A simple mechanical bow.',
    proficiency_required: 'Simple weapons'
  },
  {
    name: 'Shortbow',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.SIMPLE_RANGED,
    cost: { quantity: 25, unit: 'gp' },
    damage: { dice: '1d6', type: DamageType.PIERCING },
    weight: 2,
    properties: { 
      ammunition: true,
      two_handed: true
    },
    description: 'A simple bow for hunting and combat.',
    proficiency_required: 'Simple weapons'
  },
  // Martial Melee Weapons
  {
    name: 'Battleaxe',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.MARTIAL_MELEE,
    cost: { quantity: 10, unit: 'gp' },
    damage: { dice: '1d8', type: DamageType.SLASHING },
    weight: 4,
    properties: { 
      versatile: { damage: '1d10' }
    },
    description: 'A heavy axe designed for war.',
    proficiency_required: 'Martial weapons'
  },
  {
    name: 'Longsword',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.MARTIAL_MELEE,
    cost: { quantity: 15, unit: 'gp' },
    damage: { dice: '1d8', type: DamageType.SLASHING },
    weight: 3,
    properties: { 
      versatile: { damage: '1d10' }
    },
    description: 'A versatile sword favored by many warriors.',
    proficiency_required: 'Martial weapons'
  },
  {
    name: 'Rapier',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.MARTIAL_MELEE,
    cost: { quantity: 25, unit: 'gp' },
    damage: { dice: '1d8', type: DamageType.PIERCING },
    weight: 2,
    properties: { finesse: true },
    description: 'A slender, sharp-pointed sword.',
    proficiency_required: 'Martial weapons'
  },
  {
    name: 'Scimitar',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.MARTIAL_MELEE,
    cost: { quantity: 25, unit: 'gp' },
    damage: { dice: '1d6', type: DamageType.SLASHING },
    weight: 3,
    properties: { 
      finesse: true,
      light: true 
    },
    description: 'A curved sword with a sharp edge.',
    proficiency_required: 'Martial weapons'
  },
  {
    name: 'Shortsword',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.MARTIAL_MELEE,
    cost: { quantity: 10, unit: 'gp' },
    damage: { dice: '1d6', type: DamageType.PIERCING },
    weight: 2,
    properties: { 
      finesse: true,
      light: true 
    },
    description: 'A short, light blade perfect for quick strikes.',
    proficiency_required: 'Martial weapons'
  },
  // Martial Ranged Weapons
  {
    name: 'Heavy Crossbow',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.MARTIAL_RANGED,
    cost: { quantity: 50, unit: 'gp' },
    damage: { dice: '1d10', type: DamageType.PIERCING },
    weight: 18,
    properties: { 
      ammunition: true,
      heavy: true,
      loading: true,
      two_handed: true
    },
    description: 'A powerful mechanical bow.',
    proficiency_required: 'Martial weapons'
  },
  {
    name: 'Longbow',
    category: EquipmentCategory.WEAPON,
    weapon_type: WeaponType.MARTIAL_RANGED,
    cost: { quantity: 50, unit: 'gp' },
    damage: { dice: '1d8', type: DamageType.PIERCING },
    weight: 2,
    properties: { 
      ammunition: true,
      heavy: true,
      two_handed: true
    },
    description: 'A tall bow capable of long-range shots.',
    proficiency_required: 'Martial weapons'
  }
];

export const ARMOR: Armor[] = [
  // Light Armor
  {
    name: 'Padded',
    category: EquipmentCategory.ARMOR,
    armor_type: ArmorType.LIGHT,
    cost: { quantity: 5, unit: 'gp' },
    armor_class: { base: 11, dex_bonus: true },
    weight: 8,
    stealth_disadvantage: true,
    description: 'Quilted layers of cloth and batting.'
  },
  {
    name: 'Leather',
    category: EquipmentCategory.ARMOR,
    armor_type: ArmorType.LIGHT,
    cost: { quantity: 10, unit: 'gp' },
    armor_class: { base: 11, dex_bonus: true },
    weight: 10,
    description: 'Soft and flexible leather armor.'
  },
  {
    name: 'Studded Leather',
    category: EquipmentCategory.ARMOR,
    armor_type: ArmorType.LIGHT,
    cost: { quantity: 45, unit: 'gp' },
    armor_class: { base: 12, dex_bonus: true },
    weight: 13,
    description: 'Leather armor reinforced with metal studs.'
  },
  // Medium Armor
  {
    name: 'Hide',
    category: EquipmentCategory.ARMOR,
    armor_type: ArmorType.MEDIUM,
    cost: { quantity: 10, unit: 'gp' },
    armor_class: { base: 12, dex_bonus: true, max_bonus: 2 },
    weight: 12,
    description: 'Crude armor consisting of thick furs and pelts.'
  },
  {
    name: 'Chain Shirt',
    category: EquipmentCategory.ARMOR,
    armor_type: ArmorType.MEDIUM,
    cost: { quantity: 50, unit: 'gp' },
    armor_class: { base: 13, dex_bonus: true, max_bonus: 2 },
    weight: 20,
    description: 'Made of interlocking metal rings.'
  },
  {
    name: 'Scale Mail',
    category: EquipmentCategory.ARMOR,
    armor_type: ArmorType.MEDIUM,
    cost: { quantity: 50, unit: 'gp' },
    armor_class: { base: 14, dex_bonus: true, max_bonus: 2 },
    weight: 45,
    stealth_disadvantage: true,
    description: 'Consists of a coat and leggings covered with overlapping pieces of metal.'
  },
  {
    name: 'Breastplate',
    category: EquipmentCategory.ARMOR,
    armor_type: ArmorType.MEDIUM,
    cost: { quantity: 400, unit: 'gp' },
    armor_class: { base: 14, dex_bonus: true, max_bonus: 2 },
    weight: 20,
    description: 'Consists of a fitted metal chest piece worn with supple leather.'
  },
  {
    name: 'Half Plate',
    category: EquipmentCategory.ARMOR,
    armor_type: ArmorType.MEDIUM,
    cost: { quantity: 750, unit: 'gp' },
    armor_class: { base: 15, dex_bonus: true, max_bonus: 2 },
    weight: 40,
    stealth_disadvantage: true,
    description: 'Consists of shaped metal plates that cover most of the wearer\'s body.'
  },
  // Heavy Armor
  {
    name: 'Ring Mail',
    category: EquipmentCategory.ARMOR,
    armor_type: ArmorType.HEAVY,
    cost: { quantity: 30, unit: 'gp' },
    armor_class: { base: 14, dex_bonus: false },
    weight: 40,
    stealth_disadvantage: true,
    description: 'Leather armor with heavy rings sewn into it.'
  },
  {
    name: 'Chain Mail',
    category: EquipmentCategory.ARMOR,
    armor_type: ArmorType.HEAVY,
    cost: { quantity: 75, unit: 'gp' },
    armor_class: { base: 16, dex_bonus: false },
    weight: 55,
    stealth_disadvantage: true,
    strength_requirement: 13,
    description: 'Made of interlocking metal rings.'
  },
  {
    name: 'Splint',
    category: EquipmentCategory.ARMOR,
    armor_type: ArmorType.HEAVY,
    cost: { quantity: 200, unit: 'gp' },
    armor_class: { base: 17, dex_bonus: false },
    weight: 60,
    stealth_disadvantage: true,
    strength_requirement: 15,
    description: 'Made of narrow vertical strips of metal riveted to a backing of leather.'
  },
  {
    name: 'Plate',
    category: EquipmentCategory.ARMOR,
    armor_type: ArmorType.HEAVY,
    cost: { quantity: 1500, unit: 'gp' },
    armor_class: { base: 18, dex_bonus: false },
    weight: 65,
    stealth_disadvantage: true,
    strength_requirement: 15,
    description: 'Consists of shaped, interlocking metal plates to cover the entire body.'
  }
];

export const SHIELDS: Shield[] = [
  {
    name: 'Shield',
    category: EquipmentCategory.SHIELD,
    cost: { quantity: 10, unit: 'gp' },
    armor_class_bonus: 2,
    weight: 6,
    description: 'A shield is made from wood or metal and is carried in one hand.'
  }
];

export const ADVENTURING_GEAR: AdventuringGear[] = [
  {
    name: 'Backpack',
    category: EquipmentCategory.GEAR,
    cost: { quantity: 2, unit: 'gp' },
    weight: 5,
    description: 'A backpack can hold 1 cubic foot or 30 pounds of gear.'
  },
  {
    name: 'Bedroll',
    category: EquipmentCategory.GEAR,
    cost: { quantity: 2, unit: 'sp' },
    weight: 7,
    description: 'A bedroll consists of bedding and a blanket.'
  },
  {
    name: 'Blanket',
    category: EquipmentCategory.GEAR,
    cost: { quantity: 5, unit: 'sp' },
    weight: 3,
    description: 'A thick blanket for warmth.'
  },
  {
    name: 'Rope (50 feet)',
    category: EquipmentCategory.GEAR,
    cost: { quantity: 2, unit: 'gp' },
    weight: 10,
    description: 'Hemp rope has 2 hit points and can be burst with a DC 17 Strength check.'
  },
  {
    name: 'Torch',
    category: EquipmentCategory.GEAR,
    cost: { quantity: 1, unit: 'cp' },
    weight: 1,
    description: 'A torch burns for 1 hour, providing bright light in a 20-foot radius.'
  },
  {
    name: 'Rations (1 day)',
    category: EquipmentCategory.GEAR,
    cost: { quantity: 2, unit: 'sp' },
    weight: 2,
    description: 'Dry foods suitable for extended travel.'
  },
  {
    name: 'Waterskin',
    category: EquipmentCategory.GEAR,
    cost: { quantity: 2, unit: 'gp' },
    weight: 5,
    description: 'A waterskin can hold 4 pints of liquid.'
  }
];

// Starting equipment by class
export const CLASS_STARTING_EQUIPMENT: Record<string, StartingEquipment> = {
  Fighter: {
    equipment: [],
    equipment_choices: [
      {
        choose: 1,
        from: [
          ...ARMOR.filter(a => a.armor_type === ArmorType.HEAVY),
          ...ARMOR.filter(a => a.name === 'Leather'),
          ...ADVENTURING_GEAR.filter(g => g.name === 'Longbow')
        ],
        type: 'equipment'
      }
    ]
  },
  Wizard: {
    equipment: [
      WEAPONS.find(w => w.name === 'Quarterstaff')!,
      ADVENTURING_GEAR.find(g => g.name === 'Backpack')!
    ],
    equipment_choices: [
      {
        choose: 1,
        from: WEAPONS.filter(w => w.name === 'Dagger'),
        type: 'equipment'
      }
    ]
  },
  Rogue: {
    equipment: [
      ARMOR.find(a => a.name === 'Leather')!,
      WEAPONS.find(w => w.name === 'Dagger')!,
      WEAPONS.find(w => w.name === 'Dagger')!
    ],
    equipment_choices: [
      {
        choose: 1,
        from: [
          WEAPONS.find(w => w.name === 'Rapier')!,
          WEAPONS.find(w => w.name === 'Shortsword')!
        ],
        type: 'equipment'
      }
    ]
  }
};

class EquipmentManagementService {
  private equipmentCache: Equipment[] | null = null;
  private readonly API_BASE = 'http://localhost:12345/api/compendium';

  /**
   * Fetch equipment from compendium API
   */
  private async fetchEquipmentFromAPI(): Promise<Equipment[]> {
    try {
      const response = await fetch(`${this.API_BASE}/equipment`);
      if (!response.ok) {
        throw new Error(`Failed to fetch equipment: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Transform compendium equipment format to our Equipment type
      const items = data.equipment?.items || [];
      
      return items.map((item: any) => {
        // Calculate cost in gold pieces
        const costInGold = (
          (item.cost?.copper || 0) * 0.01 +
          (item.cost?.silver || 0) * 0.1 +
          (item.cost?.electrum || 0) * 0.5 +
          (item.cost?.gold || 0) +
          (item.cost?.platinum || 0) * 10
        );
        
        // Determine category from item data
        let category: EquipmentCategoryType = EquipmentCategory.GEAR;
        
        // Check for weapon properties
        if (item.damage_roll || item.weapon_category || item.weapon_properties ||
            item.name.toLowerCase().includes('sword') || 
            item.name.toLowerCase().includes('axe') || 
            item.name.toLowerCase().includes('bow') ||
            item.name.toLowerCase().includes('crossbow') ||
            item.name.toLowerCase().includes('mace') || 
            item.name.toLowerCase().includes('dagger') ||
            item.name.toLowerCase().includes('spear') ||
            item.name.toLowerCase().includes('hammer')) {
          category = EquipmentCategory.WEAPON;
        } 
        // Check for armor
        else if (item.armor_category || item.ac_bonus !== undefined ||
                 item.name.toLowerCase().includes('armor') || 
                 item.name.toLowerCase().includes('mail') || 
                 item.name.toLowerCase().includes('plate') ||
                 item.name.toLowerCase().includes('leather') ||
                 item.name.toLowerCase().includes('breastplate')) {
          category = EquipmentCategory.ARMOR;
        } 
        // Check for shield
        else if (item.name.toLowerCase().includes('shield')) {
          category = EquipmentCategory.SHIELD;
        }
        // Check for tools
        else if (item.name.toLowerCase().includes('tools') ||
                 item.name.toLowerCase().includes('kit') && !item.name.toLowerCase().includes('first aid')) {
          category = EquipmentCategory.TOOL;
        }
        
        return {
          name: item.name,
          category,
          cost: {
            quantity: Math.round(costInGold * 100) / 100, // Round to 2 decimal places
            unit: 'gp'
          },
          weight: item.weight || 0,
          description: item.description || '',
          properties: item.properties || {}
        } as Equipment;
      });
    } catch (error) {
      console.error('Failed to fetch equipment from API:', error);
      // For production, throw error instead of falling back to hardcoded data
      // This ensures proper error handling and prevents stale data usage
      throw new Error('Equipment data not available. Please check your connection and try again.');
    }
  }

  /**
   * Get all equipment by category
   */
  async getEquipmentByCategory(category: EquipmentCategoryType): Promise<Equipment[]> {
    const allEquipment = await this.getAllEquipment();
    return allEquipment.filter(item => item.category === category);
  }

  /**
   * Get all equipment
   */
  async getAllEquipment(): Promise<Equipment[]> {
    if (this.equipmentCache) {
      return this.equipmentCache;
    }
    
    this.equipmentCache = await this.fetchEquipmentFromAPI();
    console.log(`✅ Loaded ${this.equipmentCache.length} equipment items from compendium`);
    return this.equipmentCache;
  }

  /**
   * Get starting equipment for a class
   */
  getStartingEquipment(characterClass: string): StartingEquipment {
    return CLASS_STARTING_EQUIPMENT[characterClass] || {
      equipment: [],
      equipment_choices: []
    };
  }

  /**
   * Calculate carrying capacity based on strength
   */
  getCarryingCapacity(strength: number): {
    max_weight: number;
    encumbered_at: number;
    heavily_encumbered_at: number;
  } {
    const baseCapacity = strength * 15;
    return {
      max_weight: baseCapacity * 2,
      encumbered_at: baseCapacity,
      heavily_encumbered_at: baseCapacity * 1.5
    };
  }

  /**
   * Calculate total weight of inventory
   */
  calculateTotalWeight(items: InventoryItem[]): number {
    return items.reduce((total, item) => {
      return total + (item.equipment.weight * item.quantity);
    }, 0);
  }

  /**
   * Convert currency to gold pieces for calculations
   */
  convertToGold(currency: { cp: number; sp: number; ep: number; gp: number; pp: number }): number {
    return (
      currency.cp * 0.01 +
      currency.sp * 0.1 +
      currency.ep * 0.5 +
      currency.gp * 1 +
      currency.pp * 10
    );
  }

  /**
   * Check if character can afford an item
   */
  canAfford(itemCost: { quantity: number; unit: string }, currency: CharacterInventory['currency']): boolean {
    const totalGold = this.convertToGold(currency);
    const itemCostInGold = this.convertCostToGold(itemCost);
    return totalGold >= itemCostInGold;
  }

  /**
   * Convert item cost to gold pieces
   */
  convertCostToGold(cost: { quantity: number; unit: string }): number {
    const multipliers = {
      cp: 0.01,
      sp: 0.1,
      ep: 0.5,
      gp: 1,
      pp: 10
    };
    return cost.quantity * (multipliers[cost.unit as keyof typeof multipliers] || 1);
  }

  /**
   * Get equipment proficiencies for a class
   */
  getClassProficiencies(characterClass: string): {
    armor: string[];
    weapons: string[];
    tools: string[];
  } {
    const proficiencies = {
      Fighter: {
        armor: ['Light armor', 'Medium armor', 'Heavy armor', 'Shields'],
        weapons: ['Simple weapons', 'Martial weapons'],
        tools: []
      },
      Wizard: {
        armor: [],
        weapons: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light crossbows'],
        tools: []
      },
      Rogue: {
        armor: ['Light armor'],
        weapons: ['Simple weapons', 'Hand crossbows', 'Longswords', 'Rapiers', 'Shortswords'],
        tools: ['Thieves\' tools']
      },
      Cleric: {
        armor: ['Light armor', 'Medium armor', 'Shields'],
        weapons: ['Simple weapons'],
        tools: []
      },
      Ranger: {
        armor: ['Light armor', 'Medium armor', 'Shields'],
        weapons: ['Simple weapons', 'Martial weapons'],
        tools: []
      }
    };

    return proficiencies[characterClass as keyof typeof proficiencies] || {
      armor: [],
      weapons: [],
      tools: []
    };
  }
}

export const equipmentManagementService = new EquipmentManagementService();
export default equipmentManagementService;