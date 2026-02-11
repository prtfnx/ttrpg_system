# This file can be empty.
# Its presence tells Python that the 'equipment' directory is a package.

# Export main classes for package imports
from .equipment import (
    BaseItem, Weapon, Armor, Shield, Tool, MagicItem, Consumable, Container,
    ItemType, WeaponCategory, WeaponProperty, DamageType, ArmorType, MagicItemRarity,
    Money, DamageRoll, ItemProperty
)

__all__ = [
    'BaseItem', 'Weapon', 'Armor', 'Shield', 'Tool', 'MagicItem', 'Consumable', 'Container',
    'ItemType', 'WeaponCategory', 'WeaponProperty', 'DamageType', 'ArmorType', 'MagicItemRarity',
    'Money', 'DamageRoll', 'ItemProperty'
]