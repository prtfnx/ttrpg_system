"""
Database migration: Role Management System
Adds expanded roles, permissions, invitations, and audit logging
"""
import sqlite3
import shutil
from pathlib import Path
from datetime import datetime

def get_db_path():
    server_host_dir = Path(__file__).parent.parent.parent
    return server_host_dir / "ttrpg.db"

def migrate_up():
    db_path = get_db_path()
    
    if not db_path.exists():
        print(f"❌ Database not found at {db_path}")
        return False
    
    backup_path = db_path.parent / f"ttrpg.db.backup_{int(datetime.now().timestamp())}"
    shutil.copy2(db_path, backup_path)
    print(f"✓ Backed up to {backup_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("📝 Expanding role types...")
        
        cursor.execute("""
            CREATE TABLE game_players_new (
                id INTEGER PRIMARY KEY,
                session_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                character_name VARCHAR(100),
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_connected BOOLEAN DEFAULT 0,
                role VARCHAR(20) NOT NULL DEFAULT 'player' 
                    CHECK (role IN ('owner', 'co_dm', 'trusted_player', 'player', 'spectator')),
                role_updated_at DATETIME,
                role_updated_by INTEGER,
                FOREIGN KEY (session_id) REFERENCES game_sessions(id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (role_updated_by) REFERENCES users(id)
            )
        """)
        
        cursor.execute("""
            INSERT INTO game_players_new 
                (id, session_id, user_id, character_name, joined_at, is_connected, role)
            SELECT 
                gp.id, gp.session_id, gp.user_id, gp.character_name, 
                gp.joined_at, gp.is_connected,
                CASE 
                    WHEN gp.role = 'dm' AND gs.owner_id = gp.user_id THEN 'owner'
                    WHEN gp.role = 'dm' THEN 'co_dm'
                    ELSE gp.role
                END
            FROM game_players gp
            JOIN game_sessions gs ON gp.session_id = gs.id
        """)
        
        cursor.execute("DROP TABLE game_players")
        cursor.execute("ALTER TABLE game_players_new RENAME TO game_players")
        print("✓ Role types expanded")
        
        print("📝 Creating permissions table...")
        cursor.execute("""
            CREATE TABLE session_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                permission VARCHAR(50) NOT NULL,
                granted_by INTEGER NOT NULL,
                granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                revoked_at DATETIME,
                is_active BOOLEAN DEFAULT 1,
                FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (granted_by) REFERENCES users(id),
                UNIQUE(session_id, user_id, permission)
            )
        """)
        
        cursor.execute("""
            CREATE INDEX idx_session_perms_lookup 
            ON session_permissions(session_id, user_id, is_active)
        """)
        print("✓ Permissions table created")
        
        print("📝 Creating invitations table...")
        cursor.execute("""
            CREATE TABLE session_invitations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                invite_code VARCHAR(32) UNIQUE NOT NULL,
                pre_assigned_role VARCHAR(20) NOT NULL DEFAULT 'player'
                    CHECK (pre_assigned_role IN ('co_dm', 'trusted_player', 'player', 'spectator')),
                created_by INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,
                max_uses INTEGER DEFAULT 1,
                uses_count INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        """)
        
        cursor.execute("CREATE INDEX idx_invite_code ON session_invitations(invite_code, is_active)")
        cursor.execute("CREATE INDEX idx_invite_session ON session_invitations(session_id, is_active)")
        print("✓ Invitations table created")
        
        print("📝 Creating audit log...")
        cursor.execute("""
            CREATE TABLE audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type VARCHAR(50) NOT NULL,
                session_code VARCHAR(20),
                user_id INTEGER,
                target_user_id INTEGER,
                details TEXT,
                ip_address VARCHAR(45),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (target_user_id) REFERENCES users(id)
            )
        """)
        
        cursor.execute("CREATE INDEX idx_audit_event ON audit_log(event_type, created_at)")
        cursor.execute("CREATE INDEX idx_audit_session ON audit_log(session_code, created_at)")
        print("✓ Audit log created")
        
        print("📝 Updating entities table...")
        cursor.execute("PRAGMA table_info(entities)")
        entity_columns = {col[1]: col for col in cursor.fetchall()}
        
        if 'controlled_by' not in entity_columns:
            cursor.execute("ALTER TABLE entities ADD COLUMN controlled_by TEXT")
            print("✓ Token ownership added")
        
        conn.commit()
        print("\n✅ Migration completed successfully")
        return True
        
    except sqlite3.Error as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        return False
        
    finally:
        conn.close()

def migrate_down():
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("⏪ Rolling back...")
        cursor.execute("DROP TABLE IF EXISTS session_permissions")
        cursor.execute("DROP TABLE IF EXISTS session_invitations")
        cursor.execute("DROP TABLE IF EXISTS audit_log")
        conn.commit()
        print("✓ Rollback completed (restore from backup for full revert)")
        return True
    except sqlite3.Error as e:
        conn.rollback()
        print(f"❌ Rollback failed: {e}")
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "down":
        migrate_down()
    else:
        migrate_up()
