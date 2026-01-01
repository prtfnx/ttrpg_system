"""
Enhanced D&D 5e Equipment model
"""

from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from enum import Enum


class ItemRarity(Enum):
    """Magic item rarity"""
    COMMON = "common"
    UNCOMMON = "uncommon"
    RARE = "rare"
    VERY_RARE = "very rare"
    LEGENDARY = "legendary"
    ARTIFACT = "artifact"


class ItemType(Enum):
    """Equipment type"""
    WEAPON = "weapon"
    ARMOR = "armor"
    POTION = "potion"
    SCROLL = "scroll"
    WAND = "wand"
    RING = "ring"
    ROD = "rod"
    STAFF = "staff"
    WONDROUS = "wondrous item"
    ADVENTURING_GEAR = "gear"


class WeaponProperty(Enum):
    """Weapon properties"""
    AMMUNITION = "ammunition"
    FINESSE = "finesse"
    HEAVY = "heavy"
    LIGHT = "light"
    LOADING = "loading"
    RANGE = "range"
    REACH = "reach"
    THROWN = "thrown"
    TWO_HANDED = "two-handed"
    VERSATILE = "versatile"


class ArmorType(Enum):
    """Armor categories"""
    LIGHT = "light"
    MEDIUM = "medium"
    HEAVY = "heavy"
    SHIELD = "shield"


@dataclass
class Damage:
    """Weapon damage"""
    dice: str
    damage_type: str
    versatile_dice: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'dice': self.dice,
            'type': self.damage_type,
            'versatile': self.versatile_dice
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Damage':
        return cls(
            dice=data.get('dice', '1d4'),
            damage_type=data.get('type', 'bludgeoning'),
            versatile_dice=data.get('versatile')
        )


@dataclass
class MagicProperty:
    """Magic item special property"""
    name: str
    description: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {'name': self.name, 'desc': self.description}
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'MagicProperty':
        return cls(name=data.get('name', ''), description=data.get('desc', ''))


class Equipment:
    """Enhanced D&D 5e equipment"""
    
    def __init__(self):
        self.name: str = ""
        self.type: ItemType = ItemType.ADVENTURING_GEAR
        self.source: str = "PHB"
        self.page: Optional[int] = None
        
        # Basic properties
        self.weight: float = 0.0
        self.cost: int = 0
        self.cost_unit: str = "gp"
        self.description: str = ""
        
        # Magic item properties
        self.is_magic: bool = False
        self.rarity: Optional[ItemRarity] = None
        self.requires_attunement: bool = False
        self.attunement_requirements: Optional[str] = None
        
        # Magic bonuses
        self.bonus: int = 0
        self.properties: List[MagicProperty] = []
        
        # Item variants
        self.base_item: Optional[str] = None
        self.variant_type: Optional[str] = None
        
        # Charges
        self.max_charges: Optional[int] = None
        self.regain_charges: Optional[str] = None
    
    def can_attune(self, character_class: Optional[str] = None) -> bool:
        """Check if item can be attuned"""
        if not self.requires_attunement:
            return True
        if not self.attunement_requirements:
            return True
        if character_class and character_class.lower() in self.attunement_requirements.lower():
            return True
        return False
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize for WebSocket transmission"""
        return {
            'name': self.name,
            'type': self.type.value,
            'source': self.source,
            'page': self.page,
            'weight': self.weight,
            'cost': self.cost,
            'cost_unit': self.cost_unit,
            'desc': self.description,
            'is_magic': self.is_magic,
            'rarity': self.rarity.value if self.rarity else None,
            'attunement': self.requires_attunement,
            'attune_req': self.attunement_requirements,
            'bonus': self.bonus,
            'properties': [p.to_dict() for p in self.properties],
            'base_item': self.base_item,
            'variant': self.variant_type,
            'charges': self.max_charges,
            'regain': self.regain_charges
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Equipment':
        """Deserialize from WebSocket message"""
        item = cls()
        item.name = data.get('name', '')
        item.type = ItemType(data.get('type', 'gear'))
        item.source = data.get('source', 'PHB')
        item.page = data.get('page')
        item.weight = data.get('weight', 0.0)
        item.cost = data.get('cost', 0)
        item.cost_unit = data.get('cost_unit', 'gp')
        item.description = data.get('desc', '')
        item.is_magic = data.get('is_magic', False)
        
        rarity = data.get('rarity')
        item.rarity = ItemRarity(rarity) if rarity else None
        
        item.requires_attunement = data.get('attunement', False)
        item.attunement_requirements = data.get('attune_req')
        item.bonus = data.get('bonus', 0)
        item.properties = [MagicProperty.from_dict(p) for p in data.get('properties', [])]
        item.base_item = data.get('base_item')
        item.variant_type = data.get('variant')
        item.max_charges = data.get('charges')
        item.regain_charges = data.get('regain')
        
        return item
    
    @classmethod
    def from_external_data(cls, data: Dict[str, Any]) -> 'Equipment':
        """Parse external JSON format"""
        item = cls()
        item.name = data.get('name', '')
        item.source = data.get('source', 'PHB')
        item.page = data.get('page')
        
        # Type
        item_type = data.get('type')
        if item_type:
            type_map = {
                'W': ItemType.WEAPON, 'A': ItemType.ARMOR,
                'P': ItemType.POTION, 'SC': ItemType.SCROLL,
                'WD': ItemType.WAND, 'RG': ItemType.RING,
                'RD': ItemType.ROD, 'ST': ItemType.STAFF,
                '$': ItemType.ADVENTURING_GEAR
            }
            item.type = type_map.get(item_type, ItemType.WONDROUS)
        
        # Weight and cost
        item.weight = data.get('weight', 0.0)
        value = data.get('value')
        if value:
            item.cost = value
        
        # Rarity
        rarity = data.get('rarity')
        if rarity:
            rarity_map = {
                'none': None, 'common': ItemRarity.COMMON,
                'uncommon': ItemRarity.UNCOMMON, 'rare': ItemRarity.RARE,
                'very rare': ItemRarity.VERY_RARE, 'legendary': ItemRarity.LEGENDARY,
                'artifact': ItemRarity.ARTIFACT
            }
            item.rarity = rarity_map.get(rarity.lower())
            item.is_magic = item.rarity is not None
        
        # Attunement
        attune = data.get('reqAttune')
        if attune:
            item.requires_attunement = True
            if isinstance(attune, str):
                item.attunement_requirements = attune
        
        # Bonus
        bonus = data.get('bonusWeapon') or data.get('bonusAc') or data.get('bonusSpellAttack')
        if bonus:
            item.bonus = int(bonus.replace('+', ''))
        
        # Charges
        charges = data.get('charges')
        if charges:
            item.max_charges = charges
        
        recharge = data.get('recharge')
        if recharge:
            item.regain_charges = recharge
        
        # Entries (description)
        entries = data.get('entries', [])
        if entries:
            desc_parts = []
            for entry in entries:
                if isinstance(entry, str):
                    desc_parts.append(entry)
                elif isinstance(entry, dict):
                    if 'entries' in entry:
                        desc_parts.extend(entry['entries'])
            item.description = '\n\n'.join(desc_parts)
        
        return item


class Weapon(Equipment):
    """Weapon equipment"""
    
    def __init__(self):
        super().__init__()
        self.type = ItemType.WEAPON
        self.damage: Optional[Damage] = None
        self.properties: List[WeaponProperty] = []
        self.range_normal: Optional[int] = None
        self.range_long: Optional[int] = None
        self.weapon_type: str = "simple melee"
    
    def is_ranged(self) -> bool:
        """Check if weapon is ranged"""
        return WeaponProperty.AMMUNITION in self.properties or WeaponProperty.THROWN in self.properties
    
    def is_finesse(self) -> bool:
        """Check if weapon has finesse"""
        return WeaponProperty.FINESSE in self.properties


class Armor(Equipment):
    """Armor equipment"""
    
    def __init__(self):
        super().__init__()
        self.type = ItemType.ARMOR
        self.armor_class: int = 10
        self.armor_type: ArmorType = ArmorType.LIGHT
        self.strength_requirement: int = 0
        self.stealth_disadvantage: bool = False
        self.dex_bonus_max: Optional[int] = None
    
    def get_ac(self, dex_modifier: int) -> int:
        """Calculate AC with dexterity modifier"""
        ac = self.armor_class
        if self.armor_type == ArmorType.LIGHT:
            ac += dex_modifier
        elif self.armor_type == ArmorType.MEDIUM:
            ac += min(dex_modifier, self.dex_bonus_max or 2)
        return ac + self.bonus
