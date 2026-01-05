"""
Treasure Generator Service
Generates treasure based on CR and encounter difficulty (DMG p. 133-139)
"""

import random
from typing import Dict, List, Any, Optional
from pathlib import Path
import sys

models_dir = Path(__file__).parent.parent / "models"
sys.path.insert(0, str(models_dir))

from equipment import ItemRarity


class TreasureGenerator:
    """Generate treasure based on D&D 5e DMG treasure tables"""
    
    # Treasure hoard by CR (DMG p. 133)
    HOARD_TABLES = {
        (0, 4): {
            'cp': (600, 6000), 'sp': (300, 3000), 'gp': (200, 2000),
            'magic_chance': 0.06  # 6% chance per item tier
        },
        (5, 10): {
            'cp': (200, 2000), 'sp': (2000, 20000), 'gp': (600, 6000), 'pp': (30, 300),
            'magic_chance': 0.16
        },
        (11, 16): {
            'gp': (400, 4000), 'pp': (500, 5000),
            'magic_chance': 0.36
        },
        (17, 20): {
            'gp': (1200, 12000), 'pp': (800, 8000),
            'magic_chance': 0.52
        }
    }
    
    # Individual treasure per CR (DMG p. 136)
    INDIVIDUAL_TABLES = {
        (0, 4): {'cp': (50, 500), 'sp': (0, 0), 'gp': (0, 0)},
        (5, 10): {'cp': (0, 0), 'sp': (100, 1000), 'gp': (20, 200)},
        (11, 16): {'sp': (0, 0), 'gp': (200, 2000), 'pp': (20, 200)},
        (17, 20): {'gp': (0, 0), 'pp': (200, 2000)}
    }
    
    # Magic item distribution by rarity
    RARITY_WEIGHTS = {
        ItemRarity.COMMON: 45,
        ItemRarity.UNCOMMON: 30,
        ItemRarity.RARE: 15,
        ItemRarity.VERY_RARE: 7,
        ItemRarity.LEGENDARY: 3
    }
    
    def __init__(self, equipment_service=None):
        """Initialize with optional equipment service for magic items"""
        self.equipment_service = equipment_service
    
    def _get_cr_tier(self, cr: int) -> tuple:
        """Get CR tier for treasure tables"""
        for tier in [(0, 4), (5, 10), (11, 16), (17, 20)]:
            if tier[0] <= cr <= tier[1]:
                return tier
        return (0, 4)  # Default to lowest tier
    
    def _roll_currency(self, min_val: int, max_val: int) -> int:
        """Roll for currency amount"""
        if max_val == 0:
            return 0
        return random.randint(min_val, max_val)
    
    def generate_individual_treasure(self, cr: int, num_creatures: int = 1) -> Dict[str, Any]:
        """Generate treasure from individual creatures"""
        tier = self._get_cr_tier(cr)
        table = self.INDIVIDUAL_TABLES[tier]
        
        treasure = {
            'cp': 0, 'sp': 0, 'ep': 0, 'gp': 0, 'pp': 0,
            'items': []
        }
        
        for _ in range(num_creatures):
            for coin, (min_val, max_val) in table.items():
                treasure[coin] += self._roll_currency(min_val, max_val)
        
        return treasure
    
    def generate_hoard_treasure(self, cr: int) -> Dict[str, Any]:
        """Generate treasure hoard"""
        tier = self._get_cr_tier(cr)
        table = self.HOARD_TABLES[tier]
        
        treasure = {
            'cp': 0, 'sp': 0, 'ep': 0, 'gp': 0, 'pp': 0,
            'items': []
        }
        
        # Roll coins
        for coin in ['cp', 'sp', 'gp', 'pp']:
            if coin in table:
                min_val, max_val = table[coin]
                treasure[coin] = self._roll_currency(min_val, max_val)
        
        # Roll for magic items
        magic_chance = table.get('magic_chance', 0)
        num_magic_items = self._determine_magic_items(magic_chance, cr)
        
        if num_magic_items > 0 and self.equipment_service:
            treasure['items'] = self._generate_magic_items(num_magic_items, cr)
        
        return treasure
    
    def _determine_magic_items(self, base_chance: float, cr: int) -> int:
        """Determine number of magic items based on chance"""
        count = 0
        
        # Higher CR = more rolls
        rolls = 1 + (cr // 5)
        
        for _ in range(rolls):
            if random.random() < base_chance:
                count += 1
        
        return count
    
    def _generate_magic_items(self, count: int, cr: int) -> List[Dict[str, Any]]:
        """Generate random magic items based on CR"""
        if not self.equipment_service:
            return []
        
        items = []
        magic_items = self.equipment_service.get_magic_items()
        
        if not magic_items:
            return []
        
        # Adjust rarity weights by CR
        tier = self._get_cr_tier(cr)
        weights = self._adjust_rarity_weights(tier)
        
        for _ in range(count):
            # Select rarity based on weights
            rarity = random.choices(
                list(weights.keys()),
                weights=list(weights.values())
            )[0]
            
            # Get items of that rarity
            rarity_items = [i for i in magic_items if i.rarity == rarity]
            
            if rarity_items:
                item = random.choice(rarity_items)
                items.append(item.to_dict())
        
        return items
    
    def _adjust_rarity_weights(self, tier: tuple) -> Dict[ItemRarity, int]:
        """Adjust rarity weights based on CR tier"""
        weights = self.RARITY_WEIGHTS.copy()
        
        # Lower tiers: favor common/uncommon
        if tier == (0, 4):
            weights[ItemRarity.COMMON] = 60
            weights[ItemRarity.UNCOMMON] = 30
            weights[ItemRarity.RARE] = 8
            weights[ItemRarity.VERY_RARE] = 2
            weights[ItemRarity.LEGENDARY] = 0
        
        # Mid tiers: balanced
        elif tier == (5, 10):
            weights[ItemRarity.COMMON] = 35
            weights[ItemRarity.UNCOMMON] = 35
            weights[ItemRarity.RARE] = 20
            weights[ItemRarity.VERY_RARE] = 8
            weights[ItemRarity.LEGENDARY] = 2
        
        # High tiers: favor rare+
        elif tier == (11, 16):
            weights[ItemRarity.COMMON] = 15
            weights[ItemRarity.UNCOMMON] = 25
            weights[ItemRarity.RARE] = 35
            weights[ItemRarity.VERY_RARE] = 20
            weights[ItemRarity.LEGENDARY] = 5
        
        # Epic tiers: mostly rare/legendary
        elif tier == (17, 20):
            weights[ItemRarity.COMMON] = 5
            weights[ItemRarity.UNCOMMON] = 10
            weights[ItemRarity.RARE] = 30
            weights[ItemRarity.VERY_RARE] = 35
            weights[ItemRarity.LEGENDARY] = 20
        
        return weights
    
    def generate_treasure(
        self,
        cr: int,
        num_creatures: int = 1,
        hoard: bool = False
    ) -> Dict[str, Any]:
        """
        Generate treasure for an encounter
        
        Args:
            cr: Challenge rating
            num_creatures: Number of creatures
            hoard: True for hoard treasure, False for individual
        
        Returns:
            Dict with coins and magic items
        """
        if hoard:
            return self.generate_hoard_treasure(cr)
        else:
            return self.generate_individual_treasure(cr, num_creatures)
    
    def treasure_to_summary(self, treasure: Dict[str, Any]) -> str:
        """Convert treasure dict to readable summary"""
        parts = []
        
        # Coins
        coins = []
        for coin in ['pp', 'gp', 'ep', 'sp', 'cp']:
            if treasure.get(coin, 0) > 0:
                coins.append(f"{treasure[coin]} {coin}")
        
        if coins:
            parts.append(', '.join(coins))
        
        # Items
        if treasure.get('items'):
            items_str = f"{len(treasure['items'])} magic item(s)"
            parts.append(items_str)
        
        return '; '.join(parts) if parts else 'No treasure'
