"""
Tools Panel - Left sidebar panel for DM tools and actions
"""

from imgui_bundle import imgui

import random
from logger import setup_logger
logger = setup_logger(__name__)


class ToolsPanel:
    """Tools panel for DM tools, dice rolling, and initiative tracking"""
    
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge
        self.selected_tool = "Select"
        self.custom_dice = "1d20"
        self.dice_history = []
        
        # Keep measurement history for UI display
        self.measurement_history = []
        
        # Drawing tool settings
        self.draw_shape = "line"
        self.draw_color = [1.0, 0.0, 0.0]  # Red default
        self.draw_thickness = 2
        
    def render(self):
        """Render the tools panel content"""
        # User mode display and toggle
        is_gm = self.actions_bridge.is_gm_mode()
        mode_color = (1.0, 0.8, 0.4, 1.0) if is_gm else (0.4, 0.8, 1.0, 1.0)
        mode_text = "GM Mode" if is_gm else "Player Mode"
        
        imgui.text_colored(mode_color, mode_text)
        if imgui.button("Switch Mode"):
            new_mode = not is_gm
            if self.actions_bridge.set_user_mode(new_mode):
                logger.info(f"User mode switched to {'GM' if new_mode else 'Player'}")
        
        imgui.separator()
        
        imgui.text("DM Tools")
        imgui.separator()
        
        # === SYSTEM CONTROLS === (GM Only)
        if self.actions_bridge.is_gm_mode():
            imgui.text("DM System Controls")
            
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
            
            # Settings button
            if imgui.button("Settings"):
                self._open_settings()
            
            imgui.separator()
        
        # Tool selection (mode-dependent)
        tools = self.actions_bridge.get_allowed_tools_for_mode()
        
        imgui.text("Tools")
        for tool in tools:
            if imgui.radio_button(tool, self.selected_tool == tool):
                self.selected_tool = tool
                self._handle_tool_selection(tool)
        
        # Measurement tool display
        if self.selected_tool == "Measure":
            imgui.separator()
            imgui.text("Measurement Tool")
            
            # Get measurement tool from context
            measurement_tool = getattr(self.context, 'measurement_tool', None)
            
            if measurement_tool and measurement_tool.active:
                if measurement_tool.measuring:
                    imgui.text_colored((0.0, 1.0, 0.0, 1.0), "Click to set end point")
                    if imgui.button("Cancel Measurement"):
                        measurement_tool.clear()
                else:
                    imgui.text("Click to start measuring")
                
                # Show current measurement
                if measurement_tool.start_point and measurement_tool.end_point:
                    distance = measurement_tool.get_distance()
                    if distance is not None:
                        distance_feet = measurement_tool.get_distance_in_feet()
                        imgui.text(f"Distance: {distance:.1f} units")
                        imgui.text(f"({distance_feet:.1f} feet)")
                        
                        if imgui.button("Save Measurement"):
                            self.measurement_history.append(distance)
                            if len(self.measurement_history) > 10:
                                self.measurement_history.pop(0)
                            
                            # Add to chat if available
                            if hasattr(self.context, 'add_chat_message'):
                                self.context.add_chat_message(f"Measured distance: {distance:.1f} units ({distance_feet:.1f} ft)")
                            
                            measurement_tool.clear()
            else:
                imgui.text("Measurement tool not available")
            
            # Measurement history
            if self.measurement_history:
                imgui.text("Recent Measurements:")
                imgui.begin_child("measurement_history", (0, 60))
                for i, measurement in enumerate(self.measurement_history[-5:]):
                    imgui.text(f"{i+1}: {measurement:.2f} units")
                imgui.end_child()
        
        # Draw tool integration
        elif self.selected_tool == "Draw":
            imgui.separator()
            imgui.text("Drawing Tool")
            
            # Initialize drawing tool if needed
            if not hasattr(self.context, 'drawing_tool') or self.context.drawing_tool is None:
                self._initialize_drawing_tool()
            
            drawing_tool = self.context.drawing_tool
            if drawing_tool:
                # Drawing shape selection
                imgui.text("Shape:")
                for shape in drawing_tool.available_shapes:
                    if imgui.radio_button(shape.title(), drawing_tool.current_shape == shape):
                        drawing_tool.set_shape(shape)
                        self.draw_shape = shape  # Keep in sync
                    if shape != drawing_tool.available_shapes[-1]:  # Not last item
                        imgui.same_line()
                
                # Drawing settings
                imgui.separator()
                imgui.text("Settings:")
                
                # Color selection
                imgui.text("Color:")
                
                # Color buttons for quick selection
                color_names = list(drawing_tool.available_colors.keys())
                for i, color_name in enumerate(color_names):
                    color_rgb = drawing_tool.available_colors[color_name]
                    if imgui.color_button(f"##{color_name}", color_rgb + [1.0]):  # Add alpha
                        drawing_tool.set_color_by_name(color_name)
                        self.draw_color = color_rgb  # Keep in sync
                    
                    # Tooltip with color name
                    if imgui.is_item_hovered():
                        imgui.set_tooltip(color_name)
                    
                    # Create rows of 4 colors
                    if (i + 1) % 4 != 0 and i < len(color_names) - 1:
                        imgui.same_line()
                
                # Custom color picker
                imgui.text("Custom:")
                changed, new_color = imgui.color_edit3("##draw_color", drawing_tool.current_color)
                if changed:
                    drawing_tool.set_color(new_color)
                    self.draw_color = new_color  # Keep in sync
                
                # Thickness slider
                imgui.text("Thickness:")
                changed, new_thickness = imgui.slider_int("##thickness", drawing_tool.current_thickness, 1, 20)
                if changed:
                    drawing_tool.set_thickness(new_thickness)
                    self.draw_thickness = new_thickness  # Keep in sync
                
                # Drawing tool status and controls
                imgui.separator()
                if drawing_tool.active:
                    imgui.text_colored((0.0, 1.0, 0.0, 1.0), f"Drawing {drawing_tool.current_shape} - Active")
                    if imgui.button("Stop Drawing"):
                        drawing_tool.stop()
                    
                    imgui.same_line()
                    if imgui.button("Save Drawing"):
                        drawing_tool.save_current_drawing()
                    
                    if imgui.button("Clear All"):
                        drawing_tool.clear_saved_drawings()
                else:
                    if imgui.button("Start Drawing"):
                        drawing_tool.start()
                
                # Drawing count
                if drawing_tool.saved_drawings:
                    imgui.text(f"Saved drawings: {len(drawing_tool.saved_drawings)}")
            else:
                imgui.text_colored((1.0, 0.4, 0.4, 1.0), "Drawing tool not available")
        
        # Fog of War tool integration
        elif self.selected_tool == "Fog of War":
            imgui.separator()
            imgui.text("Fog of War Tool")
            
            # Initialize fog of war tool if needed
            if not hasattr(self.context, 'fog_of_war_tool') or self.context.fog_of_war_tool is None:
                if self.actions_bridge.start_fog_of_war_tool():
                    imgui.text_colored((0.0, 1.0, 0.0, 1.0), "Fog of War tool initialized")
                else:
                    imgui.text_colored((1.0, 0.4, 0.4, 1.0), "Failed to initialize Fog of War tool")
            
            fog_tool = getattr(self.context, 'fog_of_war_tool', None)
            if fog_tool and fog_tool.active:
                # Mode selection
                imgui.text("Mode:")
                if imgui.radio_button("Hide Areas", fog_tool.current_mode == "hide"):
                    fog_tool.set_mode("hide")
                imgui.same_line()
                if imgui.radio_button("Reveal Areas", fog_tool.current_mode == "reveal"):
                    fog_tool.set_mode("reveal")
                
                imgui.separator()
                
                # Quick actions
                imgui.text("Quick Actions:")
                if imgui.button("Hide All Table", (120, 25)):
                    fog_tool.hide_all_table()
                
                if imgui.button("Reveal All Table", (120, 25)):
                    fog_tool.reveal_all_table()
                
                if imgui.button("Clear All Fog", (120, 25)):
                    fog_tool.clear_fog_rectangles()
                
                imgui.separator()
                
                # Tool status
                if fog_tool.drawing:
                    imgui.text_colored((1.0, 1.0, 0.0, 1.0), "Drawing fog rectangle...")
                    imgui.text("Release mouse to apply")
                else:
                    imgui.text_colored((0.0, 1.0, 0.0, 1.0), f"Mode: {fog_tool.current_mode.title()}")
                    imgui.text("Click and drag to draw rectangles")
                
                # Fog rectangles count
                fog_count = len(fog_tool.fog_rectangles)
                if fog_count > 0:
                    imgui.text(f"Active fog areas: {fog_count}")
                
                # Instructions
                imgui.separator()
                imgui.text_colored((0.7, 0.7, 0.7, 1.0), "Instructions:")
                imgui.text_colored((0.7, 0.7, 0.7, 1.0), "• GM sees fog as gray/transparent")
                imgui.text_colored((0.7, 0.7, 0.7, 1.0), "• Players see fog as black")
                imgui.text_colored((0.7, 0.7, 0.7, 1.0), "• Drag to create rectangles")
                imgui.text_colored((0.7, 0.7, 0.7, 1.0), "• Use reveal to create windows")
                
            else:
                imgui.text_colored((1.0, 0.4, 0.4, 1.0), "Fog of War tool not available")
                imgui.text_colored((0.7, 0.7, 0.7, 1.0), "Only available in GM mode")

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
        
        # Stop previous tools
        if hasattr(self.context, 'measurement_tool') and self.context.measurement_tool:
            self.context.measurement_tool.stop()
        if hasattr(self.context, 'drawing_tool') and self.context.drawing_tool:
            self.context.drawing_tool.stop()
        if hasattr(self.context, 'fog_of_war_tool') and self.context.fog_of_war_tool:
            self.context.fog_of_war_tool.stop()
        
        # Handle specific tool initialization
        if tool == "Measure":
            self.actions_bridge.start_measurement_tool()
        elif tool == "Draw":
            # Initialize and start drawing tool
            if not hasattr(self.context, 'drawing_tool') or self.context.drawing_tool is None:
                self._initialize_drawing_tool()
            if self.context.drawing_tool:
                self.context.drawing_tool.start()
        elif tool == "Fog of War":
            self.actions_bridge.start_fog_of_war_tool()
        
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
    
    # === PAINT TOOL METHODS ===
    def _is_paint_mode_active(self) -> bool:
        """Check if paint mode is active"""
        try:
            import PaintManager
            return PaintManager.is_paint_mode_active()
        except ImportError:
            return False
    
    def _enter_paint_mode(self):
        """Enter paint mode"""
        try:
            import PaintManager
            PaintManager.toggle_paint_mode()
            logger.info("Entered paint mode")
        except ImportError:
            logger.error("PaintManager not available")
    
    def _exit_paint_mode(self):
        """Exit paint mode"""
        try:
            import PaintManager
            PaintManager.toggle_paint_mode()
            logger.info("Exited paint mode")
        except ImportError:
            logger.error("PaintManager not available")
    
    def _cycle_paint_color(self):
        """Cycle paint colors"""
        try:
            import PaintManager
            PaintManager.cycle_paint_colors()
            logger.info("Cycled paint color")
        except ImportError:
            logger.error("PaintManager not available")
    
    def _adjust_paint_width(self, delta: int):
        """Adjust paint brush width"""
        try:
            import PaintManager
            PaintManager.adjust_paint_width(delta)
            logger.info(f"Adjusted paint width by {delta}")
        except ImportError:
            logger.error("PaintManager not available")
    
    def _clear_paint_canvas(self):
        """Clear paint canvas"""
        try:
            import PaintManager
            if PaintManager.paint_system and PaintManager.paint_system.canvas:
                PaintManager.paint_system.canvas.clear_canvas()
                logger.info("Cleared paint canvas")
        except ImportError:
            logger.error("PaintManager not available")
    
    def _set_drawing_settings(self):
        """Apply current drawing settings to the paint system"""
        try:
            import PaintManager
            # Set color (convert from float to int)
            r = int(self.draw_color[0] * 255)
            g = int(self.draw_color[1] * 255)
            b = int(self.draw_color[2] * 255)
            
            # Use the paint_system instance methods
            if PaintManager.paint_system and PaintManager.paint_system.canvas:
                PaintManager.paint_system.canvas.set_drawing_color(r, g, b, 255)
                PaintManager.paint_system.canvas.set_drawing_width(self.draw_thickness)
                
                logger.info(f"Set drawing settings: color=({r},{g},{b}), thickness={self.draw_thickness}")
        except ImportError:
            logger.error("PaintManager not available for drawing settings")
        except Exception as e:
            logger.error(f"Failed to set drawing settings: {e}")

    def _open_settings(self):
        """Open the settings panel"""
        try:
            # Get the main GUI instance and open settings panel
            if hasattr(self.context, 'gui') and hasattr(self.context.gui, 'panel_instances'):
                from ..gui_imgui import GuiPanel
                settings_panel = self.context.gui.panel_instances.get(GuiPanel.SETTINGS)
                if settings_panel:
                    settings_panel.open()
                    logger.info("Settings panel opened")
                else:
                    logger.error("Settings panel not found")
            else:
                logger.error("GUI instance not available")
        except Exception as e:
            logger.error(f"Failed to open settings panel: {e}")

    def _initialize_drawing_tool(self):
        """Initialize the drawing tool"""
        try:
            from ..tools.drawing_tool import DrawingTool
            self.context.drawing_tool = DrawingTool(self.context)
            logger.info("Drawing tool initialized")
        except ImportError as e:
            logger.error(f"Failed to import drawing tool: {e}")
        except Exception as e:
            logger.error(f"Failed to initialize drawing tool: {e}")
