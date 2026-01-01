#!/usr/bin/env python3
"""
D&D 5e Character System - Core Classes
DEPRECATED: Use models.character_class instead for enhanced models
"""

import sys
from pathlib import Path

# Redirect to new enhanced models
models_dir = Path(__file__).parent.parent / "models"
sys.path.insert(0, str(models_dir))

from character_class import CharacterClass, Subclass, ClassFeature, LevelProgression, AbilityScore

__all__ = ['CharacterClass', 'Subclass', 'ClassFeature', 'LevelProgression', 'AbilityScore']

# Keep old classes for backward compatibility
from typing import List, Dict, Optional, Union, Any
from dataclasses import dataclass
from enum import Enum
import re


class AbilityScore(Enum):
    """D&D 5e ability scores"""
    STRENGTH = "Strength"
    DEXTERITY = "Dexterity"
    CONSTITUTION = "Constitution"
    INTELLIGENCE = "Intelligence"
    WISDOM = "Wisdom"
    CHARISMA = "Charisma"


class Size(Enum):
    """Character size categories"""
    TINY = "Tiny"
    SMALL = "Small"
    MEDIUM = "Medium"
    LARGE = "Large"
    HUGE = "Huge"
    GARGANTUAN = "Gargantuan"


class Skill(Enum):
    """D&D 5e skills"""
    ACROBATICS = "Acrobatics"
    ANIMAL_HANDLING = "Animal Handling"
    ARCANA = "Arcana"
    ATHLETICS = "Athletics"
    DECEPTION = "Deception"
    HISTORY = "History"
    INSIGHT = "Insight"
    INTIMIDATION = "Intimidation"
    INVESTIGATION = "Investigation"
    MEDICINE = "Medicine"
    NATURE = "Nature"
    PERCEPTION = "Perception"
    PERFORMANCE = "Performance"
    PERSUASION = "Persuasion"
    RELIGION = "Religion"
    SLEIGHT_OF_HAND = "Sleight of Hand"
    STEALTH = "Stealth"
    SURVIVAL = "Survival"


@dataclass
class AbilityScoreIncrease:
    """Represents an ability score increase"""
    ability: AbilityScore
    increase: int


@dataclass
class RacialTrait:
    """Represents a racial trait"""
    name: str
    description: str
    source: str = ""



@dataclass
class ClassFeature:
    """Represents a class feature"""
    name: str
    description: str
    level: int
    source: str = ""

# --- 5e.tools ENHANCED FIELDS ---
@dataclass
class Subclass:
    """D&D 5e Subclass (Archetype) representation"""
    name: str
    description: str
    features: List[ClassFeature] = field(default_factory=list)
    spell_list_extension: List[str] = field(default_factory=list)  # Additional spells
    source: str = "PHB"

@dataclass
class LevelProgression:
    """Level-by-level progression data"""
    level: int
    proficiency_bonus: int
    features: List[str]  # Feature names gained at this level
    spell_slots: Optional[Dict[int, int]] = None  # {1: 2, 2: 0, ...}
    class_specific: Dict[str, Any] = field(default_factory=dict)  # Rage, Ki, etc.


@dataclass
class BackgroundFeature:
    """Represents a background feature"""
    name: str
    description: str
    feature_type: str = "feature"  # feature, trait, etc.


class Race:
    """D&D 5e Race representation"""
    
    def __init__(self):
        self.name: str = ""
        self.size: Size = Size.MEDIUM
        self.speed: int = 30
        self.ability_score_increases: List[AbilityScoreIncrease] = []
        self.spell_ability: Optional[AbilityScore] = None
        self.skill_proficiencies: List[Skill] = []
        self.traits: List[RacialTrait] = []
        self.languages: List[str] = []
        self.source: str = ""
        
        # Additional racial features
        self.darkvision: int = 0  # range in feet, 0 if none
        self.damage_resistances: List[str] = []
        self.damage_immunities: List[str] = []
        self.condition_immunities: List[str] = []
        
    def get_ability_modifier(self, ability: AbilityScore) -> int:
        """Get the racial modifier for an ability score"""
        for asi in self.ability_score_increases:
            if asi.ability == ability:
                return asi.increase
        return 0


class CharacterClass:
    """D&D 5e Character Class representation"""
    
    def __init__(self):
        self.name: str = ""
        self.hit_die: int = 8  # d8, d10, etc.
        self.primary_abilities: List[AbilityScore] = []
        self.saving_throw_proficiencies: List[AbilityScore] = []
        self.skill_proficiencies: List[Skill] = []
        self.num_skills: int = 2  # Number of skills to choose
        self.spell_ability: Optional[AbilityScore] = None
        
        # Equipment proficiencies
        self.armor_proficiencies: List[str] = []
        self.weapon_proficiencies: List[str] = []
        self.tool_proficiencies: List[str] = []
        
        # Starting equipment
        self.starting_wealth: str = "2d4x10"  # Starting gold formula
        
        # Class features by level
        self.features: Dict[int, List[ClassFeature]] = {}
        self.spell_slots: Dict[int, Dict[int, int]] = {}  # level -> spell level -> slots
        
        # Source information
        self.source: str = ""

        # --- 5e.tools enhanced fields ---
        self.subclasses: List[Subclass] = []
        self.subclass_level: int = 3  # Level when subclass is chosen
        self.progression: List[LevelProgression] = []  # Full 1-20 progression
        self.starting_equipment_options: List[Dict[str, Any]] = []
        self.multiclass_prerequisites: Dict[str, int] = {}  # {"strength": 13}
        self.spellcasting_ability: Optional[AbilityScore] = None
        self.spell_slots_by_level: Dict[int, Dict[int, int]] = {}  # {1: {1: 2}, 2: {1: 3}}
        self.source_5etools: str = "PHB"
    

    def get_features_at_level(self, level: int) -> List[ClassFeature]:
        """Get all features available at given level"""
        features = []
        for lvl in range(1, level + 1):
            if lvl in self.features:
                features.extend(self.features[lvl])
        return features

    def get_subclass_at_level(self, level: int) -> bool:
        """Check if subclass should be chosen at this level"""
        return level >= self.subclass_level


class Background:
    """D&D 5e Background representation"""
    
    def __init__(self):
        self.name: str = ""
        self.skill_proficiencies: List[Skill] = []
        self.language_proficiencies: List[str] = []
        self.tool_proficiencies: List[str] = []
        self.equipment: List[str] = []
        self.features: List[BackgroundFeature] = []
        self.suggested_characteristics: List[str] = []
        self.source: str = ""


@dataclass
class FeatPrerequisite:
    """Represents a feat prerequisite"""
    prerequisite_type: str  # "ability", "race", "class", "level", etc.
    requirement: str  # "Strength 13", "Elf", "Spellcaster", etc.


class Feat:
    """D&D 5e Feat representation"""
    
    def __init__(self):
        self.name: str = ""
        self.description: str = ""
        self.prerequisites: List[FeatPrerequisite] = []
        self.ability_score_increases: List[AbilityScoreIncrease] = []
        self.benefits: List[str] = []
        self.source: str = ""


class Character:
    """Complete D&D 5e Character representation"""
    
    def __init__(self):
        # Basic character information
        self.name: str = ""
        self.player_name: str = ""
        self.race: Optional[Race] = None
        self.character_class: Optional[CharacterClass] = None
        self.background: Optional[Background] = None
        self.level: int = 1
        
        # Ability scores (base scores before racial bonuses)
        self.ability_scores: Dict[AbilityScore, int] = {
            AbilityScore.STRENGTH: 10,
            AbilityScore.DEXTERITY: 10,
            AbilityScore.CONSTITUTION: 10,
            AbilityScore.INTELLIGENCE: 10,
            AbilityScore.WISDOM: 10,
            AbilityScore.CHARISMA: 10
        }
        
        # Skills and proficiencies
        self.skill_proficiencies: List[Skill] = []
        self.expertise: List[Skill] = []  # Skills with expertise (double proficiency)
        
        # Equipment and spells
        self.equipment: List[str] = []
        self.spells_known: List[str] = []
        self.feats: List[Feat] = []
        
        # Calculated values
        self.hit_points: int = 0
        self.max_hit_points: int = 0
        self.armor_class: int = 10
        self.proficiency_bonus: int = 2
        
        # Character details
        self.alignment: str = ""
        self.experience_points: int = 0
        self.backstory: str = ""
        
    def get_ability_modifier(self, ability: AbilityScore) -> int:
        """Calculate ability modifier including racial bonuses"""
        base_score = self.ability_scores[ability]
        racial_bonus = self.race.get_ability_modifier(ability) if self.race else 0
        total_score = base_score + racial_bonus
        return (total_score - 10) // 2
    
    def get_skill_modifier(self, skill: Skill) -> int:
        """Calculate skill modifier including proficiency"""
        # Map skills to their associated abilities
        skill_abilities = {
            Skill.ACROBATICS: AbilityScore.DEXTERITY,
            Skill.ANIMAL_HANDLING: AbilityScore.WISDOM,
            Skill.ARCANA: AbilityScore.INTELLIGENCE,
            Skill.ATHLETICS: AbilityScore.STRENGTH,
            Skill.DECEPTION: AbilityScore.CHARISMA,
            Skill.HISTORY: AbilityScore.INTELLIGENCE,
            Skill.INSIGHT: AbilityScore.WISDOM,
            Skill.INTIMIDATION: AbilityScore.CHARISMA,
            Skill.INVESTIGATION: AbilityScore.INTELLIGENCE,
            Skill.MEDICINE: AbilityScore.WISDOM,
            Skill.NATURE: AbilityScore.INTELLIGENCE,
            Skill.PERCEPTION: AbilityScore.WISDOM,
            Skill.PERFORMANCE: AbilityScore.CHARISMA,
            Skill.PERSUASION: AbilityScore.CHARISMA,
            Skill.RELIGION: AbilityScore.INTELLIGENCE,
            Skill.SLEIGHT_OF_HAND: AbilityScore.DEXTERITY,
            Skill.STEALTH: AbilityScore.DEXTERITY,
            Skill.SURVIVAL: AbilityScore.WISDOM,
        }
        
        ability = skill_abilities.get(skill, AbilityScore.INTELLIGENCE)
        modifier = self.get_ability_modifier(ability)
        
        if skill in self.skill_proficiencies:
            if skill in self.expertise:
                modifier += self.proficiency_bonus * 2
            else:
                modifier += self.proficiency_bonus
                
        return modifier
    
    def calculate_proficiency_bonus(self) -> int:
        """Calculate proficiency bonus based on level"""
        return 2 + ((self.level - 1) // 4)
    
    def update_calculated_values(self):
        """Update all calculated character values"""
        self.proficiency_bonus = self.calculate_proficiency_bonus()
        
        # Calculate hit points (simplified - would need more complex logic for real implementation)
        if self.character_class:
            constitution_modifier = self.get_ability_modifier(AbilityScore.CONSTITUTION)
            self.max_hit_points = (self.character_class.hit_die + constitution_modifier) * self.level
            if self.hit_points == 0:  # First time setting hit points
                self.hit_points = self.max_hit_points
    
    def level_up(self, hit_point_roll: Optional[int] = None):
        """Level up the character"""
        if not self.character_class:
            return False
            
        self.level += 1
        self.proficiency_bonus = self.calculate_proficiency_bonus()
        
        # Add hit points
        constitution_modifier = self.get_ability_modifier(AbilityScore.CONSTITUTION)
        if hit_point_roll is not None:
            hp_gain = hit_point_roll + constitution_modifier
        else:
            # Use average
            hp_gain = (self.character_class.hit_die // 2 + 1) + constitution_modifier
        
        # Ensure minimum 1 HP gain
        hp_gain = max(1, hp_gain)
        self.hit_points += hp_gain
        self.max_hit_points += hp_gain
        
        return True


# Utility functions for character creation
def parse_ability_increase(ability_string: str) -> List[AbilityScoreIncrease]:
    """Parse ability score increases from strings like 'Dex 2, Cha 1'"""
    increases = []
    if not ability_string:
        return increases
        
    # Map common abbreviations to full ability names
    ability_map = {
        'Str': AbilityScore.STRENGTH,
        'Dex': AbilityScore.DEXTERITY,
        'Con': AbilityScore.CONSTITUTION,
        'Int': AbilityScore.INTELLIGENCE,
        'Wis': AbilityScore.WISDOM,
        'Cha': AbilityScore.CHARISMA,
        'Strength': AbilityScore.STRENGTH,
        'Dexterity': AbilityScore.DEXTERITY,
        'Constitution': AbilityScore.CONSTITUTION,
        'Intelligence': AbilityScore.INTELLIGENCE,
        'Wisdom': AbilityScore.WISDOM,
        'Charisma': AbilityScore.CHARISMA,
    }
    
    # Parse strings like "Dex 2, Cha 1" or "Strength 1"
    parts = ability_string.split(',')
    for part in parts:
        part = part.strip()
        if not part:
            continue
            
        # Split on space to get ability and increase
        tokens = part.split()
        if len(tokens) >= 2:
            ability_name = tokens[0].strip()
            try:
                increase = int(tokens[1])
                if ability_name in ability_map:
                    increases.append(AbilityScoreIncrease(
                        ability=ability_map[ability_name],
                        increase=increase
                    ))
            except ValueError:
                continue
                
    return increases


def parse_skill_proficiencies(proficiency_string: str) -> List[Skill]:
    """Parse skill proficiencies from strings"""
    skills = []
    if not proficiency_string:
        return skills
    
    # Map skill names to enum values
    skill_map = {skill.value: skill for skill in Skill}
    
    parts = proficiency_string.split(',')
    for part in parts:
        skill_name = part.strip()
        if skill_name in skill_map:
            skills.append(skill_map[skill_name])
            
    return skills
