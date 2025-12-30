#!/usr/bin/env python3
"""
Initial migration: create migrations table and core compendium tables
"""
def run(db):
    session = db.get_session()
    session.execute('''
        CREATE TABLE IF NOT EXISTS migrations (
            migration_id TEXT PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    session.commit()
    session.close()
# Optional rollback function
def rollback(db):
    session = db.get_session()
    session.execute('DROP TABLE IF EXISTS migrations;')
    session.commit()
    session.close()
