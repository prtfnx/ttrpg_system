"""
Equipment loader service
Handles loading, caching, and querying equipment
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Optional

models_dir = Path(__file__).parent.parent / "models"
sys.path.insert(0, str(models_dir))

from equipment import Equipment, ItemType, ItemRarity


class EquipmentService:
    """Service for managing equipment compendium data"""
    
    def __init__(self, data_dir: Optional[Path] = None):
        if data_dir is None:
            data_dir = Path(__file__).parent.parent / "exports"
        self.data_dir = Path(data_dir)
        self.equipment: Dict[str, Equipment] = {}
        self._loaded = False
    
    def load_equipment(self) -> int:
        """Load equipment from export data"""
        equip_file = self.data_dir / "equipment_5etools.json"
        if not equip_file.exists():
            raise FileNotFoundError(f"Equipment data not found: {equip_file}")
        
        with open(equip_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Parse baseitem and item arrays
        items = data.get('baseitem', []) + data.get('item', [])
        
        for item_data in items:
            item = Equipment.from_external_data(item_data)
            self.equipment[item.name.lower()] = item
        
        self._loaded = True
        return len(self.equipment)
    
    def get_equipment(self, name: str) -> Optional[Equipment]:
        """Get equipment by name"""
        if not self._loaded:
            self.load_equipment()
        return self.equipment.get(name.lower())
    
    def search_equipment(
        self,
        query: Optional[str] = None,
        item_type: Optional[ItemType] = None,
        rarity: Optional[ItemRarity] = None,
        magic_only: bool = False,
        requires_attunement: Optional[bool] = None
    ) -> List[Equipment]:
        """Search equipment with filters"""
        if not self._loaded:
            self.load_equipment()
        
        results = list(self.equipment.values())
        
        if query:
            q = query.lower()
            results = [e for e in results if q in e.name.lower()]
        
        if item_type:
            results = [e for e in results if e.type == item_type]
        
        if rarity:
            results = [e for e in results if e.rarity == rarity]
        
        if magic_only:
            results = [e for e in results if e.is_magic]
        
        if requires_attunement is not None:
            results = [e for e in results if e.requires_attunement == requires_attunement]
        
        return results
    
    def get_magic_items(self) -> List[Equipment]:
        """Get all magic items"""
        return self.search_equipment(magic_only=True)
    
    def get_by_rarity(self, rarity: ItemRarity) -> List[Equipment]:
        """Get items by rarity"""
        return self.search_equipment(rarity=rarity)
    
    def get_attunement_items(self) -> List[Equipment]:
        """Get items requiring attunement"""
        return self.search_equipment(requires_attunement=True)
    
    def to_dict_list(self, equipment: List[Equipment]) -> List[Dict]:
        """Convert equipment list to dict list for serialization"""
        return [e.to_dict() for e in equipment]
