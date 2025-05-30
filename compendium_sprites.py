#!/usr/bin/env python3
"""
Compendium Sprite Helper
Utilities for creating sprites from compendium entities
"""

import logging
from pathlib import Path
from typing import Optional, Dict, Any
import uuid

logger = logging.getLogger(__name__)

class CompendiumSpriteHelper:
    """Helper class for creating sprites from compendium entities"""
    
    @staticmethod
    def create_monster_sprite(context, monster_instance, position=(0, 0), table=None):
        """Create a sprite from a monster instance"""
        try:
            # Try to find a token image for the monster
            token_path = CompendiumSpriteHelper._find_monster_token(monster_instance.name)
            
            if not token_path:
                # Fallback to a default monster token
                token_path = b"resources/goblin.png"  # Default monster token
            
            # Create sprite with monster data
            sprite = context.add_sprite(
                texture_path=token_path,
                scale_x=0.5,
                scale_y=0.5,
                layer='tokens',
                coord_x=position[0],
                coord_y=position[1],
                table=table,
                sprite_id=str(uuid.uuid4()),
                collidable=True
            )
            
            if sprite:
                # Attach monster data to sprite
                sprite.compendium_entity = monster_instance
                sprite.entity_type = 'monster'
                
                # Set sprite name for identification
                sprite.name = monster_instance.name
                
                logger.info(f"Created monster sprite for {monster_instance.name}")
                return sprite
            
        except Exception as e:
            logger.error(f"Failed to create monster sprite: {e}")
            
        return None
    
    @staticmethod
    def create_character_sprite(context, character_data, position=(0, 0), table=None):
        """Create a sprite from character data"""
        try:
            # Use a character token - could be based on race/class
            token_path = CompendiumSpriteHelper._find_character_token(character_data)
            
            if not token_path:
                # Fallback to default character tokens
                token_path = b"resources/woman.png"  # Default character token
            
            # Create sprite with character data
            sprite = context.add_sprite(
                texture_path=token_path,
                scale_x=0.5,
                scale_y=0.5,
                layer='tokens',
                coord_x=position[0],
                coord_y=position[1],
                table=table,
                sprite_id=str(uuid.uuid4()),
                character=character_data
            )
            
            if sprite:
                # Attach character data to sprite
                sprite.compendium_entity = character_data
                sprite.entity_type = 'character'
                
                # Set sprite name for identification
                sprite.name = getattr(character_data, 'name', 'Character')
                
                logger.info(f"Created character sprite")
                return sprite
                
        except Exception as e:
            logger.error(f"Failed to create character sprite: {e}")
            
        return None
    
    @staticmethod
    def create_spell_effect_sprite(context, spell_data, position=(0, 0), table=None):
        """Create a visual effect sprite for a spell"""
        try:
            # Find spell effect graphics
            effect_path = CompendiumSpriteHelper._find_spell_effect(spell_data)
            
            if not effect_path:
                # Fallback to default magic effect
                effect_path = b"resources/magic_projectile.gif"
            
            # Create temporary effect sprite
            sprite = context.add_sprite(
                texture_path=effect_path,
                scale_x=0.3,
                scale_y=0.3,
                layer='effects',
                coord_x=position[0],
                coord_y=position[1],
                table=table,
                sprite_id=str(uuid.uuid4()),
                moving=True,
                speed=200
            )
            
            if sprite:
                # Attach spell data to sprite
                sprite.compendium_entity = spell_data
                sprite.entity_type = 'spell'
                
                # Set sprite name for identification
                sprite.name = getattr(spell_data, 'name', 'Spell Effect')
                
                # Set auto-destruction timer (3 seconds)
                sprite.set_die_timer(3000)
                
                logger.info(f"Created spell effect sprite")
                return sprite
                
        except Exception as e:
            logger.error(f"Failed to create spell effect sprite: {e}")
            
        return None
    
    @staticmethod
    def _find_monster_token(monster_name: str) -> Optional[bytes]:
        """Find token image for a monster"""
        # Check if compendium has token mapping
        token_base_path = Path("core_table/compendiums/monster_tokens")
        
        if token_base_path.exists():
            # Common naming patterns for monster tokens
            patterns = [
                f"{monster_name.lower().replace(' ', '_')}.webp",
                f"{monster_name.lower().replace(' ', '-')}.webp",
                f"{monster_name.lower()}.webp",
                f"{monster_name.lower().replace(' ', '_')}.png",
                f"{monster_name.lower().replace(' ', '-')}.png",
                f"{monster_name.lower()}.png"
            ]
            
            for pattern in patterns:
                token_path = token_base_path / pattern
                if token_path.exists():
                    return str(token_path).encode()
        
        return None
    
    @staticmethod
    def _find_character_token(character_data) -> Optional[bytes]:
        """Find appropriate token for character based on race/class"""
        # This could be expanded to match tokens based on race/class
        # For now, use default character tokens
        
        race_name = getattr(character_data, 'race', '').lower()
        class_name = getattr(character_data, 'char_class', '').lower()
        
        # Check for race-specific tokens
        token_patterns = [
            f"resources/{race_name}.png",
            f"resources/{class_name}.png",
            f"resources/character_{race_name}.png",
            f"resources/character_{class_name}.png"
        ]
        
        for pattern in token_patterns:
            if Path(pattern).exists():
                return pattern.encode()
        
        return None
    
    @staticmethod
    def _find_spell_effect(spell_data) -> Optional[bytes]:
        """Find appropriate visual effect for spell"""
        spell_name = getattr(spell_data, 'name', '').lower()
        spell_school = getattr(spell_data, 'school', '').lower()
        
        # Map spell schools to effect graphics
        school_effects = {
            'evocation': 'fire_explosion.png',
            'conjuration': 'magic_projectile.gif',
            'enchantment': 'magic_projectile.gif',
            'illusion': 'magic_projectile.gif',
            'divination': 'magic_projectile.gif',
            'necromancy': 'magic_projectile.gif',
            'transmutation': 'magic_projectile.gif',
            'abjuration': 'magic_projectile.gif'
        }
        
        # Specific spell effects
        spell_effects = {
            'fireball': 'fire_explosion.png',
            'magic missile': 'magic_projectile.gif',
            'lightning bolt': 'magic_projectile.gif'
        }
        
        # Check for specific spell effect first
        if spell_name in spell_effects:
            effect_path = f"resources/{spell_effects[spell_name]}"
            if Path(effect_path).exists():
                return effect_path.encode()
        
        # Check for school-based effect
        if spell_school in school_effects:
            effect_path = f"resources/{school_effects[spell_school]}"
            if Path(effect_path).exists():
                return effect_path.encode()
        
        return None
    
    @staticmethod
    def update_sprite_from_entity(sprite):
        """Update sprite properties based on its compendium entity"""
        if not sprite.compendium_entity or not sprite.entity_type:
            return
        
        try:
            if sprite.entity_type == 'monster':
                CompendiumSpriteHelper._update_monster_sprite(sprite)
            elif sprite.entity_type == 'character':
                CompendiumSpriteHelper._update_character_sprite(sprite)
            elif sprite.entity_type == 'spell':
                CompendiumSpriteHelper._update_spell_sprite(sprite)
                
        except Exception as e:
            logger.error(f"Failed to update sprite from entity: {e}")
    
    @staticmethod
    def _update_monster_sprite(sprite):
        """Update monster sprite based on monster data"""
        monster = sprite.compendium_entity
        
        # Update sprite size based on monster size
        size_scales = {
            'Tiny': 0.25,
            'Small': 0.4,
            'Medium': 0.5,
            'Large': 0.75,
            'Huge': 1.0,
            'Gargantuan': 1.5
        }
        
        monster_size = getattr(monster, 'size', 'Medium')
        if monster_size in size_scales:
            sprite.scale_x = size_scales[monster_size]
            sprite.scale_y = size_scales[monster_size]
    
    @staticmethod
    def _update_character_sprite(sprite):
        """Update character sprite based on character data"""
        character = sprite.compendium_entity
        
        # Could update based on character level, equipment, etc.
        # For now, keep standard character size
        pass
    
    @staticmethod
    def _update_spell_sprite(sprite):
        """Update spell effect sprite based on spell data"""
        spell = sprite.compendium_entity
        
        # Could update based on spell level, duration, etc.
        spell_level = getattr(spell, 'level', 1)
        
        # Scale effect based on spell level
        base_scale = 0.3
        level_scale = base_scale + (spell_level * 0.1)
        sprite.scale_x = min(level_scale, 1.0)
        sprite.scale_y = min(level_scale, 1.0)


# Convenience functions for quick sprite creation
def create_monster_sprite(context, monster_instance, coord_x=0.0, coord_y=0.0, table=None):
    """Quick function to create a monster sprite"""
    return CompendiumSpriteHelper.create_monster_sprite(context, monster_instance, (coord_x, coord_y), table)

def create_character_sprite(context, character_data, coord_x=0.0, coord_y=0.0, table=None):
    """Quick function to create a character sprite"""
    return CompendiumSpriteHelper.create_character_sprite(context, character_data, (coord_x, coord_y), table)

def create_spell_effect_sprite(context, spell_data, coord_x=0.0, coord_y=0.0, table=None):
    """Quick function to create a spell effect sprite"""
    return CompendiumSpriteHelper.create_spell_effect_sprite(context, spell_data, (coord_x, coord_y), table)

def create_compendium_sprite(entity, entity_type, position=(0, 0), context=None):
    """Universal function to create sprites from compendium entities"""
    if not context:
        logger.error("Context required for creating compendium sprites")
        return None
        
    try:
        if entity_type == 'monster':
            return CompendiumSpriteHelper.create_monster_sprite(context, entity, position)
        elif entity_type == 'character':
            return CompendiumSpriteHelper.create_character_sprite(context, entity, position)
        elif entity_type == 'spell' or entity_type == 'equipment':
            # Equipment items can be treated as spell effects for visualization
            return CompendiumSpriteHelper.create_spell_effect_sprite(context, entity, position)
        else:
            logger.warning(f"Unknown entity type: {entity_type}")
            return None
            
    except Exception as e:
        logger.error(f"Failed to create compendium sprite: {e}")
        return None
