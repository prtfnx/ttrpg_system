#!/usr/bin/env python3
"""
Migration manager for compendium database
Handles schema and data migrations with versioning and rollback
"""
import os
import logging
from typing import Callable, Dict, List, Optional
from core_table.compendiums.database.manager import CompendiumDB

logger = logging.getLogger(__name__)

class MigrationError(Exception):
    pass

class MigrationManager:
    def __init__(self, db: CompendiumDB, migrations_path: str):
        self.db = db
        self.migrations_path = migrations_path
        self.migrations: Dict[str, Callable] = {}
        self.applied: List[str] = []
        self._load_migrations()
        logger.info(f"MigrationManager initialized with {len(self.migrations)} migrations")
    def _load_migrations(self):
        # Discover migration scripts in the migrations_path
        for fname in sorted(os.listdir(self.migrations_path)):
            if fname.endswith('.py') and fname.startswith('migration_'):
                migration_id = fname.replace('.py', '')
                mod_path = os.path.join(self.migrations_path, fname)
                try:
                    migration_func = self._import_migration(mod_path)
                    self.migrations[migration_id] = migration_func
                except Exception as e:
                    logger.error(f"Failed to load migration {fname}: {e}")
    def _import_migration(self, path: str) -> Callable:
        import importlib.util
        spec = importlib.util.spec_from_file_location("migration", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        if not hasattr(mod, 'run'):
            raise MigrationError(f"Migration script {path} missing 'run' function")
        return getattr(mod, 'run')
    def get_applied_migrations(self) -> List[str]:
        # Query DB for applied migrations
        session = self.db.get_session()
        result = session.execute("SELECT migration_id FROM migrations ORDER BY migration_id").fetchall()
        session.close()
        return [row[0] for row in result]
    def apply_migrations(self):
        applied = set(self.get_applied_migrations())
        for migration_id, migration_func in self.migrations.items():
            if migration_id not in applied:
                logger.info(f"Applying migration {migration_id}")
                try:
                    migration_func(self.db)
                    self._record_migration(migration_id)
                except Exception as e:
                    logger.error(f"Migration {migration_id} failed: {e}")
                    raise MigrationError(f"Migration {migration_id} failed: {e}")
    def _record_migration(self, migration_id: str):
        session = self.db.get_session()
        session.execute("INSERT INTO migrations (migration_id) VALUES (:mid)", {'mid': migration_id})
        session.commit()
        session.close()
    def rollback_migration(self, migration_id: str):
        # Rollback logic (requires migration script to support rollback)
        if migration_id not in self.migrations:
            raise MigrationError(f"Migration {migration_id} not found")
        migration_func = self.migrations[migration_id]
        if not hasattr(migration_func, 'rollback'):
            raise MigrationError(f"Migration {migration_id} does not support rollback")
        try:
            migration_func.rollback(self.db)
            self._remove_migration_record(migration_id)
        except Exception as e:
            logger.error(f"Rollback for {migration_id} failed: {e}")
            raise MigrationError(f"Rollback for {migration_id} failed: {e}")
    def _remove_migration_record(self, migration_id: str):
        session = self.db.get_session()
        session.execute("DELETE FROM migrations WHERE migration_id = :mid", {'mid': migration_id})
        session.commit()
        session.close()
