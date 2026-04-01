#!/usr/bin/env python3
"""
Database Backup Script for TTRPG System
Automated backups with rotation and cloud storage support
"""

import os
import sqlite3
import shutil
import datetime
from pathlib import Path
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DatabaseBackupManager:
    def __init__(self, db_path: str, backup_dir: str = "backups"):
        self.db_path = Path(db_path)
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(exist_ok=True)
        
    def create_backup(self, backup_name: str = None) -> Path:
        """Create a backup of the database"""
        if not self.db_path.exists():
            raise FileNotFoundError(f"Database not found: {self.db_path}")
            
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = backup_name or f"ttrpg_backup_{timestamp}.db"
        backup_path = self.backup_dir / backup_name
        
        # Create backup using SQLite backup API (safer than file copy)
        try:
            source_conn = sqlite3.connect(str(self.db_path))
            backup_conn = sqlite3.connect(str(backup_path))
            source_conn.backup(backup_conn)
            source_conn.close()
            backup_conn.close()
            
            logger.info(f"✅ Database backup created: {backup_path}")
            return backup_path
            
        except Exception as e:
            logger.error(f"❌ Backup failed: {e}")
            raise
    
    def cleanup_old_backups(self, keep_count: int = 10):
        """Remove old backups, keeping only the most recent ones"""
        backup_files = sorted(self.backup_dir.glob("ttrpg_backup_*.db"))
        
        if len(backup_files) > keep_count:
            for old_backup in backup_files[:-keep_count]:
                old_backup.unlink()
                logger.info(f"🗑️ Removed old backup: {old_backup.name}")
    
    def restore_backup(self, backup_path: Path, target_path: Path = None):
        """Restore database from backup"""
        target_path = target_path or self.db_path
        
        if not backup_path.exists():
            raise FileNotFoundError(f"Backup not found: {backup_path}")
        
        # Create backup of current database before restore
        if target_path.exists():
            current_backup = self.create_backup(f"pre_restore_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.db")
            logger.info(f"📦 Current database backed up to: {current_backup}")
        
        # Copy backup to target location
        shutil.copy2(backup_path, target_path)
        logger.info(f"🔄 Database restored from: {backup_path}")


def backup_development_database():
    """Backup development database"""
    db_path = "server_host/ttrpg.db"
    backup_manager = DatabaseBackupManager(db_path, "backups/dev")
    
    backup_path = backup_manager.create_backup()
    backup_manager.cleanup_old_backups(keep_count=5)  # Keep 5 dev backups
    
    return backup_path


def backup_production_database():
    """Backup production database (implement based on your deployment)"""
    # For production, you might:
    # 1. Use environment variables for database connection
    # 2. Upload to cloud storage (R2, S3, etc.)
    # 3. Send notifications on success/failure
    # 4. Run as scheduled job (cron, systemd timer, etc.)
    
    db_url = os.getenv("DATABASE_URL", "")
    if "sqlite" in db_url:
        # Extract path from sqlite:///path/to/db format
        db_path = db_url.replace("sqlite:///", "")
        backup_manager = DatabaseBackupManager(db_path, "backups/prod")
        
        backup_path = backup_manager.create_backup()
        backup_manager.cleanup_old_backups(keep_count=30)  # Keep 30 prod backups
        
        # TODO: Upload to cloud storage here
        # upload_to_r2(backup_path)
        
        return backup_path
    else:
        logger.warning("Production backup not implemented for non-SQLite databases")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--prod":
        logger.info("🏭 Running production backup...")
        backup_production_database()
    else:
        logger.info("🛠️ Running development backup...")
        backup_development_database()
    
    logger.info("✅ Backup completed!")