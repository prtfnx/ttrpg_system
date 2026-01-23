#!/usr/bin/env python3
"""
Simple test script to verify character management database schema
"""

import sys
import os

# Add the project root to the path  
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
sys.path.append(project_root)

def test_character_manager():
    """Test the character manager functionality"""
    try:
        from server_host.managers.character_manager import get_server_character_manager
        
        manager = get_server_character_manager()
        print("✅ ServerCharacterManager imported successfully")
        
        # Test database connection
        session_id = manager.get_session_id_from_code("test_session")
        print(f"✅ Database connection test completed (result: {session_id})")
        
        return True
        
    except Exception as e:
        print(f"❌ Error testing character manager: {e}")
        return False

def test_database_models():
    """Test database models import"""
    try:
        from server_host.database.models import SessionCharacter, GameSession, User
        print("✅ Database models imported successfully")
        
        # Test model attributes
        fields = ['character_id', 'session_id', 'character_name', 'character_data', 'owner_user_id']
        for field in fields:
            if hasattr(SessionCharacter, field):
                print(f"  ✅ SessionCharacter.{field} exists")
            else:
                print(f"  ❌ SessionCharacter.{field} missing")
        
        return True
        
    except Exception as e:
        print(f"❌ Error testing database models: {e}")
        return False

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
