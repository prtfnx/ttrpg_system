"""
Unified Compendium Service
Central service for all compendium data
"""

import sys
from pathlib import Path
from typing import List, Dict, Optional, Any, Union

# Import other services
from .spell_service import SpellService
from .class_service import ClassService
from .equipment_service import EquipmentService
from .monster_service import MonsterService

# Import models
from ..models.spell import Spell
from ..models.character_class import CharacterClass
from ..models.equipment import Equipment
from ..models.monster import Monster


class CompendiumService:
    """Unified service for all compendium data"""
    
    def __init__(self, data_dir: Optional[Path] = None):
        if data_dir is None:
            data_dir = Path(__file__).parent.parent / "exports"
        
        self.data_dir = Path(data_dir)
        self.spells = SpellService(data_dir)
        self.classes = ClassService(data_dir)
        self.equipment = EquipmentService(data_dir)
        self.monsters = MonsterService(data_dir)
        self._loaded = False
    
    def load_all(self) -> Dict[str, int]:
        """Load all compendium data"""
        counts = {
            'spells': self.spells.load_spells(),
            'classes': self.classes.load_classes(),
            'equipment': self.equipment.load_equipment(),
            'monsters': self.monsters.load_monsters()
        }
        self._loaded = True
        return counts
    
    def search(
        self,
        query: str,
        category: Optional[str] = None
    ) -> Dict[str, List[Any]]:
        """Search across all categories or specific category"""
        results = {}
        
        if not self._loaded:
            self.load_all()
        
        if category is None or category == 'spells':
            results['spells'] = self.spells.search_spells(query=query)
        
        if category is None or category == 'classes':
            results['classes'] = self.classes.search_classes(query=query)
        
        if category is None or category == 'equipment':
            results['equipment'] = self.equipment.search_equipment(query=query)
        
        if category is None or category == 'monsters':
            results['monsters'] = self.monsters.search_monsters(query=query)
        
        return results
    
    def get_spell(self, name: str) -> Optional[Spell]:
        """Get spell by name"""
        return self.spells.get_spell(name)
    
    def get_class(self, name: str) -> Optional[CharacterClass]:
        """Get class by name"""
        return self.classes.get_class(name)
    
    def get_equipment(self, name: str) -> Optional[Equipment]:
        """Get equipment by name"""
        return self.equipment.get_equipment(name)
    
    def get_monster(self, name: str) -> Optional[Monster]:
        """Get monster by name"""
        return self.monsters.get_monster(name)
    
    def get_stats(self) -> Dict[str, int]:
        """Get compendium statistics"""
        if not self._loaded:
            self.load_all()
        
        return {
            'total_spells': len(self.spells.spells),
            'total_classes': len(self.classes.classes),
            'total_equipment': len(self.equipment.equipment),
            'total_monsters': len(self.monsters.monsters),
            'cantrips': len(self.spells.get_cantrips()),
            'ritual_spells': len(self.spells.get_ritual_spells()),
            'magic_items': len(self.equipment.get_magic_items()),
            'legendary_monsters': len(self.monsters.get_legendary_monsters())
        }
    
    def get_by_level(self, level: int) -> Dict[str, List[Any]]:
        """Get content by character level"""
        if not self._loaded:
            self.load_all()
        
        return {
            'spells': self.spells.get_spells_by_level(level),
            'available_classes': self.classes.get_all_classes()
        }
    
    def get_for_character_creation(self) -> Dict[str, Any]:
        """Get all data needed for character creation"""
        if not self._loaded:
            self.load_all()
        
        return {
            'classes': [c.to_dict() for c in self.classes.get_all_classes()],
            'cantrips': [s.to_dict() for s in self.spells.get_cantrips()],
            'level_1_spells': [s.to_dict() for s in self.spells.get_spells_by_level(1)]
        }
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize compendium summary"""
        return {
            'loaded': self._loaded,
            'stats': self.get_stats() if self._loaded else {},
            'data_dir': str(self.data_dir)
        }
