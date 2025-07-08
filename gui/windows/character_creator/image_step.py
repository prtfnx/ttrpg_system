#!/usr/bin/env python3
"""
Image Step - Character image selection step for character creation
"""

import os
import sys
import subprocess
from imgui_bundle import imgui, portable_file_dialogs
from typing import Dict, List, Optional, Any
from pathlib import Path

from logger import setup_logger
logger = setup_logger(__name__)


class ImageStep:
    """Character image selection step for character creation"""
    
    def __init__(self, character_data: Dict, compendium_data: Dict):
        self.character_data = character_data
        self.compendium_data = compendium_data
        
        # Initialize image data if not present
        if 'selected_image' not in self.character_data:
            self.character_data['selected_image'] = ""
        
        self.selected_image_path = self.character_data['selected_image']
        self.image_preview_text = "No image selected"
        
        # File dialog state
        self.file_dialog_open = False
        
        # Update preview text if image already selected
        if self.selected_image_path:
            self.image_preview_text = f"Selected: {Path(self.selected_image_path).name}"
    
    def render(self) -> bool:
        """Render the image step. Returns True if step is complete."""
        imgui.text("Select character image:")
        imgui.separator()
        
        # Image selection
        imgui.text("Character Token/Avatar Image:")
        imgui.text(self.image_preview_text)
        
        imgui.spacing()
        
        if imgui.button("Browse for Image", (200, 40)):
            self._open_file_dialog()
        
        imgui.same_line()
        if imgui.button("Browse Images Folder", (200, 40)):
            self._open_images_folder()
        
        imgui.same_line()
        if imgui.button("Clear Selection", (150, 40)):
            self._clear_selection()
        
        # Show drag-drop hint
        imgui.separator()
        imgui.text("Note: This image will be used as your character's token on the table.")
        imgui.text("Supported formats: PNG, JPG, JPEG, GIF, BMP")
        imgui.text("Tip: You can also drag and drop image files into the application.")
        
        # Manual path input as alternative
        imgui.separator()
        imgui.text("Or enter image path manually:")
        imgui.set_next_item_width(400)
        changed, new_path = imgui.input_text("##manual_path", self.selected_image_path or "")
        if changed:
            self._set_image_path(new_path)
        
        return True  # Always complete - image selection is optional
    
    def _open_images_folder(self):
        """Open the images folder in system file manager"""
        try:
            # Create images folder if it doesn't exist
            images_folder = Path("resources/images")
            images_folder.mkdir(parents=True, exist_ok=True)
            
            # Open folder in system file manager
            if sys.platform == "win32":
                subprocess.run(['explorer', str(images_folder)], shell=True)
            elif sys.platform == "darwin":
                subprocess.run(['open', str(images_folder)])
            else:
                subprocess.run(['xdg-open', str(images_folder)])
                
            logger.info(f"Opened images folder: {images_folder}")
            
        except Exception as e:
            logger.error(f"Error opening images folder: {e}")
    
    def _set_image_path(self, path: str):
        """Set the image path and update UI"""
        if path and Path(path).exists() and Path(path).is_file():
            self.selected_image_path = path
            self.character_data['selected_image'] = path
            self.image_preview_text = f"Selected: {Path(path).name}"
            logger.debug(f"Set character image: {path}")
        elif path:
            self.image_preview_text = "File not found or invalid"
            logger.warning(f"Invalid image path: {path}")
        else:
            self.selected_image_path = ""
            self.character_data['selected_image'] = ""
            self.image_preview_text = "No image selected"

    def _clear_selection(self):
        """Clear the selected image"""
        self.selected_image_path = ""
        self.character_data['selected_image'] = ""
        self.image_preview_text = "No image selected"
        logger.debug("Cleared character image selection")
    
    def get_completion_status(self) -> str:
        """Get a string describing the completion status"""
        if self.selected_image_path:
            return f"Image: {Path(self.selected_image_path).name}"
        return "Image: Optional"
    
    def is_complete(self) -> bool:
        """Check if this step is complete"""
        return True  # Always complete - image selection is optional
    
    def get_selected_image(self) -> str:
        """Get the selected image path"""
        return self.selected_image_path
    
    def _open_file_dialog(self):
        """Open file dialog to select character image"""
        try:
            # Use portable_file_dialogs for cross-platform file selection
            result = portable_file_dialogs.open_file(
                "Select Character Image",
                ".",
                ["Image Files", "*.png *.jpg *.jpeg *.gif *.bmp", "All Files", "*"]
            )
            
            if result and result.result() and len(result.result()) > 0:
                file_path = result.result()[0]
                if file_path:
                    self._set_image_path(str(file_path))
                    logger.info(f"Selected character image via file dialog: {file_path}")
            
        except Exception as e:
            logger.error(f"Error opening file dialog: {e}")
            self.image_preview_text = "Error opening file dialog"
    
    def _handle_file_dialog(self):
        """Handle file dialog results - no longer needed with portable_file_dialogs"""
        pass
