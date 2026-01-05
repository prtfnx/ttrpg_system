"""
Spell Calculator Service
Calculates spell damage, save DC, attack bonus, and upcasting
Production-ready, no mocks
"""

import re
from typing import Dict, Any, Optional
from ..models.spell import Spell


class SpellCalculator:
    """Calculate spell effects and upcasting"""
    
    @staticmethod
    def calculate_upcast_damage(spell: Spell, slot_level: int) -> Dict[str, Any]:
        """
        Calculate damage when casting spell at higher level
        
        Args:
            spell: Spell object with damage info
            slot_level: Spell slot level used (must be >= spell.level)
            
        Returns:
            Dict with base_damage, upcast_damage, total_damage
        """
        if slot_level < spell.level:
            return {"error": f"Cannot cast {spell.level} level spell with {slot_level} level slot"}
        
        if not spell.damage:
            return {"base_damage": None, "upcast_damage": None, "total_damage": None}
        
        # Parse base damage (e.g., "8d6")
        base_match = re.match(r'(\d+)d(\d+)', spell.damage)
        if not base_match:
            return {"base_damage": spell.damage, "upcast_damage": "N/A", "total_damage": spell.damage}
        
        base_dice_count = int(base_match.group(1))
        dice_size = int(base_match.group(2))
        
        # Calculate upcast bonus
        levels_above = slot_level - spell.level
        if levels_above == 0:
            return {
                "base_damage": spell.damage,
                "upcast_damage": "0",
                "total_damage": spell.damage
            }
        
        # Default: +1d[dice] per level above (standard for most damage spells)
        upcast_dice = levels_above
        
        # Check for higher level description patterns
        if spell.higher_level_description:
            desc_lower = spell.higher_level_description.lower()
            
            # Pattern: "1d6 per slot level above 3rd"
            per_level_match = re.search(r'(\d+)d(\d+)\s+(?:for each|per).*?(?:slot )?level(?:\s+above)?', desc_lower)
            if per_level_match:
                upcast_dice = int(per_level_match.group(1)) * levels_above
                dice_size = int(per_level_match.group(2))
        
        total_dice = base_dice_count + upcast_dice
        
        return {
            "base_damage": f"{base_dice_count}d{dice_size}",
            "upcast_bonus": f"+{upcast_dice}d{dice_size}",
            "total_damage": f"{total_dice}d{dice_size}",
            "slot_level": slot_level,
            "levels_above": levels_above
        }
    
    @staticmethod
    def calculate_spell_save_dc(ability_modifier: int, proficiency_bonus: int) -> int:
        """Calculate spell save DC: 8 + proficiency + ability modifier"""
        return 8 + proficiency_bonus + ability_modifier
    
    @staticmethod
    def calculate_spell_attack_bonus(ability_modifier: int, proficiency_bonus: int) -> int:
        """Calculate spell attack bonus: proficiency + ability modifier"""
        return proficiency_bonus + ability_modifier
    
    @staticmethod
    def get_spell_slot_cost(spell: Spell, slot_level: int) -> bool:
        """Check if slot level is valid for spell"""
        return slot_level >= spell.level
    
    @staticmethod
    def calculate_aoe_squares(aoe_description: str, grid_size: int = 5) -> int:
        """
        Calculate approximate grid squares affected by AoE
        
        Args:
            aoe_description: e.g., "20-foot radius", "30-foot cone"
            grid_size: Grid square size in feet (default 5 for D&D)
            
        Returns:
            Approximate number of squares
        """
        # Extract radius/size
        match = re.search(r'(\d+)-foot', aoe_description.lower())
        if not match:
            return 0
        
        size = int(match.group(1))
        
        if 'radius' in aoe_description.lower() or 'sphere' in aoe_description.lower():
            # Circle area: πr², then divide by square size
            radius_squares = size / grid_size
            area = 3.14159 * (radius_squares ** 2)
            return int(area)
        
        elif 'cone' in aoe_description.lower():
            # Cone approximation: area increases with distance
            length_squares = size / grid_size
            avg_width = length_squares / 2
            return int(length_squares * avg_width)
        
        elif 'cube' in aoe_description.lower():
            # Cube: simple square
            side_squares = size / grid_size
            return int(side_squares ** 2)
        
        elif 'line' in aoe_description.lower():
            # Line: length × 1 square wide
            return int(size / grid_size)
        
        return 0
