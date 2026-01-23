from dataclasses import dataclass, field
# --- 5e.tools ENHANCED FIELDS ---
@dataclass
class MagicItemEffect:
    """Magic item effect/property"""
    name: str
    description: str
    requires_attunement: bool = False


#!/usr/bin/env python3
"""
D&D 5e Equipment System
Core classes for managing equipment, weapons, armor, and magic items
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Any, Union


class ItemType(Enum):
    """Types of equipment items"""
    WEAPON = "weapon"
    ARMOR = "armor"
    SHIELD = "shield"
    TOOL = "tool"
    GEAR = "gear"
    TREASURE = "treasure"
    MAGIC_ITEM = "magic_item"
    CONSUMABLE = "consumable"
    CONTAINER = "container"
    MOUNT = "mount"
    VEHICLE = "vehicle"
    TRADE_GOOD = "trade_good"
    CURRENCY = "currency"
    POTION = "potion"
    SCROLL = "scroll"
    RING = "ring"
    ROD = "rod"
    STAFF = "staff"
    WAND = "wand"
    WONDROUS = "wondrous"


class WeaponCategory(Enum):
    """Weapon categories"""
    SIMPLE_MELEE = "simple_melee"
    SIMPLE_RANGED = "simple_ranged"
    MARTIAL_MELEE = "martial_melee"
    MARTIAL_RANGED = "martial_ranged"
    EXOTIC = "exotic"


class WeaponProperty(Enum):
    """Weapon properties"""
    AMMUNITION = "ammunition"
    FINESSE = "finesse"
    HEAVY = "heavy"
    LIGHT = "light"
    LOADING = "loading"
    RANGE = "range"
    REACH = "reach"
    SPECIAL = "special"
    THROWN = "thrown"
    TWO_HANDED = "two_handed"
    VERSATILE = "versatile"


class DamageType(Enum):
    """Damage types"""
    ACID = "acid"
    BLUDGEONING = "bludgeoning"
    COLD = "cold"
    FIRE = "fire"
    FORCE = "force"
    LIGHTNING = "lightning"
    NECROTIC = "necrotic"
    PIERCING = "piercing"
    POISON = "poison"
    PSYCHIC = "psychic"
    RADIANT = "radiant"
    SLASHING = "slashing"
    THUNDER = "thunder"

@dataclass
class WeaponDamage:
    """Weapon damage information"""
    dice: str  # "1d8"
    damage_type: DamageType
    versatile_dice: Optional[str] = None  # "1d10" for versatile weapons



class ArmorType(Enum):
    """Armor types"""
    LIGHT = "light"
    MEDIUM = "medium"
    HEAVY = "heavy"
    NATURAL = "natural"
    SHIELD = "shield"


class MagicItemRarity(Enum):
    """Magic item rarity"""
    COMMON = "common"
    UNCOMMON = "uncommon"
    RARE = "rare"
    VERY_RARE = "very_rare"
    LEGENDARY = "legendary"
    ARTIFACT = "artifact"


class Currency(Enum):
    """Currency types"""
    COPPER = "cp"
    SILVER = "sp"
    ELECTRUM = "ep"
    GOLD = "gp"
    PLATINUM = "pp"


@dataclass
class Money:
    """Represents currency amounts"""
    copper: int = 0
    silver: int = 0
    electrum: int = 0
    gold: int = 0
    platinum: int = 0

    def to_copper(self) -> int:
        """Convert all currency to copper pieces"""
        return (self.copper + 
                self.silver * 10 + 
                self.electrum * 50 + 
                self.gold * 100 + 
                self.platinum * 1000)

    def to_gold(self) -> float:
        """Convert all currency to gold pieces"""
        return self.to_copper() / 100.0

    @classmethod
    def from_gold(cls, gold_amount: float) -> 'Money':
        """Create Money from gold amount"""
        total_copper = int(gold_amount * 100)
        return cls(gold=total_copper // 100, copper=total_copper % 100)


@dataclass
class DamageRoll:
    """Represents a damage roll for weapons"""
    dice_count: int
    dice_type: int  # e.g., 6 for d6
    damage_type: DamageType
    modifier: int = 0
    versatile_dice_count: Optional[int] = None
    versatile_dice_type: Optional[int] = None

    def __str__(self) -> str:
        base = f"{self.dice_count}d{self.dice_type}"
        if self.modifier != 0:
            base += f"{'+' if self.modifier > 0 else ''}{self.modifier}"
        base += f" {self.damage_type.value}"
        
        if self.versatile_dice_count:
            base += f" (versatile: {self.versatile_dice_count}d{self.versatile_dice_type})"
        
        return base


@dataclass
class ItemProperty:
    """Represents a special property of an item"""
    name: str
    description: str
    value: Optional[str] = None


@dataclass
class BaseItem:
    """Base class for all equipment items"""
    name: str
    description: str = ""
    item_type: ItemType = ItemType.GEAR
    weight: float = 0.0
    cost: Money = field(default_factory=Money)
    rarity: MagicItemRarity = MagicItemRarity.COMMON
    properties: List[ItemProperty] = field(default_factory=list)
    source: str = "Unknown"
    page: Optional[int] = None
    requires_attunement: bool = False
    attunement_description: str = ""
    tags: List[str] = field(default_factory=list)

    def add_property(self, name: str, description: str, value: Optional[str] = None):
        """Add a property to the item"""
        self.properties.append(ItemProperty(name, description, value))

    def get_property(self, name: str) -> Optional[ItemProperty]:
        """Get a property by name"""
        for prop in self.properties:
            if prop.name.lower() == name.lower():
                return prop
        return None

    def has_property(self, name: str) -> bool:
        """Check if item has a specific property"""
        return self.get_property(name) is not None


@dataclass
class Weapon(BaseItem):
    """Weapon item"""

    weapon_category: WeaponCategory = WeaponCategory.SIMPLE_MELEE
    damage_roll: Optional[DamageRoll] = None
    weapon_properties: List[WeaponProperty] = field(default_factory=list)
    range_normal: Optional[int] = None  # Normal range in feet
    range_long: Optional[int] = None    # Long range in feet
    ammunition_type: Optional[str] = None
    is_magical: bool = False
    enhancement_bonus: int = 0

    # --- 5e.tools enhanced fields ---
    is_magic: bool = False
    rarity: Optional[MagicItemRarity] = None
    requires_attunement: bool = False
    bonus: int = 0  # +1, +2, +3
    additional_damage: Optional[WeaponDamage] = None  # Flametongue: +2d6 fire
    special_properties: List[MagicItemEffect] = field(default_factory=list)
    base_item: Optional[str] = None  # "Longsword" for variants
    variant_of: Optional[str] = None  # For magic items

    def __post_init__(self):
        self.item_type = ItemType.WEAPON

    def has_weapon_property(self, prop: WeaponProperty) -> bool:
        """Check if weapon has a specific property"""
        return prop in self.weapon_properties

    def is_ranged(self) -> bool:
        """Check if weapon is ranged"""
        return self.weapon_category in [WeaponCategory.SIMPLE_RANGED, WeaponCategory.MARTIAL_RANGED]

    def is_melee(self) -> bool:
        """Check if weapon is melee"""
        return self.weapon_category in [WeaponCategory.SIMPLE_MELEE, WeaponCategory.MARTIAL_MELEE]

    def get_range_str(self) -> str:
        """Get range as string"""
        if self.range_normal and self.range_long:
            return f"{self.range_normal}/{self.range_long} ft."
        elif self.range_normal:
            return f"{self.range_normal} ft."
        return "Melee"


@dataclass
class Armor(BaseItem):
    """Armor item"""
    armor_type: ArmorType = ArmorType.LIGHT
    armor_class: int = 10
    max_dex_bonus: Optional[int] = None
    min_strength: int = 0
    stealth_disadvantage: bool = False
    is_magical: bool = False
    enhancement_bonus: int = 0

    def __post_init__(self):
        self.item_type = ItemType.ARMOR

    def get_ac_formula(self) -> str:
        """Get armor class calculation formula"""
        base = str(self.armor_class + self.enhancement_bonus)
        
        if self.max_dex_bonus is None:
            return f"{base} + Dex modifier"
        elif self.max_dex_bonus == 0:
            return base
        else:
            return f"{base} + Dex modifier (max {self.max_dex_bonus})"


@dataclass
class Shield(BaseItem):
    """Shield item"""
    armor_class_bonus: int = 2
    is_magical: bool = False
    enhancement_bonus: int = 0

    def __post_init__(self):
        self.item_type = ItemType.SHIELD

    def get_ac_bonus(self) -> int:
        """Get total AC bonus including enhancements"""
        return self.armor_class_bonus + self.enhancement_bonus


@dataclass
class Tool(BaseItem):
    """Tool item (artisan's tools, thieves' tools, etc.)"""
    tool_type: str = "misc"
    proficiency_bonus_applies: bool = True

    def __post_init__(self):
        self.item_type = ItemType.TOOL


@dataclass
class MagicItem(BaseItem):
    """Magic item with special abilities"""
    charges: Optional[int] = None
    max_charges: Optional[int] = None
    charge_recovery: str = ""
    spell_abilities: List[str] = field(default_factory=list)
    command_word: Optional[str] = None
    activation_time: str = "1 action"
    
    def __post_init__(self):
        self.item_type = ItemType.MAGIC_ITEM
        if self.rarity == MagicItemRarity.COMMON:
            self.rarity = MagicItemRarity.UNCOMMON  # Magic items are at least uncommon

    def has_charges(self) -> bool:
        """Check if item uses charges"""
        return self.charges is not None and self.max_charges is not None

    def use_charge(self) -> bool:
        """Use one charge, return True if successful"""
        if self.has_charges() and self.charges > 0:
            self.charges -= 1
            return True
        return False

    def recharge(self, amount: int = None):
        """Recharge the item"""
        if self.has_charges():
            if amount is None:
                self.charges = self.max_charges
            else:
                self.charges = min(self.max_charges, self.charges + amount)


@dataclass
class Consumable(BaseItem):
    """Consumable item (potions, scrolls, etc.)"""
    uses: int = 1
    spell_effect: Optional[str] = None
    spell_level: Optional[int] = None
    spell_save_dc: Optional[int] = None

    def __post_init__(self):
        self.item_type = ItemType.CONSUMABLE

    def is_depleted(self) -> bool:
        """Check if consumable is used up"""
        return self.uses <= 0

    def use(self) -> bool:
        """Use the consumable, return True if successful"""
        if self.uses > 0:
            self.uses -= 1
            return True
        return False


@dataclass
class Container(BaseItem):
    """Container item (bags, chests, etc.)"""
    capacity_weight: float = 0.0  # Weight capacity in pounds
    capacity_volume: float = 0.0  # Volume capacity in cubic feet
    contents: List[BaseItem] = field(default_factory=list)

    def __post_init__(self):
        self.item_type = ItemType.CONTAINER

    def add_item(self, item: BaseItem) -> bool:
        """Add item to container if there's space"""
        current_weight = sum(item.weight for item in self.contents)
        if current_weight + item.weight <= self.capacity_weight:
            self.contents.append(item)
            return True
        return False

    def remove_item(self, item: BaseItem) -> bool:
        """Remove item from container"""
        if item in self.contents:
            self.contents.remove(item)
            return True
        return False

    def get_total_weight(self) -> float:
        """Get total weight of container and contents"""
        return self.weight + sum(item.weight for item in self.contents)


# Equipment management classes
@dataclass
class Equipment:
    """Complete equipment set for a character"""
    weapons: List[Weapon] = field(default_factory=list)
    armor: Optional[Armor] = None
    shield: Optional[Shield] = None
    tools: List[Tool] = field(default_factory=list)
    gear: List[BaseItem] = field(default_factory=list)
    magic_items: List[MagicItem] = field(default_factory=list)
    consumables: List[Consumable] = field(default_factory=list)
    containers: List[Container] = field(default_factory=list)
    money: Money = field(default_factory=Money)

    def get_all_items(self) -> List[BaseItem]:
        """Get all items as a flat list"""
        items = []
        items.extend(self.weapons)
        if self.armor:
            items.append(self.armor)
        if self.shield:
            items.append(self.shield)
        items.extend(self.tools)
        items.extend(self.gear)
        items.extend(self.magic_items)
        items.extend(self.consumables)
        items.extend(self.containers)
        return items

    def get_total_weight(self) -> float:
        """Calculate total equipment weight"""
        return sum(item.weight for item in self.get_all_items())

    def get_armor_class(self, dex_modifier: int = 0) -> int:
        """Calculate total armor class"""
        base_ac = 10
        
        if self.armor:
            base_ac = self.armor.armor_class + self.armor.enhancement_bonus
            if self.armor.max_dex_bonus is None:
                base_ac += dex_modifier
            else:
                base_ac += min(dex_modifier, self.armor.max_dex_bonus)
        else:
            base_ac += dex_modifier
        
        if self.shield:
            base_ac += self.shield.get_ac_bonus()
        
        return base_ac

    def add_item(self, item: BaseItem):
        """Add an item to the appropriate equipment list"""
        if isinstance(item, Weapon):
            self.weapons.append(item)
        elif isinstance(item, Armor):
            self.armor = item
        elif isinstance(item, Shield):
            self.shield = item
        elif isinstance(item, Tool):
            self.tools.append(item)
        elif isinstance(item, MagicItem):
            self.magic_items.append(item)
        elif isinstance(item, Consumable):
            self.consumables.append(item)
        elif isinstance(item, Container):
            self.containers.append(item)
        else:
            self.gear.append(item)

    def remove_item(self, item: BaseItem) -> bool:
        """Remove an item from equipment"""
        if isinstance(item, Weapon) and item in self.weapons:
            self.weapons.remove(item)
            return True
        elif isinstance(item, Armor) and self.armor == item:
            self.armor = None
            return True
        elif isinstance(item, Shield) and self.shield == item:
            self.shield = None
            return True
        elif isinstance(item, Tool) and item in self.tools:
            self.tools.remove(item)
            return True
        elif isinstance(item, MagicItem) and item in self.magic_items:
            self.magic_items.remove(item)
            return True
        elif isinstance(item, Consumable) and item in self.consumables:
            self.consumables.remove(item)
            return True
        elif isinstance(item, Container) and item in self.containers:
            self.containers.remove(item)
            return True
        elif item in self.gear:
            self.gear.remove(item)
            return True
        return False

    def find_item(self, name: str) -> Optional[BaseItem]:
        """Find an item by name"""
        for item in self.get_all_items():
            if item.name.lower() == name.lower():
                return item
        return None
