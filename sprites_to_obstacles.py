#!/usr/bin/env python3
"""
Light Layer Sprites to Obstacles Converter

This module provides functionality to convert sprites in the "light" layer 
to a numpy array format compatible with the GeometricManager visibility system.

Sprites in the light layer act as visibility obstacles that block line of sight.
Each sprite is converted to a rectangular obstacle represented as line segments.
"""

import numpy as np
import logging
from typing import Optional, List, Tuple
from Actions import Actions
from gui.gui_actions_bridge import GuiActionsBridge

logger = logging.getLogger(__name__)


def sprites_to_obstacles_numpy(table, layer: str = "light", 
                              include_non_collidable: bool = True) -> np.ndarray:
    """
    FAST numpy-vectorized conversion of sprites to obstacles array.
    
    Uses vectorized operations for maximum performance when processing many sprites.
    
    Args:
        table: ContextTable object containing sprite data
        layer: Layer name to extract sprites from (default: "light")
        include_non_collidable: Whether to include non-collidable sprites (default: True)
        
    Returns:
        numpy array of shape (N*4, 2, 2) representing line segments
        Each sprite contributes 4 line segments (rectangle edges)
        Format: [[[x1, y1], [x2, y2]], ...] for each line segment
        
    Note:
        - Returns empty array if no sprites found or layer doesn't exist
        - Each sprite rectangle is converted to 4 line segments (top, right, bottom, left)
        - Uses sprite.frect for position and dimensions
        - Only processes sprites with valid dimensions (w > 0 and h > 0)
        - Optimized with numpy vectorized operations for performance
    """
    if not table or not hasattr(table, 'dict_of_sprites_list'):
        logger.warning("Invalid table object provided")
        return np.array([]).reshape(0, 2, 2)
    
    if layer not in table.dict_of_sprites_list:
        logger.warning(f"Layer '{layer}' not found in table")
        return np.array([]).reshape(0, 2, 2)
    
    sprite_list = table.dict_of_sprites_list[layer]
    if not sprite_list:
        logger.info(f"No sprites found in layer '{layer}'")
        return np.array([]).reshape(0, 2, 2)
    
    # FAST: Pre-filter and extract sprite data in one pass
    valid_sprites = []
    for sprite in sprite_list:
        # Skip non-collidable if filtering
        if not include_non_collidable and hasattr(sprite, 'collidable') and not sprite.collidable:
            continue
            
        # Check for frect
        if not hasattr(sprite, 'frect'):
            continue
            
        try:
            # Extract bounds
            x, y, w, h = float(sprite.frect.x), float(sprite.frect.y), float(sprite.frect.w), float(sprite.frect.h)
            
            # Skip invalid dimensions
            if w <= 0 or h <= 0:
                continue
                
            valid_sprites.append([x, y, w, h])
            
        except (AttributeError, TypeError, ValueError):
            continue
    
    if not valid_sprites:
        logger.info(f"No valid obstacles created from layer '{layer}'")
        return np.array([]).reshape(0, 2, 2)
    
    # FAST: Convert to numpy array for vectorized operations
    sprite_rects = np.array(valid_sprites, dtype=np.float64)  # Shape: (N, 4) [x, y, w, h]
    
    # FAST: Vectorized calculation of all corners
    x, y, w, h = sprite_rects[:, 0], sprite_rects[:, 1], sprite_rects[:, 2], sprite_rects[:, 3]
    
    # Calculate all corner points vectorized
    x2 = x + w  # Right edge x-coordinate
    y2 = y + h  # Bottom edge y-coordinate
    
    # FAST: Create all line segments at once using vectorized operations
    num_sprites = len(sprite_rects)
    
    # Pre-allocate obstacles array: 4 segments per sprite
    obstacles = np.empty((num_sprites * 4, 2, 2), dtype=np.float64)
    
    # Vectorized assignment of all line segments
    # Top edges: (x, y) -> (x2, y)
    obstacles[0::4, 0, 0] = x     # Start x
    obstacles[0::4, 0, 1] = y     # Start y  
    obstacles[0::4, 1, 0] = x2    # End x
    obstacles[0::4, 1, 1] = y     # End y
    
    # Right edges: (x2, y) -> (x2, y2)
    obstacles[1::4, 0, 0] = x2    # Start x
    obstacles[1::4, 0, 1] = y     # Start y
    obstacles[1::4, 1, 0] = x2    # End x  
    obstacles[1::4, 1, 1] = y2    # End y
    
    # Bottom edges: (x2, y2) -> (x, y2)
    obstacles[2::4, 0, 0] = x2    # Start x
    obstacles[2::4, 0, 1] = y2    # Start y
    obstacles[2::4, 1, 0] = x     # End x
    obstacles[2::4, 1, 1] = y2    # End y
    
    # Left edges: (x, y2) -> (x, y)
    obstacles[3::4, 0, 0] = x     # Start x
    obstacles[3::4, 0, 1] = y2    # Start y
    obstacles[3::4, 1, 0] = x     # End x
    obstacles[3::4, 1, 1] = y     # End y
    
    logger.info(f"FAST: Created {len(obstacles)} line segments from {num_sprites} sprites in layer '{layer}'")
    logger.debug(f"Obstacles array shape: {obstacles.shape}")
    
    return obstacles


def get_light_layer_obstacles(context) -> np.ndarray:
    """
    Convenience function to get obstacles from the light layer of the current table.
    
    Args:
        context: Context object with current_table
        
    Returns:
        numpy array of obstacles from light layer sprites
    """
    if not context or not hasattr(context, 'current_table') or not context.current_table:
        logger.warning("No current table in context")
        return np.array([]).reshape(0, 2, 2)
    
    return sprites_to_obstacles_numpy(context.current_table, layer="light")


def get_obstacles_via_actions(actions_bridge: GuiActionsBridge, layer: str = "light") -> np.ndarray:
    """
    FAST: Get obstacles using the Actions bridge interface with numpy optimizations.
    
    This method uses the GUI actions bridge to retrieve sprite data and convert
    it to obstacles format. Optimized with vectorized operations.
    
    Args:
        actions_bridge: GuiActionsBridge instance
        layer: Layer name to extract sprites from (default: "light")
        
    Returns:
        numpy array of obstacles from the specified layer
    """
    if not actions_bridge:
        logger.error("No actions bridge provided")
        return np.array([]).reshape(0, 2, 2)
    
    # Get sprites from the specified layer
    sprites = actions_bridge.get_layer_sprites(layer)
    
    if not sprites:
        logger.info(f"No sprites found in layer '{layer}' via actions bridge")
        return np.array([]).reshape(0, 2, 2)
    
    # FAST: Pre-filter and extract sprite data
    valid_sprites = []
    base_width = 32.0   # Default sprite size
    base_height = 32.0
    
    for sprite_id, sprite_data in sprites.items():
        try:
            # Extract position and scale from sprite data
            position = sprite_data.get('position')
            scale = sprite_data.get('scale', (1.0, 1.0))
            
            if not position:
                continue
            
            x = float(position.x)
            y = float(position.y)
            w = base_width * scale[0]
            h = base_height * scale[1]
            
            # Skip sprites with invalid dimensions
            if w <= 0 or h <= 0:
                continue
            
            valid_sprites.append([x, y, w, h])
            
        except (AttributeError, TypeError, ValueError):
            continue
    
    if not valid_sprites:
        logger.info(f"No valid obstacles created from layer '{layer}' via actions bridge")
        return np.array([]).reshape(0, 2, 2)
    
    # FAST: Convert to numpy array for vectorized operations
    sprite_rects = np.array(valid_sprites, dtype=np.float64)  # Shape: (N, 4) [x, y, w, h]
    
    # FAST: Vectorized calculation of all corners
    x, y, w, h = sprite_rects[:, 0], sprite_rects[:, 1], sprite_rects[:, 2], sprite_rects[:, 3]
    
    # Calculate corner points vectorized
    x2 = x + w
    y2 = y + h
    
    # FAST: Create all line segments at once
    num_sprites = len(sprite_rects)
    obstacles = np.empty((num_sprites * 4, 2, 2), dtype=np.float64)
    
    # Vectorized assignment of line segments (same pattern as main function)
    obstacles[0::4, 0, 0] = x     # Top edges start x
    obstacles[0::4, 0, 1] = y     # Top edges start y  
    obstacles[0::4, 1, 0] = x2    # Top edges end x
    obstacles[0::4, 1, 1] = y     # Top edges end y
    
    obstacles[1::4, 0, 0] = x2    # Right edges start x
    obstacles[1::4, 0, 1] = y     # Right edges start y
    obstacles[1::4, 1, 0] = x2    # Right edges end x  
    obstacles[1::4, 1, 1] = y2    # Right edges end y
    
    obstacles[2::4, 0, 0] = x2    # Bottom edges start x
    obstacles[2::4, 0, 1] = y2    # Bottom edges start y
    obstacles[2::4, 1, 0] = x     # Bottom edges end x
    obstacles[2::4, 1, 1] = y2    # Bottom edges end y
    
    obstacles[3::4, 0, 0] = x     # Left edges start x
    obstacles[3::4, 0, 1] = y2    # Left edges start y
    obstacles[3::4, 1, 0] = x     # Left edges end x
    obstacles[3::4, 1, 1] = y     # Left edges end y
    
    logger.info(f"FAST: Created {len(obstacles)} line segments from {num_sprites} sprites in layer '{layer}' via actions bridge")
    
    return obstacles


def combine_static_and_sprite_obstacles(static_obstacles: np.ndarray, 
                                      sprite_obstacles: np.ndarray) -> np.ndarray:
    """
    Combine static obstacles with sprite-based obstacles.
    
    Args:
        static_obstacles: Existing static obstacles array
        sprite_obstacles: Obstacles generated from sprites
        
    Returns:
        Combined obstacles array
    """
    if static_obstacles.size == 0 and sprite_obstacles.size == 0:
        return np.array([]).reshape(0, 2, 2)
    elif static_obstacles.size == 0:
        return sprite_obstacles
    elif sprite_obstacles.size == 0:
        return static_obstacles
    else:
        # Ensure both arrays have the same shape structure
        if len(static_obstacles.shape) == 3 and len(sprite_obstacles.shape) == 3:
            combined = np.vstack([static_obstacles, sprite_obstacles])
            logger.info(f"Combined {static_obstacles.shape[0]} static + {sprite_obstacles.shape[0]} sprite obstacles = {combined.shape[0]} total")
            return combined
        else:
            logger.error("Shape mismatch in obstacle arrays")
            return static_obstacles


# Example usage and testing
if __name__ == "__main__":
    """
    Test the sprite to obstacles conversion with mock data.
    """
    import ctypes
    import sdl3
    
    # Mock sprite class for testing
    class MockSprite:
        def __init__(self, x, y, w, h, sprite_id="test", collidable=True):
            self.frect = sdl3.SDL_FRect()
            self.frect.x = ctypes.c_float(x)
            self.frect.y = ctypes.c_float(y)
            self.frect.w = ctypes.c_float(w)
            self.frect.h = ctypes.c_float(h)
            self.sprite_id = sprite_id
            self.collidable = collidable
    
    # Mock table class
    class MockTable:
        def __init__(self):
            self.dict_of_sprites_list = {
                'light': [
                    MockSprite(100, 100, 50, 30, "light1"),
                    MockSprite(200, 150, 40, 40, "light2"),
                    MockSprite(300, 200, 60, 20, "light3", collidable=False)
                ],
                'tokens': [
                    MockSprite(50, 50, 32, 32, "token1")
                ]
            }
    
    # Test the conversion
    print("Testing light sprites to obstacles conversion...")
    
    mock_table = MockTable()
    
    # Test light layer conversion
    obstacles = sprites_to_obstacles_numpy(mock_table, "light")
    print(f"Generated obstacles shape: {obstacles.shape}")
    print(f"Number of line segments: {len(obstacles)}")
    print(f"Expected: {len(mock_table.dict_of_sprites_list['light']) * 4} segments")
    
    # Test with non-collidable filtering
    obstacles_collidable = sprites_to_obstacles_numpy(mock_table, "light", include_non_collidable=False)
    print(f"Collidable only obstacles: {len(obstacles_collidable)} segments")
    
    # Show some example obstacles
    if len(obstacles) > 0:
        print(f"First obstacle (line segment): {obstacles[0]}")
        print(f"Second obstacle (line segment): {obstacles[1]}")
    
    print("Test completed successfully!")
