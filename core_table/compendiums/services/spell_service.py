"""
Spell loader service
Handles loading, caching, and querying spells
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Optional, Set

# Add models directory to path
models_dir = Path(__file__).parent.parent / "models"
sys.path.insert(0, str(models_dir))

from spell import Spell


class SpellService:
    """Service for managing spell compendium data"""
    
    def __init__(self, data_dir: Optional[Path] = None):
        if data_dir is None:
            data_dir = Path(__file__).parent.parent / "exports"
        self.data_dir = Path(data_dir)
        self.spells: Dict[str, Spell] = {}
        self.spell_by_class: Dict[str, Set[str]] = {}
        self._loaded = False
    
    def load_spells(self) -> int:
        """Load spells from export data"""
        spell_file = self.data_dir / "spells_5etools.json"
        if not spell_file.exists():
            raise FileNotFoundError(f"Spell data not found: {spell_file}")
        
        with open(spell_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        spell_list = data.get('spell', [])
        for spell_data in spell_list:
            spell = Spell.from_external_data(spell_data)
            self.spells[spell.name.lower()] = spell
        
        self._loaded = True
        return len(self.spells)
    
    def get_spell(self, name: str) -> Optional[Spell]:
        """Get spell by name"""
        if not self._loaded:
            self.load_spells()
        return self.spells.get(name.lower())
    
    def search_spells(
        self,
        query: Optional[str] = None,
        level: Optional[int] = None,
        school: Optional[str] = None,
        ritual: Optional[bool] = None,
        concentration: Optional[bool] = None,
        class_name: Optional[str] = None
    ) -> List[Spell]:
        """Search spells with filters"""
        if not self._loaded:
            self.load_spells()
        
        results = list(self.spells.values())
        
        if query:
            q = query.lower()
            results = [s for s in results if q in s.name.lower() or q in s.get_description().lower()]
        
        if level is not None:
            results = [s for s in results if s.level == level]
        
        if school:
            results = [s for s in results if s.school.value == school.upper()]
        
        if ritual is not None:
            results = [s for s in results if s.ritual == ritual]
        
        if concentration is not None:
            results = [s for s in results if s.concentration == concentration]
        
        if class_name:
            results = [s for s in results if s.can_be_cast_by(class_name)]
        
        return results
    
    def get_spells_by_level(self, level: int) -> List[Spell]:
        """Get all spells of a specific level"""
        return self.search_spells(level=level)
    
    def get_cantrips(self) -> List[Spell]:
        """Get all cantrips (level 0 spells)"""
        return self.get_spells_by_level(0)
    
    def get_ritual_spells(self) -> List[Spell]:
        """Get all ritual spells"""
        return self.search_spells(ritual=True)
    
    def to_dict_list(self, spells: List[Spell]) -> List[Dict]:
        """Convert spell list to dict list for serialization"""
        return [s.to_dict() for s in spells]
