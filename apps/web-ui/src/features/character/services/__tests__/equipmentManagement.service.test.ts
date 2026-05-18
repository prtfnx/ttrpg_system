import { describe, it, expect } from 'vitest';
import {
  equipmentManagementService,
  equipmentToWizardItem,
  wizardItemToInventoryItem,
  inventoryItemToWizardItem,
  EquipmentCategory,
  WeaponType,
  ArmorType,
  DamageType,
  WEAPONS,
  ARMOR,
  SHIELDS,
  ADVENTURING_GEAR,
  CLASS_STARTING_EQUIPMENT,
} from '../equipmentManagement.service';
import type { Equipment, InventoryItem } from '../equipmentManagement.service';

// Minimal Equipment stub
const sword: Equipment = {
  id: 'longsword',
  name: 'Longsword',
  category: EquipmentCategory.WEAPON,
  cost: { quantity: 15, unit: 'gp' },
  weight: 3,
  description: 'A standard longsword.',
  properties: {},
};

// Minimal InventoryItem stub
const inventoryItem: InventoryItem = {
  id: 'inv-1',
  equipment: sword,
  quantity: 2,
  equipped: false,
};

describe('equipmentToWizardItem', () => {
  it('converts equipment to WizardEquipmentItem', () => {
    const result = equipmentToWizardItem(sword, 1);
    expect(result.equipment.name).toBe('Longsword');
    expect(result.quantity).toBe(1);
    expect(result.equipped).toBeUndefined(); // not passed → not set
  });

  it('sets equipped when provided', () => {
    const result = equipmentToWizardItem(sword, 3, true);
    expect(result.equipped).toBe(true);
    expect(result.quantity).toBe(3);
  });
});

describe('wizardItemToInventoryItem + inventoryItemToWizardItem roundtrip', () => {
  it('converts WizardEquipmentItem → InventoryItem via lookup fn', () => {
    const wizard = equipmentToWizardItem(sword, 2, true);
    const inv = wizardItemToInventoryItem(wizard, (_name) => sword);
    expect(inv.quantity).toBe(2);
    expect(inv.equipment.name).toBe('Longsword');
    expect(inv.equipped).toBe(true);
  });

  it('converts InventoryItem → WizardEquipmentItem', () => {
    const wizard = inventoryItemToWizardItem(inventoryItem);
    expect(wizard.equipment.name).toBe('Longsword');
    expect(wizard.quantity).toBe(2);
  });
});

describe('EquipmentCategory constants', () => {
  it('has WEAPON, ARMOR, SHIELD, GEAR, TOOL values', () => {
    expect(EquipmentCategory.WEAPON).toBeDefined();
    expect(EquipmentCategory.ARMOR).toBeDefined();
    expect(EquipmentCategory.SHIELD).toBeDefined();
    expect(EquipmentCategory.GEAR).toBeDefined();
    expect(EquipmentCategory.TOOL).toBeDefined();
  });
});

describe('WeaponType / ArmorType / DamageType constants', () => {
  it('WeaponType has SIMPLE_MELEE and MARTIAL_MELEE', () => {
    expect(WeaponType.SIMPLE_MELEE).toBeDefined();
    expect(WeaponType.MARTIAL_MELEE).toBeDefined();
  });

  it('ArmorType has LIGHT, MEDIUM, HEAVY', () => {
    expect(ArmorType.LIGHT).toBeDefined();
    expect(ArmorType.MEDIUM).toBeDefined();
    expect(ArmorType.HEAVY).toBeDefined();
  });

  it('DamageType has SLASHING, PIERCING, BLUDGEONING', () => {
    expect(DamageType.SLASHING).toBeDefined();
    expect(DamageType.PIERCING).toBeDefined();
    expect(DamageType.BLUDGEONING).toBeDefined();
  });
});

describe('Static data arrays', () => {
  it('WEAPONS is a non-empty array', () => {
    expect(Array.isArray(WEAPONS)).toBe(true);
    expect(WEAPONS.length).toBeGreaterThan(0);
  });

  it('ARMOR is a non-empty array', () => {
    expect(Array.isArray(ARMOR)).toBe(true);
    expect(ARMOR.length).toBeGreaterThan(0);
  });

  it('SHIELDS is a non-empty array', () => {
    expect(Array.isArray(SHIELDS)).toBe(true);
    expect(SHIELDS.length).toBeGreaterThan(0);
  });

  it('ADVENTURING_GEAR is a non-empty array', () => {
    expect(Array.isArray(ADVENTURING_GEAR)).toBe(true);
    expect(ADVENTURING_GEAR.length).toBeGreaterThan(0);
  });

  it('CLASS_STARTING_EQUIPMENT has Fighter entry', () => {
    expect(CLASS_STARTING_EQUIPMENT['Fighter']).toBeDefined();
  });
});

describe('equipmentManagementService sync methods', () => {
  describe('getCarryingCapacity', () => {
    it('STR 10 → max 300 lbs', () => {
      const result = equipmentManagementService.getCarryingCapacity(10);
      expect(result.max_weight).toBe(300);
      expect(result.encumbered_at).toBe(150);
      expect(result.heavily_encumbered_at).toBe(225);
    });

    it('STR 20 → max 600 lbs', () => {
      expect(equipmentManagementService.getCarryingCapacity(20).max_weight).toBe(600);
    });
  });

  describe('calculateTotalWeight', () => {
    it('sums quantity × weight', () => {
      const items: InventoryItem[] = [
        { ...inventoryItem, quantity: 2 },
        { ...inventoryItem, id: 'inv-2', quantity: 1 },
      ];
      // sword.weight = 3, so 2*3 + 1*3 = 9
      expect(equipmentManagementService.calculateTotalWeight(items)).toBe(9);
    });

    it('empty inventory is 0', () => {
      expect(equipmentManagementService.calculateTotalWeight([])).toBe(0);
    });
  });

  describe('convertToGold', () => {
    it('converts mixed currency correctly', () => {
      const gold = equipmentManagementService.convertToGold({
        cp: 100, sp: 10, ep: 2, gp: 5, pp: 1
      });
      // 100*0.01 + 10*0.1 + 2*0.5 + 5*1 + 1*10 = 1+1+1+5+10 = 18
      expect(gold).toBeCloseTo(18);
    });
  });

  describe('convertCostToGold', () => {
    it('gp = face value', () => {
      expect(equipmentManagementService.convertCostToGold({ quantity: 15, unit: 'gp' })).toBe(15);
    });

    it('sp = 0.1 gp', () => {
      expect(equipmentManagementService.convertCostToGold({ quantity: 10, unit: 'sp' })).toBeCloseTo(1);
    });

    it('pp = 10 gp', () => {
      expect(equipmentManagementService.convertCostToGold({ quantity: 2, unit: 'pp' })).toBe(20);
    });
  });

  describe('canAfford', () => {
    const fullPurse = { cp: 0, sp: 0, ep: 0, gp: 100, pp: 0 };
    const emptyPurse = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

    it('can afford 15gp item with 100gp', () => {
      expect(equipmentManagementService.canAfford({ quantity: 15, unit: 'gp' }, fullPurse)).toBe(true);
    });

    it('cannot afford 200gp item with 100gp', () => {
      expect(equipmentManagementService.canAfford({ quantity: 200, unit: 'gp' }, fullPurse)).toBe(false);
    });

    it('empty purse cannot afford anything', () => {
      expect(equipmentManagementService.canAfford({ quantity: 1, unit: 'cp' }, emptyPurse)).toBe(false);
    });
  });

  describe('getStartingEquipment', () => {
    it('returns equipment for known class', () => {
      const eq = equipmentManagementService.getStartingEquipment('Fighter');
      expect(eq).toBeDefined();
      expect(Array.isArray(eq.equipment)).toBe(true);
    });

    it('returns empty arrays for unknown class', () => {
      const eq = equipmentManagementService.getStartingEquipment('Unknown');
      expect(eq.equipment).toEqual([]);
    });
  });

  describe('getClassProficiencies', () => {
    it('Fighter has heavy armor proficiency', () => {
      const profs = equipmentManagementService.getClassProficiencies('Fighter');
      expect(profs.armor).toContain('Heavy armor');
      expect(profs.weapons).toContain('Martial weapons');
    });

    it('Wizard has no armor', () => {
      const profs = equipmentManagementService.getClassProficiencies('Wizard');
      expect(profs.armor).toEqual([]);
    });

    it('Rogue has thieves tools', () => {
      const profs = equipmentManagementService.getClassProficiencies('Rogue');
      expect(profs.tools.some(t => t.includes('Thieves'))).toBe(true);
    });

    it('unknown class returns empty arrays', () => {
      const profs = equipmentManagementService.getClassProficiencies('Unknown');
      expect(profs.armor).toEqual([]);
      expect(profs.weapons).toEqual([]);
      expect(profs.tools).toEqual([]);
    });
  });
});
