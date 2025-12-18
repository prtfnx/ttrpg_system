"""
Database migration: Add role column to game_players table

This migration adds a 'role' column to store session-based user roles.
Based on OWASP Authorization best practices for session-based RBAC.

Run with: python server_host/database/migrations/add_role_to_game_players.py
"""
import sqlite3
import os
from pathlib import Path

def get_db_path():
    """Get the database path"""
    server_host_dir = Path(__file__).parent.parent.parent
    return server_host_dir / "ttrpg.db"

def migrate_up():
    """Add role column to game_players table"""
    db_path = get_db_path()
    
    if not db_path.exists():
        print(f"Error: Database not found at {db_path}")
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(game_players)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'role' in columns:
            print("Migration already applied: 'role' column exists")
            return True
        
        # Add role column with default value 'player'
        # OWASP best practice: Deny by default (least privilege)
        cursor.execute("""
            ALTER TABLE game_players 
            ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'player'
        """)
        
        # Update existing session owners to DM role
        # This maintains current behavior where owner = DM
        cursor.execute("""
            UPDATE game_players
            SET role = 'dm'
            WHERE user_id IN (
                SELECT owner_id 
                FROM game_sessions 
                WHERE id = game_players.session_id
            )
        """)
        
        conn.commit()
        print("✓ Migration successful: Added 'role' column to game_players")
        print(f"✓ Updated {cursor.rowcount} session owners to DM role")
        return True
        
    except sqlite3.Error as e:
        conn.rollback()
        print(f"✗ Migration failed: {e}")
        return False
        
    finally:
        conn.close()

def migrate_down():
    """Remove role column from game_players table"""
    db_path = get_db_path()
    
    if not db_path.exists():
        print(f"Error: Database not found at {db_path}")
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # SQLite doesn't support DROP COLUMN directly
        # We need to recreate the table without the role column
        cursor.execute("PRAGMA table_info(game_players)")
        columns = [col[1] for col in cursor.fetchall() if col[1] != 'role']
        
        if len(columns) == 5:  # Original column count
            print("Migration already rolled back: 'role' column doesn't exist")
            return True
        
        # Create new table without role column
        cursor.execute("""
            CREATE TABLE game_players_backup (
                id INTEGER PRIMARY KEY,
                session_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                character_name VARCHAR(100),
                joined_at DATETIME,
                is_connected BOOLEAN DEFAULT 0,
                FOREIGN KEY (session_id) REFERENCES game_sessions(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        
        # Copy data
        cursor.execute("""
            INSERT INTO game_players_backup 
            SELECT id, session_id, user_id, character_name, joined_at, is_connected
            FROM game_players
        """)
        
        # Drop old table and rename backup
        cursor.execute("DROP TABLE game_players")
        cursor.execute("ALTER TABLE game_players_backup RENAME TO game_players")
        
        conn.commit()
        print("✓ Rollback successful: Removed 'role' column from game_players")
        return True
        
    except sqlite3.Error as e:
        conn.rollback()
        print(f"✗ Rollback failed: {e}")
        return False
        
    finally:
        conn.close()

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "down":
        print("Rolling back migration...")
        success = migrate_down()
    else:
        print("Applying migration...")
        success = migrate_up()
    
    sys.exit(0 if success else 1)
