"""
Tools Panel - Left sidebar panel for DM tools and actions
"""

from imgui_bundle import imgui
import logging
import random

logger = logging.getLogger(__name__)


class ToolsPanel:
    """Tools panel for DM tools, dice rolling, and initiative tracking"""
    
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge
        self.selected_tool = "Select"
        self.custom_dice = "1d20"
        self.dice_history = []
        
    def render(self):
        """Render the tools panel content"""
        imgui.text("DM Tools")
        imgui.separator()
        
        # === SYSTEM CONTROLS ===
        imgui.text("System Controls")
        
        # Lighting System Toggle
        light_on = getattr(self.context, 'light_on', True)
        clicked, new_light_on = imgui.checkbox("Lighting System", light_on)
        if clicked:
            self.context.light_on = new_light_on
            logger.info(f"Lighting system {'enabled' if new_light_on else 'disabled'}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Lighting system {'enabled' if new_light_on else 'disabled'}")
        
        # Network System Toggle
        net_on = getattr(self.context, 'net', False)
        clicked, new_net_on = imgui.checkbox("Network System", net_on)
        if clicked:
            self.context.net = new_net_on
            logger.info(f"Network system {'enabled' if new_net_on else 'disabled'}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"Network system {'enabled' if new_net_on else 'disabled'}")
        
        # GUI System Toggle
        gui_on = getattr(self.context, 'gui', True)
        clicked, new_gui_on = imgui.checkbox("GUI System", gui_on)
        if clicked:
            self.context.gui = new_gui_on
            logger.info(f"GUI system {'enabled' if new_gui_on else 'disabled'}")
            if hasattr(self.context, 'add_chat_message'):
                self.context.add_chat_message(f"GUI system {'enabled' if new_gui_on else 'disabled'}")
            # Note: GUI disable will take effect on next frame
        
        imgui.separator()
        
        # Tool selection
        tools = ["Select", "Move", "Rotate", "Scale", "Measure", "Draw", "Erase"]
        for tool in tools:
            if imgui.radio_button(tool, self.selected_tool == tool):
                self.selected_tool = tool
                self._handle_tool_selection(tool)
        
        imgui.separator()
        
        # Quick dice section
        imgui.text("Quick Dice")
        dice_types = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"]
        
        # Create a grid of dice buttons
        for i, dice in enumerate(dice_types):
            if imgui.button(dice, (60, 25)):
                self._roll_dice(dice)
            
            # Create 2 columns
            if (i + 1) % 2 != 0:
                imgui.same_line()
        
        # Custom dice input
        imgui.separator()
        imgui.text("Custom Dice:")
        changed, self.custom_dice = imgui.input_text("##custom_dice", self.custom_dice, 64)
        imgui.same_line()
        if imgui.button("Roll##custom"):
            self._roll_custom_dice()
        
        # Dice history
        if self.dice_history:
            imgui.separator()
            imgui.text("Recent Rolls:")
            imgui.begin_child("dice_history", (0, 80))
            for roll in self.dice_history[-5:]:  # Show last 5 rolls
                imgui.text(f"{roll['dice']}: {roll['result']}")
            imgui.end_child()
        
        imgui.separator()
        
        # Initiative tracker
        imgui.text("Initiative Tracker")
        if imgui.button("Start Combat", (-1, 30)):
            self._handle_start_combat()
        
        if imgui.button("Next Turn", (-1, 25)):
            self._handle_next_turn()
        
        if imgui.button("End Combat", (-1, 25)):
            self._handle_end_combat()
    def _handle_tool_selection(self, tool: str):
        """Handle tool selection"""
        self.actions_bridge.set_current_tool(tool)
        logger.info(f"Tool selected: {tool}")
    
    def _roll_dice(self, dice_type: str):
        """Roll a standard dice type"""
        try:
            # Parse dice notation (e.g., "d20" -> 20)
            if dice_type.startswith('d'):
                sides = int(dice_type[1:])
                result = random.randint(1, sides)
                
                # Add to history
                self.dice_history.append({
                    'dice': dice_type,
                    'result': result
                })
                
                # Keep only last 10 rolls
                if len(self.dice_history) > 10:
                    self.dice_history.pop(0)
                
                # Add to chat if available
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message(f"Rolled {dice_type}: {result}")
                
                logger.info(f"Rolled {dice_type}: {result}")
                
        except ValueError:
            logger.error(f"Invalid dice type: {dice_type}")
    
    def _roll_custom_dice(self):
        """Roll custom dice notation"""
        try:
            # Simple parser for dice notation like "2d6", "1d20+5", etc.
            import re
            
            dice_pattern = r'(\d*)d(\d+)([+-]\d+)?'
            match = re.match(dice_pattern, self.custom_dice.lower().replace(' ', ''))
            
            if match:
                count = int(match.group(1)) if match.group(1) else 1
                sides = int(match.group(2))
                modifier = int(match.group(3)) if match.group(3) else 0
                
                # Limit reasonable values
                if count > 20:
                    count = 20
                if sides > 1000:
                    sides = 1000
                
                # Roll dice
                rolls = [random.randint(1, sides) for _ in range(count)]
                total = sum(rolls) + modifier
                
                # Create result string
                if count == 1:
                    if modifier:
                        result_str = f"Rolled {self.custom_dice}: {rolls[0]} + {modifier} = {total}"
                    else:
                        result_str = f"Rolled {self.custom_dice}: {total}"
                else:
                    roll_str = " + ".join(map(str, rolls))
                    if modifier:
                        result_str = f"Rolled {self.custom_dice}: ({roll_str}) + {modifier} = {total}"
                    else:
                        result_str = f"Rolled {self.custom_dice}: ({roll_str}) = {total}"
                
                # Add to history
                self.dice_history.append({
                    'dice': self.custom_dice,
                    'result': total
                })
                
                # Keep only last 10 rolls
                if len(self.dice_history) > 10:
                    self.dice_history.pop(0)
                
                # Add to chat if available
                if hasattr(self.context, 'add_chat_message'):
                    self.context.add_chat_message(result_str)
                
                logger.info(result_str)
                
            else:
                logger.error(f"Invalid dice notation: {self.custom_dice}")
                
        except Exception as e:
            logger.error(f"Error rolling custom dice: {e}")
    
    def _handle_start_combat(self):
        """Handle combat start"""
        logger.info("Combat started")
        if hasattr(self.context, 'add_chat_message'):
            self.context.add_chat_message("Combat started!")
    
    def _handle_next_turn(self):
        """Handle next turn in combat"""
        logger.info("Next turn")
        if hasattr(self.context, 'add_chat_message'):
            self.context.add_chat_message("Next turn!")
    
    def _handle_end_combat(self):
        """Handle combat end"""
        logger.info("Combat ended")
        if hasattr(self.context, 'add_chat_message'):
            self.context.add_chat_message("Combat ended!")
