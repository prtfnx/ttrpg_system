# Database migrations

Audience: operators and maintainers running schema changes.

Status: usable.

Last source audit: 2026-10-06

## Contract

Alembic is the only hosted schema authority:

- configuration: `apps/server/alembic.ini`;
- environment: `apps/server/database/alembic/env.py`;
- revisions: `apps/server/database/alembic/versions/`;
- deployed revision ledger: `alembic_version`;
- baseline: `0001_postgresql_baseline`;
- current head: `0011_selection_preferences`.

Revision 0011 adds `game_players.selection_mode`, non-null with the default
`separate`. Existing memberships keep separate selection. The authenticated
GET/PUT selection-preference route saves only the caller's membership and
returns private, non-cacheable responses. Downgrading to 0010 drops this
preference; it does not remove paint objects or sprites. The schema lifecycle
and membership isolation regressions run against this head.

The retired numbered SQLite runner is available only in Git history. It is not
an active schema authority and existing SQLite schemas are not upgraded in
place.

Alembic loads its CLI logging configuration with
`disable_existing_loggers=False`. This is required when migration commands run
inside a process that has already configured application loggers: importing
the Alembic environment must not silently disable those loggers. Keep the
regression in `apps/server/tests/integration/test_alembic_baseline.py` when
changing `env.py` or `alembic.ini`.

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

Paint cutover uses `apps/server/scripts/cutover_legacy_paint.py`. Deploy with
`PAINT_OBJECT_WRITES_ENABLED=false` while preparing and verifying the private
backup/report artifacts and converted objects. The maintenance command owns
its writer-fenced transaction; the runtime gate does not prevent that explicit
maintenance workflow. Enable the flag and restart only after release checks.
Authorized snapshots remain available while runtime writes are disabled.
The unset production default is disabled, including for existing deployments
upgrading to code that introduces this setting.

### Legacy paint maintenance

Run from `apps/server` with the repository Python environment and the intended
schema-owner connection. These commands use `DATABASE_MIGRATION_URL` (falling
back to `DATABASE_URL`), not the isolated acceptance runner's disposable URL.
Confirm the target and pause old paint writers before taking the source
watermark; the runtime gate cannot stop an old deployed binary. Keep production
runtime paint writes disabled through verification.

Choose separate private artifact paths that do not already exist:

```powershell
python scripts/export_paint_templates.py --output '<private template export path>'
python scripts/cutover_legacy_paint.py --backup '<private dry-run backup path>' --report '<private dry-run report path>'
```

Template export preserves raw fields and records a deterministic SHA-256.
The cutover dry run backs up all source strokes and reports stable ID mapping,
converted counts, source checksum, and every quarantined row. Review artifacts
and sample converted renders. Apply with the reviewed source checksum and new
artifact paths:

```powershell
python scripts/cutover_legacy_paint.py --backup '<private apply backup path>' --report '<private apply report path>' --apply --expected-sha256 '<reviewed source checksum>'
```

Apply refuses quarantine unless `--allow-quarantine` explicitly acknowledges
the reviewed rows. It holds writer fencing and paint-table locks, checks the
source watermark, verifies persisted objects, and preserves source rows.
Repeating conversion is safe only while converted object state has not become
live or diverged. Artifacts use private atomic no-replace publication; concurrent
commands cannot overwrite them. Retain verified backups and the template export
through the rollback window. A later explicit migration, not UI cleanup, is
required to remove legacy tables.

Use [Testing strategy](../TESTING_STRATEGY.md#isolated-paint-acceptance-and-load-checks)
for synthetic acceptance/load/rollback checks. Those checks do not replace
deployment-specific backup review or a live restore drill. Enable runtime
paint writes and restart only after the deployment's release checks are approved.

### Rollback boundary

Migration 0010 does not delete legacy strokes or templates. Downgrading to
0009 removes the new object, state, and operation tables, so it is not a safe
rollback after any accepted new-format write. After that boundary, preserve
the database and deploy a forward fix; turning off the flag does not make old
binaries understand the new format.

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
