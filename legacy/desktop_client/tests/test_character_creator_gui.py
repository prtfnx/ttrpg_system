#!/usr/bin/env python3
"""
Test script to check character creator with actual GUI
"""

import sys
import os
sys.path.append(os.path.dirname(__file__))

from imgui_bundle import imgui, hello_imgui
from gui.windows.character_creator import CharacterCreator
from CompendiumManager import CompendiumManager

class MockContext:
    def __init__(self):
        self.CompendiumManager = CompendiumManager()
        # Load character data
        self.CompendiumManager.load_characters()

def main():
    # Create context and character creator
    context = MockContext()
    creator = CharacterCreator(context=context)
    
    # Open the creator
    creator.open_creator()
    
    def gui_function():
        # Main menu bar
        if imgui.begin_main_menu_bar():
            if imgui.begin_menu("Character"):
                if imgui.menu_item("Open Creator")[0]:
                    creator.open_creator()
                imgui.end_menu()
            imgui.end_main_menu_bar()
        
        # Render the character creator
        creator.render()
        
        # Debug information
        if imgui.begin("Debug Info"):
            imgui.text(f"Current step: {creator.current_step.name}")
            imgui.text(f"Race selected: {creator.character_data['race'] is not None}")
            imgui.text(f"Class selected: {creator.character_data['class'] is not None}")
            imgui.text(f"Background selected: {creator.character_data['background'] is not None}")
            
            imgui.separator()
            imgui.text("Navigation Test:")
            next_step_value = creator.current_step.value + 1
            can_go_forward = (next_step_value < len(creator.current_step.__class__) and 
                             creator._can_access_step(creator.current_step.__class__(next_step_value)))
            imgui.text(f"Can go forward: {can_go_forward}")
            
            if creator.character_data['race']:
                imgui.text(f"Selected race: {creator.character_data['race'].get('name', 'Unknown')}")
            if creator.character_data['class']:
                imgui.text(f"Selected class: {creator.character_data['class'].get('name', 'Unknown')}")
        
        imgui.end()
    
    # Run the GUI
    runner_params = hello_imgui.RunnerParams()
    runner_params.app_window_params.window_title = "Character Creator Test"
    runner_params.app_window_params.window_geometry.size = (1200, 800)
    runner_params.callbacks.show_gui = gui_function
    
    hello_imgui.run(runner_params)

if __name__ == "__main__":
    main()
