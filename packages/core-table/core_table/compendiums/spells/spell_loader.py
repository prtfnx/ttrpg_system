#!/usr/bin/env python3
"""
D&D 5e Spell Loader
Loads spells from exported JSON format for use in applications
"""

import json
import os
import sys
from typing import Dict, List, Optional, Any

# Add the current directory to the path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from spell import Spell, SpellSchool, SpellComponent, SpellEffect, DamageRoll


class SpellLoader:
    """Loads D&D 5e spells from exported data formats"""
    
    def __init__(self):
        self.spells: Dict[str, Spell] = {}
        self.metadata: Dict[str, Any] = {}
        
    def load_from_json(self, json_file: str) -> bool:
        """Load spells from JSON file"""
        try:
            print(f"📖 Loading spells from: {json_file}")
            
            if not os.path.exists(json_file):
                print(f"❌ File not found: {json_file}")
                return False
            
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Load metadata
            self.metadata = data.get('metadata', {})
            
            # Load spells
            spells_data = data.get('spells', {})
            
            loaded_count = 0
            for spell_name, spell_data in spells_data.items():
                spell = self._dict_to_spell(spell_data)
                if spell:
                    self.spells[spell_name] = spell
                    loaded_count += 1
            
            print(f"✅ Loaded {loaded_count} spells from JSON")
            return True
            
        except Exception as e:
            print(f"❌ Error loading JSON: {e}")
            return False
    
    def _dict_to_spell(self, data: Dict[str, Any]) -> Optional[Spell]:
        """Convert dictionary data to Spell object"""
        try:
            spell = Spell()
            
            # Basic properties
            spell.name = data.get('name', '')
            spell.level = data.get('level', 0)
            
            # School
            school_str = data.get('school', 'Evocation')
            try:
                spell.school = SpellSchool(school_str)
            except ValueError:
                spell.school = SpellSchool.EVOCATION
            
            spell.ritual = data.get('ritual', False)
            spell.casting_time = data.get('casting_time', '1 action')
            spell.range = data.get('range', 'Touch')
            spell.duration = data.get('duration', 'Instantaneous')
            spell.concentration = data.get('concentration', False)
            
            # Components
            comp_data = data.get('components', {})
            spell.components = SpellComponent(
                verbal=comp_data.get('verbal', False),
                somatic=comp_data.get('somatic', False),
                material=comp_data.get('material', False),
                material_description=comp_data.get('material_description'),
                material_consumed=comp_data.get('material_consumed', False),
                material_cost=comp_data.get('material_cost')
            )
            
            spell.classes = data.get('classes', [])
            spell.description = data.get('description', '')
            spell.higher_levels = data.get('higher_levels', '')
            spell.source = data.get('source', 'Unknown')
            spell.page = data.get('page')
            spell.tags = data.get('tags', [])
            spell.damage_types = data.get('damage_types', [])
            spell.save_types = data.get('save_types', [])
            
            # Effects
            effects_data = data.get('effects', [])
            for effect_data in effects_data:
                effect = SpellEffect(
                    effect_type=effect_data.get('effect_type', 'utility'),
                    description=effect_data.get('description', ''),
                    save_type=effect_data.get('save_type'),
                    condition=effect_data.get('condition'),
                    duration=effect_data.get('duration'),
                    area_type=effect_data.get('area_type'),
                    area_size=effect_data.get('area_size')
                )
                
                # Damage roll
                damage_data = effect_data.get('damage_roll')
                if damage_data:
                    effect.damage_roll = DamageRoll(
                        dice_count=damage_data.get('dice_count', 1),
                        dice_type=damage_data.get('dice_sides', 6),
                        modifier=damage_data.get('modifier', 0),
                        damage_type=damage_data.get('damage_type', 'untyped')
                    )
                
                spell.add_effect(effect)
            
            return spell
            
        except Exception as e:
            print(f"⚠️ Error converting spell data: {e}")
            return None
    
    def get_spell(self, name: str) -> Optional[Spell]:
        """Get a spell by name"""
        return self.spells.get(name)
    
    def get_spells_by_level(self, level: int) -> List[Spell]:
        """Get all spells of a specific level"""
        return [spell for spell in self.spells.values() if spell.level == level]
    
    def get_spells_by_school(self, school: SpellSchool) -> List[Spell]:
        """Get all spells of a specific school"""
        return [spell for spell in self.spells.values() if spell.school == school]
    
    def get_spells_by_class(self, class_name: str) -> List[Spell]:
        """Get all spells available to a specific class"""
        return [spell for spell in self.spells.values() if class_name in spell.classes]
    
    def search_spells(self, query: str) -> List[Spell]:
        """Search spells by name or description"""
        query_lower = query.lower()
        results = []
        
        for spell in self.spells.values():
            if (query_lower in spell.name.lower() or 
                (spell.description and query_lower in spell.description.lower())):
                results.append(spell)
        
        return results
    
    def get_cantrips(self) -> List[Spell]:
        """Get all cantrips (level 0 spells)"""
        return self.get_spells_by_level(0)
    
    def get_ritual_spells(self) -> List[Spell]:
        """Get all ritual spells"""
        return [spell for spell in self.spells.values() if spell.ritual]
    
    def get_concentration_spells(self) -> List[Spell]:
        """Get all concentration spells"""
        return [spell for spell in self.spells.values() if spell.concentration]
    
    def get_damage_spells(self) -> List[Spell]:
        """Get all spells that deal damage"""
        return [spell for spell in self.spells.values() 
                if any(effect.damage_roll for effect in spell.effects)]
    
    def get_healing_spells(self) -> List[Spell]:
        """Get all healing spells"""
        return [spell for spell in self.spells.values() 
                if any(effect.damage_roll and effect.damage_roll.damage_type == 'healing' 
                       for effect in spell.effects)]
    
    def print_summary(self):
        """Print a summary of loaded spells"""
        if not self.spells:
            print("No spells loaded")
            return
        
        print(f"\n📚 Spell Library Summary")
        print(f"Total spells: {len(self.spells)}")
        
        if self.metadata:
            print(f"Export date: {self.metadata.get('export_date', 'Unknown')}")
            print(f"Format version: {self.metadata.get('format_version', 'Unknown')}")
        
        # Level distribution
        level_counts = {}
        for spell in self.spells.values():
            level = spell.level
            level_counts[level] = level_counts.get(level, 0) + 1
        
        print(f"\nSpells by level:")
        for level in sorted(level_counts.keys()):
            level_name = "Cantrips" if level == 0 else f"Level {level}"
            print(f"  {level_name}: {level_counts[level]}")
        
        # School distribution
        school_counts = {}
        for spell in self.spells.values():
            school = spell.school.value if spell.school else 'Unknown'
            school_counts[school] = school_counts.get(school, 0) + 1
        
        print(f"\nSpells by school:")
        for school, count in sorted(school_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"  {school}: {count}")
        
        # Special categories
        print(f"\nSpecial categories:")
        print(f"  Ritual spells: {len(self.get_ritual_spells())}")
        print(f"  Concentration spells: {len(self.get_concentration_spells())}")
        print(f"  Damage spells: {len(self.get_damage_spells())}")
        print(f"  Healing spells: {len(self.get_healing_spells())}")


def test_spell_loader():
    """Test the spell loader"""
    print("🧪 Testing Spell Loader")
    print("=" * 40)
    
    loader = SpellLoader()
    
    # Try to load from the exported JSON file
    json_file = "spellbook_optimized.json"
    if os.path.exists(json_file):
        success = loader.load_from_json(json_file)
        if success:
            loader.print_summary()
            
            # Test searches
            print(f"\n🔍 Search Examples:")
            
            # Search for fireball
            fireball_results = loader.search_spells("fireball")
            if fireball_results:
                print(f"Found 'fireball': {fireball_results[0].name}")
            
            # Get wizard spells
            wizard_spells = loader.get_spells_by_class("Wizard")
            print(f"Wizard spells: {len(wizard_spells)}")
            
            # Get cantrips
            cantrips = loader.get_cantrips()
            print(f"Cantrips: {len(cantrips)}")
            
            # Show some damage spells
            damage_spells = loader.get_damage_spells()
            if damage_spells:
                print(f"\nSample damage spells:")
                for spell in damage_spells[:3]:
                    damage_effects = [e for e in spell.effects if e.damage_roll]
                    if damage_effects:
                        damage = damage_effects[0].damage_roll
                        print(f"  {spell.name}: {damage.dice_count}d{damage.dice_type} {damage.damage_type}")
        else:
            print("Failed to load spells")
    else:
        print(f"JSON file not found: {json_file}")
        print("Run the spell exporter first to create the JSON file")


if __name__ == "__main__":
    test_spell_loader()
