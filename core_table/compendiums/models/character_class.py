"""
Enhanced D&D 5e Character Class model
"""

from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from enum import Enum


class AbilityScore(Enum):
    """D&D 5e ability scores"""
    STRENGTH = "STR"
    DEXTERITY = "DEX"
    CONSTITUTION = "CON"
    INTELLIGENCE = "INT"
    WISDOM = "WIS"
    CHARISMA = "CHA"
    
    @property
    def full_name(self) -> str:
        names = {
            "STR": "Strength", "DEX": "Dexterity", "CON": "Constitution",
            "INT": "Intelligence", "WIS": "Wisdom", "CHA": "Charisma"
        }
        return names.get(self.value, self.value)


@dataclass
class ClassFeature:
    """Class feature with level requirement"""
    name: str
    description: str
    level: int
    source: str = "PHB"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'desc': self.description,
            'level': self.level,
            'source': self.source
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ClassFeature':
        return cls(
            name=data.get('name', ''),
            description=data.get('desc', ''),
            level=data.get('level', 1),
            source=data.get('source', 'PHB')
        )


@dataclass
class Subclass:
    """Character subclass (archetype)"""
    name: str
    short_name: str
    description: str
    features: List[ClassFeature] = field(default_factory=list)
    spell_list: List[str] = field(default_factory=list)
    source: str = "PHB"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'short_name': self.short_name,
            'desc': self.description,
            'features': [f.to_dict() for f in self.features],
            'spells': self.spell_list,
            'source': self.source
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Subclass':
        return cls(
            name=data.get('name', ''),
            short_name=data.get('short_name', ''),
            description=data.get('desc', ''),
            features=[ClassFeature.from_dict(f) for f in data.get('features', [])],
            spell_list=data.get('spells', []),
            source=data.get('source', 'PHB')
        )


@dataclass
class LevelProgression:
    """Level progression data"""
    level: int
    proficiency_bonus: int
    features: List[str]
    spell_slots: Optional[Dict[int, int]] = None
    class_resources: Dict[str, int] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'level': self.level,
            'prof': self.proficiency_bonus,
            'features': self.features,
            'slots': self.spell_slots,
            'resources': self.class_resources
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'LevelProgression':
        return cls(
            level=data.get('level', 1),
            proficiency_bonus=data.get('prof', 2),
            features=data.get('features', []),
            spell_slots=data.get('slots'),
            class_resources=data.get('resources', {})
        )


@dataclass
class StartingEquipment:
    """Starting equipment option"""
    default_choice: List[str]
    alternatives: List[List[str]] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'default': self.default_choice,
            'alternatives': self.alternatives
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'StartingEquipment':
        return cls(
            default_choice=data.get('default', []),
            alternatives=data.get('alternatives', [])
        )


class CharacterClass:
    """Enhanced D&D 5e character class"""
    
    def __init__(self):
        self.name: str = ""
        self.source: str = "PHB"
        self.hit_die: int = 8
        
        # Core abilities
        self.primary_abilities: List[AbilityScore] = []
        self.saving_throws: List[AbilityScore] = []
        self.spellcasting_ability: Optional[AbilityScore] = None
        
        # Proficiencies
        self.armor_proficiencies: List[str] = []
        self.weapon_proficiencies: List[str] = []
        self.tool_proficiencies: List[str] = []
        self.skill_choices: int = 2
        self.skill_options: List[str] = []
        
        # Features and progression
        self.features: List[ClassFeature] = []
        self.progression: List[LevelProgression] = []
        
        # Subclasses
        self.subclasses: List[Subclass] = []
        self.subclass_level: int = 3
        
        # Starting equipment
        self.starting_equipment: List[StartingEquipment] = []
        self.starting_gold: str = "5d4x10"
        
        # Multiclassing
        self.multiclass_requirements: Dict[str, int] = {}
        
        # Spell slots (for spellcasters)
        self.spell_slots: Dict[int, Dict[int, int]] = {}
        self.cantrips_known: Dict[int, int] = {}
        self.spells_known: Dict[int, int] = {}
        
        # Class-specific resources
        self.resource_name: Optional[str] = None
        self.resource_by_level: Dict[int, int] = {}
    
    def get_features_at_level(self, level: int) -> List[ClassFeature]:
        """Get all features up to specified level"""
        return [f for f in self.features if f.level <= level]
    
    def get_progression_at_level(self, level: int) -> Optional[LevelProgression]:
        """Get progression data for specific level"""
        for prog in self.progression:
            if prog.level == level:
                return prog
        return None
    
    def get_spell_slots_at_level(self, level: int) -> Dict[int, int]:
        """Get spell slots for character level"""
        return self.spell_slots.get(level, {})
    
    def requires_subclass_at(self, level: int) -> bool:
        """Check if subclass selection is required"""
        return level >= self.subclass_level
    
    def get_proficiency_bonus(self, level: int) -> int:
        """Calculate proficiency bonus for level"""
        return 2 + ((level - 1) // 4)
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize for WebSocket transmission"""
        return {
            'name': self.name,
            'source': self.source,
            'hit_die': self.hit_die,
            'primary_abilities': [a.value for a in self.primary_abilities],
            'saving_throws': [s.value for s in self.saving_throws],
            'spellcasting': self.spellcasting_ability.value if self.spellcasting_ability else None,
            'armor_prof': self.armor_proficiencies,
            'weapon_prof': self.weapon_proficiencies,
            'tool_prof': self.tool_proficiencies,
            'skill_choices': self.skill_choices,
            'skill_options': self.skill_options,
            'features': [f.to_dict() for f in self.features],
            'progression': [p.to_dict() for p in self.progression],
            'subclasses': [s.to_dict() for s in self.subclasses],
            'subclass_level': self.subclass_level,
            'starting_equipment': [e.to_dict() for e in self.starting_equipment],
            'starting_gold': self.starting_gold,
            'multiclass_req': self.multiclass_requirements,
            'spell_slots': self.spell_slots,
            'cantrips_known': self.cantrips_known,
            'spells_known': self.spells_known,
            'resource_name': self.resource_name,
            'resource_by_level': self.resource_by_level
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'CharacterClass':
        """Deserialize from WebSocket message"""
        char_class = cls()
        char_class.name = data.get('name', '')
        char_class.source = data.get('source', 'PHB')
        char_class.hit_die = data.get('hit_die', 8)
        
        char_class.primary_abilities = [AbilityScore(a) for a in data.get('primary_abilities', [])]
        char_class.saving_throws = [AbilityScore(s) for s in data.get('saving_throws', [])]
        
        spell_ability = data.get('spellcasting')
        char_class.spellcasting_ability = AbilityScore(spell_ability) if spell_ability else None
        
        char_class.armor_proficiencies = data.get('armor_prof', [])
        char_class.weapon_proficiencies = data.get('weapon_prof', [])
        char_class.tool_proficiencies = data.get('tool_prof', [])
        char_class.skill_choices = data.get('skill_choices', 2)
        char_class.skill_options = data.get('skill_options', [])
        
        char_class.features = [ClassFeature.from_dict(f) for f in data.get('features', [])]
        char_class.progression = [LevelProgression.from_dict(p) for p in data.get('progression', [])]
        char_class.subclasses = [Subclass.from_dict(s) for s in data.get('subclasses', [])]
        
        char_class.subclass_level = data.get('subclass_level', 3)
        char_class.starting_equipment = [StartingEquipment.from_dict(e) for e in data.get('starting_equipment', [])]
        char_class.starting_gold = data.get('starting_gold', '5d4x10')
        char_class.multiclass_requirements = data.get('multiclass_req', {})
        char_class.spell_slots = data.get('spell_slots', {})
        char_class.cantrips_known = data.get('cantrips_known', {})
        char_class.spells_known = data.get('spells_known', {})
        char_class.resource_name = data.get('resource_name')
        char_class.resource_by_level = data.get('resource_by_level', {})
        
        return char_class
    
    @classmethod
    def from_external_data(cls, data: Dict[str, Any]) -> 'CharacterClass':
        """Parse external JSON format"""
        char_class = cls()
        char_class.name = data.get('name', '')
        char_class.source = data.get('source', 'PHB')
        
        # Hit die
        hd = data.get('hd', {})
        char_class.hit_die = hd.get('faces', 8)
        
        # Primary abilities
        primary = data.get('ability', [])
        if primary:
            for ability in primary:
                for key in ability:
                    char_class.primary_abilities.append(AbilityScore(key.upper()))
        
        # Saving throws
        proficiency = data.get('proficiency', [])
        for prof in proficiency:
            for key, values in prof.items():
                if key in ['str', 'dex', 'con', 'int', 'wis', 'cha']:
                    char_class.saving_throws.append(AbilityScore(key.upper()))
        
        # Spellcasting
        spellcasting = data.get('spellcastingAbility')
        if spellcasting:
            char_class.spellcasting_ability = AbilityScore(spellcasting.upper())
        
        # Starting proficiencies
        start_prof = data.get('startingProficiencies', {})
        char_class.armor_proficiencies = start_prof.get('armor', [])
        char_class.weapon_proficiencies = start_prof.get('weapons', [])
        char_class.tool_proficiencies = start_prof.get('tools', [])
        
        # Skills
        skills = start_prof.get('skills', [])
        if skills:
            skill_data = skills[0] if isinstance(skills, list) else skills
            if isinstance(skill_data, dict):
                char_class.skill_choices = skill_data.get('choose', {}).get('count', 2)
                skill_options = skill_data.get('choose', {}).get('from', [])
                char_class.skill_options = skill_options
        
        # Class features
        class_features = data.get('classFeatures', [])
        for feature_ref in class_features:
            if isinstance(feature_ref, str):
                parts = feature_ref.split('|')
                if len(parts) >= 2:
                    feature_name = parts[0]
                    feature_level = int(parts[2]) if len(parts) > 2 else 1
                    char_class.features.append(ClassFeature(
                        name=feature_name,
                        description='',
                        level=feature_level,
                        source=char_class.source
                    ))
        
        # Subclass info
        char_class.subclass_level = data.get('subclassLevel', 3)
        
        # Multiclass requirements
        multiclass = data.get('multiclassing', {})
        req_data = multiclass.get('requirements', {})
        if req_data:
            for ability, value in req_data.items():
                char_class.multiclass_requirements[ability.lower()] = value
        
        # Spell progression
        spell_prog = data.get('casterProgression')
        if spell_prog:
            # Build spell slot table
            for level in range(1, 21):
                slots = {}
                if spell_prog == 'full':
                    slot_map = {
                        1: {1: 2}, 2: {1: 3}, 3: {1: 4, 2: 2}, 4: {1: 4, 2: 3},
                        5: {1: 4, 2: 3, 3: 2}, 6: {1: 4, 2: 3, 3: 3},
                        7: {1: 4, 2: 3, 3: 3, 4: 1}, 8: {1: 4, 2: 3, 3: 3, 4: 2},
                        9: {1: 4, 2: 3, 3: 3, 4: 3, 5: 1}, 10: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2},
                        11: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1}, 12: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1},
                        13: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1}, 14: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1},
                        15: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1}, 16: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1},
                        17: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1}, 18: {1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1},
                        19: {1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1}, 20: {1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1}
                    }
                    char_class.spell_slots[level] = slot_map.get(level, {})
        
        return char_class
