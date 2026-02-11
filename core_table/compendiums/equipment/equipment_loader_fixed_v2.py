#!/usr/bin/env python3
"""
D&D 5e Equipment System - Data Loader
Load equipment data for use in the VTT system
"""

import json
from pathlib import Path
from typing import Dict, List, Optional, Any
try:
    from .equipment import (
        BaseItem, Weapon, Armor, Shield, Tool, MagicItem, Consumable, Container,
        ItemType, WeaponCategory, WeaponProperty, DamageType, ArmorType, MagicItemRarity,
        Money, DamageRoll, ItemProperty
    )
except ImportError:
    from equipment import (
        BaseItem, Weapon, Armor, Shield, Tool, MagicItem, Consumable, Container,
        ItemType, WeaponCategory, WeaponProperty, DamageType, ArmorType, MagicItemRarity,
        Money, DamageRoll, ItemProperty
    )


class EquipmentLoader:
    """Load equipment data from exported files"""
    
    def __init__(self, data_directory: str = "../exports"):
        self.data_directory = Path(data_directory)
        self.equipment: Dict[str, BaseItem] = {}
        self.weapons: Dict[str, Weapon] = {}
        self.armor: Dict[str, Armor] = {}
        self.shields: Dict[str, Shield] = {}
        self.tools: Dict[str, Tool] = {}
        self.magic_items: Dict[str, MagicItem] = {}
        self.consumables: Dict[str, Consumable] = {}
        self.containers: Dict[str, Container] = {}
        self.general_gear: Dict[str, BaseItem] = {}
        self.loaded = False
    
    def load_equipment_data(self, filename: str = "equipment_data.json") -> bool:
        """Load equipment data from JSON file"""
        try:
            data_path = self.data_directory / filename
            print(f"Loading equipment data from: {data_path}")
            
            if not data_path.exists():
                print(f"Equipment data file not found: {data_path}")
                return False
            
            with open(data_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Access equipment data from the correct structure
            if 'equipment' not in data:
                print("No 'equipment' section found in data file")
                return False
                
            equipment_data = data['equipment']
            
            # Load equipment by type
            for category, items in equipment_data.items():
                if category == "weapons":
                    for item_data in items:
                        weapon = self._dict_to_weapon(item_data)
                        if weapon:
                            self.weapons[weapon.name] = weapon
                            self.equipment[weapon.name] = weapon
                
                elif category == "armor":
                    for item_data in items:
                        armor_item = self._dict_to_armor(item_data)
                        if armor_item:
                            self.armor[armor_item.name] = armor_item
                            self.equipment[armor_item.name] = armor_item
                
                elif category == "shields":
                    for item_data in items:
                        shield = self._dict_to_shield(item_data)
                        if shield:
                            self.shields[shield.name] = shield
                            self.equipment[shield.name] = shield
                
                elif category == "tools":
                    for item_data in items:
                        tool = self._dict_to_tool(item_data)
                        if tool:
                            self.tools[tool.name] = tool
                            self.equipment[tool.name] = tool
                
                elif category == "magic_items":
                    for item_data in items:
                        magic_item = self._dict_to_magic_item(item_data)
                        if magic_item:
                            self.magic_items[magic_item.name] = magic_item
                            self.equipment[magic_item.name] = magic_item
                
                elif category == "consumables":
                    for item_data in items:
                        consumable = self._dict_to_consumable(item_data)
                        if consumable:
                            self.consumables[consumable.name] = consumable
                            self.equipment[consumable.name] = consumable
                
                elif category == "containers":
                    for item_data in items:
                        container = self._dict_to_container(item_data)
                        if container:
                            self.containers[container.name] = container
                            self.equipment[container.name] = container
                
                elif category == "general_gear" or category == "gear":
                    for item_data in items:
                        gear = self._dict_to_base_item(item_data)
                        if gear:
                            self.general_gear[gear.name] = gear
                            self.equipment[gear.name] = gear
            
            self.loaded = True
            print(f"Loaded {len(self.equipment)} total equipment items:")
            print(f"   Weapons: {len(self.weapons)}")
            print(f"   Armor: {len(self.armor)}")
            print(f"   Shields: {len(self.shields)}")
            print(f"   Tools: {len(self.tools)}")
            print(f"   Magic Items: {len(self.magic_items)}")
            print(f"   Consumables: {len(self.consumables)}")
            print(f"   Containers: {len(self.containers)}")
            print(f"   General Gear: {len(self.general_gear)}")
            return True
            
        except Exception as e:            
            print(f"Error loading equipment data: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def _safe_enum_value(self, enum_class, value, default):
        """Safely convert a value to an enum, returning default if invalid"""
        if not value or value == {} or value is None:
            return default
        
        if isinstance(value, str):
            # Try to find enum value by string
            for enum_item in enum_class:
                if enum_item.value.upper() == value.upper() or enum_item.name.upper() == value.upper():
                    return enum_item
            return default
        
        if isinstance(value, enum_class):
            return value
            
        return default
    
    def _get_item_type_from_category(self, category: str) -> ItemType:
        """Determine ItemType from category string"""
        category_map = {
            'weapons': ItemType.WEAPON,
            'armor': ItemType.ARMOR,
            'shields': ItemType.SHIELD,
            'tools': ItemType.TOOL,
            'magic_items': ItemType.MAGIC_ITEM,
            'consumables': ItemType.CONSUMABLE,
            'containers': ItemType.CONTAINER,
            'general_gear': ItemType.GEAR,
            'gear': ItemType.GEAR,
            'currency': ItemType.CURRENCY
        }
        return category_map.get(category, ItemType.GEAR)
    
    def _dict_to_money(self, data: Dict[str, int]) -> Money:
        """Convert dictionary data to Money object"""
        if not data:
            return Money()
        
        return Money(
            copper=data.get('copper', 0),
            silver=data.get('silver', 0),
            electrum=data.get('electrum', 0),
            gold=data.get('gold', 0),
            platinum=data.get('platinum', 0)
        )
    
    def _dict_to_base_item(self, data: Dict[str, Any]) -> Optional[BaseItem]:
        """Convert dictionary data to BaseItem object"""
        try:
            item = BaseItem(
                name=data.get('name', ''),
                description=data.get('description', ''),
                item_type=self._safe_enum_value(ItemType, data.get('item_type'), ItemType.GEAR),
                weight=data.get('weight', 0.0),
                cost=self._dict_to_money(data.get('cost', {})),
                rarity=self._safe_enum_value(MagicItemRarity, data.get('rarity'), MagicItemRarity.COMMON),
                source=data.get('source', 'Unknown'),
                page=data.get('page'),
                requires_attunement=data.get('requires_attunement', False),
                attunement_description=data.get('attunement_description', ''),
                tags=data.get('tags', [])
            )
            
            # Handle properties
            if 'properties' in data:
                for prop_data in data['properties']:
                    item.add_property(
                        prop_data.get('name', ''),
                        prop_data.get('description', ''),
                        prop_data.get('value')
                    )
            
            return item
        except Exception as e:
            print(f"Error creating base item from {data.get('name', 'unknown')}: {e}")
            return None

    def _dict_to_weapon(self, data: Dict[str, Any]) -> Optional[Weapon]:
        """Convert dictionary data to Weapon object"""
        try:
            weapon = Weapon(
                name=data.get('name', ''),
                description=data.get('description', ''),
                item_type=ItemType.WEAPON,
                weight=data.get('weight', 0.0),
                cost=self._dict_to_money(data.get('cost', {})),
                rarity=self._safe_enum_value(MagicItemRarity, data.get('rarity'), MagicItemRarity.COMMON),
                source=data.get('source', 'Unknown'),
                page=data.get('page'),
                requires_attunement=data.get('requires_attunement', False),
                attunement_description=data.get('attunement_description', ''),
                tags=data.get('tags', []),
                
                # Weapon-specific attributes
                weapon_category=self._safe_enum_value(WeaponCategory, data.get('weapon_category'), WeaponCategory.SIMPLE_MELEE),
                range_normal=data.get('range_normal'),
                range_long=data.get('range_long')
            )
            
            # Handle damage roll
            if 'damage_roll' in data and data['damage_roll']:
                damage_data = data['damage_roll']                
                weapon.damage_roll = DamageRoll(
                    dice_count=damage_data.get('dice_count', 1),
                    dice_type=damage_data.get('dice_type', 4),
                    damage_type=self._safe_enum_value(DamageType, damage_data.get('damage_type'), DamageType.SLASHING),
                    modifier=damage_data.get('modifier', 0),
                    versatile_dice_count=damage_data.get('versatile_dice_count'),
                    versatile_dice_type=damage_data.get('versatile_dice_type')
                )
            
            # Handle weapon properties
            if 'weapon_properties' in data:
                for prop_name in data['weapon_properties']:
                    if prop_name and prop_name != {}:
                        weapon_prop = self._safe_enum_value(WeaponProperty, prop_name, None)
                        if weapon_prop:
                            weapon.weapon_properties.append(weapon_prop)
            
            # Handle general properties
            if 'properties' in data:
                for prop_data in data['properties']:
                    weapon.add_property(
                        prop_data.get('name', ''),
                        prop_data.get('description', ''),
                        prop_data.get('value')
                    )
            
            return weapon
        except Exception as e:
            print(f"Error creating weapon from {data.get('name', 'unknown')}: {e}")
            return None
    
    def _dict_to_armor(self, data: Dict[str, Any]) -> Optional[Armor]:
        """Convert dictionary data to Armor object"""
        try:
            armor = Armor(
                name=data.get('name', ''),
                description=data.get('description', ''),
                item_type=ItemType.ARMOR,
                weight=data.get('weight', 0.0),
                cost=self._dict_to_money(data.get('cost', {})),
                rarity=self._safe_enum_value(MagicItemRarity, data.get('rarity'), MagicItemRarity.COMMON),
                source=data.get('source', 'Unknown'),
                page=data.get('page'),
                requires_attunement=data.get('requires_attunement', False),
                attunement_description=data.get('attunement_description', ''),
                tags=data.get('tags', []),
                
                # Armor-specific attributes
                armor_type=self._safe_enum_value(ArmorType, data.get('armor_type'), ArmorType.LIGHT),
                armor_class=data.get('armor_class', 10),
                max_dex_bonus=data.get('max_dex_bonus'),
                min_strength=data.get('min_strength', 0),
                stealth_disadvantage=data.get('stealth_disadvantage', False)
            )
            
            # Handle general properties
            if 'properties' in data:
                for prop_data in data['properties']:
                    armor.add_property(
                        prop_data.get('name', ''),
                        prop_data.get('description', ''),
                        prop_data.get('value')
                    )
            
            return armor
        except Exception as e:
            print(f"Error creating armor from {data.get('name', 'unknown')}: {e}")
            return None
    
    def _dict_to_shield(self, data: Dict[str, Any]) -> Optional[Shield]:
        """Convert dictionary data to Shield object"""
        try:
            shield = Shield(
                name=data.get('name', ''),
                description=data.get('description', ''),
                item_type=ItemType.SHIELD,
                weight=data.get('weight', 0.0),
                cost=self._dict_to_money(data.get('cost', {})),
                rarity=self._safe_enum_value(MagicItemRarity, data.get('rarity'), MagicItemRarity.COMMON),
                source=data.get('source', 'Unknown'),
                page=data.get('page'),
                requires_attunement=data.get('requires_attunement', False),
                attunement_description=data.get('attunement_description', ''),
                tags=data.get('tags', []),
                
                # Shield-specific attributes
                armor_class_bonus=data.get('armor_class_bonus', 2)
            )
            
            # Handle general properties
            if 'properties' in data:
                for prop_data in data['properties']:
                    shield.add_property(
                        prop_data.get('name', ''),
                        prop_data.get('description', ''),
                        prop_data.get('value')
                    )
            
            return shield
        except Exception as e:
            print(f"Error creating shield from {data.get('name', 'unknown')}: {e}")
            return None
    
    def _dict_to_tool(self, data: Dict[str, Any]) -> Optional[Tool]:
        """Convert dictionary data to Tool object"""
        try:
            tool = Tool(
                name=data.get('name', ''),
                description=data.get('description', ''),
                item_type=ItemType.TOOL,
                weight=data.get('weight', 0.0),
                cost=self._dict_to_money(data.get('cost', {})),
                rarity=self._safe_enum_value(MagicItemRarity, data.get('rarity'), MagicItemRarity.COMMON),
                source=data.get('source', 'Unknown'),
                page=data.get('page'),
                requires_attunement=data.get('requires_attunement', False),
                attunement_description=data.get('attunement_description', ''),
                tags=data.get('tags', []),
                
                # Tool-specific attributes
                tool_type=data.get('tool_type', 'misc')
            )
            
            # Handle general properties
            if 'properties' in data:
                for prop_data in data['properties']:
                    tool.add_property(
                        prop_data.get('name', ''),
                        prop_data.get('description', ''),
                        prop_data.get('value')
                    )
            
            return tool
        except Exception as e:
            print(f"Error creating tool from {data.get('name', 'unknown')}: {e}")
            return None
    
    def _dict_to_magic_item(self, data: Dict[str, Any]) -> Optional[MagicItem]:
        """Convert dictionary data to MagicItem object"""
        try:
            magic_item = MagicItem(
                name=data.get('name', ''),
                description=data.get('description', ''),
                item_type=ItemType.MAGIC_ITEM,
                weight=data.get('weight', 0.0),
                cost=self._dict_to_money(data.get('cost', {})),
                rarity=self._safe_enum_value(MagicItemRarity, data.get('rarity'), MagicItemRarity.COMMON),
                source=data.get('source', 'Unknown'),
                page=data.get('page'),
                requires_attunement=data.get('requires_attunement', False),
                attunement_description=data.get('attunement_description', ''),
                tags=data.get('tags', []),
                
                # Magic item specific attributes
                charges=data.get('charges'),
                max_charges=data.get('max_charges'),
                charge_recovery=data.get('charge_recovery', ''),
                spell_abilities=data.get('spell_abilities', []),
                command_word=data.get('command_word'),
                activation_time=data.get('activation_time', '1 action')
            )
            
            # Handle general properties
            if 'properties' in data:
                for prop_data in data['properties']:
                    magic_item.add_property(
                        prop_data.get('name', ''),
                        prop_data.get('description', ''),
                        prop_data.get('value')
                    )
            
            return magic_item
        except Exception as e:
            print(f"Error creating magic item from {data.get('name', 'unknown')}: {e}")
            return None
    
    def _dict_to_consumable(self, data: Dict[str, Any]) -> Optional[Consumable]:
        """Convert dictionary data to Consumable object"""
        try:
            consumable = Consumable(
                name=data.get('name', ''),
                description=data.get('description', ''),
                item_type=ItemType.CONSUMABLE,
                weight=data.get('weight', 0.0),
                cost=self._dict_to_money(data.get('cost', {})),
                rarity=self._safe_enum_value(MagicItemRarity, data.get('rarity'), MagicItemRarity.COMMON),
                source=data.get('source', 'Unknown'),
                page=data.get('page'),
                requires_attunement=data.get('requires_attunement', False),
                attunement_description=data.get('attunement_description', ''),
                tags=data.get('tags', []),
                
                # Consumable-specific attributes
                uses=data.get('uses', 1),
                spell_effect=data.get('spell_effect'),
                spell_level=data.get('spell_level'),
                spell_save_dc=data.get('spell_save_dc')
            )
            
            # Handle general properties
            if 'properties' in data:
                for prop_data in data['properties']:
                    consumable.add_property(
                        prop_data.get('name', ''),
                        prop_data.get('description', ''),
                        prop_data.get('value')
                    )
            
            return consumable
        except Exception as e:
            print(f"Error creating consumable from {data.get('name', 'unknown')}: {e}")
            return None
    
    def _dict_to_container(self, data: Dict[str, Any]) -> Optional[Container]:
        """Convert dictionary data to Container object"""
        try:
            container = Container(
                name=data.get('name', ''),
                description=data.get('description', ''),
                item_type=ItemType.CONTAINER,
                weight=data.get('weight', 0.0),
                cost=self._dict_to_money(data.get('cost', {})),
                rarity=self._safe_enum_value(MagicItemRarity, data.get('rarity'), MagicItemRarity.COMMON),
                source=data.get('source', 'Unknown'),
                page=data.get('page'),
                requires_attunement=data.get('requires_attunement', False),
                attunement_description=data.get('attunement_description', ''),
                tags=data.get('tags', []),
                
                # Container-specific attributes
                capacity_weight=data.get('capacity_weight', 0.0),
                capacity_volume=data.get('capacity_volume', 0.0)
            )
            
            # Handle general properties
            if 'properties' in data:
                for prop_data in data['properties']:
                    container.add_property(
                        prop_data.get('name', ''),
                        prop_data.get('description', ''),
                        prop_data.get('value')
                    )
            
            return container
        except Exception as e:
            print(f"Error creating container from {data.get('name', 'unknown')}: {e}")
            return None
    
    # Equipment access methods
    def get_item(self, name: str) -> Optional[BaseItem]:
        """Get any equipment item by name"""
        if not self.loaded:
            return None
        return self.equipment.get(name)
    
    def get_weapon(self, name: str) -> Optional[Weapon]:
        """Get a weapon by name"""
        if not self.loaded:
            return None
        return self.weapons.get(name)
    
    def get_armor(self, name: str) -> Optional[Armor]:
        """Get an armor piece by name"""
        if not self.loaded:
            return None
        return self.armor.get(name)
    
    def get_shield(self, name: str) -> Optional[Shield]:
        """Get a shield by name"""
        if not self.loaded:
            return None
        return self.shields.get(name)
    
    def get_tool(self, name: str) -> Optional[Tool]:
        """Get a tool by name"""
        if not self.loaded:
            return None
        return self.tools.get(name)
    
    def get_magic_item(self, name: str) -> Optional[MagicItem]:
        """Get a magic item by name"""
        if not self.loaded:
            return None
        return self.magic_items.get(name)
    
    def get_consumable(self, name: str) -> Optional[Consumable]:
        """Get a consumable by name"""
        if not self.loaded:
            return None
        return self.consumables.get(name)
    
    def get_container(self, name: str) -> Optional[Container]:
        """Get a container by name"""
        if not self.loaded:
            return None
        return self.containers.get(name)
    
    # Collection access methods
    def get_all_weapons(self) -> List[Weapon]:
        """Get all available weapons"""
        if not self.loaded:
            return []
        return list(self.weapons.values())
    
    def get_all_armor(self) -> List[Armor]:
        """Get all available armor"""
        if not self.loaded:
            return []
        return list(self.armor.values())
    
    def get_all_shields(self) -> List[Shield]:
        """Get all available shields"""
        if not self.loaded:
            return []
        return list(self.shields.values())
    
    def get_all_tools(self) -> List[Tool]:
        """Get all available tools"""
        if not self.loaded:
            return []
        return list(self.tools.values())
    
    def get_all_magic_items(self) -> List[MagicItem]:
        """Get all available magic items"""
        if not self.loaded:
            return []
        return list(self.magic_items.values())
    
    def get_all_consumables(self) -> List[Consumable]:
        """Get all available consumables"""
        if not self.loaded:
            return []
        return list(self.consumables.values())
    
    def get_all_containers(self) -> List[Container]:
        """Get all available containers"""
        if not self.loaded:
            return []
        return list(self.containers.values())
    
    def get_all_equipment(self) -> List[BaseItem]:
        """Get all available equipment"""
        if not self.loaded:
            return []
        return list(self.equipment.values())
    
    # Search methods
    def search_equipment(self, query: str) -> List[BaseItem]:
        """Search all equipment by name"""
        if not self.loaded:
            return []
        
        query_lower = query.lower()
        return [item for item in self.equipment.values() 
                if query_lower in item.name.lower()]
    
    def search_weapons(self, query: str) -> List[Weapon]:
        """Search weapons by name"""
        if not self.loaded:
            return []
        
        query_lower = query.lower()
        return [weapon for weapon in self.weapons.values() 
                if query_lower in weapon.name.lower()]
    
    def search_armor(self, query: str) -> List[Armor]:
        """Search armor by name"""
        if not self.loaded:
            return []
        
        query_lower = query.lower()
        return [armor for armor in self.armor.values() 
                if query_lower in armor.name.lower()]
    
    def search_magic_items(self, query: str) -> List[MagicItem]:
        """Search magic items by name"""
        if not self.loaded:
            return []
        
        query_lower = query.lower()
        return [item for item in self.magic_items.values() 
                if query_lower in item.name.lower()]
    
    # Filter methods
    def get_weapons_by_category(self, category: WeaponCategory) -> List[Weapon]:
        """Get weapons by category"""
        if not self.loaded:
            return []
        return [weapon for weapon in self.weapons.values() 
                if weapon.weapon_category == category]
    
    def get_armor_by_type(self, armor_type: ArmorType) -> List[Armor]:
        """Get armor by type"""
        if not self.loaded:
            return []
        return [armor for armor in self.armor.values() 
                if armor.armor_type == armor_type]
    
    def get_magic_items_by_rarity(self, rarity: MagicItemRarity) -> List[MagicItem]:
        """Get magic items by rarity"""
        if not self.loaded:
            return []
        return [item for item in self.magic_items.values() 
                if item.rarity == rarity]
    
    def get_equipment_summary(self) -> Dict[str, Any]:
        """Get summary of available equipment"""
        if not self.loaded:
            return {'error': 'Equipment data not loaded'}
        
        return {
            'total_items': len(self.equipment),
            'weapons': len(self.weapons),
            'armor': len(self.armor), 
            'shields': len(self.shields),
            'tools': len(self.tools),
            'magic_items': len(self.magic_items),
            'consumables': len(self.consumables),
            'containers': len(self.containers),
            'gear': len(self.general_gear),
            'categories': {
                'weapons': len(self.weapons),
                'armor': len(self.armor),
                'shields': len(self.shields),
                'tools': len(self.tools),
                'magic_items': len(self.magic_items),
                'consumables': len(self.consumables),
                'containers': len(self.containers),
                'general_gear': len(self.general_gear)
            }
        }


def main():
    """Test the equipment loader"""
    print("D&D 5e Equipment Data Loader Test")
    print("=" * 50)
    
    loader = EquipmentLoader()
    
    if loader.load_equipment_data():
        print(f"\nEquipment Data Summary:")
        summary = loader.get_equipment_summary()
        
        print(f"Total Items: {summary['total_items']}")
        print(f"  Weapons: {summary['weapons']}")
        print(f"  Armor: {summary['armor']}")
        print(f"  Shields: {summary['shields']}")
        print(f"  Tools: {summary['tools']}")
        print(f"  Magic Items: {summary['magic_items']}")
        print(f"  Consumables: {summary['consumables']}")
        print(f"  Containers: {summary['containers']}")
        print(f"  General Gear: {summary['gear']}")
        
        # Test searches
        print(f"\nSearch Tests:")
        swords = loader.search_weapons("sword")
        print(f"Sword weapons found: {len(swords)}")
        if swords:
            for weapon in swords[:3]:
                damage_info = ""
                if weapon.damage_roll:
                    damage_info = f" ({weapon.damage_roll})"
                print(f"  - {weapon.name}{damage_info}")
        
        leather_armor = loader.search_armor("leather")
        print(f"Leather armor found: {len(leather_armor)}")
        if leather_armor:
            for armor in leather_armor[:3]:
                print(f"  - {armor.name} (AC {armor.armor_class})")
        
        magic_weapons = loader.search_magic_items("sword")
        print(f"Magic sword items found: {len(magic_weapons)}")
        if magic_weapons:
            for item in magic_weapons[:3]:
                print(f"  - {item.name} ({item.rarity.value})")
        
        print(f"\nEquipment loader test complete!")
    else:
        print(f"Failed to load equipment data")


if __name__ == "__main__":
    main()
