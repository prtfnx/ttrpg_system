#!/usr/bin/env python3
"""
Compendium Manager for D&D 5e Virtual Tabletop System
Provides unified access to monsters, equipment, characters, and spells
"""

import time
import sys
import os
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
import json
from logger import setup_logger

logger = setup_logger(__name__)

# Import the existing compendium systems - using direct imports like test_integration
try:
    # Change directory to compendiums for relative imports to work
    import sys
    import os
    compendiums_path = os.path.join(os.path.dirname(__file__), 'core_table', 'compendiums')
    if compendiums_path not in sys.path:
        sys.path.append(compendiums_path)
    
    from monsters.bestiary_loader import BestiaryLoader
    print("BestiaryLoader imported successfully")
except ImportError as e:
    logger.warning(f"Could not import bestiary module: {e}")
    BestiaryLoader = None

try:
    from spells.spell_loader import SpellLoader
    print("SpellLoader imported successfully")
except ImportError as e:
    logger.warning(f"Could not import spell module: {e}")
    SpellLoader = None

try:
    from characters.character_loader import CharacterLoader
    print("CharacterLoader imported successfully")
except ImportError as e:
    logger.warning(f"Could not import character module: {e}")
    CharacterLoader = None

try:
    from equipment.equipment_loader_fixed_v2 import EquipmentLoader
    print("EquipmentLoader imported successfully")
except ImportError as e:
    logger.warning(f"Could not import equipment module: {e}")
    EquipmentLoader = None

logger = setup_logger(__name__)

class CompendiumManager:
    """
    Unified manager for all D&D 5e compendium data.
    Provides easy access to monsters, equipment, characters, and spells.
    """
    
    def __init__(self, compendium_path: Optional[str] = None):
        """Initialize the compendium manager"""
        if compendium_path:
            self.compendium_path = Path(compendium_path)
        else:
            # Get the directory where this file is located and find compendiums relative to it
            current_dir = Path(__file__).parent
            self.compendium_path = current_dir / "core_table" / "compendiums"
            
        # Debug: Print the path being used
        print(f"Compendium path: {self.compendium_path}")
        print(f"Exports path: {self.compendium_path / 'exports'}")
        
        # Loader instances
        self.bestiary_loader = None
        self.character_loader = None
        self.equipment_loader = None
        self.spell_loader = None
        
        # Data access caches
        self.bestiary = None
        self.characters_loaded = False
        self.equipment_loaded = False
        self.spells_loaded = False
        
        # Status tracking
        self.available_systems = {
            'monsters': False,
            'characters': False,
            'equipment': False,
            'spells': False
        }
        
        logger.info("CompendiumManager initialized")
    
    def load_all_systems(self) -> Dict[str, bool]:
        """Load all available compendium systems"""
        results = {}
        
        results['monsters'] = self.load_monsters()
        results['characters'] = self.load_characters()
        results['equipment'] = self.load_equipment()
        results['spells'] = self.load_spells()
        
        loaded_count = sum(results.values())
        logger.info(f"Loaded {loaded_count}/4 compendium systems")
        
        return results
    def load_monsters(self) -> bool:
        """Load the monster compendium"""
        if not BestiaryLoader:
            logger.warning("Monster system not available")
            return False
            
        try:
            start_time = time.time()
            
            # Try to load from optimized JSON first
            bestiary_file = self.compendium_path / "exports" / "bestiary_optimized.json"
            if not bestiary_file.exists():
                bestiary_file = self.compendium_path / "bestiary_optimized.json"
            
            if bestiary_file.exists():
                self.bestiary = BestiaryLoader.load_from_json(str(bestiary_file))
                if self.bestiary and len(self.bestiary.monsters) > 0:
                    load_time = time.time() - start_time
                    logger.info(f"Loaded {len(self.bestiary.monsters)} monsters in {load_time:.2f}s")
                    self.available_systems['monsters'] = True
                    return True
            
            logger.warning(f"Monster data file not found at {bestiary_file}")
            return False
            
        except Exception as e:
            logger.error(f"Failed to load monsters: {e}")
            return False
    
    def load_characters(self) -> bool:
        """Load the character compendium (races, classes, backgrounds)"""
        if not CharacterLoader:
            logger.warning("Character system not available")
            return False
            
        try:
            start_time = time.time()
            
            self.character_loader = CharacterLoader()
            
            # Try to load from exported character data
            character_file = self.compendium_path / "exports" / "character_data.json"
            if not character_file.exists():
                character_file = self.compendium_path / "character_data.json"
            
            if character_file.exists():
                success = self.character_loader.load_character_data(str(character_file))
                if success:
                    load_time = time.time() - start_time
                    summary = self.character_loader.get_character_summary()
                    if 'error' not in summary:
                        total_items = (summary['races']['total'] + 
                                     summary['classes']['total'] + 
                                     summary['backgrounds']['total'])
                        logger.info(f"Loaded {total_items} character elements in {load_time:.2f}s")
                        self.characters_loaded = True
                        self.available_systems['characters'] = True
                        return True
            
            logger.warning(f"Character data file not found at {character_file}")
            return False
            
        except Exception as e:
            logger.error(f"Failed to load characters: {e}")
            return False
    
    def load_equipment(self) -> bool:
        """Load the equipment compendium"""
        if not EquipmentLoader:
            logger.warning("Equipment system not available")
            return False
            
        try:
            start_time = time.time()
            
            self.equipment_loader = EquipmentLoader()
            
            # Try to load from exported equipment data
            equipment_file = self.compendium_path / "exports" / "equipment_data.json"
            if not equipment_file.exists():
                equipment_file = self.compendium_path / "equipment_data.json"
            
            if equipment_file.exists():
                success = self.equipment_loader.load_equipment_data(str(equipment_file))
                if success:
                    load_time = time.time() - start_time
                    total_items = len(self.equipment_loader.equipment)
                    logger.info(f"Loaded {total_items} equipment items in {load_time:.2f}s")
                    self.equipment_loaded = True
                    self.available_systems['equipment'] = True
                    return True
            
            logger.warning(f"Equipment data file not found at {equipment_file}")
            return False
            
        except Exception as e:
            logger.error(f"Failed to load equipment: {e}")
            return False
    def load_spells(self) -> bool:
        """Load the spell compendium"""
        if not SpellLoader:
            logger.warning("Spell system not available")
            return False
            
        try:
            start_time = time.time()
            
            self.spell_loader = SpellLoader()
            
            # Try to load from exported spell data - following test_integration pattern
            spell_file = self.compendium_path / "exports" / "spellbook_optimized.json"
            if not spell_file.exists():
                spell_file = self.compendium_path / "spellbook_optimized.json"
            
            if spell_file.exists():
                success = self.spell_loader.load_from_json(str(spell_file))
                if success:
                    load_time = time.time() - start_time
                    total_spells = len(self.spell_loader.spells)
                    logger.info(f"Loaded {total_spells} spells in {load_time:.2f}s")
                    self.spells_loaded = True
                    self.available_systems['spells'] = True
                    return True
            
            logger.warning(f"Spell data file not found at {spell_file}")
            return False
            
        except Exception as e:
            logger.error(f"Failed to load spells: {e}")
            return False
    
    # === MONSTER ACCESS METHODS ===
    
    def get_monster(self, name: str):
        """Get a monster by name"""
        if not self.available_systems['monsters'] or not self.bestiary:
            return None
        return self.bestiary.get_monster(name)
    
    def search_monsters(self, query: str, limit: int = 20) -> List:
        """Search monsters by name or description"""
        if not self.available_systems['monsters'] or not self.bestiary:
            return []
        return self.bestiary.search_monsters(query, limit)
    
    def get_monsters_by_cr(self, cr: Union[str, int, float]) -> List:
        """Get monsters by challenge rating"""
        if not self.available_systems['monsters'] or not self.bestiary:
            return []
        return self.bestiary.get_monsters_by_cr(cr)
    
    def create_monster_instance(self, name: str, instance_name: Optional[str] = None):
        """Create a combat-ready monster instance"""
        if not self.available_systems['monsters'] or not self.bestiary:
            return None
        return self.bestiary.create_monster_instance(name, instance_name)
    
    # === CHARACTER ACCESS METHODS ===
    
    def get_race(self, name: str):
        """Get a race by name"""
        if not self.available_systems['characters'] or not self.character_loader:
            return None
        return self.character_loader.get_race(name)
    
    def get_character_class(self, name: str):
        """Get a character class by name"""
        if not self.available_systems['characters'] or not self.character_loader:
            return None
        return self.character_loader.get_class(name)
    
    def get_background(self, name: str):
        """Get a background by name"""
        if not self.available_systems['characters'] or not self.character_loader:
            return None
        return self.character_loader.get_background(name)
    
    def search_races(self, query: str) -> List:
        """Search races by name or traits"""
        if not self.available_systems['characters'] or not self.character_loader:
            return []
        return self.character_loader.search_races(query)
    
    def search_classes(self, query: str) -> List:
        """Search character classes by name or features"""
        if not self.available_systems['characters'] or not self.character_loader:
            return []
        return self.character_loader.search_classes(query)
    
    def search_backgrounds(self, query: str) -> List:
        """Search backgrounds by name or skills"""
        if not self.available_systems['characters'] or not self.character_loader:
            return []
        return self.character_loader.search_backgrounds(query)
    
    # === EQUIPMENT ACCESS METHODS ===
    
    def get_weapon(self, name: str):
        """Get a weapon by name"""
        if not self.available_systems['equipment'] or not self.equipment_loader:
            return None
        return self.equipment_loader.get_weapon(name)
    
    def get_armor(self, name: str):
        """Get armor by name"""
        if not self.available_systems['equipment'] or not self.equipment_loader:
            return None
        return self.equipment_loader.get_armor(name)
    
    def get_magic_item(self, name: str):
        """Get a magic item by name"""
        if not self.available_systems['equipment'] or not self.equipment_loader:
            return None
        return self.equipment_loader.get_magic_item(name)
    
    def search_equipment(self, query: str, item_type: Optional[str] = None) -> List:
        """Search equipment by name or properties"""
        if not self.available_systems['equipment'] or not self.equipment_loader:
            return []
        return self.equipment_loader.search_equipment(query, item_type)
    
    # === SPELL ACCESS METHODS ===
    
    def get_spell(self, name: str):
        """Get a spell by name"""
        if not self.available_systems['spells'] or not self.spell_loader:
            return None
        return self.spell_loader.get_spell(name)
    
    def search_spells(self, query: str, level: Optional[int] = None, school: Optional[str] = None) -> List:
        """Search spells by name, level, or school"""
        if not self.available_systems['spells'] or not self.spell_loader:
            return []
        return self.spell_loader.search_spells(query, level, school)
    
    def get_spells_by_level(self, level: int) -> List:
        """Get all spells of a specific level"""
        if not self.available_systems['spells'] or not self.spell_loader:
            return []
        return self.spell_loader.get_spells_by_level(level)
    
    def get_spells_by_class(self, char_class: str) -> List:
        """Get all spells available to a character class"""
        if not self.available_systems['spells'] or not self.spell_loader:
            return []
        return self.spell_loader.get_spells_by_class(char_class)
    
    # === UTILITY METHODS ===
    
    def get_system_status(self) -> Dict[str, Any]:
        """Get the status of all compendium systems"""
        status = {
            'available_systems': self.available_systems.copy(),
            'loaded_systems': sum(self.available_systems.values()),
            'total_systems': len(self.available_systems),
            'data_counts': {}
        }
        
        # Add data counts for loaded systems
        if self.available_systems['monsters'] and self.bestiary:
            status['data_counts']['monsters'] = len(self.bestiary.monsters)
        
        if self.available_systems['characters'] and self.character_loader:
            summary = self.character_loader.get_character_summary()
            if 'error' not in summary:
                status['data_counts']['races'] = summary['races']['total']
                status['data_counts']['classes'] = summary['classes']['total']
                status['data_counts']['backgrounds'] = summary['backgrounds']['total']
        
        if self.available_systems['equipment'] and self.equipment_loader:
            status['data_counts']['equipment'] = len(self.equipment_loader.equipment)
        
        if self.available_systems['spells'] and self.spell_loader:
            status['data_counts']['spells'] = len(self.spell_loader.spells)
        
        return status
    
    def get_status(self) -> Dict[str, Any]:
        """Alias for get_system_status for backwards compatibility"""
        return self.get_system_status()
    
    def search_all(self, query: str, limit_per_type: int = 10) -> Dict[str, List]:
        """Search across all loaded compendium systems"""
        results = {
            'monsters': [],
            'races': [],
            'classes': [],
            'backgrounds': [],
            'equipment': [],
            'spells': []
        }
        
        if self.available_systems['monsters']:
            results['monsters'] = self.search_monsters(query, limit_per_type)
        
        if self.available_systems['characters']:
            results['races'] = self.search_races(query)[:limit_per_type]
            results['classes'] = self.search_classes(query)[:limit_per_type]
            results['backgrounds'] = self.search_backgrounds(query)[:limit_per_type]
        
        if self.available_systems['equipment']:
            results['equipment'] = self.search_equipment(query)[:limit_per_type]
        
        if self.available_systems['spells']:
            results['spells'] = self.search_spells(query)[:limit_per_type]
        
        return results


# Global compendium manager instance (lazy loaded)
_compendium_manager = None

def get_compendium_manager(compendium_path: Optional[str] = None) -> CompendiumManager:
    """Get the global compendium manager instance"""
    global _compendium_manager
    if _compendium_manager is None:
        _compendium_manager = CompendiumManager(compendium_path)
    return _compendium_manager

def load_compendiums(compendium_path: Optional[str] = None) -> Dict[str, bool]:
    """Convenience function to load all compendium systems"""
    manager = get_compendium_manager(compendium_path)
    return manager.load_all_systems()

# Example usage
if __name__ == "__main__":
    # Test the compendium manager
    import logging
    # logging.basicConfig removed - using central logger setup
    print("Testing D&D 5e Compendium Manager")
    print("=" * 50)
    
    # Create and load compendiums
    manager = CompendiumManager()
    results = manager.load_all_systems()
    
    print(f"\nLoaded systems: {results}")
      # Test monster access
    if results['monsters']:
        print("\nMonster System Test:")
        goblin = manager.get_monster("Goblin")
        if goblin:
            print(f"Found: {goblin.name} (CR {goblin.challenge_rating})")
            
        dragons = manager.search_monsters("dragon")[:3]
        print(f"Dragon search results: {[m.name for m in dragons]}")
    
    # Test character access
    if results['characters']:
        print("\nCharacter System Test:")
        elf = manager.get_race("Elf")
        if elf:
            print(f"Found race: {elf.name}")
            
        fighter = manager.get_character_class("Fighter")
        if fighter:
            print(f"Found class: {fighter.name}")
    
    # Test equipment access
    if results['equipment']:
        print("\nEquipment System Test:")
        sword = manager.get_weapon("Longsword")
        if sword:
            print(f"Found weapon: {sword.name}")
    
    # Test spell access
    if results['spells']:
        print("\nSpell System Test:")
        fireball = manager.get_spell("Fireball")
        if fireball:
            print(f"Found spell: {fireball.name}")
    
    # System status
    status = manager.get_system_status()
    print(f"\nSystem Status: {status}")
    
    print("\nCompendium Manager test complete!")


