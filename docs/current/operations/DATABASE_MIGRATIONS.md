# Database migrations

Audience: operators and maintainers running schema changes.

Status: usable.

Last source audit: 2026-09-10

## Contract

Alembic is the only hosted schema authority:

- configuration: `apps/server/alembic.ini`;
- environment: `apps/server/database/alembic/env.py`;
- revisions: `apps/server/database/alembic/versions/`;
- deployed revision ledger: `alembic_version`;
- baseline: `0001_postgresql_baseline`;
- current head: `0008_application_writer`.

The retired numbered SQLite runner is available only in Git history. It is not
an active schema authority and existing SQLite schemas are not upgraded in
place.

## Operator commands

Run from `apps/server` with `DATABASE_MIGRATION_URL` set to the intended
schema-owner connection. Alembic falls back to `DATABASE_URL` when the
dedicated value is absent:

```powershell
alembic upgrade head
alembic current --check-heads
alembic check
```

`alembic check` detects model changes that would produce migration operations;
it does not prove that a data transformation is correct.

CI repeats these commands against a fresh PostgreSQL service and runs the
PostgreSQL contract tests. Local runs opt in with
`TEST_POSTGRESQL_DATABASE_URL`. The target database name must contain `test`,
business-data tables must be empty at suite start; the migration-owned quota
and writer singleton rows are expected. Some older contract fixtures accept
`ALLOW_POSTGRESQL_INTEGRATION_TARGET=1` for isolated targets, but the writer
handover suite always requires a database name containing `test`.

## SQLite importer limitation

`apps/server/scripts/import_sqlite_to_postgresql.py` is a one-time legacy data
bridge, not an active schema authority. Its current empty-target validator
requires zero rows in every model table. Alembic intentionally seeds
`asset_quota_state` and `application_writer_state`, so a normally migrated
target fails this check. The importer also does not establish writer fencing.

Do not treat the existing dry-run/`--commit` CLI as a verified transfer path for
the current schema. Do not delete the singleton rows or clear writer ownership
to bypass validation. Supporting this path requires preserving migration-owned
seed rows, distinguishing them from imported business data, and testing the
complete import under the current PostgreSQL writer contract. Preserve the
source database until a corrected importer passes a disposable restore drill.

## Render Free startup

Render Free has no pre-deploy command. The development service starts through
`scripts/migrate_and_start.py`, which:

1. opens the configured database;
2. uses `DATABASE_MIGRATION_URL` when configured;
3. serializes PostgreSQL migration attempts with an advisory lock;
4. upgrades to `head`;
5. verifies repository and database heads match;
6. disposes the migration engine;
7. replaces itself with Uvicorn using `--workers 1` and `DATABASE_URL`;
8. preflights the release and claims application writer ownership before loading sessions.

Migration or verification failure prevents application traffic. The wrapper
logs bounded event names and revision identifiers, never the connection URL.

`DATABASE_MIGRATION_URL` should use a direct schema-owner connection.
`DATABASE_URL` should use a restricted application role with only the DML and
sequence privileges required at runtime. The split limits the effect of an
application compromise even though Render Free must retain the migration
credential for its startup wrapper.

## Rollout and recovery

Test each revision on a disposable PostgreSQL database before deployment.
Prefer forward fixes. Do not run a downgrade against newer writes unless its
data behavior was explicitly designed and rehearsed.

For the disposable Free development environment, recovery is branch-based:
stop writes, create/reset the Neon development branch, apply `alembic upgrade
head`, smoke-test it, then update Render's `DATABASE_URL`.

See [Backup and restore](BACKUP_AND_RESTORE.md) for the current recovery limits.

## Writer-aware migrations

Online Alembic commands use `migration_writer_transaction` on the migration
connection. It holds the writer row's exclusive lock, uses the current owner
token for guarded data writes, and does not transfer ownership. Normal runtime
transactions and handover wait for that transaction. Keep migrations bounded
and compatible with code that may still be serving during rollout.

New application tables require an explicit `application_writer_guard` trigger
in their migration. Do not edit revision 0008's frozen table inventory to add a
future table. Autogenerate and `alembic check` do not prove trigger coverage;
the PostgreSQL inventory regression does. Offline SQL output must be reviewed
for its own execution/locking context before use; it does not run the online
Python context manager.

See [Writer handover](WRITER_HANDOVER.md) for rollback and manual maintenance
constraints. Schema-owner credentials do not make an uninstrumented DML
transaction exempt from the trigger.
