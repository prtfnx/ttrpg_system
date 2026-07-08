# Database migrations

Audience: operators and maintainers running schema changes.

Status: usable.

Last source audit: 2026-07-08

## Current migration system

Migrations live in:

```text
apps/server/database/migrations/
```

The runner is:

```text
apps/server/database/migrations/run_migrations.py
```

It uses the SQLite database path from `apps/server/database/database.py`. When
`DATABASE_URL` is unset, that path is:

```text
apps/server/ttrpg.db
```

Current numbered migrations run from `001_add_obstacle_metadata.py` through
`023_add_table_environment_state.py`.

## What the runner does

`MigrationRunner.run_migrations()`:

1. checks that the database file exists;
2. creates `schema_migrations` if needed;
3. reads already-applied migration names;
4. finds numbered `.py` migration files in sorted order;
5. imports each pending migration;
6. runs `upgrade(db_path)`;
7. records the migration name after success.

When `run_migrations.py` is executed as a script, it also creates a timestamped
SQLite file backup before applying migrations.

## Run locally

Start the server once if the database does not exist yet. Then run:

```powershell
cd apps/server
python database\migrations\run_migrations.py
```

A successful run prints the backup filename and reports whether pending
migrations were applied.

## Before production

Do not run a new migration against the only copy of production data first.

Recommended sequence:

1. Copy the production database or restore a recent backup into a test
   environment.
2. Run the migration runner against that copy.
3. Start the server against the migrated copy.
4. Run a focused smoke check for the changed feature.
5. Confirm rollback expectations before touching production.

For SQLite production data, the runner's automatic backup is useful but not a
backup strategy by itself. Make an external copy before the deploy window.

## Rollback reality

Migration files may define `downgrade(db_path)`, but the runner does not call
downgrades.

SQLite also cannot safely reverse every schema change. Many current downgrades
are no-ops. Treat rollback as restoring the database backup unless a specific
migration has a tested manual recovery plan.

## Common failure modes

Database file is missing:

- the runner exits before applying anything;
- start the server once or point `DATABASE_URL` at the intended database.

Migration import fails:

- check imports inside the migration file;
- current migrations should import from `utils.logger`, not old
  `server_host` paths.

Column already exists:

- newer migrations should be idempotent where possible;
- check table columns with `PRAGMA table_info(...)` before adding columns.

Production starts but data looks old:

- confirm `DATABASE_URL` points at the same database you migrated;
- confirm the migration name exists in `schema_migrations`;
- confirm the model and loader code read the new column or table.

## Verification

After applying migrations:

```powershell
cd apps/server
python -m pytest tests\unit\test_models.py tests\unit\test_crud.py
```

For feature-specific schema changes, run the owning tests too. Examples:

- combat persistence: `tests\unit\test_combat_persistence.py`;
- character persistence: `tests\unit\test_character_overhaul.py`;
- route behavior: matching files under `tests\integration\`.

## Change checklist

- New migration has the next numeric prefix.
- Migration has `upgrade(db_path: str)`.
- Existing data path was tested on a copy.
- Database backup exists outside the app process.
- `schema_migrations` records the migration after success.
- Server starts against the migrated database.
- Feature smoke check passes.
