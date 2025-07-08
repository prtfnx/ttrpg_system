#!/usr/bin/env python3
"""
Equipment Step - Equipment selection step for character creation
"""

from imgui_bundle import imgui
from typing import Dict, List, Optional, Any
from .utils import CharacterCreatorUtils

from logger import setup_logger
logger = setup_logger(__name__)


class EquipmentStep:
    """Equipment selection step for character creation"""
    
    def __init__(self, character_data: Dict, compendium_data: Dict):
        self.character_data = character_data
        self.compendium_data = compendium_data
        
        # Initialize equipment if not present
        if 'equipment' not in self.character_data:
            self.character_data['equipment'] = []
        
        self.equipment_list = self.character_data['equipment']
        self.new_item_name = ""
    
    def render(self) -> bool:
        """Render the equipment step. Returns True if step is complete."""
        imgui.text("Manage your character's equipment:")
        imgui.separator()
        
        # Starting equipment from class and background
        self._render_starting_equipment()
        imgui.separator()
        
        # Custom equipment
        self._render_custom_equipment()
        
        return True  # Always complete - equipment is optional
    
    def _render_starting_equipment(self):
        """Render starting equipment from class and background"""
        imgui.text("Starting Equipment:")
        
        # Equipment from class
        class_name = self.character_data.get('character_class', '')
        if class_name:
            imgui.text(f"From {class_name}:")
            
            # Add default equipment for each class since compendium doesn't have it structured
            default_class_equipment = self._get_default_class_equipment(class_name)
            
            if default_class_equipment:
                for item in default_class_equipment:
                    imgui.bullet_text(item)
                    # Auto-add to character equipment if not already there
                    if item not in self.equipment_list:
                        self.equipment_list.append(item)
            else:
                imgui.text("  No starting equipment defined")
        
        # Equipment from background
        bg_name = self.character_data.get('background', '')
        if bg_name:
            imgui.text(f"From {bg_name}:")
            
            # Add default equipment for each background since compendium doesn't have it structured
            default_bg_equipment = self._get_default_background_equipment(bg_name)
            
            if default_bg_equipment:
                for item in default_bg_equipment:
                    imgui.bullet_text(item)
                    # Auto-add to character equipment if not already there
                    if item not in self.equipment_list:
                        self.equipment_list.append(item)
            else:
                imgui.text("  No starting equipment defined")
    
    def _render_custom_equipment(self):
        """Render custom equipment management"""
        imgui.text("Additional Equipment:")
        
        # Add new item
        imgui.text("Add Item:")
        imgui.same_line()
        imgui.set_next_item_width(200)
        changed, self.new_item_name = imgui.input_text("##new_item", self.new_item_name)
        
        imgui.same_line()
        add_clicked = imgui.button("Add")
        if add_clicked and self.new_item_name.strip():
            self.equipment_list.append(self.new_item_name.strip())
            self.new_item_name = ""
        
        imgui.separator()
        
        # Equipment list with delete buttons
        imgui.begin_child("equipment_list", (0, 300), True)
        items_to_remove = []
        
        for i, item in enumerate(self.equipment_list):
            remove_clicked = imgui.button(f"X##{i}", (25, 25))
            if remove_clicked:
                items_to_remove.append(i)
            
            imgui.same_line()
            imgui.text(item)
        
        # Remove items (in reverse order to maintain indices)
        for i in reversed(items_to_remove):
            del self.equipment_list[i]
        
        imgui.end_child()
    
    def get_completion_status(self) -> str:
        """Get a string describing the completion status"""
        item_count = len(self.equipment_list)
        return f"Equipment: {item_count} items"
    
    def is_complete(self) -> bool:
        """Check if this step is complete"""
        return True  # Always complete - equipment is optional
    
    def _get_default_class_equipment(self, class_name: str) -> List[str]:
        """Get default starting equipment for a class"""
        class_equipment = {
            "Barbarian": ["Greataxe", "Handaxes (2)", "Javelin (4)", "Explorer's Pack", "Leather Armor", "Shield"],
            "Fighter": ["Chain Mail", "Shield", "Martial Weapon", "Simple Weapon", "Light Crossbow", "Bolts (20)", "Dungeoneer's Pack"],
            "Ranger": ["Studded Leather", "Shield", "Scimitar", "Handaxe (2)", "Longbow", "Arrows (20)", "Dungeoneer's Pack"],
            "Rogue": ["Leather Armor", "Shortsword", "Dagger (2)", "Thieves' Tools", "Burglar's Pack", "Shortbow", "Arrows (20)"],
            "Wizard": ["Quarterstaff", "Dagger", "Component Pouch", "Scholar's Pack", "Leather Armor", "Simple Weapon"],
            "Cleric": ["Scale Mail", "Shield", "Light Crossbow", "Bolts (20)", "Simple Weapon", "Priest's Pack"],
            "Bard": ["Leather Armor", "Dagger", "Simple Weapon", "Lute", "Entertainer's Pack"],
            "Druid": ["Leather Armor", "Shield", "Scimitar", "Simple Weapon", "Dungeoneer's Pack"],
            "Monk": ["Shortsword", "Simple Weapon", "Dart (10)", "Dungeoneer's Pack"],
            "Paladin": ["Chain Mail", "Shield", "Martial Weapon", "Javelin (5)", "Priest's Pack"],
            "Sorcerer": ["Dagger (2)", "Simple Weapon", "Light Crossbow", "Bolts (20)", "Dungeoneer's Pack"],
            "Warlock": ["Leather Armor", "Simple Weapon", "Dagger (2)", "Simple Weapon", "Scholar's Pack"]
        }
        return class_equipment.get(class_name, [])
    
    def _get_default_background_equipment(self, background_name: str) -> List[str]:
        """Get default starting equipment for a background"""
        background_equipment = {
            "Acolyte": ["Holy Symbol", "Prayer Book", "Incense (5)", "Vestments", "Common Clothes", "Belt Pouch (15 gp)"],
            "Criminal": ["Crowbar", "Dark Common Clothes", "Belt Pouch (15 gp)"],
            "Folk Hero": ["Artisan's Tools", "Shovel", "Iron Pot", "Common Clothes", "Belt Pouch (10 gp)"],
            "Noble": ["Signet Ring", "Scroll of Pedigree", "Fine Clothes", "Purse (25 gp)"],
            "Sage": ["Ink", "Quill", "Small Knife", "Letter", "Common Clothes", "Belt Pouch (10 gp)"],
            "Soldier": ["Insignia of Rank", "Trophy", "Deck of Cards", "Common Clothes", "Belt Pouch (10 gp)"],
            "Charlatan": ["Fine Clothes", "Disguise Kit", "Con Tools", "Belt Pouch (15 gp)"],
            "Entertainer": ["Musical Instrument", "Favor of Admirer", "Costume", "Belt Pouch (15 gp)"],
            "Guild Artisan": ["Artisan's Tools", "Letter of Introduction", "Traveler's Clothes", "Belt Pouch (15 gp)"],
            "Hermit": ["Herbalism Kit", "Scroll", "Common Clothes", "Belt Pouch (5 gp)"],
            "Outlander": ["Staff", "Hunting Trap", "Traveler's Clothes", "Belt Pouch (10 gp)"],
            "Sailor": ["Belaying Pin", "Silk Rope (50 feet)", "Lucky Charm", "Common Clothes", "Belt Pouch (10 gp)"]
        }
        return background_equipment.get(background_name, [])
