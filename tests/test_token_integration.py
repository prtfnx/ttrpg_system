"""
Test Monster Token Integration
Tests the complete entity-image linking implementation
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from core_table.compendiums.token_resolution_service import TokenResolutionService, get_token_service
from core_table.compendiums.monsters.monster import Monster
from storage.r2_manager import R2AssetManager
from logger import setup_logger

logger = setup_logger(__name__)


def test_token_resolution():
    """Test token resolution service"""
    
    print("="*60)
    print("Token Resolution Service Test")
    print("="*60)
    
    # Initialize R2 manager (optional - will fallback to local if not configured)
    try:
        r2_manager = R2AssetManager()
        if r2_manager.is_r2_configured():
            print("[OK] R2 configured")
        else:
            r2_manager = None
            print("[SKIP] R2 not configured, using local fallback")
    except:
        r2_manager = None
        print("[SKIP] R2 not available, using local fallback")
    
    # Create token service
    token_service = TokenResolutionService(r2_manager)
    
    print(f"\nLoaded {len(token_service.token_mapping)} token mappings")
    print(f"R2 mappings: {len(token_service.r2_mapping)}")
    
    # Test cases
    test_monsters = [
        ("Goblin", "humanoid"),  # Exact match
        ("Faerie Dragon (Older)", "dragon"),  # Normalized match (parentheses removed)
        ("Giant Rat (Diseased)", "beast"),  # Normalized match
        ("Ancient Red Dragon", "dragon"),  # Exact match
        ("Beholder", "aberration"),  # Exact match
        ("Nonexistent Monster", "aberration"),  # Should use type fallback or generic
        ("Drag n", "dragon"),  # Fuzzy match test
    ]
    
    print("\n" + "="*60)
    print("Resolution Tests")
    print("="*60)
    
    for monster_name, monster_type in test_monsters:
        print(f"\nTesting: {monster_name} ({monster_type})")
        
        # Get token info
        info = token_service.get_token_info(monster_name)
        print(f"  Has Token: {info['has_token']}")
        print(f"  Match Type: {info['match_type']}")
        print(f"  Source: {info['source']}")
        
        if info.get('matched_name'):
            print(f"  Matched Name: {info['matched_name']}")
        
        # Resolve URL
        token_url = token_service.resolve_token_url(
            monster_name,
            monster_type,
            use_r2=False  # Use local for testing
        )
        print(f"  URL: {token_url[:100]}...")


def test_monster_integration():
    """Test monster class integration with tokens"""
    
    print("\n" + "="*60)
    print("Monster Class Integration Test")
    print("="*60)
    
    # Create test monsters
    monsters = [
        Monster("Goblin"),
        Monster("Ancient Red Dragon"),
        Monster("Beholder"),
    ]
    
    # Set types
    monsters[0].type = "humanoid"
    monsters[1].type = "dragon"
    monsters[2].type = "aberration"
    
    # Initialize token service
    token_service = get_token_service()
    
    print("\nResolving tokens for monsters...")
    for monster in monsters:
        monster.token_url = token_service.resolve_token_url(
            monster.name,
            monster.type,
            use_r2=False
        )
        
        # Determine source
        if monster.token_url.startswith('data:'):
            monster.token_source = 'fallback'
        elif '/defaults/' in monster.token_url:
            monster.token_source = 'type_default'
        else:
            monster.token_source = 'local'
        
        print(f"\n{monster.name}:")
        print(f"  Type: {monster.type}")
        print(f"  Token URL: {monster.token_url[:80]}...")
        print(f"  Token Source: {monster.token_source}")
    
    # Test to_dict serialization
    print("\n" + "-"*60)
    print("Testing serialization...")
    
    monster_dict = monsters[0].to_dict()
    print(f"\nGoblin serialized:")
    print(f"  Name: {monster_dict['name']}")
    print(f"  Token URL: {monster_dict.get('token_url', 'N/A')[:80]}...")
    print(f"  Token Source: {monster_dict.get('token_source', 'N/A')}")


def test_fallback_chain():
    """Test the complete fallback chain"""
    
    print("\n" + "="*60)
    print("Fallback Chain Test")
    print("="*60)
    
    token_service = get_token_service()
    
    test_cases = [
        ("Goblin", "humanoid", "Expected: Exact match"),
        ("Faerie Dragon (Older)", "dragon", "Expected: Normalized match (remove parentheses)"),
        ("Anciient Red Dragn", "dragon", "Expected: Fuzzy match to 'Ancient Red Dragon'"),
        ("Completely Unknown Monster XYZ123", "aberration", "Expected: Type fallback or generic"),
        ("Test Monster", None, "Expected: Generic fallback (no type provided)"),
    ]
    
    for monster_name, monster_type, expected in test_cases:
        print(f"\nTest: {monster_name}")
        print(f"  {expected}")
        
        info = token_service.get_token_info(monster_name)
        url = token_service.resolve_token_url(monster_name, monster_type, use_r2=False)
        
        print(f"  Result: {info['match_type']} match")
        if info.get('matched_name'):
            print(f"  Matched to: {info['matched_name']}")
        print(f"  Source: {info['source']}")


def test_performance():
    """Test batch resolution performance"""
    
    print("\n" + "="*60)
    print("Performance Test")
    print("="*60)
    
    import time
    
    token_service = get_token_service()
    
    # Get first 100 monsters from mapping
    monster_names = list(token_service.token_mapping.keys())[:100]
    
    print(f"\nBatch resolving {len(monster_names)} monsters...")
    
    start_time = time.time()
    results = token_service.batch_resolve(monster_names)
    end_time = time.time()
    
    duration = end_time - start_time
    if len(results) > 0:
        print(f"  Resolved {len(results)} tokens in {duration:.3f} seconds")
        print(f"  Average: {(duration / len(results) * 1000):.2f} ms per token")
    else:
        print(f"  No tokens to resolve")
        return
    
    # Test caching
    print("\nTesting cached resolution...")
    start_time = time.time()
    results2 = token_service.batch_resolve(monster_names)
    end_time = time.time()
    
    cached_duration = end_time - start_time
    if cached_duration > 0:
        print(f"  Cached resolution: {cached_duration:.3f} seconds")
        print(f"  Speedup: {duration / cached_duration:.1f}x faster")
    else:
        print(f"  Cached resolution: < 0.001 seconds (instant)")


def main():
    """Run all tests"""
    
    print("\n" + "="*70)
    print(" MONSTER TOKEN INTEGRATION TEST SUITE")
    print("="*70)
    
    try:
        # Test 1: Token Resolution Service
        test_token_resolution()
        
        # Test 2: Monster Class Integration
        test_monster_integration()
        
        # Test 3: Fallback Chain
        test_fallback_chain()
        
        # Test 4: Performance
        test_performance()
        
        print("\n" + "="*70)
        print(" ALL TESTS COMPLETED SUCCESSFULLY [OK]")
        print("="*70 + "\n")
        
    except Exception as e:
        print(f"\n[ERROR] TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
