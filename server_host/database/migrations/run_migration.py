#!/usr/bin/env python3
"""
Run database migration to add token_asset_id FK to session_characters
"""

import sys
from pathlib import Path
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))

from server_host.database.database import engine

def main():
    sql_file = Path(__file__).parent / "add_token_asset_fk.sql"
    
    print(f"📄 Reading migration: {sql_file}")
    with open(sql_file, 'r') as f:
        sql = f.read()
    
    print("🔄 Running migration...")
    
    with engine.connect() as conn:
        # Split by semicolon and execute each statement
        for statement in sql.split(';'):
            statement = statement.strip()
            if statement and not statement.startswith('--'):
                try:
                    conn.execute(text(statement))
                    print(f"✅ Executed: {statement[:60]}...")
                except Exception as e:
                    print(f"⚠️  Warning: {e}")
        
        conn.commit()
    
    print("✅ Migration complete!")

if __name__ == "__main__":
    main()
