"""
Entities Panel - Right sidebar panel for character and entity management
"""

from imgui_bundle import imgui
import logging

logger = logging.getLogger(__name__)


class EntitiesPanel:
    """Entities panel for managing characters, NPCs, and objects on the table"""
    
    def __init__(self, context):
        self.context = context
        self.entity_filter = ""
        self.selected_entity = None
        self.show_players_only = False
        self.show_npcs_only = False
        
    def render(self):
        """Render the entities panel content"""
        imgui.text("Entities & Characters")
        imgui.separator()
        
        # Filter controls
        imgui.text("Filter:")
        changed, self.entity_filter = imgui.input_text("##filter", self.entity_filter, 64)
        
        # Filter checkboxes
        _, self.show_players_only = imgui.checkbox("Players Only", self.show_players_only)
        imgui.same_line()
        _, self.show_npcs_only = imgui.checkbox("NPCs Only", self.show_npcs_only)
        
        imgui.separator()
        
        # Entity list
        if imgui.begin_child("entity_list", (0, -120)):
            entities = self._get_filtered_entities()
            
            if not entities:
                imgui.text_colored((0.7, 0.7, 0.7, 1.0), "No entities found")
            else:
                for entity in entities:
                    self._render_entity_item(entity)
        
        imgui.end_child()
        
        # Selected entity info
        imgui.separator()
        if self.selected_entity:
            self._render_entity_details()
        else:
            imgui.text("No entity selected")
        
        # Entity actions
        imgui.separator()
        self._render_entity_actions()
    
    def _get_filtered_entities(self):
        """Get entities from context with filtering applied"""
        # Try to get entities from context
        entities = getattr(self.context, 'entities', [])
        
        # If no entities in context, create some example data
        if not entities:
            entities = [
                {
                    'id': 'player_1',
                    'name': 'Gandalf the Grey',
                    'type': 'player',
                    'class': 'Wizard',
                    'level': 10,
                    'hp': 58,
                    'max_hp': 58,
                    'ac': 15,
                    'position': {'x': 5, 'y': 8}
                },
                {
                    'id': 'player_2', 
                    'name': 'Legolas',
                    'type': 'player',
                    'class': 'Ranger',
                    'level': 9,
                    'hp': 72,
                    'max_hp': 72,
                    'ac': 17,
                    'position': {'x': 6, 'y': 8}
                },
                {
                    'id': 'npc_1',
                    'name': 'Orc Captain',
                    'type': 'npc',
                    'class': 'Fighter',
                    'level': 5,
                    'hp': 45,
                    'max_hp': 58,
                    'ac': 16,
                    'position': {'x': 15, 'y': 15}
                }
            ]
        
        # Apply filters
        filtered = []
        for entity in entities:
            # Text filter
            if self.entity_filter:
                search_text = self.entity_filter.lower()
                entity_text = f"{entity.get('name', '')} {entity.get('class', '')}".lower()
                if search_text not in entity_text:
                    continue
            
            # Type filters
            entity_type = entity.get('type', 'unknown')
            if self.show_players_only and entity_type != 'player':
                continue
            if self.show_npcs_only and entity_type != 'npc':
                continue
            
            filtered.append(entity)
        
        return filtered
    
    def _render_entity_item(self, entity):
        """Render a single entity item in the list"""
        entity_id = entity.get('id', 'unknown')
        entity_name = entity.get('name', 'Unknown')
        entity_type = entity.get('type', 'unknown')
        
        # Color code by type
        if entity_type == 'player':
            color = (0.5, 0.8, 0.5, 1.0)  # Green for players
        elif entity_type == 'npc':
            color = (0.8, 0.5, 0.5, 1.0)  # Red for NPCs
        else:
            color = (0.8, 0.8, 0.5, 1.0)  # Yellow for other
        
        # Selectable item
        is_selected = self.selected_entity and self.selected_entity.get('id') == entity_id
        
        if imgui.selectable(f"{entity_name}##{entity_id}", is_selected)[0]:
            self.selected_entity = entity
            self._handle_entity_selection(entity)
        
        # Show type indicator and health bar
        if imgui.is_item_hovered():
            hp = entity.get('hp', 0)
            max_hp = entity.get('max_hp', 1)
            ac = entity.get('ac', 10)
            level = entity.get('level', 1)
            
            tooltip = f"Type: {entity_type.title()}\n"
            tooltip += f"Level: {level}\n"
            tooltip += f"HP: {hp}/{max_hp}\n"
            tooltip += f"AC: {ac}"
            
            imgui.set_tooltip(tooltip)
        
        # Health bar
        if 'hp' in entity and 'max_hp' in entity:
            hp_ratio = entity['hp'] / max(entity['max_hp'], 1)
            
            # Color based on health
            if hp_ratio > 0.7:
                bar_color = (0.2, 0.8, 0.2, 1.0)  # Green
            elif hp_ratio > 0.3:
                bar_color = (0.8, 0.8, 0.2, 1.0)  # Yellow
            else:
                bar_color = (0.8, 0.2, 0.2, 1.0)  # Red
            
            # Small health bar
            imgui.same_line()
            imgui.text_colored(bar_color, f"({entity['hp']}/{entity['max_hp']})")
    
    def _render_entity_details(self):
        """Render details for the selected entity"""
        entity = self.selected_entity
        imgui.text(f"Selected: {entity.get('name', 'Unknown')}")
        
        # Basic info
        if 'class' in entity:
            imgui.text(f"Class: {entity['class']}")
        if 'level' in entity:
            imgui.text(f"Level: {entity['level']}")
        
        # Position
        pos = entity.get('position', {})
        if pos:
            imgui.text(f"Position: ({pos.get('x', 0)}, {pos.get('y', 0)})")
        
        # Health controls for DM
        if entity.get('type') != 'player':  # DM can modify NPC health
            if 'hp' in entity and 'max_hp' in entity:
                imgui.separator()
                imgui.text("Health:")
                
                # HP slider
                new_hp = imgui.slider_int("HP", entity['hp'], 0, entity['max_hp'])[1]
                if new_hp != entity['hp']:
                    entity['hp'] = new_hp
                    logger.info(f"Updated {entity['name']} HP to {new_hp}")
    
    def _render_entity_actions(self):
        """Render action buttons for entity management"""
        # Add entity button
        if imgui.button("Add Entity", (-1, 25)):
            self._handle_add_entity()
        
        # Actions for selected entity
        if self.selected_entity:
            if imgui.button("Remove Selected", (-1, 25)):
                self._handle_remove_entity()
            
            if imgui.button("Duplicate", (-1, 25)):
                self._handle_duplicate_entity()
            
            if imgui.button("Center View", (-1, 25)):
                self._handle_center_view()
    
    def _handle_entity_selection(self, entity):
        """Handle entity selection"""
        logger.info(f"Entity selected: {entity.get('name', 'Unknown')}")
        
        # Notify context if it has a selection handler
        if hasattr(self.context, 'select_entity'):
            try:
                self.context.select_entity(entity)
            except Exception as e:
                logger.error(f"Error notifying context of entity selection: {e}")
    
    def _handle_add_entity(self):
        """Handle adding a new entity"""
        logger.info("Add entity requested")
        
        # Create a simple new entity
        new_entity = {
            'id': f'entity_{len(self._get_filtered_entities()) + 1}',
            'name': 'New Entity',
            'type': 'npc',
            'class': 'Fighter',
            'level': 1,
            'hp': 10,
            'max_hp': 10,
            'ac': 12,
            'position': {'x': 10, 'y': 10}
        }
        
        # Add to context if possible
        if hasattr(self.context, 'entities') and isinstance(self.context.entities, list):
            self.context.entities.append(new_entity)
        
        self.selected_entity = new_entity
        logger.info("New entity added")
    
    def _handle_remove_entity(self):
        """Handle removing the selected entity"""
        if not self.selected_entity:
            return
            
        entity_name = self.selected_entity.get('name', 'Unknown')
        logger.info(f"Remove entity requested: {entity_name}")
        
        # Remove from context if possible
        if hasattr(self.context, 'entities') and isinstance(self.context.entities, list):
            try:
                self.context.entities.remove(self.selected_entity)
            except ValueError:
                pass
        
        self.selected_entity = None
        logger.info(f"Entity removed: {entity_name}")
    
    def _handle_duplicate_entity(self):
        """Handle duplicating the selected entity"""
        if not self.selected_entity:
            return
            
        # Create a copy
        import copy
        new_entity = copy.deepcopy(self.selected_entity)
        new_entity['id'] = f"{new_entity['id']}_copy"
        new_entity['name'] = f"{new_entity['name']} (Copy)"
        
        # Offset position slightly
        if 'position' in new_entity:
            new_entity['position']['x'] += 1
            new_entity['position']['y'] += 1
        
        # Add to context
        if hasattr(self.context, 'entities') and isinstance(self.context.entities, list):
            self.context.entities.append(new_entity)
        
        self.selected_entity = new_entity
        logger.info(f"Entity duplicated: {new_entity['name']}")
    
    def _handle_center_view(self):
        """Handle centering the view on the selected entity"""
        if not self.selected_entity:
            return
            
        pos = self.selected_entity.get('position', {})
        if pos and hasattr(self.context, 'center_view_on'):
            try:
                self.context.center_view_on(pos.get('x', 0), pos.get('y', 0))
                logger.info(f"Centered view on {self.selected_entity['name']}")
            except Exception as e:
                logger.error(f"Failed to center view: {e}")
