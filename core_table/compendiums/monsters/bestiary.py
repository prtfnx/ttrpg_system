"""
Bestiary manager for D&D 5e Virtual Tabletop
DEPRECATED: Use models.monster and services.monster_service instead
"""

# Redirect to new enhanced models
from ..models.monster import Monster, MonsterAction, LegendaryAction
from ..services.monster_service import MonsterService

__all__ = ['Monster', 'MonsterAction', 'LegendaryAction', 'MonsterService']
    """
    Main class for managing the monster compendium
    Provides searching, filtering, and monster creation functionality
    """
    
    def __init__(self):
        self.monsters = {}  # Dict[str, Monster] - name -> monster
        self.monsters_by_cr = {}  # Dict[str, List[Monster]] - CR -> list of monsters
        self.monsters_by_type = {}  # Dict[str, List[Monster]] - type -> list of monsters
        self.monsters_by_environment = {}  # Dict[str, List[Monster]] - environment -> list of monsters
        self.templates = {}  # Dict[str, MonsterTemplate] - template variants
        self.parser = BestiaryParser()
        
        # Initialize built-in templates
        self._init_templates()
    
    def load_from_xml(self, xml_file_path: str) -> bool:
        """Load monsters from Bestiary.xml file"""
        try:
            print(f"Loading bestiary from {xml_file_path}...")
            monsters_list = self.parser.parse_bestiary_file(xml_file_path)
            
            print(f"Loaded {len(monsters_list)} monsters")
            
            # Clear existing data
            self.monsters.clear()
            self.monsters_by_cr.clear()
            self.monsters_by_type.clear()
            self.monsters_by_environment.clear()
            
            # Index monsters
            for monster in monsters_list:
                self._add_monster_to_indices(monster)
            
            print("Bestiary loaded successfully!")
            return True
            
        except Exception as e:
            print(f"Error loading bestiary: {e}")
            return False
    
    def save_to_cache(self, cache_file_path: str) -> bool:
        """Save processed monsters to JSON cache for faster loading"""
        try:
            cache_data = {
                'monsters': {name: monster.to_dict() for name, monster in self.monsters.items()},
                'version': '1.0'
            }
            
            with open(cache_file_path, 'w', encoding='utf-8') as f:
                json.dump(cache_data, f, indent=2, ensure_ascii=False)
            
            print(f"Bestiary cache saved to {cache_file_path}")
            return True
            
        except Exception as e:
            print(f"Error saving bestiary cache: {e}")
            return False
    
    def load_from_cache(self, cache_file_path: str) -> bool:
        """Load monsters from JSON cache"""
        try:
            if not os.path.exists(cache_file_path):
                return False
                
            with open(cache_file_path, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)
            
            # Clear existing data
            self.monsters.clear()
            self.monsters_by_cr.clear()
            self.monsters_by_type.clear()
            self.monsters_by_environment.clear()
            
            # Load monsters from cache
            for name, monster_data in cache_data.get('monsters', {}).items():
                monster = self._monster_from_dict(monster_data)
                if monster:
                    self._add_monster_to_indices(monster)
            
            print(f"Loaded {len(self.monsters)} monsters from cache")
            return True
            
        except Exception as e:
            print(f"Error loading bestiary cache: {e}")
            return False
    
    def _add_monster_to_indices(self, monster: Monster):
        """Add monster to all search indices"""
        # Main index by name
        self.monsters[monster.name] = monster
        
        # Index by challenge rating
        cr = monster.challenge_rating
        if cr not in self.monsters_by_cr:
            self.monsters_by_cr[cr] = []
        self.monsters_by_cr[cr].append(monster)
        
        # Index by type
        monster_type = monster.type
        if monster_type not in self.monsters_by_type:
            self.monsters_by_type[monster_type] = []
        self.monsters_by_type[monster_type].append(monster)
        
        # Index by environment
        for env in monster.environment:
            if env not in self.monsters_by_environment:
                self.monsters_by_environment[env] = []
            self.monsters_by_environment[env].append(monster)
    
    def _monster_from_dict(self, data: Dict) -> Optional[Monster]:
        """Recreate Monster object from dictionary data"""
        try:
            monster = Monster(data.get('name', 'Unknown'))
            
            # Basic attributes
            for attr in ['size', 'type', 'subtype', 'alignment', 'armor_class', 
                        'armor_desc', 'hit_points', 'current_hp', 'hit_dice', 
                        'passive_perception', 'challenge_rating', 'experience_points', 
                        'source', 'legendary_actions_used']:
                if attr in data:
                    setattr(monster, attr, data[attr])
            
            # Dictionary attributes
            for attr in ['speed', 'stats', 'saves', 'skills', 'spells', 'spell_slots']:
                if attr in data:
                    setattr(monster, attr, data[attr])
            
            # List attributes
            for attr in ['damage_resistances', 'damage_vulnerabilities', 
                        'damage_immunities', 'condition_immunities', 'senses', 
                        'languages', 'environment', 'conditions']:
                if attr in data:
                    setattr(monster, attr, data[attr])
              # Recreate complex objects (simplified for now)
            # In a full implementation, you'd recreate MonsterTrait, MonsterAction, etc.
            
            return monster
            
        except Exception as e:
            print(f"Error recreating monster from dict: {e}")
            return None
    
    def get_monster(self, name: str) -> Optional[Monster]:
        """Get monster by exact name"""
        return self.monsters.get(name)
    
    def search_monsters(self, query: str, limit: Optional[int] = None) -> List[Monster]:
        """Search monsters by name (case-insensitive partial match)"""
        query = query.lower()
        results = []
        
        for name, monster in self.monsters.items():
            if query in name.lower():
                results.append(monster)
        
        results = sorted(results, key=lambda m: m.name)
        
        if limit is not None:
            results = results[:limit]
        
        return results
    
    def get_monsters_by_cr(self, challenge_rating: str) -> List[Monster]:
        """Get all monsters of specific challenge rating"""
        return self.monsters_by_cr.get(challenge_rating, [])
    
    def get_monsters_by_cr_range(self, min_cr: str, max_cr: str) -> List[Monster]:
        """Get monsters within CR range"""
        cr_order = ["0", "1/8", "1/4", "1/2"] + [str(i) for i in range(1, 31)]
        
        try:
            min_idx = cr_order.index(min_cr)
            max_idx = cr_order.index(max_cr)
        except ValueError:
            return []
        
        results = []
        for i in range(min_idx, max_idx + 1):
            cr = cr_order[i]
            results.extend(self.get_monsters_by_cr(cr))
        
        return sorted(results, key=lambda m: (cr_order.index(m.challenge_rating), m.name))
    
    def get_monsters_by_type(self, monster_type: str) -> List[Monster]:
        """Get all monsters of specific type"""
        return self.monsters_by_type.get(monster_type, [])
    
    def get_monsters_by_environment(self, environment: str) -> List[Monster]:
        """Get all monsters from specific environment"""
        return self.monsters_by_environment.get(environment, [])    
    def filter_monsters(self, 
                       challenge_rating: Optional[str] = None,
                       monster_type: Optional[str] = None,
                       environment: Optional[str] = None,
                       size: Optional[str] = None,
                       alignment: Optional[str] = None) -> List[Monster]:
        """Filter monsters by multiple criteria"""
        candidates = list(self.monsters.values())
        
        if challenge_rating:
            candidates = [m for m in candidates if m.challenge_rating == challenge_rating]
        
        if monster_type:
            candidates = [m for m in candidates if m.type.lower() == monster_type.lower()]
        
        if environment:
            candidates = [m for m in candidates if environment.lower() in [e.lower() for e in m.environment]]
        
        if size:
            candidates = [m for m in candidates if m.size.upper() == size.upper()]
        
        if alignment:
            candidates = [m for m in candidates if alignment.lower() in m.alignment.lower()]
        
        return sorted(candidates, key=lambda m: m.name)    
    def get_random_encounter(self, 
                           challenge_rating: Optional[str] = None,
                           environment: Optional[str] = None,
                           count: int = 1) -> List[Monster]:
        """Generate random encounter"""
        import random
        
        candidates = self.filter_monsters(
            challenge_rating=challenge_rating,
            environment=environment
        )
        
        if not candidates:
            candidates = list(self.monsters.values())
        
        if not candidates:
            return []
        
        return random.choices(candidates, k=min(count, len(candidates)))
    
    def create_monster_instance(self, monster_name: str, template_name: Optional[str] = None) -> Optional[Monster]:
        """Create a new instance of a monster, optionally with template applied"""
        base_monster = self.get_monster(monster_name)
        if not base_monster:
            return None
        
        # Create a copy for the instance
        instance = Monster(base_monster.name)
        
        # Copy all attributes from base monster
        for attr in dir(base_monster):
            if not attr.startswith('_') and not callable(getattr(base_monster, attr)):
                value = getattr(base_monster, attr)
                # Deep copy lists and dicts
                if isinstance(value, (list, dict)):
                    import copy
                    setattr(instance, attr, copy.deepcopy(value))
                else:
                    setattr(instance, attr, value)
        
        # Reset instance-specific state
        instance.current_hp = instance.hit_points
        instance.conditions = []
        instance.legendary_actions_used = 0
        
        # Apply template if specified
        if template_name and template_name in self.templates:
            template = self.templates[template_name]
            instance = template.apply_to_monster(instance)
        
        return instance
    
    def get_available_types(self) -> List[str]:
        """Get list of all monster types in bestiary"""
        return sorted(self.monsters_by_type.keys())
    
    def get_available_environments(self) -> List[str]:
        """Get list of all environments in bestiary"""
        return sorted(self.monsters_by_environment.keys())
    
    def get_available_challenge_ratings(self) -> List[str]:
        """Get list of all challenge ratings in bestiary"""
        cr_order = ["0", "1/8", "1/4", "1/2"] + [str(i) for i in range(1, 31)]
        return [cr for cr in cr_order if cr in self.monsters_by_cr]
    
    def _init_templates(self):
        """Initialize built-in monster templates"""
        # Elite template - stronger version
        self.templates['Elite'] = MonsterTemplate(
            name='Elite',
            stat_adjustments={'STR': 2, 'DEX': 2, 'CON': 2},
            trait_additions=[
                {
                    'name': 'Elite Resilience',
                    'description': 'This creature has advantage on saving throws against being charmed or frightened.'
                }
            ]
        )
        
        # Weak template - weaker version
        self.templates['Weak'] = MonsterTemplate(
            name='Weak',
            stat_adjustments={'STR': -2, 'DEX': -2, 'CON': -2},
            trait_additions=[
                {
                    'name': 'Frail',
                    'description': 'This creature has disadvantage on Constitution saving throws.'
                }
            ]
        )
        
        # Young template
        self.templates['Young'] = MonsterTemplate(
            name='Young',
            stat_adjustments={'STR': -4, 'DEX': 2, 'CON': -2, 'INT': -2, 'WIS': -2, 'CHA': -2},
            trait_additions=[
                {
                    'name': 'Youthful Energy',
                    'description': 'This creature has +10 ft. to its speed.'
                }
            ]
        )
        
        # Ancient template
        self.templates['Ancient'] = MonsterTemplate(
            name='Ancient',
            stat_adjustments={'STR': 2, 'DEX': -2, 'CON': 2, 'INT': 4, 'WIS': 4, 'CHA': 2},
            trait_additions=[
                {
                    'name': 'Ancient Wisdom',
                    'description': 'This creature has advantage on Wisdom and Intelligence saving throws.'
                }
            ]
        )
    
    def get_stats_summary(self) -> Dict:
        """Get summary statistics about the bestiary"""
        return {
            'total_monsters': len(self.monsters),
            'by_challenge_rating': {cr: len(monsters) for cr, monsters in self.monsters_by_cr.items()},
            'by_type': {mtype: len(monsters) for mtype, monsters in self.monsters_by_type.items()},
            'by_environment': {env: len(monsters) for env, monsters in self.monsters_by_environment.items()},
            'available_templates': list(self.templates.keys())
        }
    
    def __len__(self):
        return len(self.monsters)
    
    def __contains__(self, monster_name: str):
        return monster_name in self.monsters
    
    def __iter__(self):
        return iter(self.monsters.values())
