# Database migrations

Audience: operators and maintainers running schema changes.

Status: usable.

Last source audit: 2026-07-17

## Contract

Alembic is the only hosted schema authority:

- configuration: `apps/server/alembic.ini`;
- environment: `apps/server/database/alembic/env.py`;
- revisions: `apps/server/database/alembic/versions/`;
- deployed revision ledger: `alembic_version`;
- current baseline: `0001_postgresql_baseline`.

The retired numbered SQLite runner is available only in Git history. It is not
an active schema authority and existing SQLite schemas are not upgraded in
place.

## Operator commands

Run from `apps/server` with `DATABASE_URL` set to the intended database:

```powershell
alembic upgrade head
alembic current --check-heads
alembic check
```

`alembic check` detects model changes that would produce migration operations;
it does not prove that a data transformation is correct.

CI repeats these commands against a fresh PostgreSQL service and runs the
PostgreSQL contract tests. Local runs can opt in by setting
`TEST_POSTGRESQL_DATABASE_URL` to an empty disposable database.

## One-time SQLite data transfer

`scripts/import_sqlite_to_postgresql.py` is an explicit data bridge for a
legacy local database. It does not recreate the retired migration system.
Alembic must create the empty target schema first.

Run from `apps/server`. The default invocation exercises the complete import
inside one PostgreSQL transaction and rolls it back:

```powershell
python scripts/import_sqlite_to_postgresql.py `
  --source ttrpg.db `
  --skip-invalid-assets
```

Review the reported table, repair, and skipped-row counts. Add `--commit` only
after the dry-run succeeds:

```powershell
python scripts/import_sqlite_to_postgresql.py `
  --source ttrpg.db `
  --skip-invalid-assets `
  --commit
```

The importer:

- opens SQLite read-only and checks its integrity;
- refuses unsupported legacy data or foreign-key damage;
- requires PostgreSQL at the repository Alembic head;
- refuses a target containing application rows;
- serializes import attempts with a PostgreSQL advisory transaction lock;
- translates the known final SQLite data transformations;
- verifies destination counts and resets generated-key sequences;
- commits everything or rolls back everything.

`--skip-invalid-assets` is intentionally explicit. It omits asset metadata
whose uploader no longer exists instead of inventing ownership or disabling
PostgreSQL foreign keys. Preserve the original SQLite file as migration
evidence until application and R2 smoke checks are complete.

## Render Free startup

Render Free has no pre-deploy command. The development service starts through
`scripts/migrate_and_start.py`, which:

1. opens the configured database;
2. serializes PostgreSQL migration attempts with an advisory lock;
3. upgrades to `head`;
4. verifies repository and database heads match;
5. replaces itself with Uvicorn.

Migration or verification failure prevents application traffic. The wrapper
logs bounded event names and revision identifiers, never the connection URL.

## Rollout and recovery

Test each revision on a disposable PostgreSQL database before deployment.
Prefer forward fixes. Do not run a downgrade against newer writes unless its
data behavior was explicitly designed and rehearsed.

For the disposable Free development environment, recovery is branch-based:
stop writes, create/reset the Neon development branch, apply `alembic upgrade
head`, smoke-test it, then update Render's `DATABASE_URL`.

See [Backup and restore](BACKUP_AND_RESTORE.md) for the current recovery limits.
