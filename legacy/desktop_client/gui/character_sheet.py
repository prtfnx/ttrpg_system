from imgui_bundle import imgui
from imgui_bundle.python_backends.sdl3_backend import SDL3Renderer
import OpenGL.GL as gl
import sdl3
import ctypes
import logging
import math
import random
import json

logger = logging.getLogger(__name__)

class Character:
    """Character data model - separates data from UI"""
    
    def __init__(self):
        self.data = {
            'character_name': 'Мутный',
            'class_level': 'Rogue 3',
            'background': 'Criminal',
            'player_name': 'Player',
            'race': 'Half-Elf',
            'alignment': 'Chaotic Neutral',
            'experience_points': 1350,
            
            # Abilities
            'strength': 8, 'dexterity': 17, 'constitution': 14,
            'intelligence': 12, 'wisdom': 13, 'charisma': 16,
            
            # Combat
            'proficiency_bonus': 2, 'inspiration': False,
            'armor_class': 14, 'initiative': 3, 'speed': 30,
            'hit_point_maximum': 22, 'current_hit_points': 22, 'temporary_hit_points': 0,
            'death_saves_successes': 0, 'death_saves_failures': 0,
            
            # Equipment
            'equipment': {'cp': 0, 'sp': 0, 'ep': 0, 'gp': 125, 'pp': 0},
            
            # Features - Fixed apostrophe issue
            'features': [
                {'name': 'Sneak Attack', 'description': 'Once per turn, deal extra 2d6 damage when you have advantage.'},
                {'name': 'Thieves Cant', 'description': 'You know thieves cant, a secret mix of dialect and code.'},
                {'name': 'Cunning Action', 'description': 'Dash, Disengage, or Hide as a bonus action.'}
            ]
        }
    
    def get_ability_modifier(self, ability):
        return math.floor((self.data[ability] - 10) / 2)
    
    def save_to_file(self, filename=None):
        if not filename:
            filename = f"{self.data['character_name']}_character.json"
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, indent=2, ensure_ascii=False)
            return f"Saved to {filename}"
        except Exception as e:
            return f"Save failed: {e}"


class DiceRoller:
    """Handles all dice rolling functionality"""
    
    @staticmethod
    def roll_d20(modifier=0, name=""):
        roll = random.randint(1, 20)
        total = roll + modifier
        result = f"Rolled {name}: {roll}"
        if modifier != 0:
            result += f" + {modifier} = {total}"
        print(result)
        return total


class CharacterSheetUI:
    """UI component for character sheet rendering"""
    
    def __init__(self, character):
        self.character = character
        self.edit_mode = False
        self.editing_feature = None
    
    def render(self):
        imgui.set_next_window_size((1200, 800), imgui.Cond_.first_use_ever)
        
        if imgui.begin("D&D 5e Character Sheet")[0]:
            self._render_header()
            imgui.separator()
            
            if imgui.begin_tab_bar("MainTabs"):
                if imgui.begin_tab_item("Character")[0]:
                    self._render_character_tab()
                    imgui.end_tab_item()
                
                if imgui.begin_tab_item("Edit")[0]:
                    self._render_edit_tab()
                    imgui.end_tab_item()
                
                imgui.end_tab_bar()
            
            imgui.end()
    
    def _render_header(self):
        """Editable character header"""
        data = self.character.data
        
        # Character name - editable
        imgui.text("Name:")
        imgui.same_line()
        imgui.set_next_item_width(200)
        changed, new_name = imgui.input_text("##char_name", data['character_name'])
        if changed:
            data['character_name'] = new_name
        imgui.same_line()
        imgui.text(f"| {data['class_level']} | {data['race']} | {data['background']}")
        
        # Quick actions
        imgui.same_line()
        if imgui.button("Save"):
            result = self.character.save_to_file()
            print(result)
        
        imgui.same_line()
        if imgui.button("Long Rest"):
            self._long_rest()
    
    def _render_character_tab(self):
        """Main character sheet tab - 3 column layout matching D&D 5e style"""
        imgui.columns(3, "MainCols")
        
        # Set column widths for optimal D&D 5e layout
        imgui.set_column_width(0, 220)  # col1 - abilities & skills
        imgui.set_column_width(1, 250)  # col2 - combat vitals  
        # col3 gets remaining space for equipment & features
          # === COLUMN 1: Abilities & Skills ===
        imgui.text_colored((0.8, 0.8, 0.9, 1.0), "ABILITIES")
        imgui.separator()
        self._render_abilities()
        
        imgui.spacing()
        imgui.spacing()
        
        imgui.text_colored((0.8, 0.8, 0.9, 1.0), "SKILLS")
        imgui.separator()
        self._render_skills()
        
        imgui.spacing()
        imgui.spacing()
        
        imgui.text_colored((0.8, 0.8, 0.9, 1.0), "SAVING THROWS")
        imgui.separator()
        self._render_saving_throws()
        
        imgui.next_column()
        
        # === COLUMN 2: Combat Vitals ===
        imgui.text_colored((0.9, 0.8, 0.8, 1.0), "COMBAT")
        imgui.separator()
        self._render_combat()
        
        imgui.spacing()
        imgui.spacing()
        
        imgui.text_colored((0.9, 0.8, 0.8, 1.0), "ATTACKS & SPELLCASTING")
        imgui.separator()
        self._render_attacks()
        
        imgui.next_column()
        
        # === COLUMN 3: Equipment & Features ===
        imgui.text_colored((0.8, 0.9, 0.8, 1.0), "EQUIPMENT")
        imgui.separator()
        self._render_equipment()
        
        imgui.spacing()
        imgui.spacing()
        
        imgui.text_colored((0.8, 0.9, 0.8, 1.0), "FEATURES & TRAITS")
        imgui.separator()
        self._render_features()
        
        imgui.columns(1)
    def _render_abilities(self):
        """Ability scores with clickable modifiers"""
        abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
        
        for ability in abilities:
            score = self.character.data[ability]
            modifier = self.character.get_ability_modifier(ability)
            mod_str = f"{modifier:+d}" if modifier != 0 else "0"
            
            imgui.text(f"{ability[:3].upper()}: {score}")
            imgui.same_line()
            if imgui.button(f"{mod_str}##mod_{ability}", (30, 20)):
                DiceRoller.roll_d20(modifier, f"{ability.capitalize()} check")
    def _render_skills(self):
        """Key skills for this character"""
        # Rogue skills with proficiency
        rogue_skills = [
            ('Deception', 'charisma', True),
            ('Insight', 'wisdom', True),
            ('Perception', 'wisdom', True),
            ('Stealth', 'dexterity', True),
            ('Sleight of Hand', 'dexterity', True)
        ]
        
        for skill_name, ability, proficient in rogue_skills:
            base_mod = self.character.get_ability_modifier(ability)
            prof_bonus = self.character.data['proficiency_bonus'] if proficient else 0
            total_mod = base_mod + prof_bonus
            mod_str = f"{total_mod:+d}" if total_mod != 0 else "0"
            
            if imgui.button(f"{mod_str}##skill_{skill_name.replace(' ', '_')}", (30, 20)):
                DiceRoller.roll_d20(total_mod, f"{skill_name} check")
            
            imgui.same_line()
            prof_indicator = "●" if proficient else "○"
            imgui.text(f"{prof_indicator} {skill_name}")
    def _render_combat(self):
        """Combat stats and HP management"""
        data = self.character.data
        
        imgui.text(f"AC: {data['armor_class']} | Speed: {data['speed']} ft")
        
        # Initiative
        imgui.text("Initiative:")
        imgui.same_line()
        init_mod = data['initiative']
        init_str = f"{init_mod:+d}" if init_mod != 0 else "0"
        if imgui.button(f"{init_str}##init", (30, 20)):
            DiceRoller.roll_d20(init_mod, "Initiative")
        imgui.spacing()
        
        # HP Management
        # Current HP - editable
        imgui.text("Current:")
        imgui.same_line()
        imgui.set_next_item_width(60)
        changed, new_hp = imgui.input_int("##current_hp", data['current_hit_points'])
        if changed:
            data['current_hit_points'] = max(0, new_hp)
        
        imgui.same_line()
        imgui.text(f"/ {data['hit_point_maximum']}")
        
        # Quick HP buttons
        if imgui.button("Heal 5"):
            data['current_hit_points'] = min(data['hit_point_maximum'], data['current_hit_points'] + 5)
        imgui.same_line()
        if imgui.button("Damage 5"):
            data['current_hit_points'] = max(0, data['current_hit_points'] - 5)
        
        # Death saves
        imgui.spacing()
        imgui.text("Death Saves:")
        
        imgui.text("Success:")
        for i in range(3):
            if imgui.checkbox(f"##success_{i}", i < data['death_saves_successes']):
                data['death_saves_successes'] = i + 1 if i >= data['death_saves_successes'] else i
            if i < 2:
                imgui.same_line()
        
        imgui.text("Failure:")
        for i in range(3):
            if imgui.checkbox(f"##failure_{i}", i < data['death_saves_failures']):
                data['death_saves_failures'] = i + 1 if i >= data['death_saves_failures'] else i
            if i < 2:
                imgui.same_line()
    def _render_attacks(self):
        """Attack actions"""
        # Quick attack buttons
        if imgui.button("Shortsword (+5)", (120, 25)):
            DiceRoller.roll_d20(5, "Shortsword attack")
        
        if imgui.button("Shortbow (+5)", (120, 25)):
            DiceRoller.roll_d20(5, "Shortbow attack")
        
        if imgui.button("Sneak Attack (2d6)", (120, 25)):
            damage = random.randint(1, 6) + random.randint(1, 6)
            print(f"Sneak Attack damage: {damage}")
    def _render_equipment(self):
        """Equipment and money"""
        # Money - editable
        eq = self.character.data['equipment']
        for currency in ['gp', 'sp', 'cp']:  # Show only common currencies
            imgui.text(f"{currency.upper()}:")
            imgui.same_line()
            imgui.set_next_item_width(60)
            changed, new_value = imgui.input_int(f"##money_{currency}", eq[currency])
            if changed:
                eq[currency] = max(0, new_value)
        imgui.spacing()
        imgui.text("Gear:")
        imgui.text("• Shortsword, Shortbow")
        imgui.text("• Leather Armor")
        imgui.text("• Thieves Tools")
    def _render_features(self):
        """Character features - editable"""
        features = self.character.data['features']
        
        for i, feature in enumerate(features):
            # Feature name
            imgui.text_colored((0.9, 0.9, 0.6, 1.0), feature['name'])
            
            # Edit button on same line
            imgui.same_line()
            if imgui.button(f"Edit##feat_{i}", (40, 20)):
                self.editing_feature = i
            
            # Description with text wrapping using text_wrapped
            imgui.text_colored((0.8, 0.8, 0.8, 1.0), "")  # Set color
            imgui.same_line(0, 0)  # No spacing
            imgui.text_wrapped(feature['description'])
            imgui.spacing()
    
    def _render_edit_tab(self):
        """Edit mode for character data"""
        imgui.text_colored((0.8, 0.8, 0.2, 1.0), "EDIT CHARACTER")
        imgui.separator()
        
        data = self.character.data
        
        # Basic info editing
        imgui.text("Basic Info:")
        
        # Class & Level
        imgui.text("Class & Level:")
        imgui.set_next_item_width(150)
        changed, new_class = imgui.input_text("##class_level", data['class_level'])
        if changed:
            data['class_level'] = new_class
        
        # Race
        imgui.text("Race:")
        imgui.set_next_item_width(150)
        changed, new_race = imgui.input_text("##race", data['race'])
        if changed:
            data['race'] = new_race
        
        # Background
        imgui.text("Background:")
        imgui.set_next_item_width(150)
        changed, new_bg = imgui.input_text("##background", data['background'])
        if changed:
            data['background'] = new_bg
        
        imgui.spacing()
        
        # Feature editing
        if self.editing_feature is not None:
            self._render_feature_editor()
          # Add new feature
        if imgui.button("Add New Feature"):
            data['features'].append({'name': 'New Feature', 'description': 'Description here...'})
            self.editing_feature = len(data['features']) - 1

    def _render_feature_editor(self):
        """Editor for individual features"""
        if self.editing_feature is None or self.editing_feature >= len(self.character.data['features']):
            self.editing_feature = None
            return
        
        feature = self.character.data['features'][self.editing_feature]
        
        imgui.text_colored((0.8, 0.8, 0.2, 1.0), "EDITING FEATURE")
        imgui.separator()
        
        # Feature name
        imgui.text("Name:")
        imgui.set_next_item_width(200)
        changed, new_name = imgui.input_text("##feat_name", feature['name'])
        if changed:
            feature['name'] = new_name
        
        # Feature description
        imgui.text("Description:")
        imgui.set_next_item_width(400)
        changed, new_desc = imgui.input_text_multiline("##feat_desc", feature['description'], (400, 100))
        if changed:
            feature['description'] = new_desc
        
        # Control buttons
        if imgui.button("Done"):
            self.editing_feature = None
        
        imgui.same_line()
        if imgui.button("Delete Feature"):
            del self.character.data['features'][self.editing_feature]
            self.editing_feature = None
    
    def _long_rest(self):
        """Perform long rest"""
        data = self.character.data
        data['current_hit_points'] = data['hit_point_maximum']
        data['death_saves_successes'] = 0
        data['death_saves_failures'] = 0
        print("Long rest completed - HP restored, death saves reset")
    
    def _render_saving_throws(self):
        """Saving throws with clickable buttons"""
        data = self.character.data
        saving_throws = [
            ('Strength', 'strength'),
            ('Dexterity', 'dexterity'),
            ('Constitution', 'constitution'),
            ('Intelligence', 'intelligence'),
            ('Wisdom', 'wisdom'),
            ('Charisma', 'charisma')
        ]
        
        for save_name, ability in saving_throws:
            ability_mod = self.character.get_ability_modifier(ability)
            # For now, assume no proficiency in saves
            save_bonus = ability_mod
            
            save_str = f"{save_bonus:+d}" if save_bonus != 0 else "+0"
            
            if imgui.button(f"{save_str}##save_{ability}", (30, 20)):
                DiceRoller.roll_d20(save_bonus, f"{save_name} saving throw")
            
            imgui.same_line()
            imgui.text(save_name)
    
    # ...existing code...
    

class CharacterSheetApp:
    """Main application class"""
    
    def __init__(self):
        self.window = None
        self.gl_context = None
        self.imgui_renderer = None
        self.character = Character()
        self.ui = CharacterSheetUI(self.character)
    
    def run(self):
        if not self._init_sdl() or not self._init_imgui():
            return
        
        print("D&D 5e Character Sheet - Press ESC to exit")
        print("Click modifiers to roll dice, use Edit tab to modify character")
        
        running = True
        event = sdl3.SDL_Event()
        
        while running:
            while sdl3.SDL_PollEvent(ctypes.byref(event)):
                self.imgui_renderer.process_event(event)
                if event.type == sdl3.SDL_EVENT_QUIT or \
                   (event.type == sdl3.SDL_EVENT_KEY_DOWN and event.key.key == sdl3.SDLK_ESCAPE):
                    running = False
            
            self.imgui_renderer.process_inputs()
            imgui.new_frame()
            
            self.ui.render()
            
            gl.glClearColor(0.1, 0.1, 0.1, 1.0)
            gl.glClear(gl.GL_COLOR_BUFFER_BIT)
            imgui.render()
            self.imgui_renderer.render(imgui.get_draw_data())
            sdl3.SDL_GL_SwapWindow(self.window)
        
        self._cleanup()
    
    def _init_sdl(self):
        if not sdl3.SDL_Init(sdl3.SDL_INIT_VIDEO):
            return False
        
        sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_CONTEXT_MAJOR_VERSION, 4)
        sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_CONTEXT_MINOR_VERSION, 1)
        sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_DOUBLEBUFFER, 1)
        
        self.window = sdl3.SDL_CreateWindow(
            "D&D 5e Character Sheet".encode(), 1200, 800,
            sdl3.SDL_WINDOW_OPENGL | sdl3.SDL_WINDOW_RESIZABLE
        )
        
        if self.window:
            self.gl_context = sdl3.SDL_GL_CreateContext(self.window)
            sdl3.SDL_GL_SetSwapInterval(1)
            return True
        return False
    
    def _init_imgui(self):
        try:
            imgui.create_context()
            imgui.style_colors_dark()
            self.imgui_renderer = SDL3Renderer(self.window)
            return True
        except Exception as e:
            logger.error(f"ImGui init failed: {e}")
            return False
    
    def _cleanup(self):
        if self.imgui_renderer:
            self.imgui_renderer.shutdown()
        if imgui.get_current_context():
            imgui.destroy_context()
        if self.gl_context:
            sdl3.SDL_GL_DestroyContext(self.gl_context)
        if self.window:
            sdl3.SDL_DestroyWindow(self.window)
        sdl3.SDL_Quit()


def main():
    logging.basicConfig(level=logging.INFO)
    app = CharacterSheetApp()
    app.run()


if __name__ == "__main__":
    main()