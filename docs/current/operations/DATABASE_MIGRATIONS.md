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

The retired numbered SQLite runner is available only in Git history. Existing
SQLite application databases are disposable and cannot be upgraded by the
active code.

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
