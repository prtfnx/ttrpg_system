#!/usr/bin/env python3
"""
Compendium GUI Components
Enhanced GUI components for D&D 5e compendium integration
"""


from typing import List, Dict, Any, Optional
from imgui_bundle import imgui

from logger import setup_logger
logger = setup_logger(__name__)

class CompendiumPanel:
    """GUI panel for browsing and managing compendium content"""
    
    def __init__(self):
        self.search_query = ""
        self.selected_tab = 0  # 0=Monsters, 1=Characters, 2=Equipment, 3=Spells
        self.selected_monster = None
        self.selected_race = None
        self.selected_class = None
        self.selected_equipment = None
        self.selected_spell = None
        
        # Search results
        self.monster_results = []
        self.character_results = []
        self.equipment_results = []
        self.spell_results = []
        
        # Filters
        self.monster_cr_filter = ""
        self.spell_level_filter = -1
        self.equipment_type_filter = ""
        
    def render(self, context) -> bool:
        """Render the compendium panel with proper error handling"""
        try:
            # Header
            imgui.text("D&D 5e Reference")
            imgui.separator()
            
            # Tab selection with proper cleanup
            tab_bar_open = imgui.begin_tab_bar("CompendiumTabs")
            if tab_bar_open:
                try:
                    if imgui.begin_tab_item("Monsters")[0]:
                        try:
                            self._render_monster_tab(context)
                        finally:
                            imgui.end_tab_item()
                    
                    if imgui.begin_tab_item("Characters")[0]:
                        try:
                            self._render_character_tab(context)
                        finally:
                            imgui.end_tab_item()
                    
                    if imgui.begin_tab_item("Equipment")[0]:
                        try:
                            self._render_equipment_tab(context)
                        finally:
                            imgui.end_tab_item()
                    
                    if imgui.begin_tab_item("Spells")[0]:
                        try:
                            self._render_spell_tab(context)
                        finally:
                            imgui.end_tab_item()
                finally:
                    imgui.end_tab_bar()
            
            return True
            
        except Exception as e:
            logger.error(f"Error in compendium render: {e}")
            imgui.text_colored((1, 0, 0, 1), f"Compendium error: {e}")
            return False
    
    def _render_monster_tab(self, context):
        """Render monster browser tab"""
        cm = context.compendium_manager
        
        if not cm.available_systems['monsters']:
            imgui.text("Monster system not available")
            return
        
        # Search and filters
        imgui.text("Search Monsters:")
        changed, self.search_query = imgui.input_text("##monster_search", self.search_query)
        
        imgui.same_line()
        if imgui.button("Search##monsters"):
            changed = True
        
        # CR Filter
        imgui.text("Challenge Rating:")
        cr_changed, self.monster_cr_filter = imgui.input_text("##cr_filter", self.monster_cr_filter)
        
        if changed or cr_changed:
            self._search_monsters(cm)
        
        imgui.separator()
        
        # Results list
        if self.monster_results:
            imgui.text(f"Found {len(self.monster_results)} monsters:")
            
            if imgui.begin_child("MonsterList", size=(0,200)):
                print(f"Monster results: {self.monster_results}")
                for i, monster in enumerate(self.monster_results):
                    name = getattr(monster, 'name', 'Unknown')
                    cr = getattr(monster, 'challenge_rating', '?')
                    
                    if imgui.selectable(f"{name} (CR {cr})##monster_{i}", self.selected_monster == monster):
                        #TODO fix logic
                        self.selected_monster = monster
                
                imgui.end_child()
        
        # Selected monster details
        if self.selected_monster:
            imgui.separator()
            self._render_monster_details()
    
    def _render_character_tab(self, context):
        """Render character creation/browser tab"""
        cm = context.compendium_manager
        
        if not cm.available_systems['characters']:
            imgui.text("Character system not available")
            return
        
        # Sub-tabs for races, classes, backgrounds
        if imgui.begin_tab_bar("CharacterSubTabs"):
            if imgui.begin_tab_item("Races"):
                self._render_race_browser(cm)
                imgui.end_tab_item()
            
            if imgui.begin_tab_item("Classes"):
                self._render_class_browser(cm)
                imgui.end_tab_item()
            
            if imgui.begin_tab_item("Backgrounds"):
                self._render_background_browser(cm)
                imgui.end_tab_item()
            
            imgui.end_tab_bar()
    
    def _render_equipment_tab(self, context):
        """Render equipment browser tab"""
        cm = context.compendium_manager
        
        if not cm.available_systems['equipment']:
            imgui.text("Equipment system not available")
            return
        
        # Search
        imgui.text("Search Equipment:")
        changed, self.search_query = imgui.input_text("##equipment_search", self.search_query)
        
        imgui.same_line()
        if imgui.button("Search##equipment"):
            changed = True
        
        # Type filter
        imgui.text("Type Filter:")
        type_changed, self.equipment_type_filter = imgui.input_text("##type_filter", self.equipment_type_filter)
        
        if changed or type_changed:
            self._search_equipment(cm)
        
        imgui.separator()
        
        # Results
        if self.equipment_results:
            imgui.text(f"Found {len(self.equipment_results)} items:")
            
            if imgui.begin_child("EquipmentList", size=(0,200)):
                for i, item in enumerate(self.equipment_results):
                    name = getattr(item, 'name', 'Unknown')
                    item_type = getattr(item, 'type', 'Unknown')
                    
                    if imgui.selectable(f"{name} ({item_type})##equipment_{i}", self.selected_equipment == item):
                        self.selected_equipment = item
                
                imgui.end_child()
        
        # Selected item details
        if self.selected_equipment:
            imgui.separator()
            self._render_equipment_details()
    
    def _render_spell_tab(self, context):
        """Render spell browser tab"""
        cm = context.compendium_manager
        
        if not cm.available_systems['spells']:
            imgui.text("Spell system not available")
            return
        
        # Search and filters
        imgui.text("Search Spells:")
        changed, self.search_query = imgui.input_text("##spell_search", self.search_query)
        
        imgui.same_line()
        if imgui.button("Search##spells"):
            changed = True
        
        # Level filter
        imgui.text("Spell Level:")
        level_items = ["All"] + [str(i) for i in range(10)]
        level_changed, selected_level = imgui.combo("##level_filter", self.spell_level_filter + 1, level_items)
        if level_changed:
            self.spell_level_filter = selected_level - 1
        
        if changed or level_changed:
            self._search_spells(cm)
        
        imgui.separator()
        
        # Results
        if self.spell_results:
            imgui.text(f"Found {len(self.spell_results)} spells:")
            
            if imgui.begin_child("SpellList", size=(0,200)):
                for i, spell in enumerate(self.spell_results):
                    name = getattr(spell, 'name', 'Unknown')
                    level = getattr(spell, 'level', '?')
                    
                    if imgui.selectable(f"{name} (Level {level})##spell_{i}", self.selected_spell == spell):
                        self.selected_spell = spell
                
                imgui.end_child()
        
        # Selected spell details
        if self.selected_spell:
            imgui.separator()
            self._render_spell_details()
    
    def _search_monsters(self, cm):
        """Search for monsters"""
        try:
            if self.monster_cr_filter:
                # Search by CR
                self.monster_results = cm.get_monsters_by_cr(self.monster_cr_filter)
            elif self.search_query:
                # Search by name/description
                self.monster_results = cm.search_monsters(self.search_query, 50)
            else:
                # Default: show first 20 monsters
                self.monster_results = list(cm.bestiary.monsters.values())[:20] if cm.bestiary else []
        except Exception as e:
            logger.error(f"Monster search failed: {e}")
            self.monster_results = []
    
    def _search_equipment(self, cm):
        """Search for equipment"""
        try:
            if self.search_query:
                self.equipment_results = cm.search_equipment(self.search_query, self.equipment_type_filter or None)
            else:
                # Show first 20 items
                self.equipment_results = list(cm.equipment_loader.all_items.values())[:20] if cm.equipment_loader else []
        except Exception as e:
            logger.error(f"Equipment search failed: {e}")
            self.equipment_results = []
    
    def _search_spells(self, cm):
        """Search for spells"""
        try:
            level = self.spell_level_filter if self.spell_level_filter >= 0 else None
            if self.search_query:
                self.spell_results = cm.search_spells(self.search_query, level)
            elif level is not None:
                self.spell_results = cm.get_spells_by_level(level)
            else:
                # Show first 20 spells
                self.spell_results = list(cm.spell_loader.spells.values())[:20] if cm.spell_loader else []
        except Exception as e:
            logger.error(f"Spell search failed: {e}")
            self.spell_results = []
    
    def _render_race_browser(self, cm):
        """Render race browser"""
        imgui.text("Search Races:")
        changed, query = imgui.input_text("##race_search", "")
        
        if changed and query:
            races = cm.search_races(query)
            if races and imgui.begin_child("RaceList", size=(0,150)):
                for i, race in enumerate(races):
                    name = getattr(race, 'name', 'Unknown')
                    if imgui.selectable(f"{name}##race_{i}", self.selected_race == race):
                        self.selected_race = race
                imgui.end_child()
        
        if self.selected_race:
            imgui.separator()
            imgui.text(f"Selected: {getattr(self.selected_race, 'name', 'Unknown')}")
            
            if imgui.button("Add to Table"):
                self._add_race_to_table()
    
    def _render_class_browser(self, cm):
        """Render class browser"""
        imgui.text("Search Classes:")
        changed, query = imgui.input_text("##class_search", "")
        
        if changed and query:
            classes = cm.search_classes(query)
            if classes and imgui.begin_child("ClassList", size=(150,0)):
                for i, char_class in enumerate(classes):
                    name = getattr(char_class, 'name', 'Unknown')
                    if imgui.selectable(f"{name}##class_{i}", self.selected_class == char_class):
                        self.selected_class = char_class
                imgui.end_child()
        
        if self.selected_class:
            imgui.separator()
            imgui.text(f"Selected: {getattr(self.selected_class, 'name', 'Unknown')}")
    
    def _render_background_browser(self, cm):
        """Render background browser"""
        imgui.text("Background selection coming soon...")
    
    def _render_monster_details(self):
        """Render detailed monster information"""
        monster = self.selected_monster
        imgui.text(f"Monster: {getattr(monster, 'name', 'Unknown')}")
        imgui.text(f"CR: {getattr(monster, 'challenge_rating', '?')}")
        imgui.text(f"Type: {getattr(monster, 'type', '?')}")
        imgui.text(f"HP: {getattr(monster, 'hit_points', '?')}")
        imgui.text(f"AC: {getattr(monster, 'armor_class', '?')}")
        
        if imgui.button("Add to Table"):
            self._add_monster_to_table()
    
    def _render_equipment_details(self):
        """Render detailed equipment information"""
        item = self.selected_equipment
        imgui.text(f"Item: {getattr(item, 'name', 'Unknown')}")
        imgui.text(f"Type: {getattr(item, 'type', '?')}")
        
        if hasattr(item, 'cost'):
            imgui.text(f"Cost: {item.cost}")
        if hasattr(item, 'weight'):
            imgui.text(f"Weight: {item.weight}")
    
    def _render_spell_details(self):
        """Render detailed spell information"""
        spell = self.selected_spell
        imgui.text(f"Spell: {getattr(spell, 'name', 'Unknown')}")
        imgui.text(f"Level: {getattr(spell, 'level', '?')}")
        imgui.text(f"School: {getattr(spell, 'school', '?')}")
        
        if hasattr(spell, 'description'):
            imgui.text("Description:")
            imgui.text_wrapped(spell.description[:200] + "..." if len(spell.description) > 200 else spell.description)
        
        if imgui.button("Cast Spell Effect"):
            self._cast_spell_effect()
    
    def _add_monster_to_table(self):
        """Add selected monster to the current table"""
        # This would integrate with the main application's sprite system
        logger.info(f"Adding monster {self.selected_monster.name} to table")
        # TODO: Implement actual monster addition
    
    def _add_race_to_table(self):
        """Add selected race to character creation"""
        logger.info(f"Selected race: {self.selected_race.name}")
        # TODO: Implement character creation integration
    
    def _cast_spell_effect(self):
        """Create spell effect on table"""
        logger.info(f"Casting spell: {self.selected_spell.name}")
        # TODO: Implement spell effect creation


class CompendiumQuickAccess:
    """Quick access panel for frequently used compendium features"""
    
    def __init__(self):
        self.quick_search = ""
        self.quick_results = []
    
    def render(self, context) -> bool:
        """Render quick access panel"""
        if not context.compendium_manager:
            return False
        
        imgui.text("Quick Search:")
        changed, self.quick_search = imgui.input_text("##quick_search", self.quick_search)
        
        if changed and len(self.quick_search) >= 3:
            self._quick_search(context.compendium_manager)
        
        # Show results
        if self.quick_results:
            imgui.separator()
            imgui.text("Quick Results:")
            
            if imgui.begin_child("QuickResults", size=(0,200)):
                for category, items in self.quick_results.items():
                    if items:
                        imgui.text(f"{category.title()}:")
                        for item in items[:3]:  # Show max 3 per category
                            name = getattr(item, 'name', 'Unknown')
                            if imgui.selectable(f"  {name}##quick_{category}_{name}", self.selected_equipment == item):
                                self._quick_select(item, category)
                
                imgui.end_child()
        
        return True
    
    def _quick_search(self, cm):
        """Perform quick search across all systems"""
        try:
            self.quick_results = cm.search_all(self.quick_search, 3)
        except Exception as e:
            logger.error(f"Quick search failed: {e}")
            self.quick_results = {}
    
    def _quick_select(self, item, category):
        """Handle quick selection of an item"""
        logger.info(f"Quick selected {category}: {getattr(item, 'name', 'Unknown')}")
        # TODO: Implement quick actions based on category


# Integration with existing GUI system
def add_compendium_panels(gui_state):
    """Add compendium panels to the existing GUI state"""
    if not hasattr(gui_state, 'compendium_panel'):
        gui_state.compendium_panel = CompendiumPanel()
    
    if not hasattr(gui_state, 'compendium_quick_access'):
        gui_state.compendium_quick_access = CompendiumQuickAccess()

def render_compendium_panels(gui_state, context):
    """Render compendium panels in the GUI"""
    # Main compendium browser window
    if imgui.begin("D&D 5e Compendium"):
        if hasattr(gui_state, 'compendium_panel'):
            gui_state.compendium_panel.render(context)
        imgui.end()
    
    # Quick access panel
    if imgui.begin("Quick Access"):
        if hasattr(gui_state, 'compendium_quick_access'):
            gui_state.compendium_quick_access.render(context)
        imgui.end()
