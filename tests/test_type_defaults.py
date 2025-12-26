"""
Test type-based default token fallback
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core_table.compendiums.token_resolution_service import TokenResolutionService
from storage.r2_manager import R2AssetManager

def test_type_defaults():
    """Test type-based default tokens"""
    
    print("=" * 60)
    print("TYPE-BASED DEFAULT TOKENS TEST")
    print("=" * 60)
    
    # Initialize
    r2_manager = R2AssetManager()
    token_service = TokenResolutionService(r2_manager=r2_manager)
    
    # Test with fake monsters of each type
    creature_types = [
        'aberration', 'beast', 'celestial', 'construct', 'dragon',
        'elemental', 'fey', 'fiend', 'giant', 'humanoid',
        'monstrosity', 'ooze', 'plant', 'undead'
    ]
    
    print(f"\nTesting {len(creature_types)} creature types...\n")
    
    for creature_type in creature_types:
        # Create fake monster name that won't exist in database
        fake_monster = f"Fake {creature_type.title()} Monster XYZ"
        
        # Resolve token (should fall back to type default)
        url = token_service.resolve_token_url(
            monster_name=fake_monster,
            monster_type=creature_type,
            use_r2=False  # Use local to test API endpoint
        )
        
        info = token_service.get_token_info(fake_monster)
        
        print(f"{creature_type:15s} -> {info['match_type']:15s} | {url}")
        
        # Check if using type fallback
        if 'defaults' in url:
            print(f"  [OK] Using type default: {url}")
        elif 'data:image/svg' in url:
            print(f"  [WARNING] Using generic fallback instead of type default")
        else:
            print(f"  [ERROR] Unexpected URL pattern")
    
    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)

if __name__ == "__main__":
    test_type_defaults()
