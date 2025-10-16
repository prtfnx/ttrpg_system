"""
Database Migration Runner
Applies all pending migrations to the database
"""
import os
import sys
import sqlite3
from pathlib import Path

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

from server_host.utils.logger import setup_logger
from server_host.database.database import DB_PATH

logger = setup_logger(__name__)

class MigrationRunner:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.migrations_dir = Path(__file__).parent
        
    def ensure_migrations_table(self):
        """Create migrations tracking table if it doesn't exist"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        conn.close()
        
    def get_applied_migrations(self):
        """Get list of already applied migrations"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT migration_name FROM schema_migrations ORDER BY id")
        applied = [row[0] for row in cursor.fetchall()]
        conn.close()
        return applied
        
    def mark_migration_applied(self, migration_name: str):
        """Mark migration as applied"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO schema_migrations (migration_name) VALUES (?)",
            (migration_name,)
        )
        conn.commit()
        conn.close()
        
    def run_migrations(self):
        """Run all pending migrations"""
        if not os.path.exists(self.db_path):
            logger.error(f"Database not found at {self.db_path}")
            logger.info("Run the server first to create the database.")
            return False
            
        logger.info(f"Running migrations on: {self.db_path}")
        
        # Ensure migrations tracking table exists
        self.ensure_migrations_table()
        
        # Get applied migrations
        applied = self.get_applied_migrations()
        logger.info(f"Already applied: {len(applied)} migrations")
        
        # Find migration files
        migration_files = sorted([
            f for f in os.listdir(self.migrations_dir)
            if f.endswith('.py') and f[0].isdigit() and f != 'run_migrations.py'
        ])
        
        if not migration_files:
            logger.info("No migration files found")
            return True
            
        # Run pending migrations
        pending_count = 0
        for migration_file in migration_files:
            migration_name = migration_file[:-3]  # Remove .py extension
            
            if migration_name in applied:
                logger.info(f"⏭  Skipping {migration_name} (already applied)")
                continue
                
            logger.info(f" Applying {migration_name}...")
            
            # Import and run migration
            try:
                module_name = f"server_host.database.migrations.{migration_name}"
                migration_module = __import__(module_name, fromlist=['upgrade'])
                
                # Run upgrade
                migration_module.upgrade(self.db_path)
                
                # Mark as applied
                self.mark_migration_applied(migration_name)
                
                logger.info(f" {migration_name} applied successfully")
                pending_count += 1
                
            except Exception as e:
                logger.error(f" Failed to apply {migration_name}: {e}")
                return False
        
        if pending_count == 0:
            logger.info(" All migrations up to date")
        else:
            logger.info(f" Applied {pending_count} new migrations")
            
        return True

if __name__ == "__main__":
    import shutil
    import time
    
    print("=" * 60)
    print("Database Migration Runner")
    print("=" * 60)
    print(f"\nDatabase: {DB_PATH}")
    
    if not os.path.exists(DB_PATH):
        print(f"\n Database not found!")
        print("Please run the server first to create the database.")
        sys.exit(1)
    
    # Create backup
    backup_path = f"{DB_PATH}.backup_{int(time.time())}"
    print(f"\nCreating backup: {os.path.basename(backup_path)}")
    shutil.copy2(DB_PATH, backup_path)
    print("Backup created")
    
    # Run migrations
    runner = MigrationRunner(DB_PATH)
    print("\n Running migrations...\n")
    
    if runner.run_migrations():
        print("\n All migrations completed successfully!")
        print(f" Backup available at: {backup_path}")
    else:
        print("\n Migration failed!")
        print(f"Restore from backup: {backup_path}")
        sys.exit(1)
