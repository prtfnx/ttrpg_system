"""
Class loader service
Handles loading, caching, and querying character classes with subclass support
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Optional, Any

models_dir = Path(__file__).parent.parent / "models"
sys.path.insert(0, str(models_dir))

from character_class import CharacterClass


class ClassService:
    """Service for managing character class compendium data"""
    
    def __init__(self, data_dir: Optional[Path] = None):
        if data_dir is None:
            data_dir = Path(__file__).parent.parent / "exports"
        self.data_dir = Path(data_dir)
        self.classes: Dict[str, CharacterClass] = {}
        self._loaded = False
    
    def load_classes(self) -> int:
        """Load classes from export data"""
        class_file = self.data_dir / "classes_5etools.json"
        if not class_file.exists():
            raise FileNotFoundError(f"Class data not found: {class_file}")
        
        with open(class_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # The classes file contains references to individual class files
        # For now, we'll create basic class objects
        for class_name in data:
            char_class = CharacterClass()
            char_class.name = class_name.capitalize()
            self.classes[class_name.lower()] = char_class
        
        self._loaded = True
        return len(self.classes)
    
    def get_class(self, name: str) -> Optional[CharacterClass]:
        """Get class by name"""
        if not self._loaded:
            self.load_classes()
        return self.classes.get(name.lower())
    
    def get_all_classes(self) -> List[CharacterClass]:
        """Get all available classes"""
        if not self._loaded:
            self.load_classes()
        return list(self.classes.values())
    
    def search_classes(self, query: Optional[str] = None) -> List[CharacterClass]:
        """Search classes"""
        if not self._loaded:
            self.load_classes()
        
        results = list(self.classes.values())
        
        if query:
            q = query.lower()
            results = [c for c in results if q in c.name.lower()]
        
        return results
    
    def get_subclasses(self, class_name: str) -> List[Dict[str, Any]]:
        """Get all subclasses for a class"""
        char_class = self.get_class(class_name)
        if not char_class or not hasattr(char_class, 'subclasses'):
            return []
        return [s.__dict__ if hasattr(s, '__dict__') else s for s in char_class.subclasses]
    
    def get_features_at_level(self, class_name: str, level: int, 
                             subclass_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get features available at specific level"""
        char_class = self.get_class(class_name)
        if not char_class:
            return []
        
        features = []
        
        # Get class features up to level
        if hasattr(char_class, 'features'):
            for feature in char_class.features:
                if hasattr(feature, 'level') and feature.level <= level:
                    features.append(feature.to_dict() if hasattr(feature, 'to_dict') else feature.__dict__)
        
        # Get subclass features if subclass specified
        if subclass_name and hasattr(char_class, 'subclasses'):
            for subclass in char_class.subclasses:
                subclass_name_match = (
                    (hasattr(subclass, 'name') and subclass.name.lower() == subclass_name.lower()) or
                    (isinstance(subclass, dict) and subclass.get('name', '').lower() == subclass_name.lower())
                )
                if subclass_name_match:
                    subclass_features = (
                        subclass.get('features', []) if isinstance(subclass, dict)
                        else getattr(subclass, 'features', [])
                    )
                    for feature in subclass_features:
                        feature_level = (
                            feature.get('level', 0) if isinstance(feature, dict)
                            else getattr(feature, 'level', 0)
                        )
                        if feature_level <= level:
                            features.append(feature if isinstance(feature, dict) else feature.__dict__)
                    break
        
        return features
    
    def get_proficiency_bonus(self, level: int) -> int:
        """Calculate proficiency bonus for level"""
        return 2 + (level - 1) // 4
    
    def to_dict_list(self, classes: List[CharacterClass]) -> List[Dict]:
        """Convert class list to dict list for serialization"""
        return [c.to_dict() for c in classes]
