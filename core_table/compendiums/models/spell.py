"""
Enhanced D&D 5e Spell model
"""

from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from enum import Enum


class SpellSchool(Enum):
    """D&D 5e spell schools"""
    ABJURATION = "A"
    CONJURATION = "C"
    DIVINATION = "D"
    ENCHANTMENT = "E"
    EVOCATION = "V"
    ILLUSION = "I"
    NECROMANCY = "N"
    TRANSMUTATION = "T"
    
    @property
    def full_name(self) -> str:
        """Get full school name"""
        names = {
            "A": "Abjuration", "C": "Conjuration", "D": "Divination",
            "E": "Enchantment", "V": "Evocation", "I": "Illusion",
            "N": "Necromancy", "T": "Transmutation"
        }
        return names.get(self.value, self.value)


@dataclass
class SpellComponent:
    """Spell components (V, S, M)"""
    verbal: bool = False
    somatic: bool = False
    material: bool = False
    material_description: str = ""
    material_cost: Optional[int] = None
    material_consumed: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'v': self.verbal,
            's': self.somatic,
            'm': self.material,
            'm_desc': self.material_description,
            'm_cost': self.material_cost,
            'm_consumed': self.material_consumed
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SpellComponent':
        return cls(
            verbal=data.get('v', False),
            somatic=data.get('s', False),
            material=data.get('m', False),
            material_description=data.get('m_desc', ''),
            material_cost=data.get('m_cost'),
            material_consumed=data.get('m_consumed', False)
        )


@dataclass
class SpellClassInfo:
    """Spell-class relationship"""
    class_name: str
    class_source: str = "PHB"
    subclass_name: Optional[str] = None
    subclass_source: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'class': self.class_name,
            'source': self.class_source,
            'subclass': self.subclass_name,
            'subclass_source': self.subclass_source
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SpellClassInfo':
        return cls(
            class_name=data.get('class', ''),
            class_source=data.get('source', 'PHB'),
            subclass_name=data.get('subclass'),
            subclass_source=data.get('subclass_source')
        )


@dataclass
class HigherLevelInfo:
    """Upcasting information"""
    description: str
    damage_increase: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'desc': self.description,
            'dmg_inc': self.damage_increase
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'HigherLevelInfo':
        return cls(
            description=data.get('desc', ''),
            damage_increase=data.get('dmg_inc')
        )


@dataclass
class ScalingDamage:
    """Damage scaling by level"""
    base_level: int
    damage_dice: str
    scaling: Dict[int, str] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'base': self.base_level,
            'dice': self.damage_dice,
            'scale': self.scaling
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ScalingDamage':
        return cls(
            base_level=data.get('base', 1),
            damage_dice=data.get('dice', ''),
            scaling=data.get('scale', {})
        )


class Spell:
    """Enhanced D&D 5e Spell"""
    
    def __init__(self):
        # Core spell data
        self.name: str = ""
        self.level: int = 0
        self.school: SpellSchool = SpellSchool.EVOCATION
        self.source: str = "PHB"
        self.page: Optional[int] = None
        
        # Casting mechanics
        self.casting_time: str = "1 action"
        self.range_type: str = "point"
        self.range_distance: int = 0
        self.range_unit: str = "feet"
        self.duration_type: str = "instant"
        self.duration_amount: Optional[int] = None
        self.duration_unit: Optional[str] = None
        
        # Properties
        self.ritual: bool = False
        self.concentration: bool = False
        self.components: SpellComponent = SpellComponent()
        
        # Description
        self.entries: List[str] = []
        self.higher_level: Optional[HigherLevelInfo] = None
        
        # Classes
        self.classes: List[SpellClassInfo] = []
        
        # Effects
        self.damage_types: List[str] = []
        self.saving_throws: List[str] = []
        self.attack_type: Optional[str] = None
        self.area_tags: List[str] = []
        self.misc_tags: List[str] = []
        
        # Scaling
        self.scaling_damage: Optional[ScalingDamage] = None
        
        # Metadata
        self.srd: bool = False
        self.basic_rules: bool = False
    
    def can_be_cast_by(self, class_name: str, subclass_name: Optional[str] = None) -> bool:
        """Check if class/subclass can cast this spell"""
        for cls in self.classes:
            if cls.class_name.lower() == class_name.lower():
                if subclass_name is None or cls.subclass_name is None:
                    return True
                if cls.subclass_name.lower() == subclass_name.lower():
                    return True
        return False
    
    def get_upcast_damage(self, slot_level: int) -> Optional[str]:
        """Calculate damage at higher spell slot level"""
        if not self.scaling_damage or slot_level <= self.level:
            return None
        return self.scaling_damage.scaling.get(slot_level)
    
    def get_description(self) -> str:
        """Get full spell description"""
        if not self.entries:
            return ""
        return "\n\n".join([e for e in self.entries if isinstance(e, str)])
    
    def has_component(self, component: str) -> bool:
        """Check for specific component (V, S, M)"""
        c = component.upper()
        if c == 'V':
            return self.components.verbal
        elif c == 'S':
            return self.components.somatic
        elif c == 'M':
            return self.components.material
        return False
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize for WebSocket transmission"""
        return {
            'name': self.name,
            'level': self.level,
            'school': self.school.value,
            'source': self.source,
            'page': self.page,
            'casting_time': self.casting_time,
            'range': {
                'type': self.range_type,
                'distance': self.range_distance,
                'unit': self.range_unit
            },
            'duration': {
                'type': self.duration_type,
                'amount': self.duration_amount,
                'unit': self.duration_unit
            },
            'ritual': self.ritual,
            'concentration': self.concentration,
            'components': self.components.to_dict(),
            'entries': self.entries,
            'higher_level': self.higher_level.to_dict() if self.higher_level else None,
            'classes': [c.to_dict() for c in self.classes],
            'damage_types': self.damage_types,
            'saving_throws': self.saving_throws,
            'attack_type': self.attack_type,
            'area_tags': self.area_tags,
            'misc_tags': self.misc_tags,
            'scaling': self.scaling_damage.to_dict() if self.scaling_damage else None,
            'srd': self.srd,
            'basic_rules': self.basic_rules
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Spell':
        """Deserialize from WebSocket message"""
        spell = cls()
        spell.name = data.get('name', '')
        spell.level = data.get('level', 0)
        spell.school = SpellSchool(data.get('school', 'V'))
        spell.source = data.get('source', 'PHB')
        spell.page = data.get('page')
        spell.casting_time = data.get('casting_time', '1 action')
        
        # Range
        range_data = data.get('range', {})
        spell.range_type = range_data.get('type', 'point')
        spell.range_distance = range_data.get('distance', 0)
        spell.range_unit = range_data.get('unit', 'feet')
        
        # Duration
        duration_data = data.get('duration', {})
        spell.duration_type = duration_data.get('type', 'instant')
        spell.duration_amount = duration_data.get('amount')
        spell.duration_unit = duration_data.get('unit')
        
        spell.ritual = data.get('ritual', False)
        spell.concentration = data.get('concentration', False)
        
        # Components
        comp_data = data.get('components', {})
        spell.components = SpellComponent.from_dict(comp_data)
        
        spell.entries = data.get('entries', [])
        
        # Higher level
        if data.get('higher_level'):
            spell.higher_level = HigherLevelInfo.from_dict(data['higher_level'])
        
        # Classes
        spell.classes = [SpellClassInfo.from_dict(c) for c in data.get('classes', [])]
        
        spell.damage_types = data.get('damage_types', [])
        spell.saving_throws = data.get('saving_throws', [])
        spell.attack_type = data.get('attack_type')
        spell.area_tags = data.get('area_tags', [])
        spell.misc_tags = data.get('misc_tags', [])
        
        # Scaling
        if data.get('scaling'):
            spell.scaling_damage = ScalingDamage.from_dict(data['scaling'])
        
        spell.srd = data.get('srd', False)
        spell.basic_rules = data.get('basic_rules', False)
        
        return spell
    
    @classmethod
    def from_external_data(cls, data: Dict[str, Any]) -> 'Spell':
        """Parse external JSON format"""
        spell = cls()
        spell.name = data.get('name', '')
        spell.level = data.get('level', 0)
        spell.school = SpellSchool(data.get('school', 'V'))
        spell.source = data.get('source', 'PHB')
        spell.page = data.get('page')
        spell.srd = data.get('srd', False)
        spell.basic_rules = data.get('basicRules', False)
        
        # Casting time
        time_data = data.get('time', [{}])[0]
        number = time_data.get('number', 1)
        unit = time_data.get('unit', 'action')
        spell.casting_time = f"{number} {unit}" if number > 1 else f"1 {unit}"
        
        # Range
        range_data = data.get('range', {})
        spell.range_type = range_data.get('type', 'point')
        distance = range_data.get('distance', {})
        spell.range_distance = distance.get('amount', 0)
        spell.range_unit = distance.get('type', 'feet')
        
        # Duration
        duration_list = data.get('duration', [{}])
        dur_data = duration_list[0]
        spell.duration_type = dur_data.get('type', 'instant')
        if 'duration' in dur_data:
            spell.duration_amount = dur_data['duration'].get('amount')
            spell.duration_unit = dur_data['duration'].get('type')
        
        # Meta
        meta = data.get('meta', {})
        spell.ritual = meta.get('ritual', False)
        
        # Check concentration in duration
        spell.concentration = any(d.get('concentration') for d in duration_list)
        
        # Components
        comp_data = data.get('components', {})
        material_desc = comp_data.get('m', '') if isinstance(comp_data.get('m'), str) else ''
        spell.components = SpellComponent(
            verbal=comp_data.get('v', False),
            somatic=comp_data.get('s', False),
            material='m' in comp_data,
            material_description=material_desc
        )
        
        # Entries
        spell.entries = data.get('entries', [])
        
        # Higher level
        higher_entries = data.get('entriesHigherLevel', [])
        if higher_entries:
            hl_data = higher_entries[0]
            hl_entries = hl_data.get('entries', [])
            if hl_entries:
                spell.higher_level = HigherLevelInfo(
                    description="\n".join(hl_entries)
                )
        
        # Effects
        spell.damage_types = data.get('damageInflict', [])
        spell.saving_throws = data.get('savingThrow', [])
        spell.area_tags = data.get('areaTags', [])
        spell.misc_tags = data.get('miscTags', [])
        
        # Scaling damage
        scaling_data = data.get('scalingLevelDice')
        if scaling_data:
            scaling = scaling_data.get('scaling', {})
            spell.scaling_damage = ScalingDamage(
                base_level=min(int(k) for k in scaling.keys()) if scaling else 1,
                damage_dice=scaling.get('1', ''),
                scaling={int(k): v for k, v in scaling.items()}
            )
        
        return spell
