"""
Universal Bestiary Loader
Can load monster data from any exported format
Includes token resolution integration
"""

import json
import pickle
import sqlite3
import os
from typing import Dict, List, Any, Optional

try:
    from .monster import Monster
    from .bestiary import Bestiary
except ImportError:
    from monster import Monster
    from bestiary import Bestiary

# Import token resolution service
try:
    from core_table.compendiums.token_resolution_service import get_token_service
except ImportError:
    get_token_service = None


class BestiaryLoader:
    """Universal loader for bestiary data from various formats"""
    
    @staticmethod
    def load_from_json(file_path: str) -> Optional[Bestiary]:
        """Load bestiary from JSON format"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            bestiary = Bestiary()
            monsters_data = data.get('monsters', {})
            
            for name, monster_data in monsters_data.items():
                monster = BestiaryLoader._dict_to_monster(monster_data)
                if monster:
                    bestiary._add_monster_to_indices(monster)
            
            print(f"Loaded {len(bestiary.monsters)} monsters from JSON")
            return bestiary
            
        except Exception as e:
            print(f"Error loading from JSON: {e}")
            return None
    
    @staticmethod
    def load_from_yaml(file_path: str) -> Optional[Bestiary]:
        """Load bestiary from YAML format"""
        try:
            import yaml
            with open(file_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)
            
            bestiary = Bestiary()
            monsters_data = data.get('monsters', {})
            
            for name, monster_data in monsters_data.items():
                monster = BestiaryLoader._dict_to_monster(monster_data)
                if monster:
                    bestiary._add_monster_to_indices(monster)
            
            print(f"Loaded {len(bestiary.monsters)} monsters from YAML")
            return bestiary
            
        except ImportError:
            print("YAML library not available. Install with: pip install PyYAML")
            return None
        except Exception as e:
            print(f"Error loading from YAML: {e}")
            return None
    
    @staticmethod
    def load_from_pickle(file_path: str) -> Optional[Bestiary]:
        """Load bestiary from Pickle format"""
        try:
            with open(file_path, 'rb') as f:
                data = pickle.load(f)
            
            bestiary = data.get('bestiary')
            if isinstance(bestiary, Bestiary):
                print(f"Loaded {len(bestiary.monsters)} monsters from Pickle")
                return bestiary
            else:
                print("Invalid pickle format")
                return None
                
        except Exception as e:
            print(f"Error loading from Pickle: {e}")
            return None
    
    @staticmethod
    def load_from_sqlite(file_path: str) -> Optional[Bestiary]:
        """Load bestiary from SQLite format"""
        try:
            conn = sqlite3.connect(file_path)
            cursor = conn.cursor()
            
            # Get all monsters
            cursor.execute("SELECT * FROM monsters")
            rows = cursor.fetchall()
            
            # Get column names
            cursor.execute("PRAGMA table_info(monsters)")
            columns = [row[1] for row in cursor.fetchall()]
            
            bestiary = Bestiary()
            
            for row in rows:
                monster_data = dict(zip(columns, row))
                monster = BestiaryLoader._sqlite_row_to_monster(monster_data)
                if monster:
                    bestiary._add_monster_to_indices(monster)
            
            conn.close()
            
            print(f"Loaded {len(bestiary.monsters)} monsters from SQLite")
            return bestiary
            
        except Exception as e:
            print(f"Error loading from SQLite: {e}")
            return None
    
    @staticmethod
    def load_from_msgpack(file_path: str) -> Optional[Bestiary]:
        """Load bestiary from MessagePack format"""
        try:
            import msgpack
            with open(file_path, 'rb') as f:
                data = msgpack.unpack(f)
            
            bestiary = Bestiary()
            monsters_data = data.get('monsters', {})
            
            for name, monster_data in monsters_data.items():
                monster = BestiaryLoader._dict_to_monster(monster_data)
                if monster:
                    bestiary._add_monster_to_indices(monster)
            
            print(f"Loaded {len(bestiary.monsters)} monsters from MessagePack")
            return bestiary
            
        except ImportError:
            print("MessagePack library not available. Install with: pip install msgpack")
            return None
        except Exception as e:
            print(f"Error loading from MessagePack: {e}")
            return None
    
    @staticmethod
    def auto_load(file_path: str) -> Optional[Bestiary]:
        """Automatically detect format and load bestiary"""
        if not os.path.exists(file_path):
            print(f"File not found: {file_path}")
            return None
        
        _, ext = os.path.splitext(file_path.lower())
        
        loaders = {
            '.json': BestiaryLoader.load_from_json,
            '.yaml': BestiaryLoader.load_from_yaml,
            '.yml': BestiaryLoader.load_from_yaml,
            '.pkl': BestiaryLoader.load_from_pickle,
            '.pickle': BestiaryLoader.load_from_pickle,
            '.db': BestiaryLoader.load_from_sqlite,
            '.sqlite': BestiaryLoader.load_from_sqlite,
            '.msgpack': BestiaryLoader.load_from_msgpack,        }
        
        loader = loaders.get(ext)
        if loader:
            print(f"Auto-detected format: {ext}")
            return loader(file_path)
        else:
            print(f"Unknown file format: {ext}")
            return None
    
    @staticmethod
    def _dict_to_monster(data: Dict[str, Any]) -> Optional[Monster]:
        """Convert dictionary data back to Monster object"""
        try:
            try:
                from .monster import Monster, MonsterAction, MonsterTrait, MonsterLegendaryAction
                from .bestiary import Bestiary
            except ImportError:
                from monster import Monster, MonsterAction, MonsterTrait, MonsterLegendaryAction
                from bestiary import Bestiary
            
            monster = Monster(data.get('name', 'Unknown'))
            
            # Basic attributes
            monster.size = data.get('size', 'M')
            monster.type = data.get('type', 'humanoid')
            monster.subtype = data.get('subtype', '')
            monster.alignment = data.get('alignment', 'neutral')
            monster.armor_class = data.get('armor_class', 10)
            monster.armor_desc = data.get('armor_desc', '')
            monster.hit_points = data.get('hit_points', 10)
            monster.hit_dice = data.get('hit_dice', '')
            monster.current_hp = monster.hit_points
            
            # Dictionary attributes
            monster.speed = data.get('speed', {'walk': 30})
            monster.stats = data.get('stats', {
                'STR': 10, 'DEX': 10, 'CON': 10, 
                'INT': 10, 'WIS': 10, 'CHA': 10
            })
            monster.saves = data.get('saves', {})
            monster.skills = data.get('skills', {})
            monster.spells = data.get('spells', {})
            monster.spell_slots = data.get('spell_slots', {})
            
            # List attributes
            monster.damage_resistances = data.get('damage_resistances', [])
            monster.damage_vulnerabilities = data.get('damage_vulnerabilities', [])
            monster.damage_immunities = data.get('damage_immunities', [])
            monster.condition_immunities = data.get('condition_immunities', [])
            monster.senses = data.get('senses', [])
            monster.languages = data.get('languages', [])
            monster.environment = data.get('environment', [])
            
            # Other attributes
            monster.passive_perception = data.get('passive_perception', 10)
            monster.challenge_rating = data.get('challenge_rating', '0')
            monster.experience_points = data.get('experience_points', 0)
            monster.source = data.get('source', '')
            
            # Token data (NEW)
            monster.token_url = data.get('token_url')
            monster.token_source = data.get('token_source', 'none')
            
            # Resolve token if not already set and token service available
            if not monster.token_url and get_token_service:
                try:
                    token_service = get_token_service()
                    monster.token_url = token_service.resolve_token_url(
                        monster.name,
                        monster.type,
                        use_r2=True
                    )
                    # Determine source
                    if monster.token_url.startswith('data:'):
                        monster.token_source = 'fallback'
                    elif '/defaults/' in monster.token_url:
                        monster.token_source = 'type_default'
                    elif 'r2' in monster.token_url or 'cloudflare' in monster.token_url:
                        monster.token_source = 'r2'
                    else:
                        monster.token_source = 'local'
                except Exception as e:
                    print(f"Token resolution failed for {monster.name}: {e}")
            
            # Complex objects
            monster.traits = []
            for trait_data in data.get('traits', []):
                trait = MonsterTrait(
                    trait_data.get('name', ''),
                    trait_data.get('description', '')
                )
                monster.traits.append(trait)
            
            monster.actions = []
            for action_data in data.get('actions', []):
                action = MonsterAction(
                    action_data.get('name', ''),
                    action_data.get('description', ''),
                    action_data.get('attack_info', '')
                )
                monster.actions.append(action)
            
            monster.legendary_actions = []
            for la_data in data.get('legendary_actions', []):
                la = MonsterLegendaryAction(
                    la_data.get('name', ''),
                    la_data.get('description', ''),
                    la_data.get('cost', 1)
                )
                monster.legendary_actions.append(la)
            
            return monster
            
        except Exception as e:
            print(f"Error converting dict to monster: {e}")
            return None
    
    @staticmethod
    def _sqlite_row_to_monster(row_data: Dict[str, Any]) -> Optional[Monster]:
        """Convert SQLite row data to Monster object"""
        try:
            # Convert JSON fields back to objects
            for field in ['speed', 'stats', 'saves', 'skills', 'traits', 'actions', 
                         'legendary_actions', 'damage_resistances', 'damage_vulnerabilities',
                         'damage_immunities', 'condition_immunities', 'senses', 
                         'languages', 'environment', 'spells', 'spell_slots']:
                json_field = f"{field}_json"
                if json_field in row_data and row_data[json_field]:
                    row_data[field] = json.loads(row_data[json_field])
                else:
                    row_data[field] = [] if field.endswith('s') else {}
            
            # Use the standard dict conversion
            return BestiaryLoader._dict_to_monster(row_data)
            
        except Exception as e:
            print(f"Error converting SQLite row to monster: {e}")
            return None


# Convenience functions for quick loading
def load_bestiary(file_path: str) -> Optional[Bestiary]:
    """Convenience function to load bestiary from any format"""
    return BestiaryLoader.auto_load(file_path)


def get_available_formats():
    """Get list of available export/import formats"""
    formats = {
        'json': 'JSON - Human readable, widely supported',
        'pickle': 'Pickle - Fastest for Python, binary format',
        'sqlite': 'SQLite - Database with SQL queries',
    }
    
    try:
        import yaml
        formats['yaml'] = 'YAML - Very readable, good for configs'
    except ImportError:
        pass
    
    try:
        import msgpack
        formats['msgpack'] = 'MessagePack - Fast binary, cross-language'
    except ImportError:
        pass
    
    return formats


if __name__ == "__main__":
    print("Available formats:")
    for fmt, desc in get_available_formats().items():
        print(f"  {fmt}: {desc}")
