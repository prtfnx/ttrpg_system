"""
Migration: Add role field to game_players and create session invitations system
Date: 2026-02-11
Description: Adds role-based access control and secure invitation management
"""
import sqlite3
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)

def upgrade(db_path: str):
    """Add role field and create invitation tables"""
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Add role column to game_players table
        cursor.execute("PRAGMA table_info(game_players)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'role' not in columns:
            logger.info("Adding role column to game_players table")
            cursor.execute("""
                ALTER TABLE game_players 
                ADD COLUMN role VARCHAR(20) DEFAULT 'player'
            """)
            logger.info("✓ Role column added")
        else:
            logger.info("⏭  Role column already exists")
        
        # Create session_invitations table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS session_invitations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invite_code VARCHAR(32) UNIQUE NOT NULL,
                session_id INTEGER NOT NULL,
                pre_assigned_role VARCHAR(20) NOT NULL DEFAULT 'player',
                created_by INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                max_uses INTEGER DEFAULT 1,
                uses_count INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (session_id) REFERENCES game_sessions(id)
            )
        """)
        logger.info("✓ session_invitations table created")
        
        # Create indexes for session_invitations
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_invitations_code ON session_invitations(invite_code)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_invitations_session ON session_invitations(session_id)")
        
        # Create audit_logs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type VARCHAR(50) NOT NULL,
                session_code VARCHAR(20),
                user_id INTEGER,
                ip_address VARCHAR(45),
                user_agent TEXT,
                details TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        logger.info("✓ audit_logs table created")
        
        # Create indexes for audit_logs
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_logs(event_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_session_code ON audit_logs(session_code)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)")
        
        conn.commit()
        logger.info("✓ Migration 005_add_role_and_invitations completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"✗ Migration failed: {e}")
        if conn:
            conn.rollback()
            conn.close()
        raise

def downgrade(db_path: str):
    """Remove role field and invitation tables"""
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Drop tables
        cursor.execute("DROP TABLE IF EXISTS audit_logs")
        cursor.execute("DROP TABLE IF EXISTS session_invitations")
        
        # Note: SQLite doesn't support DROP COLUMN directly
        # Role column would need manual table recreation to remove
        logger.info("✓ Invitation tables dropped (role column remains)")
        
        conn.commit()
        conn.close()
        return True
        
    except Exception as e:
        logger.error(f"✗ Downgrade failed: {e}")
        if conn:
            conn.rollback()
            conn.close()
        raise