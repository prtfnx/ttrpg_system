"""
Compendium Panel - Panel for managing game content and references
"""

from imgui_bundle import imgui
from logger import setup_logger
logger = setup_logger(__name__)


class CompendiumPanel:
    """Compendium panel for browsing spells, items, monsters, and other game content"""
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge
        self.search_query = ""
        self.selected_category = "Spells"
        self.selected_item = None        
        self.categories = ["Spells", "Items", "Monsters", "Classes", "Races", "Rules"]
        
    def render(self):
        """Render the compendium panel content"""        
        # Always use collapsing header but don't return early to avoid Begin/End mismatches
        header_expanded = imgui.collapsing_header("Compendium & References")
        
        if header_expanded:
            # Search bar
            self._render_search_section()
            
            # Category selection
            self._render_category_section()
            
            # Content list
            self._render_content_list()
            
            # Selected item details
            if self.selected_item:
                self._render_item_details()
    
    def _render_search_section(self):
        """Render the search section"""
        imgui.text("Search:")
        imgui.same_line()
        imgui.set_next_item_width(-1)
        changed, self.search_query = imgui.input_text("##search", self.search_query, 128)
        
        if imgui.button("Clear Search") and self.search_query:
            self.search_query = ""
        
        imgui.separator()
    def _render_category_section(self):
        """Render category selection"""
        imgui.text("Category:")
        
        for category in self.categories:
            if imgui.radio_button(category, self.selected_category == category):
                self.selected_category = category
                self.selected_item = None  # Clear selection when changing category
                self._handle_category_change(category)
            
            # Create 2 columns
            if self.categories.index(category) % 2 == 0:
                imgui.same_line()
        
        imgui.separator()
    
    def _render_content_list(self):
        """Render the content list for the selected category"""
        imgui.text(f"{self.selected_category}:")
        
        # Use simple child window sizing without negative heights to avoid viewport issues
        imgui.begin_child("content_list", (0, 0))
        
        content_items = self._get_content_items()
        
        if not content_items:
            imgui.text_colored((0.7, 0.7, 0.7, 1.0), f"No {self.selected_category.lower()} found")
        else:
            for item in content_items:
                self._render_content_item(item)
        
        imgui.end_child()
    
    def _render_content_item(self, item):
        """Render a single content item"""
        item_name = item.get('name', 'Unknown')
        item_id = item.get('id', item_name)
        
        # Check if this item matches search
        if self.search_query:
            search_lower = self.search_query.lower()
            item_text = f"{item_name} {item.get('description', '')}".lower()
            if search_lower not in item_text:
                return
        # Selectable item
        is_selected = self.selected_item and self.selected_item.get('id') == item_id
        if is_selected is None:
            is_selected = False
        clicked, _ = imgui.selectable(f"{item_name}##{item_id}", is_selected)
        if clicked:
            self.selected_item = item
            self._handle_item_selection(item)
        
        # Show brief info on hover
        if imgui.is_item_hovered():
            tooltip = item.get('brief', item.get('description', 'No description available'))
            if len(tooltip) > 100:
                tooltip = tooltip[:100] + "..."
            imgui.set_tooltip(tooltip)
    def _render_item_details(self):
        """Render details for the selected item"""
        imgui.separator()
        item = self.selected_item
        
        # Safety check - ensure item is not None
        if item is None:
            imgui.text("No item selected")
            return
        
        # Item name and type
        item_name = item.get('name', 'Unknown') if isinstance(item, dict) else 'Unknown'
        imgui.text(f"Selected: {item_name}")
        
        if isinstance(item, dict) and 'type' in item:
            imgui.same_line()
            imgui.text_colored((0.7, 0.7, 0.7, 1.0), f"({item['type']})")
        
        # Item details based on category
        if self.selected_category == "Spells":
            self._render_spell_details(item)
        elif self.selected_category == "Items":
            self._render_item_equipment_details(item)
        elif self.selected_category == "Monsters":
            self._render_monster_details(item)
        else:
            self._render_generic_details(item)
        
        # Action buttons
        imgui.separator()
        if imgui.button("Add to Table"):
            self._add_to_table(item)
        
        imgui.same_line()
        if imgui.button("Copy to Chat"):
            self._copy_to_chat(item)
    
    def _render_spell_details(self, spell):
        """Render spell-specific details"""
        if 'level' in spell:
            imgui.text(f"Level: {spell['level']}")
        if 'school' in spell:
            imgui.text(f"School: {spell['school']}")
        if 'casting_time' in spell:
            imgui.text(f"Casting Time: {spell['casting_time']}")
        if 'range' in spell:
            imgui.text(f"Range: {spell['range']}")
        if 'duration' in spell:
            imgui.text(f"Duration: {spell['duration']}")
        
        if 'description' in spell:
            imgui.separator()
            imgui.text_wrapped(spell['description'])
    
    def _render_item_equipment_details(self, item):
        """Render item/equipment specific details"""
        if 'rarity' in item:
            imgui.text(f"Rarity: {item['rarity']}")
        if 'type' in item:
            imgui.text(f"Type: {item['type']}")
        if 'weight' in item:
            imgui.text(f"Weight: {item['weight']}")
        if 'value' in item:
            imgui.text(f"Value: {item['value']}")
        
        if 'description' in item:
            imgui.separator()
            imgui.text_wrapped(item['description'])
    
    def _render_monster_details(self, monster):
        """Render monster-specific details"""
        if 'cr' in monster:
            imgui.text(f"Challenge Rating: {monster['cr']}")
        if 'type' in monster:
            imgui.text(f"Type: {monster['type']}")
        if 'size' in monster:
            imgui.text(f"Size: {monster['size']}")
        if 'hp' in monster:
            imgui.text(f"Hit Points: {monster['hp']}")
        if 'ac' in monster:
            imgui.text(f"Armor Class: {monster['ac']}")
        
        if 'description' in monster:
            imgui.separator()
            imgui.text_wrapped(monster['description'])
    
    def _render_generic_details(self, item):
        """Render generic item details"""
        if 'description' in item:
            imgui.text_wrapped(item['description'])
        
        # Show all other properties
        for key, value in item.items():
            if key not in ['id', 'name', 'description']:
                imgui.text(f"{key.title()}: {value}")
    
    def _get_content_items(self):
        """Get content items for the selected category"""
        # Try to get content from context first
        if hasattr(self.context, 'compendium_data'):
            compendium = self.context.compendium_data
            if isinstance(compendium, dict) and self.selected_category.lower() in compendium:
                return compendium[self.selected_category.lower()]
        
        # Fallback to example data
        example_data = {
            "Spells": [
                {
                    'id': 'fireball',
                    'name': 'Fireball',
                    'level': 3,
                    'school': 'Evocation',
                    'casting_time': '1 action',
                    'range': '150 feet',
                    'duration': 'Instantaneous',
                    'description': 'A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame.'
                },
                {
                    'id': 'magic_missile',
                    'name': 'Magic Missile',
                    'level': 1,
                    'school': 'Evocation',
                    'casting_time': '1 action',
                    'range': '120 feet',
                    'duration': 'Instantaneous',
                    'description': 'You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range.'
                }
            ],
            "Items": [
                {
                    'id': 'longsword',
                    'name': 'Longsword',
                    'type': 'Weapon',
                    'rarity': 'Common',
                    'weight': '3 lb',
                    'value': '15 gp',
                    'description': 'A versatile martial weapon with a straight double-edged blade.'
                },
                {
                    'id': 'potion_healing',
                    'name': 'Potion of Healing',
                    'type': 'Potion',
                    'rarity': 'Common',
                    'weight': '0.5 lb',
                    'value': '50 gp',
                    'description': 'When you drink this potion, you regain 2d4 + 2 hit points.'
                }
            ],
            "Monsters": [
                {
                    'id': 'goblin',
                    'name': 'Goblin',
                    'type': 'Humanoid',
                    'size': 'Small',
                    'cr': '1/4',
                    'hp': 7,
                    'ac': 15,
                    'description': 'A small, malicious creature that loves to cause trouble and mischief.'
                },
                {
                    'id': 'dragon_red_adult',
                    'name': 'Adult Red Dragon',
                    'type': 'Dragon',
                    'size': 'Huge',
                    'cr': '17',
                    'hp': 256,
                    'ac': 19,
                    'description': 'The most covetous and arrogant of the chromatic dragons, red dragons are fierce and territorial.'
                }
            ],
            "Classes": [
                {
                    'id': 'fighter',
                    'name': 'Fighter',
                    'description': 'A master of martial combat, skilled with a variety of weapons and armor.'
                },
                {
                    'id': 'wizard',
                    'name': 'Wizard',
                    'description': 'A scholarly magic-user capable of manipulating the structures of spellcasting.'
                }
            ],
            "Races": [
                {
                    'id': 'human',
                    'name': 'Human',
                    'description': 'The most adaptable and ambitious people among the common races.'
                },
                {
                    'id': 'elf',
                    'name': 'Elf',
                    'description': 'A magical people of otherworldly grace, living in places of ethereal beauty.'
                }
            ],
            "Rules": [
                {
                    'id': 'advantage',
                    'name': 'Advantage and Disadvantage',
                    'description': 'When you have advantage, roll two d20s and use the higher roll. When you have disadvantage, use the lower roll.'
                },
                {
                    'id': 'inspiration',
                    'name': 'Inspiration',
                    'description': 'Inspiration allows you to draw on your personality traits, ideals, bonds, and flaws to gain advantage on a roll.'
                }
            ]
        }
        
        return example_data.get(self.selected_category, [])
    
    def _handle_category_change(self, category):
        """Handle category change"""
        logger.info(f"Compendium category changed to: {category}")
        
        # Clear search when changing categories
        self.search_query = ""
    
    def _handle_item_selection(self, item):
        """Handle item selection"""
        item_name = item.get('name', 'Unknown')
        logger.info(f"Compendium item selected: {item_name}")
    
    def _add_to_table(self, item):
        """Add the selected item to the game table"""
        item_name = item.get('name', 'Unknown')
        logger.info(f"Adding to table: {item_name}")
        
        # Try to add through context
        if hasattr(self.context, 'add_to_table'):
            try:
                self.context.add_to_table(item)
            except Exception as e:
                logger.error(f"Failed to add to table: {e}")
        
        # Add to chat
        if hasattr(self.context, 'add_chat_message'):
            self.context.add_chat_message(f"Added to table: {item_name}")
    
    def _copy_to_chat(self, item):
        """Copy item information to chat"""
        item_name = item.get('name', 'Unknown')
        description = item.get('description', 'No description available')
        
        chat_message = f"[{self.selected_category}] {item_name}: {description}"
        
        # Truncate if too long
        if len(chat_message) > 200:
            chat_message = chat_message[:200] + "..."
        
        if hasattr(self.context, 'add_chat_message'):
            self.context.add_chat_message(chat_message)
        
        logger.info(f"Copied to chat: {item_name}")
