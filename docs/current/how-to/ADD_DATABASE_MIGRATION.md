# Add a database migration

Audience: contributors changing persisted server data.

Status: usable.

Last source audit: 2026-07-20

PostgreSQL schema history is managed only by Alembic. Models describe current
intent; committed revisions describe how deployed databases reach that intent.

## Steps

1. Update `apps/server/database/models.py`.
2. Add or update the application behavior and tests that use the schema.
3. From `apps/server`, point `DATABASE_MIGRATION_URL` at a disposable
   PostgreSQL database containing the current Alembic head. If unset, Alembic
   uses `DATABASE_URL`.
4. Generate a candidate:

   ```powershell
   alembic revision --autogenerate -m "describe the schema change"
   ```

5. Review every operation under `database/alembic/versions/`. Autogenerate
   cannot design data backfills, safe renames, or rollout compatibility.
6. Apply and verify it on a disposable PostgreSQL database:

   ```powershell
   alembic upgrade head
   alembic current --check-heads
   alembic check
   ```

7. Run the owning behavior tests and the PostgreSQL integration suite.
8. Update schema and operations documentation when the contract changes.

## Review checklist

- The revision is incremental; never edit an already deployed revision.
- Upgrade and downgrade operations respect foreign-key order.
- Destructive changes have an explicit data-retention decision.
- Deployments remain compatible with the previous app instance during a
  rolling/overlapping rollout.
- Constraint and index names use the model naming convention and fit
  PostgreSQL identifier limits.
- No connection URL or secret is logged or committed.
- SQLite-only unit tests are not treated as PostgreSQL migration proof.

See [Database migrations](../operations/DATABASE_MIGRATIONS.md) for operator
commands and recovery policy.
