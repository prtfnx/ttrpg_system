#!/usr/bin/env python3
"""
CLI tool for migration management
"""
import argparse
import sys
from core_table.compendiums.database.manager import CompendiumDB
from core_table.compendiums.migrations.manager import MigrationManager

def main():
    parser = argparse.ArgumentParser(description='Compendium Migration CLI')
    parser.add_argument('--db', type=str, required=True, help='Path to compendium database')
    parser.add_argument('--migrations', type=str, required=True, help='Path to migrations directory')
    parser.add_argument('action', choices=['apply', 'rollback', 'status'], help='Migration action')
    parser.add_argument('--id', type=str, help='Migration ID for rollback')
    args = parser.parse_args()
    db = CompendiumDB(args.db)
    mgr = MigrationManager(db, args.migrations)
    if args.action == 'apply':
        mgr.apply_migrations()
        print('Migrations applied.')
    elif args.action == 'rollback':
        if not args.id:
            print('Migration ID required for rollback.', file=sys.stderr)
            sys.exit(1)
        mgr.rollback_migration(args.id)
        print(f'Migration {args.id} rolled back.')
    elif args.action == 'status':
        applied = mgr.get_applied_migrations()
        print('Applied migrations:', applied)
if __name__ == '__main__':
    main()
