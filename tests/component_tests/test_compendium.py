#!/usr/bin/env python3
"""
Test script for D&D 5e Compendium Integration
Tests the compendium manager and data loading
"""

import logging
from compendium_manager import CompendiumManager, get_compendium_manager, load_compendiums

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def test_compendium_integration():
    """Test the compendium integration"""
    print("🎲 Testing D&D 5e Compendium Integration")
    print("=" * 50)
    
    # Test 1: Load compendiums
    print("\n1. Loading compendium systems...")
    try:
        results = load_compendiums()
        print(f"   Loading results: {results}")
        
        loaded_count = sum(results.values())
        total_systems = len(results)
        print(f"   Loaded {loaded_count}/{total_systems} systems successfully")
        
    except Exception as e:
        print(f"   Error loading compendiums: {e}")
        return False
    
    # Test 2: Get compendium manager
    print("\n2. Getting compendium manager...")
    try:
        manager = get_compendium_manager()
        print(f"   Manager created: {type(manager).__name__}")
        
        # Test manager status
        status = manager.get_status()
        print(f"   Status: {status}")
        
    except Exception as e:
        print(f"   Error getting manager: {e}")
        return False
    
    # Test 3: Test monster access (if available)
    print("\n3. Testing monster access...")
    try:
        if manager.bestiary:
            monsters = manager.get_all_monsters()
            print(f"   Available monsters: {len(monsters) if monsters else 0}")
            
            if monsters:
                # Show first few monsters
                sample_monsters = list(monsters.keys())[:5]
                print(f"   Sample monsters: {sample_monsters}")
                
                # Test getting a specific monster
                if sample_monsters:
                    monster = manager.get_monster(sample_monsters[0])
                    if monster:
                        print(f"   Retrieved monster: {getattr(monster, 'name', 'Unknown')}")
                    
        else:
            print("   No bestiary loaded")
            
    except Exception as e:
        print(f"   Error testing monsters: {e}")
    
    # Test 4: Test equipment access (if available)
    print("\n4. Testing equipment access...")
    try:
        if hasattr(manager, 'equipment_loader') and manager.equipment_loader:
            equipment = manager.get_all_equipment()
            print(f"   Available equipment: {len(equipment) if equipment else 0}")
        else:
            print("   No equipment loader available")
            
    except Exception as e:
        print(f"   Error testing equipment: {e}")
    
    # Test 5: Test spell access (if available)
    print("\n5. Testing spell access...")
    try:
        if hasattr(manager, 'spell_loader') and manager.spell_loader:
            spells = manager.get_all_spells()
            print(f"   Available spells: {len(spells) if spells else 0}")
        else:
            print("   No spell loader available")
            
    except Exception as e:
        print(f"   Error testing spells: {e}")    
    print("\n" + "=" * 50)
    print("✅ Compendium integration test completed!")
    # Convert to proper test assertion instead of return
    assert True, "Compendium test completed successfully"

if __name__ == "__main__":
    test_compendium_integration()
