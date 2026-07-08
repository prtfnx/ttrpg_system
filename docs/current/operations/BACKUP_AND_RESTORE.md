# Backup and restore

Audience: operators and maintainers protecting persisted game data.

Status: usable for current SQLite-backed deployments. Non-SQLite production
backup is not implemented in this repo.

Last source audit: 2026-07-08

## Current persisted data

The default local database is:

```text
apps/server/ttrpg.db
```

`DATABASE_URL` overrides that path. When the URL contains `sqlite`, SQLAlchemy
uses SQLite-specific `check_same_thread=False`.

Cloud asset bytes are not stored in SQLite. The `assets` table stores metadata
and R2 object references; the actual uploaded files live in Cloudflare R2 when
R2 is enabled.

## What exists today

Current backup-related code:

- `apps/server/database/migrations/run_migrations.py` creates a timestamped
  SQLite file backup before applying migrations when run as a script.
- `scripts/backup_database.py` contains `DatabaseBackupManager`, which uses the
  SQLite backup API and can restore a backup over a target database.
- `scripts/backup_database.ps1` copies a database file and rotates old backups.

Important caveat: both top-level backup scripts still default to old
`server_host` paths. Do not run them blindly. Pass current paths explicitly or
update the scripts before making them part of normal operations.

## Before risky changes

Before a migration, deploy, or manual database edit:

1. Stop writes if possible.
2. Identify the active database path from `DATABASE_URL`.
3. Create a backup outside the app directory or deployment container.
4. Record the app commit, migration list, and backup filename.
5. Test restore on a copy before touching production.

The migration runner's local backup is a useful last line of defense, but it is
not enough by itself for production. It sits beside the SQLite file and can be
lost with the same disk.

## Manual SQLite backup

For local development, a simple offline file copy is usually enough after the
server is stopped:

```powershell
Copy-Item apps\server\ttrpg.db backups\dev\ttrpg_backup_YYYYMMDD_HHMMSS.db
```

For a live SQLite database, prefer the SQLite backup API. The repo's Python
helper already has that behavior in `DatabaseBackupManager.create_backup`.

If you use `scripts/backup_database.py`, instantiate the manager with the
current path:

```python
from scripts.backup_database import DatabaseBackupManager

manager = DatabaseBackupManager("apps/server/ttrpg.db", "backups/dev")
manager.create_backup()
```

Do not rely on its default development entrypoint until the stale
`server_host/ttrpg.db` path is fixed.

## Restore

Restore should happen with the app stopped or with all writers blocked.

Safe sequence:

1. Confirm the backup file exists and is the intended version.
2. Create a pre-restore backup of the current database.
3. Replace the database file with the chosen backup.
4. Start the server.
5. Run a smoke check for login, session open, table load, and recent changed
   feature data.
6. Check `schema_migrations` if the restore crosses a migration boundary.

For SQLite, restoring is usually a file replacement. For non-SQLite databases,
use the provider's native restore tooling; the repo does not currently provide
a tested restore path.

## R2 assets

Database backup does not back up R2 object data.

If R2 is part of the deployment, backup planning also needs:

- bucket retention or lifecycle policy;
- credentials recovery plan;
- a way to confirm that `assets.r2_key` rows still point to objects;
- a tested answer for DB restored to a point before or after R2 object changes.

The current asset delete handler removes the DB row first and then attempts R2
deletion best-effort. A database restore can therefore bring back metadata for
an object that no longer exists in R2.

## Verification

After a restore, check:

```powershell
cd apps/server
python -m pytest tests\unit\test_models.py tests\unit\test_crud.py
```

Then run a manual smoke path:

1. Open `/health`.
2. Log in.
3. Open a known session.
4. Load a table with entities.
5. Load a character.
6. If R2 is enabled, open an asset-backed sprite or upload a small image.

## Checklist

- Active database path is known.
- Backup is stored outside the app's disposable runtime.
- Restore was tested on a copy.
- R2 object data is considered separately from database rows.
- Pre-restore backup exists before replacing the database.
- Smoke check passes after restore.
