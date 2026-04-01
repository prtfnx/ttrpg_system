#!/usr/bin/env python3
"""
D&D 5e Character System - Data Loader
Load character data for use in the VTT system
"""

import json
from pathlib import Path
from typing import Dict, List, Optional, Any
from .character import Race, CharacterClass, Background, AbilityScore, Size, Skill


class CharacterLoader:
    """Load character data from exported files"""
    
    def __init__(self, data_directory: str = "../exports"):
        self.data_directory = Path(data_directory)
        self.races: Dict[str, Race] = {}
        self.classes: Dict[str, CharacterClass] = {}
        self.backgrounds: Dict[str, Background] = {}
        self.loaded = False
    
    def load_character_data(self, filename: str = "character_data.json") -> bool:
        """Load character data from JSON file"""
        try:
            data_path = self.data_directory / filename
            print(f"Loading character data from: {data_path}")
            
            if not data_path.exists():
                print(f"Character data file not found: {data_path}")
                return False
            
            with open(data_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Load races
            for race_data in data.get('races', []):
                race = self._dict_to_race(race_data)
                if race:
                    self.races[race.name] = race
            
            # Load classes
            for class_data in data.get('classes', []):
                char_class = self._dict_to_class(class_data)
                if char_class:
                    self.classes[char_class.name] = char_class
            
            # Load backgrounds
            for bg_data in data.get('backgrounds', []):
                background = self._dict_to_background(bg_data)
                if background:
                    self.backgrounds[background.name] = background
            
            self.loaded = True
            print(f"Loaded {len(self.races)} races, {len(self.classes)} classes, {len(self.backgrounds)} backgrounds")
            return True
            
        except Exception as e:
            print(f"Error loading character data: {e}")
            return False
    
    def _dict_to_race(self, data: Dict[str, Any]) -> Optional[Race]:
        """Convert dictionary data to Race object"""
        try:
            race = Race()
            race.name = data.get('name', '')
            race.size = Size(data.get('size', 'Medium'))
            race.speed = data.get('speed', 30)
            race.darkvision = data.get('darkvision', 0)
            race.spell_ability = AbilityScore(data['spell_ability']) if data.get('spell_ability') else None
            race.languages = data.get('languages', [])
            race.source = data.get('source', '')
            
            # Convert ability score increases
            race.ability_score_increases = []
            for asi_data in data.get('ability_score_increases', []):
                from .character import AbilityScoreIncrease
                asi = AbilityScoreIncrease(
                    ability=AbilityScore(asi_data['ability']),
                    increase=asi_data['increase']
                )
                race.ability_score_increases.append(asi)
            
            # Convert skill proficiencies
            race.skill_proficiencies = []
            for skill_name in data.get('skill_proficiencies', []):
                try:
                    race.skill_proficiencies.append(Skill(skill_name))
                except ValueError:
                    pass  # Skip invalid skills
            
            # Convert traits
            race.traits = []
            for trait_data in data.get('traits', []):
                from .character import RacialTrait
                trait = RacialTrait(
                    name=trait_data.get('name', ''),
                    description=trait_data.get('description', ''),
                    source=trait_data.get('source', '')
                )
                race.traits.append(trait)
            
            return race
            
        except Exception as e:
            print(f"Error converting race data: {e}")
            return None
    
    def _dict_to_class(self, data: Dict[str, Any]) -> Optional[CharacterClass]:
        """Convert dictionary data to CharacterClass object"""
        try:
            char_class = CharacterClass()
            char_class.name = data.get('name', '')
            char_class.hit_die = data.get('hit_die', 8)
            char_class.num_skills = data.get('num_skills', 2)
            char_class.spell_ability = AbilityScore(data['spell_ability']) if data.get('spell_ability') else None
            char_class.starting_wealth = data.get('starting_wealth', '2d4x10')
            char_class.source = data.get('source', '')
            
            # Convert primary abilities
            char_class.primary_abilities = []
            for ability_name in data.get('primary_abilities', []):
                try:
                    char_class.primary_abilities.append(AbilityScore(ability_name))
                except ValueError:
                    pass
            
            # Convert saving throw proficiencies
            char_class.saving_throw_proficiencies = []
            for ability_name in data.get('saving_throw_proficiencies', []):
                try:
                    char_class.saving_throw_proficiencies.append(AbilityScore(ability_name))
                except ValueError:
                    pass
            
            # Convert skill proficiencies
            char_class.skill_proficiencies = []
            for skill_name in data.get('skill_proficiencies', []):
                try:
                    char_class.skill_proficiencies.append(Skill(skill_name))
                except ValueError:
                    pass
            
            # Convert proficiencies
            char_class.armor_proficiencies = data.get('armor_proficiencies', [])
            char_class.weapon_proficiencies = data.get('weapon_proficiencies', [])
            char_class.tool_proficiencies = data.get('tool_proficiencies', [])
            
            # Convert features
            char_class.features = {}
            for level_str, features_data in data.get('features', {}).items():
                try:
                    level = int(level_str)
                    char_class.features[level] = []
                    
                    for feature_data in features_data:
                        from .character import ClassFeature
                        feature = ClassFeature(
                            name=feature_data.get('name', ''),
                            description=feature_data.get('description', ''),
                            level=feature_data.get('level', level),
                            source=feature_data.get('source', '')
                        )
                        char_class.features[level].append(feature)
                except ValueError:
                    pass
            
            # Convert spell slots
            char_class.spell_slots = data.get('spell_slots', {})
            
            return char_class
            
        except Exception as e:
            print(f"Error converting class data: {e}")
            return None
    
    def _dict_to_background(self, data: Dict[str, Any]) -> Optional[Background]:
        """Convert dictionary data to Background object"""
        try:
            background = Background()
            background.name = data.get('name', '')
            background.source = data.get('source', '')
            
            # Convert skill proficiencies
            background.skill_proficiencies = []
            for skill_name in data.get('skill_proficiencies', []):
                try:
                    background.skill_proficiencies.append(Skill(skill_name))
                except ValueError:
                    pass
            
            # Convert features
            background.features = []
            for feature_data in data.get('features', []):
                from .character import BackgroundFeature
                feature = BackgroundFeature(
                    name=feature_data.get('name', ''),
                    description=feature_data.get('description', ''),
                    feature_type=feature_data.get('feature_type', 'feature')
                )
                background.features.append(feature)
            
            return background
            
        except Exception as e:
            print(f"Error converting background data: {e}")
            return None
    
    def get_race(self, name: str) -> Optional[Race]:
        """Get a race by name"""
        return self.races.get(name)
    
    def get_class(self, name: str) -> Optional[CharacterClass]:
        """Get a class by name"""
        return self.classes.get(name)
    
    def get_background(self, name: str) -> Optional[Background]:
        """Get a background by name"""
        return self.backgrounds.get(name)
    
    def get_all_races(self) -> List[Race]:
        """Get all available races"""
        return list(self.races.values())
    
    def get_all_classes(self) -> List[CharacterClass]:
        """Get all available classes"""
        return list(self.classes.values())
    
    def get_all_backgrounds(self) -> List[Background]:
        """Get all available backgrounds"""
        return list(self.backgrounds.values())
    
    def search_races(self, query: str) -> List[Race]:
        """Search races by name"""
        query = query.lower()
        return [race for race in self.races.values() 
                if query in race.name.lower()]
    
    def search_classes(self, query: str) -> List[CharacterClass]:
        """Search classes by name"""
        query = query.lower()
        return [char_class for char_class in self.classes.values() 
                if query in char_class.name.lower()]
    
    def search_backgrounds(self, query: str) -> List[Background]:
        """Search backgrounds by name"""
        query = query.lower()
        return [background for background in self.backgrounds.values() 
                if query in background.name.lower()]
    
    def get_character_summary(self) -> Dict[str, Any]:
        """Get summary of available character options"""
        if not self.loaded:
            return {'error': 'Character data not loaded'}
        
        return {
            'races': {
                'total': len(self.races),
                'with_darkvision': len([r for r in self.races.values() if r.darkvision > 0]),
                'spellcasters': len([r for r in self.races.values() if r.spell_ability]),
                'sizes': {size.value: len([r for r in self.races.values() if r.size == size]) 
                         for size in Size}
            },
            'classes': {
                'total': len(self.classes),
                'spellcasters': len([c for c in self.classes.values() if c.spell_ability]),
                'hit_dice': {f'd{die}': len([c for c in self.classes.values() if c.hit_die == die]) 
                           for die in [6, 8, 10, 12]}
            },
            'backgrounds': {
                'total': len(self.backgrounds),
                'with_skills': len([b for b in self.backgrounds.values() if b.skill_proficiencies])
            }
        }


def main():
    """Test the character loader"""
    print("D&D 5e Character Data Loader Test")
    print("=" * 50)
    
    loader = CharacterLoader()
    
    if loader.load_character_data():
        print(f"\nCharacter Data Summary:")
        summary = loader.get_character_summary()
        
        print(f"Races: {summary['races']['total']}")
        print(f"  - With darkvision: {summary['races']['with_darkvision']}")
        print(f"  - Spellcasters: {summary['races']['spellcasters']}")
        
        print(f"Classes: {summary['classes']['total']}")
        print(f"  - Spellcasters: {summary['classes']['spellcasters']}")
        
        print(f"Backgrounds: {summary['backgrounds']['total']}")
        print(f"  - With skills: {summary['backgrounds']['with_skills']}")
        
        # Test searches
        print(f"\nSearch Tests:")
        elf_races = loader.search_races("elf")
        print(f"Elf races found: {len(elf_races)}")
        for race in elf_races[:3]:
            print(f"  - {race.name}")
        
        wizard_classes = loader.search_classes("wizard")
        print(f"Wizard classes found: {len(wizard_classes)}")
        for char_class in wizard_classes:
            print(f"  - {char_class.name}")
        
        print(f"\nCharacter loader test complete!")
    else:
        print(f"Failed to load character data")


if __name__ == "__main__":
    main()
