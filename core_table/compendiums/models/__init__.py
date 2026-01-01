"""
Compendium data models for WebSocket protocol integration
"""

from .spell import Spell, SpellComponent, SpellClassInfo, HigherLevelInfo
from .character_class import CharacterClass, Subclass, ClassFeature, LevelProgression, AbilityScore

__all__ = [
    'Spell', 'SpellComponent', 'SpellClassInfo', 'HigherLevelInfo',
    'CharacterClass', 'Subclass', 'ClassFeature', 'LevelProgression', 'AbilityScore'
]
