"""
Character system database schema tests.
Tests ServerCharacterManager and SessionCharacter model.
"""
import pytest


@pytest.mark.unit
def test_character_manager():
    """Character manager imports and initializes correctly."""
    from server_host.managers.character_manager import get_server_character_manager
    
    manager = get_server_character_manager()
    assert manager is not None
    
    # Has expected methods
    assert hasattr(manager, "get_session_id_from_code")
    assert hasattr(manager, "save_character")
    assert hasattr(manager, "load_character")


@pytest.mark.unit
def test_database_models():
    """SessionCharacter model has all required fields."""
    from server_host.database.models import SessionCharacter, GameSession, User
    
    # Model exists
    assert SessionCharacter is not None
    
    # Has required fields
    required_fields = ['character_id', 'session_id', 'character_name', 'character_data', 'owner_user_id']
    for field in required_fields:
        assert hasattr(SessionCharacter, field), f"Missing field: {field}"

if __name__ == "__main__":
    print("Character Management System Test")
    print("=" * 40)
    
    success = True
    
    print("\n1. Testing database models...")
    success &= test_database_models()
    
    print("\n2. Testing character manager...")
    success &= test_character_manager()
    
    if success:
        print("\n✅ All tests passed! Character management system is ready.")
    else:
        print("\n❌ Some tests failed. Check the implementation.")
        sys.exit(1)
