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
        
        # Get starting equipment from class
        class_name = self.character_data.get('character_class', '')
        if class_name and class_name in self.compendium_data.get('classes', {}):
            class_data = self.compendium_data['classes'][class_name]
            class_equipment = class_data.get('equipment', [])
            
            if class_equipment:
                imgui.text(f"From {class_name}:")
                for item in class_equipment:
                    imgui.bullet_text(item)
        
        # Get starting equipment from background
        bg_name = self.character_data.get('background', '')
        if bg_name and bg_name in self.compendium_data.get('backgrounds', {}):
            bg_data = self.compendium_data['backgrounds'][bg_name]
            bg_equipment = bg_data.get('equipment', [])
            
            if bg_equipment:
                imgui.text(f"From {bg_name}:")
                for item in bg_equipment:
                    imgui.bullet_text(item)
    
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
        return f"Equipment: {item_count} custom items"
    
    def is_complete(self) -> bool:
        """Check if this step is complete"""
        return True  # Always complete - equipment is optional
