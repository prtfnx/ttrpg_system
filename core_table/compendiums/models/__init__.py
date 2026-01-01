"""
Compendium data models for WebSocket protocol integration
"""

from .spell import Spell, SpellComponent, SpellClassInfo, HigherLevelInfo
from .character_class import CharacterClass, Subclass, ClassFeature, LevelProgression, AbilityScore
from .equipment import Equipment, Weapon, Armor, ItemType, ItemRarity
from .monster import Monster, MonsterAction, LegendaryAction, LairAction, MonsterType, Size

__all__ = [
    'Spell', 'SpellComponent', 'SpellClassInfo', 'HigherLevelInfo',
    'CharacterClass', 'Subclass', 'ClassFeature', 'LevelProgression', 'AbilityScore',
    'Equipment', 'Weapon', 'Armor', 'ItemType', 'ItemRarity',
    'Monster', 'MonsterAction', 'LegendaryAction', 'LairAction', 'MonsterType', 'Size'
]
