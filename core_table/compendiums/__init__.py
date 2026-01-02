"""
D&D 5e Compendiums Package
Enhanced models from Phase 1
"""

# New enhanced models (Phase 1.2-1.5)
from .models.spell import Spell, SpellSchool, SpellComponent
from .models.monster import Monster, MonsterAction, LegendaryAction
from .models.character_class import CharacterClass, Subclass, AbilityScore
from .models.equipment import Equipment, Weapon, Armor, ItemRarity

# Services (Phase 1.6-1.7)
from .services.compendium_service import CompendiumService

__all__ = [
    'Spell', 'SpellSchool', 'SpellComponent',
    'Monster', 'MonsterAction', 'LegendaryAction',
    'CharacterClass', 'Subclass', 'AbilityScore',
    'Equipment', 'Weapon', 'Armor', 'ItemRarity',
    'CompendiumService'
]

__version__ = '2.1.0'

