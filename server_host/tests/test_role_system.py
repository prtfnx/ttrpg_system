"""
Quick test script for role management system
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database.database import SessionLocal
from database import models, crud
from utils.permissions import get_role_permissions, SessionPermission
from sqlalchemy import text

def test_role_system():
    db = SessionLocal()
    
    try:
        print("🧪 Testing Role Management System\n")
        
        # Test 1: Permission system
        print("📋 Test 1: Permission System")
        owner_perms = get_role_permissions('owner')
        co_dm_perms = get_role_permissions('co_dm')
        player_perms = get_role_permissions('player')
        spectator_perms = get_role_permissions('spectator')
        
        print(f"  ✓ Owner: {len(owner_perms)} permissions")
        print(f"  ✓ Co-DM: {len(co_dm_perms)} permissions")
        print(f"  ✓ Player: {len(player_perms)} permissions")
        print(f"  ✓ Spectator: {len(spectator_perms)} permissions")
        
        # Test 2: Permission checks
        print("\n📋 Test 2: Permission Checks")
        assert SessionPermission.CREATE_TOKENS in owner_perms
        assert SessionPermission.CREATE_TOKENS in co_dm_perms
        assert SessionPermission.CREATE_TOKENS not in player_perms
        print("  ✓ Token creation permissions correct")
        
        assert SessionPermission.CHANGE_ROLES in owner_perms
        assert SessionPermission.CHANGE_ROLES not in co_dm_perms
        print("  ✓ Role change permissions correct")
        
        # Test 3: Check database tables
        print("\n📋 Test 3: Database Tables")
        
        # Check if tables exist
        tables = ['session_permissions', 'session_invitations', 'audit_log', 'game_players']
        for table in tables:
            count = db.execute(text(f"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='{table}'")).scalar()
            if count > 0:
                print(f"  ✓ Table '{table}' exists")
            else:
                print(f"  ✗ Table '{table}' missing")
        
        # Test 4: Get a test session
        print("\n📋 Test 4: Session Data")
        session = db.query(models.GameSession).first()
        if session:
            print(f"  ✓ Found session: {session.name} ({session.session_code})")
            
            players = db.query(models.GamePlayer).filter(
                models.GamePlayer.session_id == session.id
            ).all()
            print(f"  ✓ Session has {len(players)} players")
            
            for player in players:
                user = db.query(models.User).filter(models.User.id == player.user_id).first()
                print(f"    - {user.username if user else 'Unknown'}: {player.role}")
        else:
            print("  ⚠ No sessions in database")
        
        print("\n✅ All tests passed!")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_role_system()
