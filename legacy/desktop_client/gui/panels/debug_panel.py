"""
Debug Panel - Debug information and developer tools
"""

from imgui_bundle import imgui

import time
import psutil


from logger import setup_logger
logger = setup_logger(__name__)


class DebugPanel:
    """Debug panel for performance monitoring and debug information"""
    def __init__(self, context, actions_bridge):
        self.context = context
        self.actions_bridge = actions_bridge
        self.show_performance = True
        self.show_memory = True
        self.show_logs = True
        self.frame_times = []
        self.max_frame_history = 60
        self.last_update = time.time()
    def render(self):
        """Render the debug panel content"""
        
        if not imgui.collapsing_header("Debug Information"):
            return
            
        # Performance metrics
        if self.show_performance:
            self._render_performance_section()
            
        # Memory usage
        if self.show_memory:
            self._render_memory_section()
            
        # Context information
        self._render_context_section()
        
        # Log controls
        if self.show_logs:
            self._render_log_section()
    
    def _render_performance_section(self):
        """Render performance monitoring section"""
        if imgui.collapsing_header("Performance"):
            # Update frame times
            current_time = time.time()
            if self.last_update > 0:
                frame_time = current_time - self.last_update
                self.frame_times.append(frame_time * 1000)  # Convert to ms
                
                # Keep only recent frames
                if len(self.frame_times) > self.max_frame_history:
                    self.frame_times.pop(0)
            
            self.last_update = current_time
            
            if self.frame_times:
                avg_frame_time = sum(self.frame_times) / len(self.frame_times)
                fps = 1000.0 / avg_frame_time if avg_frame_time > 0 else 0
                min_frame_time = min(self.frame_times)
                max_frame_time = max(self.frame_times)
                
                imgui.text(f"FPS: {fps:.1f}")
                imgui.text(f"Frame Time: {avg_frame_time:.2f}ms (avg)")
                imgui.text(f"Range: {min_frame_time:.2f}ms - {max_frame_time:.2f}ms")
    
    def _render_memory_section(self):
        """Render memory usage section"""
        if imgui.collapsing_header("Memory"):
            try:
                process = psutil.Process()
                memory_info = process.memory_info()
                
                memory_mb = memory_info.rss / 1024 / 1024
                imgui.text(f"Memory Usage: {memory_mb:.1f} MB")
                
                # System memory
                system_memory = psutil.virtual_memory()
                imgui.text(f"System Memory: {system_memory.percent:.1f}% used")
                imgui.text(f"Available: {system_memory.available / 1024 / 1024:.0f} MB")
                
            except Exception as e:
                imgui.text("Memory info unavailable")
                logger.warning(f"Failed to get memory info: {e}")
    
    def _render_context_section(self):
        """Render context information section"""
        if imgui.collapsing_header("Context"):
            if hasattr(self.context, '__dict__'):
                imgui.text("Context attributes:")
                
                for key, value in self.context.__dict__.items():
                    # Skip private attributes and methods
                    if key.startswith('_'):
                        continue
                        
                    # Get type and basic info
                    value_type = type(value).__name__
                    
                    if isinstance(value, (list, dict)):
                        value_info = f"{value_type} (len: {len(value)})"
                    elif isinstance(value, (int, float, bool, str)):
                        value_info = f"{value_type}: {str(value)[:50]}"
                    else:
                        value_info = value_type
                    
                    imgui.text(f"  {key}: {value_info}")
            else:
                imgui.text("Context information not available")
    
    def _render_log_section(self):
        """Render logging controls section"""
        if imgui.collapsing_header("Logging"):
            # Log level controls
            current_level = logging.getLogger().getEffectiveLevel()
            level_names = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
            level_values = [logging.DEBUG, logging.INFO, logging.WARNING, logging.ERROR, logging.CRITICAL]
            
            for i, (name, value) in enumerate(zip(level_names, level_values)):
                if imgui.radio_button(name, current_level == value):
                    logging.getLogger().setLevel(value)
                    logger.info(f"Log level changed to {name}")
                
                if i < len(level_names) - 1:
                    imgui.same_line()
            
            imgui.separator()
            
            # Clear logs button
            if imgui.button("Clear Logs"):
                # This would clear logs if we had a custom handler
                logger.info("Log clear requested")
            
            imgui.same_line()
            if imgui.button("Test Log Messages"):
                logger.debug("Test debug message")
                logger.info("Test info message")
                logger.warning("Test warning message")
                logger.error("Test error message")
    
    def update(self):
        """Update debug information (call this each frame)"""
        # This method can be called to update any time-based debug info
        pass
