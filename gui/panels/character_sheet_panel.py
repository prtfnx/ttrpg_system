"""
Character Sheet Panel - D&D 5e Character Sheet Interface
Comprehensive character display and action system inspired by official D&D character sheet
"""

from imgui_bundle import imgui
import logging
import random
from typing import Optional, Dict, Any, List, Tuple
from core_table.compendiums.characters.character import (
    Character, AbilityScore, Skill, Race, CharacterClass, Background, Feat,
    AbilityScoreIncrease, Size
)

logger = logging.getLogger(__name__)


class CharacterSheetPanel:
    """Character sheet panel with full D&D 5e character display and actions"""
    
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge
        
        # Character data
        self.current_character: Optional[Character] = None
        self.character_list: List[Character] = []
        
        # UI state
        self.selected_character_index = 0
        self.is_popup_window = False
        self.popup_window_open = False
        self.window_width = 800
        self.window_height = 1000
        
        # Sheet tabs
        self.active_tab = "main"  # main, spells, equipment, features
        
        # Action states
        self.roll_results: List[str] = []
        self.max_roll_results = 10
        
        # Character sheet sections expanded state
        self.sections_expanded = {
            "basic_info": True,
            "abilities": True,
            "skills": True,
            "combat": True,
            "equipment": False,
            "features": False,
            "spells": False,
            "backstory": False
        }
        
        # Load sample character for testing
        self._create_sample_character()
    
    def set_character(self, character: Character):
        """Set the current character to display"""
        self.current_character = character
        if character:
            character.update_calculated_values()
    
    def render(self):
        """Render the character sheet panel"""
        imgui.text("Character Sheet")
        imgui.separator()
        
        # Character selection
        self._render_character_selection()
        
        if not self.current_character:
            imgui.text_colored((0.8, 0.4, 0.4, 1.0), "No character selected")
            return
        
        imgui.separator()
        
        # Pop-out window button
        if imgui.button("Open in Window"):
            self.popup_window_open = True
        
        imgui.separator()
        
        # Render character sheet content
        if imgui.begin_child("character_sheet_content", (0, 0)):
            self._render_character_sheet()
        imgui.end_child()
        
        # Handle pop-out window
        if self.popup_window_open:
            self._render_popup_window()
    
    def _render_character_selection(self):
        """Render character selection dropdown"""
        if not self.character_list:
            imgui.text("No characters loaded")
            return
        
        character_names = [char.name if char.name else f"Character {i+1}" 
                          for i, char in enumerate(self.character_list)]
        
        changed, self.selected_character_index = imgui.combo(
            "Character", self.selected_character_index, character_names
        )
        
        if changed:
            self.current_character = self.character_list[self.selected_character_index]
            if self.current_character:
                self.current_character.update_calculated_values()
    
    def _render_popup_window(self):
        """Render character sheet in a popup window"""
        if not self.popup_window_open:
            return
            
        imgui.set_next_window_size((self.window_width, self.window_height), imgui.Cond_.first_use_ever.value)
        
        window_flags = (
            imgui.WindowFlags_.horizontal_scrollbar.value |
            imgui.WindowFlags_.always_vertical_scrollbar.value
        )
        
        character_name = self.current_character.name if self.current_character and self.current_character.name else "Unknown"
        expanded, self.popup_window_open = imgui.begin(f"Character Sheet - {character_name}", self.popup_window_open, flags=window_flags)
        
        if expanded:
            self._render_character_sheet()
        
        imgui.end()
    
    def _render_character_sheet(self):
        """Render the main character sheet content"""
        if not self.current_character:
            return
        
        # Tab bar for different sections
        if imgui.begin_tab_bar("character_tabs"):
            if imgui.begin_tab_item("Main Sheet")[0]:
                self._render_main_sheet()
                imgui.end_tab_item()
            
            if imgui.begin_tab_item("Spells")[0]:
                self._render_spells_tab()
                imgui.end_tab_item()
            
            if imgui.begin_tab_item("Equipment")[0]:
                self._render_equipment_tab()
                imgui.end_tab_item()
            
            if imgui.begin_tab_item("Features & Traits")[0]:
                self._render_features_tab()
                imgui.end_tab_item()
            
            imgui.end_tab_bar()    
    def _render_main_sheet(self):
        """Render the main character sheet tab in official D&D layout"""
        char = self.current_character
        if not char:
            return
        
        # Main layout: Left column (Abilities + Skills), Right column (Basic Info + Combat)
        imgui.columns(2, "main_sheet_columns", True)
        
        # === LEFT COLUMN ===
        # Character Basic Info (condensed at top)
        if self._render_collapsible_section("Character Info", "basic_info"):
            self._render_basic_info()
        
        imgui.spacing()
        
        # Ability Scores
        if self._render_collapsible_section("Ability Scores", "abilities"):
            self._render_ability_scores()
        
        imgui.next_column()
        
        # === RIGHT COLUMN ===
        # Combat Stats
        if self._render_collapsible_section("Combat Stats", "combat"):
            self._render_combat_stats()
        
        imgui.spacing()
        
        # Skills (in right column to save space)
        if self._render_collapsible_section("Skills", "skills"):
            self._render_skills()
        
        imgui.columns(1)
        
        # Recent Roll Results (full width at bottom)
        self._render_roll_results()
    
    def _render_collapsible_section(self, title: str, key: str) -> bool:
        """Render a collapsible section header"""
        expanded = self.sections_expanded.get(key, True)
        result = imgui.collapsing_header(title, flags=imgui.TreeNodeFlags_.default_open.value if expanded else 0)
        self.sections_expanded[key] = result
        return result
    
    def _render_basic_info(self):
        """Render basic character information"""
        char = self.current_character
        if not char:
            return
        
        imgui.columns(2, "basic_info_columns")
        
        # Left column
        imgui.text(f"Name: {char.name or 'Unnamed'}")
        imgui.text(f"Level: {char.level}")
        imgui.text(f"Experience: {char.experience_points} XP")
        imgui.text(f"Race: {char.race.name if char.race else 'Unknown'}")
        
        imgui.next_column()
        
        # Right column
        imgui.text(f"Class: {char.character_class.name if char.character_class else 'Unknown'}")
        imgui.text(f"Background: {char.background.name if char.background else 'Unknown'}")
        imgui.text(f"Alignment: {char.alignment or 'Unknown'}")
        imgui.text(f"Proficiency: +{char.proficiency_bonus}")
        
        imgui.columns(1)
    
    def _render_ability_scores(self):
        """Render ability scores like official D&D character sheet - fantasy themed"""
        char = self.current_character
        if not char:
            return
        
        # Fantasy-themed ability score display
        for ability in AbilityScore:
            base_score = char.ability_scores.get(ability, 10)
            racial_bonus = char.race.get_ability_modifier(ability) if char.race else 0
            total_score = base_score + racial_bonus
            modifier = char.get_ability_modifier(ability)
            modifier_str = f"+{modifier}" if modifier >= 0 else str(modifier)
            
            # Create parchment-like background for ability scores
            imgui.push_style_color(imgui.Col_.frame_bg.value, (0.35, 0.25, 0.15, 0.9))  # Parchment brown
            imgui.push_style_color(imgui.Col_.border.value, (0.6, 0.45, 0.25, 1.0))     # Golden border
            imgui.push_style_var(imgui.StyleVar_.frame_padding.value, (12, 8))
            imgui.push_style_var(imgui.StyleVar_.frame_border_size.value, 2.0)
            
            # Ability name with fantasy styling
            imgui.text_colored((0.9, 0.8, 0.6, 1.0), f"══ {ability.value.upper()} ══")
            
            # Ornate score display box
            imgui.begin_child(f"ability_box_{ability.value}", (140, 90), True)
            
            # Large score with fantasy font effect
            imgui.set_cursor_pos((45, 15))
            imgui.push_font(None)  # Could load a fantasy font here
            imgui.text_colored((1.0, 0.9, 0.7, 1.0), f"{total_score}")
            imgui.pop_font()
            
            # Modifier in a decorative frame
            imgui.set_cursor_pos((30, 55))
            imgui.push_style_color(imgui.Col_.frame_bg.value, (0.2, 0.15, 0.1, 0.95))
            imgui.begin_child(f"modifier_{ability.value}", (80, 28), True)
            imgui.set_cursor_pos((30, 6))
            imgui.text_colored((0.8, 0.9, 1.0, 1.0), modifier_str)
            imgui.end_child()
            imgui.pop_style_color()
            
            imgui.end_child()
            
            # Fantasy-themed roll button
            imgui.same_line()
            imgui.set_cursor_pos_y(imgui.get_cursor_pos_y() + 30)
            imgui.push_style_color(imgui.Col_.button.value, (0.4, 0.2, 0.1, 0.8))
            imgui.push_style_color(imgui.Col_.button_hovered.value, (0.6, 0.3, 0.15, 0.9))
            if imgui.button(f"⚅ Roll###{ability.value}", (60, 35)):
                self._roll_ability_check(ability)
            imgui.pop_style_color(2)
            
            imgui.pop_style_var(2)
            imgui.pop_style_color(2)
            
            # Show racial bonus with fantasy theming
            if racial_bonus != 0:
                imgui.same_line()
                imgui.text_colored((0.6, 0.8, 0.9, 1.0), f"[Base: {base_score} + Racial: {racial_bonus}]")
            
            imgui.spacing()
            imgui.separator_text("~")
    
    def _render_skills(self):
        """Render skills with roll buttons"""
        char = self.current_character
        if not char:
            return
        
        imgui.columns(2, "skills_columns")
        
        for i, skill in enumerate(Skill):
            if i > 0 and i % 9 == 0:  # Split into two columns
                imgui.next_column()
            
            modifier = char.get_skill_modifier(skill)
            modifier_str = f"+{modifier}" if modifier >= 0 else str(modifier)
              # Proficiency indicator
            is_proficient = skill in char.skill_proficiencies
            has_expertise = skill in char.expertise
            
            prof_symbol = "**" if has_expertise else "*" if is_proficient else "o"
            
            # Skill name and roll button
            imgui.text(f"{prof_symbol} {skill.value}")
            imgui.same_line()
            
            if imgui.small_button(f"Roll##{skill.value}"):
                self._roll_skill_check(skill)
            
            imgui.same_line()
            imgui.text(f"({modifier_str})")
        
        imgui.columns(1)
          # Legend
        imgui.separator()
        imgui.text_colored((0.8, 0.8, 0.8, 1.0), "o Not Proficient  * Proficient  ** Expertise")
    
    def _render_combat_stats(self):
        """Render combat-related statistics"""
        char = self.current_character
        if not char:
            return
        
        imgui.columns(2, "combat_columns")
        
        # Left column
        imgui.text(f"Armor Class: {char.armor_class}")
        imgui.text(f"Hit Points: {char.hit_points}")
        imgui.text(f"Speed: {char.race.speed if char.race else 30} ft")
        
        imgui.next_column()
        
        # Right column
        imgui.text("Saving Throws:")
        if char.character_class:
            for ability in char.character_class.saving_throw_proficiencies:
                modifier = char.get_ability_modifier(ability) + char.proficiency_bonus
                modifier_str = f"+{modifier}" if modifier >= 0 else str(modifier)
                imgui.text(f"  {ability.value[:3]}: {modifier_str}")
                imgui.same_line()
                if imgui.small_button(f"Roll##{ability.value}_save"):
                    self._roll_saving_throw(ability)
        
        imgui.columns(1)
        
        # Initiative
        imgui.separator()
        dex_mod = char.get_ability_modifier(AbilityScore.DEXTERITY)
        init_mod = f"+{dex_mod}" if dex_mod >= 0 else str(dex_mod)
        imgui.text(f"Initiative: {init_mod}")
        imgui.same_line()
        if imgui.button("Roll Initiative"):
            self._roll_initiative()
    
    def _render_spells_tab(self):
        """Render spells tab"""
        char = self.current_character
        if not char:
            return
        
        if not char.spells_known:
            imgui.text("No spells known")
            return
        
        imgui.text("Known Spells:")
        imgui.separator()
        
        for spell in char.spells_known:
            imgui.bullet_text(spell)
            imgui.same_line()
            if imgui.small_button(f"Cast##{spell}"):
                self._cast_spell(spell)
    
    def _render_equipment_tab(self):
        """Render equipment tab"""
        char = self.current_character
        if not char:
            return
        
        if not char.equipment:
            imgui.text("No equipment")
            return
        
        imgui.text("Equipment:")
        imgui.separator()
        
        for item in char.equipment:
            imgui.bullet_text(item)
    
    def _render_features_tab(self):
        """Render features and traits tab"""
        char = self.current_character
        if not char:
            return
        
        # Class features
        if char.character_class:
            imgui.text("Class Features:")
            features = char.character_class.get_features_at_level(char.level)
            for feature in features:
                if imgui.collapsing_header(f"{feature.name} (Level {feature.level})"):
                    imgui.text_wrapped(feature.description)
            imgui.separator()
        
        # Racial traits
        if char.race and char.race.traits:
            imgui.text("Racial Traits:")
            for trait in char.race.traits:
                if imgui.collapsing_header(trait.name):
                    imgui.text_wrapped(trait.description)
            imgui.separator()
        
        # Background features
        if char.background and hasattr(char.background, 'features') and char.background.features:
            imgui.text("Background Features:")
            for feature in char.background.features:
                if imgui.collapsing_header(feature.name):
                    imgui.text_wrapped(feature.description)
            imgui.separator()
        
        # Feats
        if char.feats:
            imgui.text("Feats:")
            for feat in char.feats:
                if imgui.collapsing_header(feat.name):
                    imgui.text_wrapped(feat.description)
    
    def _render_roll_results(self):
        """Render recent roll results"""
        if not self.roll_results:
            return
        
        imgui.separator()
        imgui.text("Recent Rolls:")
        
        if imgui.begin_child("roll_results", (0, 120)):
            for result in reversed(self.roll_results):
                imgui.text(result)
        imgui.end_child()
        
        if imgui.button("Clear Rolls"):
            self.roll_results.clear()
    
    def _roll_ability_check(self, ability: AbilityScore):
        """Roll an ability check"""
        if not self.current_character:
            return
            
        roll = random.randint(1, 20)
        modifier = self.current_character.get_ability_modifier(ability)
        total = roll + modifier
        
        result = f"{ability.value} Check: {roll} + {modifier} = {total}"
        self._add_roll_result(result)
    
    def _roll_skill_check(self, skill: Skill):
        """Roll a skill check"""
        if not self.current_character:
            return
            
        roll = random.randint(1, 20)
        modifier = self.current_character.get_skill_modifier(skill)
        total = roll + modifier
        
        result = f"{skill.value}: {roll} + {modifier} = {total}"
        self._add_roll_result(result)
    
    def _roll_saving_throw(self, ability: AbilityScore):
        """Roll a saving throw"""
        if not self.current_character:
            return
            
        roll = random.randint(1, 20)
        modifier = self.current_character.get_ability_modifier(ability) + self.current_character.proficiency_bonus
        total = roll + modifier
        
        result = f"{ability.value} Save: {roll} + {modifier} = {total}"
        self._add_roll_result(result)
    
    def _roll_initiative(self):
        """Roll initiative"""
        if not self.current_character:
            return
            
        roll = random.randint(1, 20)
        modifier = self.current_character.get_ability_modifier(AbilityScore.DEXTERITY)
        total = roll + modifier
        
        result = f"Initiative: {roll} + {modifier} = {total}"
        self._add_roll_result(result)
    
    def _cast_spell(self, spell_name: str):
        """Cast a spell (placeholder)"""
        result = f"Cast {spell_name}"
        self._add_roll_result(result)
    
    def _add_roll_result(self, result: str):
        """Add a roll result to the history"""
        self.roll_results.append(result)
        if len(self.roll_results) > self.max_roll_results:
            self.roll_results.pop(0)
        
        logger.info(f"Roll: {result}")
    
    def _create_sample_character(self):
        """Create a sample character for testing"""
        # Create sample character
        char = Character()
        char.name = "Lyra Moonwhisper"
        char.level = 3
        char.experience_points = 900
        char.alignment = "Chaotic Good"
        char.backstory = "A half-elf ranger who grew up in the forests..."
        
        # Ability scores
        char.ability_scores[AbilityScore.STRENGTH] = 12
        char.ability_scores[AbilityScore.DEXTERITY] = 16
        char.ability_scores[AbilityScore.CONSTITUTION] = 14
        char.ability_scores[AbilityScore.INTELLIGENCE] = 13
        char.ability_scores[AbilityScore.WISDOM] = 15
        char.ability_scores[AbilityScore.CHARISMA] = 14
        
        # Create sample race (Half-Elf)
        race = Race()
        race.name = "Half-Elf"
        race.size = Size.MEDIUM
        race.speed = 30
        race.ability_score_increases = [
            AbilityScoreIncrease(AbilityScore.CHARISMA, 2),
            AbilityScoreIncrease(AbilityScore.DEXTERITY, 1),
            AbilityScoreIncrease(AbilityScore.WISDOM, 1)
        ]
        race.darkvision = 60
        race.languages = ["Common", "Elvish"]
        char.race = race
        
        # Create sample class (Ranger)
        char_class = CharacterClass()
        char_class.name = "Ranger"
        char_class.hit_die = 10
        char_class.primary_abilities = [AbilityScore.DEXTERITY, AbilityScore.WISDOM]
        char_class.saving_throw_proficiencies = [AbilityScore.STRENGTH, AbilityScore.DEXTERITY]
        char.character_class = char_class
        
        # Create sample background
        background = Background()
        background.name = "Outlander"
        char.background = background
        
        # Skills
        char.skill_proficiencies = [
            Skill.ATHLETICS,
            Skill.INSIGHT,
            Skill.INVESTIGATION,
            Skill.NATURE,
            Skill.PERCEPTION,
            Skill.STEALTH,
            Skill.SURVIVAL
        ]
        char.expertise = [Skill.SURVIVAL, Skill.STEALTH]
        
        # Equipment
        char.equipment = [
            "Longbow", "Quiver with 20 arrows", "Studded leather armor",
            "Shortsword", "Dungeoneer's pack", "Staff", "Hunting trap"
        ]
        
        # Spells
        char.spells_known = ["Hunter's Mark", "Cure Wounds", "Goodberry"]
        
        # Update calculated values
        char.update_calculated_values()
        char.armor_class = 13  # Studded leather + dex
        
        # Add to character list
        self.character_list = [char]
        self.current_character = char
