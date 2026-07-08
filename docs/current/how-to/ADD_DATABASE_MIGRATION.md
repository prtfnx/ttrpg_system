# Add a database migration

Audience: contributors changing persisted server data.

Status: usable.

Last source audit: 2026-07-08

## Before you start

Read [Database schema](../reference/DATABASE_SCHEMA.md).

Check whether the change affects:

- `apps/server/database/models.py`;
- `apps/server/database/crud.py`;
- `apps/server/database/session_utils.py`;
- protocol or route handlers;
- existing SQLite databases.

If existing databases need a new table, column, index, or data backfill, add a
numbered migration.

## Steps

1. Update the SQLAlchemy model in `apps/server/database/models.py`.
2. Add or update server helpers that read or write the data.
3. Add a migration under `apps/server/database/migrations/`.
4. Use the next number after the highest existing migration.
5. Implement `upgrade(db_path: str)`.
6. Add `downgrade(db_path: str)` when SQLite can safely reverse the change.
7. Make the migration idempotent when possible. Check table info before adding
   a column.
8. Add tests around the behavior owner: model, CRUD, route, protocol, or
   service.
9. Update docs if the persisted contract changed.

## Migration shape

Current migrations are plain Python files. The latest migration uses this
style:

```python
"""Persist table terrain and cover-zone state."""
import sqlite3

from utils.logger import setup_logger

logger = setup_logger(__name__)


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        columns = {
            row[1] for row in cursor.execute("PRAGMA table_info(virtual_tables)")
        }
        if "new_column" not in columns:
            cursor.execute(
                "ALTER TABLE virtual_tables ADD COLUMN new_column TEXT"
            )
        conn.commit()


def downgrade(db_path: str):
    logger.info("SQLite downgrade is a no-op")
```

## Run migrations

The runner is:

```text
apps/server/database/migrations/run_migrations.py
```

It expects the database file to exist first. Start the server once if the local
database has not been created.

From `apps/server`:

```powershell
python database\migrations\run_migrations.py
```

The runner creates a timestamped SQLite backup before applying pending
migrations from its main entrypoint.

## Verification

Choose checks based on the change:

```powershell
cd apps/server
pytest tests/ -q
```

For focused changes, run the relevant unit or integration test file. If the
change affects combat persistence, include:

```powershell
python -m pytest tests\unit\test_combat_persistence.py tests\unit\test_combat_command_service.py
```

## Common mistakes

- Updating `models.py` without a migration for existing databases.
- Adding a migration that fails if the column already exists.
- Forgetting that `create_tables()` does not apply all numbered migrations.
- Updating persistence without updating the WebSocket/API behavior that loads
  the data.
- Copying commands from old docs that reference `server_host`; current server
  code lives under `apps/server`.
