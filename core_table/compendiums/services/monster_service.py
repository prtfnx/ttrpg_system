"""
Monster loader service
Handles loading, caching, and querying monsters
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Optional

models_dir = Path(__file__).parent.parent / "models"
sys.path.insert(0, str(models_dir))

from monster import Monster, MonsterType, Size


class MonsterService:
    """Service for managing monster compendium data"""
    
    def __init__(self, data_dir: Optional[Path] = None):
        if data_dir is None:
            data_dir = Path(__file__).parent.parent / "exports"
        self.data_dir = Path(data_dir)
        self.monsters: Dict[str, Monster] = {}
        self._loaded = False
    
    def load_monsters(self) -> int:
        """Load monsters from export data"""
        monster_file = self.data_dir / "monsters_5etools.json"
        if not monster_file.exists():
            raise FileNotFoundError(f"Monster data not found: {monster_file}")
        
        with open(monster_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        monster_list = data.get('monster', [])
        for monster_data in monster_list:
            monster = Monster.from_external_data(monster_data)
            self.monsters[monster.name.lower()] = monster
        
        self._loaded = True
        return len(self.monsters)
    
    def get_monster(self, name: str) -> Optional[Monster]:
        """Get monster by name"""
        if not self._loaded:
            self.load_monsters()
        return self.monsters.get(name.lower())
    
    def search_monsters(
        self,
        query: Optional[str] = None,
        cr: Optional[str] = None,
        monster_type: Optional[MonsterType] = None,
        size: Optional[Size] = None,
        legendary_only: bool = False
    ) -> List[Monster]:
        """Search monsters with filters"""
        if not self._loaded:
            self.load_monsters()
        
        results = list(self.monsters.values())
        
        if query:
            q = query.lower()
            results = [m for m in results if q in m.name.lower()]
        
        if cr:
            results = [m for m in results if m.challenge_rating == cr]
        
        if monster_type:
            results = [m for m in results if m.type == monster_type]
        
        if size:
            results = [m for m in results if m.size == size]
        
        if legendary_only:
            results = [m for m in results if m.is_legendary]
        
        return results
    
    def get_by_cr(self, cr: str) -> List[Monster]:
        """Get monsters by challenge rating"""
        return self.search_monsters(cr=cr)
    
    def get_legendary_monsters(self) -> List[Monster]:
        """Get all legendary monsters"""
        return self.search_monsters(legendary_only=True)
    
    def get_by_type(self, monster_type: MonsterType) -> List[Monster]:
        """Get monsters by type"""
        return self.search_monsters(monster_type=monster_type)
    
    def to_dict_list(self, monsters: List[Monster]) -> List[Dict]:
        """Convert monster list to dict list for serialization"""
        return [m.to_dict() for m in monsters]
