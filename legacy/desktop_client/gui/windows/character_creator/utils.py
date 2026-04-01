#!/usr/bin/env python3
"""
Character Creator Utils - Shared utility functions for character creation
"""

from typing import Dict, List, Optional, Any
import json
import os
from imgui_bundle import imgui

from logger import setup_logger
logger = setup_logger(__name__)


class CharacterCreatorUtils:
    """Utility functions for character creation"""
    
    @staticmethod
    def load_compendium_data(context=None):
        """Load compendium data for races, classes, backgrounds, etc."""
        data = {
            'races': {},
            'classes': {},
            'backgrounds': {},
            'spells': {},
            'equipment': {}
        }
        
        try:
            # Use CompendiumManager if available
            if context and hasattr(context, 'CompendiumManager') and context.CompendiumManager:
                compendium = context.CompendiumManager
                
                # Get all races, classes, and backgrounds from compendium
                compendium_races = compendium.get_all_races()
                compendium_classes = compendium.get_all_classes()
                compendium_backgrounds = compendium.get_all_backgrounds()
                
                # Convert Race objects to dictionaries for UI
                for name, race in compendium_races.items():
                    race_id = name.lower().replace(' ', '_').replace("'", "")
                    data['races'][race_id] = {
                        'name': race.name,
                        'description': f"Size: {race.size.value}, Speed: {race.speed} ft",
                        'size': race.size.value,
                        'speed': race.speed,
                        'traits': [{'name': t.name, 'description': t.description} for t in race.traits],
                        'ability_score_increases': {asi.ability.value: asi.increase for asi in race.ability_score_increases},
                        'languages': race.languages,
                        'darkvision': race.darkvision,
                        'race_object': race
                    }
                
                # Convert CharacterClass objects to dictionaries for UI
                for name, char_class in compendium_classes.items():
                    class_id = name.lower().replace(' ', '_').replace("'", "")
                    data['classes'][class_id] = {
                        'name': char_class.name,
                        'description': f"Hit Die: d{char_class.hit_die}, Skills: {char_class.num_skills}",
                        'hit_die': char_class.hit_die,
                        'num_skills': char_class.num_skills,  # Add the missing num_skills field
                        'primary_abilities': [ability.value for ability in char_class.primary_abilities],
                        'saving_throws': [ability.value for ability in char_class.saving_throw_proficiencies],
                        'skill_proficiencies': [skill.value for skill in char_class.skill_proficiencies],
                        'armor_proficiencies': char_class.armor_proficiencies,
                        'weapon_proficiencies': char_class.weapon_proficiencies,
                        'class_object': char_class
                    }
                
                # Convert Background objects to dictionaries for UI
                for name, background in compendium_backgrounds.items():
                    bg_id = name.lower().replace(' ', '_').replace("'", "")
                    data['backgrounds'][bg_id] = {
                        'name': background.name,
                        'description': "Background with skills and equipment",
                        'skill_proficiencies': [skill.value for skill in background.skill_proficiencies],
                        'tool_proficiencies': background.tool_proficiencies,
                        'languages': background.language_proficiencies,
                        'equipment': background.equipment,
                        'features': [{'name': f.name, 'description': f.description} for f in background.features],
                        'background_object': background
                    }
                
                logger.info(f"Loaded from CompendiumManager: {len(data['races'])} races, {len(data['classes'])} classes, {len(data['backgrounds'])} backgrounds")
                return data
            
            # If no CompendiumManager, try to load directly from character loader
            character_data_file = os.path.join(os.path.dirname(__file__), 
                                             "../../../core_table/compendiums/characters/character_data.json")
            
            if os.path.exists(character_data_file):
                from core_table.compendiums.characters.character_loader import CharacterLoader
                
                # Initialize character loader with proper path
                data_dir = os.path.dirname(character_data_file)
                loader = CharacterLoader(data_dir)
                
                if loader.load_character_data("character_data.json"):
                    # Convert Race objects to dictionaries for UI - same as above
                    for name, race in loader.races.items():
                        race_id = name.lower().replace(' ', '_').replace("'", "")
                        data['races'][race_id] = {
                            'name': race.name,
                            'description': f"Size: {race.size.value}, Speed: {race.speed} ft",
                            'size': race.size.value,
                            'speed': race.speed,
                            'traits': [{'name': t.name, 'description': t.description} for t in race.traits],
                            'ability_score_increases': {asi.ability.value: asi.increase for asi in race.ability_score_increases},
                            'languages': race.languages,
                            'darkvision': race.darkvision,
                            'race_object': race
                        }
                    
                    # Convert CharacterClass objects to dictionaries for UI - same as above
                    for name, char_class in loader.classes.items():
                        class_id = name.lower().replace(' ', '_').replace("'", "")
                        data['classes'][class_id] = {
                            'name': char_class.name,
                            'description': f"Hit Die: d{char_class.hit_die}, Skills: {char_class.num_skills}",
                            'hit_die': char_class.hit_die,
                            'primary_abilities': [ability.value for ability in char_class.primary_abilities],
                            'saving_throws': [ability.value for ability in char_class.saving_throw_proficiencies],
                            'skill_proficiencies': [skill.value for skill in char_class.skill_proficiencies],
                            'armor_proficiencies': char_class.armor_proficiencies,
                            'weapon_proficiencies': char_class.weapon_proficiencies,
                            'class_object': char_class
                        }
                    
                    # Convert Background objects to dictionaries for UI - same as above
                    for name, background in loader.backgrounds.items():
                        bg_id = name.lower().replace(' ', '_').replace("'", "")
                        data['backgrounds'][bg_id] = {
                            'name': background.name,
                            'description': "Background with skills and equipment",
                            'skill_proficiencies': [skill.value for skill in background.skill_proficiencies],
                            'tool_proficiencies': background.tool_proficiencies,
                            'languages': background.language_proficiencies,
                            'equipment': background.equipment,
                            'features': [{'name': f.name, 'description': f.description} for f in background.features],
                            'background_object': background
                        }
                    
            
            # If all else fails, fallback to default data
            logger.error("No compendium data available - CompendiumManager not found and character data file missing")
            data['races'] = CharacterCreatorUtils.get_default_races()
            data['classes'] = CharacterCreatorUtils.get_default_classes()
            data['backgrounds'] = CharacterCreatorUtils.get_default_backgrounds()
            
        except Exception as e:
            logger.error(f"Error loading compendium data: {e}")
            # Add default data if nothing loaded
            data['races'] = CharacterCreatorUtils.get_default_races()
            data['classes'] = CharacterCreatorUtils.get_default_classes()
            data['backgrounds'] = CharacterCreatorUtils.get_default_backgrounds()
            
        return data
    
    @staticmethod
    def get_default_races():
        """Get default race data if compendium not available"""
        return {
            "Human": {
                "name": "Human",
                "size": "Medium",
                "speed": 30,
                "ability_score_increases": {"All": 1},
                "traits": ["Extra Language", "Extra Skill"],
                "description": "Versatile and adaptable, humans are the most common race."
            },
            "Elf": {
                "name": "Elf", 
                "size": "Medium",
                "speed": 30,
                "ability_score_increases": {"DEX": 2},
                "traits": ["Darkvision", "Keen Senses", "Fey Ancestry", "Trance"],
                "description": "Graceful and long-lived, elves are masters of magic and nature."
            },
            "Dwarf": {
                "name": "Dwarf",
                "size": "Medium", 
                "speed": 25,
                "ability_score_increases": {"CON": 2},
                "traits": ["Darkvision", "Dwarven Resilience", "Stonecunning"],
                "description": "Stout and hardy, dwarves are known for their craftsmanship."
            },
            "Halfling": {
                "name": "Halfling",
                "size": "Small",
                "speed": 25,
                "ability_score_increases": {"DEX": 2},
                "traits": ["Lucky", "Brave", "Halfling Nimbleness"],
                "description": "Small and cheerful, halflings are naturally lucky."
            }
        }
    
    @staticmethod
    def get_default_classes():
        """Get default class data if compendium not available"""
        return {
            "Fighter": {
                "name": "Fighter",
                "hit_die": "d10",
                "primary_ability": ["STR", "DEX"],
                "saving_throws": ["STR", "CON"],
                "skills": ["Acrobatics", "Animal Handling", "Athletics", "History", "Insight", "Intimidation", "Perception", "Survival"],
                "skill_choices": 2,
                "description": "Masters of martial combat, skilled with a variety of weapons and armor."
            },
            "Wizard": {
                "name": "Wizard",
                "hit_die": "d6", 
                "primary_ability": ["INT"],
                "saving_throws": ["INT", "WIS"],
                "skills": ["Arcana", "History", "Insight", "Investigation", "Medicine", "Religion"],
                "skill_choices": 2,
                "description": "Scholarly magic-users capable of manipulating the structures of spellcasting."
            },
            "Rogue": {
                "name": "Rogue",
                "hit_die": "d8",
                "primary_ability": ["DEX"],
                "saving_throws": ["DEX", "INT"],
                "skills": ["Acrobatics", "Athletics", "Deception", "Insight", "Intimidation", "Investigation", "Perception", "Performance", "Persuasion", "Sleight of Hand", "Stealth"],
                "skill_choices": 4,
                "description": "Scoundrels who use stealth and trickery to overcome obstacles."
            },
            "Cleric": {
                "name": "Cleric",
                "hit_die": "d8",
                "primary_ability": ["WIS"],
                "saving_throws": ["WIS", "CHA"],
                "skills": ["History", "Insight", "Medicine", "Persuasion", "Religion"],
                "skill_choices": 2,
                "description": "Priestly champions who wield divine magic in service of higher powers."
            }
        }
    
    @staticmethod
    def get_default_backgrounds():
        """Get default background data if compendium not available"""
        return {
            "Acolyte": {
                "name": "Acolyte",
                "skills": ["Insight", "Religion"],
                "languages": 2,
                "equipment": ["Holy symbol", "Prayer book", "Incense"],
                "description": "You have spent your life in service to a temple."
            },
            "Criminal": {
                "name": "Criminal", 
                "skills": ["Deception", "Stealth"],
                "tools": ["Thieves' tools", "Gaming set"],
                "equipment": ["Crowbar", "Dark clothes", "Belt pouch"],
                "description": "You are an experienced criminal with a history of breaking the law."
            },
            "Folk Hero": {
                "name": "Folk Hero",
                "skills": ["Animal Handling", "Survival"],
                "tools": ["Artisan's tools", "Vehicles (land)"],
                "equipment": ["Artisan's tools", "Shovel", "Set of clothes"],
                "description": "You come from humble social rank but are destined for much more."
            },
            "Noble": {
                "name": "Noble",
                "skills": ["History", "Persuasion"],
                "tools": ["Gaming set"],
                "languages": 1,
                "equipment": ["Signet ring", "Fine clothes", "Purse"],
                "description": "You understand wealth, power, and privilege."
            }
        }
    
    @staticmethod
    def calculate_modifier(score: int) -> int:
        """Calculate ability score modifier"""
        return (score - 10) // 2
    
    @staticmethod
    def format_modifier(modifier: int) -> str:
        """Format modifier with + or - sign"""
        return f"+{modifier}" if modifier >= 0 else str(modifier)
    
    @staticmethod
    def render_ability_score_display(label: str, score: int, can_modify: bool = False):
        """Render an ability score with modifier"""
        modifier = CharacterCreatorUtils.calculate_modifier(score)
        modifier_text = CharacterCreatorUtils.format_modifier(modifier)
        
        imgui.begin_group()
        imgui.text(label)
        
        if can_modify:
            imgui.set_next_item_width(60)
            changed, new_score = imgui.input_int(f"##{label}_score", score, 0, 0)
            if changed:
                score = max(1, min(30, new_score))
        else:
            imgui.text(f"  {score:2d}")
            
        imgui.text(f"({modifier_text})")
        imgui.end_group()
        
        return score
    
    @staticmethod
    def render_help_tooltip(text: str):
        """Render a help tooltip when item is hovered"""
        if imgui.is_item_hovered():
            imgui.set_tooltip(text)
    
    @staticmethod
    def get_proficiency_bonus(level: int) -> int:
        """Calculate proficiency bonus based on level"""
        return 2 + ((level - 1) // 4)
    
    @staticmethod
    def get_standard_array() -> List[int]:
        """Get the standard ability score array"""
        return [15, 14, 13, 12, 10, 8]
    
    @staticmethod
    def roll_ability_scores() -> List[int]:
        """Roll 4d6 drop lowest for ability scores"""
        import random
        scores = []
        for _ in range(6):
            rolls = [random.randint(1, 6) for _ in range(4)]
            rolls.sort(reverse=True)
            scores.append(sum(rolls[:3]))  # Take highest 3
        return scores
    
    @staticmethod
    def get_point_buy_costs() -> Dict[int, int]:
        """Get point buy costs for ability scores"""
        return {
            8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 
            14: 7, 15: 9
        }
    
    @staticmethod
    def calculate_point_buy_total(scores: Dict[str, int]) -> int:
        """Calculate total points spent in point buy"""
        costs = CharacterCreatorUtils.get_point_buy_costs()
        total = 0
        for score in scores.values():
            total += costs.get(score, 0)
        return total
    
    @staticmethod
    def get_all_skills() -> List[str]:
        """Get all D&D 5e skills"""
        return [
            "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception",
            "History", "Insight", "Intimidation", "Investigation", "Medicine",
            "Nature", "Perception", "Performance", "Persuasion", "Religion",
            "Sleight of Hand", "Stealth", "Survival"
        ]
    
    @staticmethod
    def get_skill_ability_mapping() -> Dict[str, str]:
        """Get the ability score associated with each skill"""
        return {
            "Acrobatics": "DEX",
            "Animal Handling": "WIS",
            "Arcana": "INT",
            "Athletics": "STR",
            "Deception": "CHA",
            "History": "INT",
            "Insight": "WIS",
            "Intimidation": "CHA",
            "Investigation": "INT",
            "Medicine": "WIS",
            "Nature": "INT",
            "Perception": "WIS",
            "Performance": "CHA",
            "Persuasion": "CHA",
            "Religion": "INT",
            "Sleight of Hand": "DEX",
            "Stealth": "DEX",
            "Survival": "WIS"
        }
