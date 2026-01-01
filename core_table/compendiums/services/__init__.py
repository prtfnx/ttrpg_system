"""
Compendium services for managing game data
"""

from .spell_service import SpellService
from .class_service import ClassService
from .equipment_service import EquipmentService
from .monster_service import MonsterService

__all__ = ['SpellService', 'ClassService', 'EquipmentService', 'MonsterService']
