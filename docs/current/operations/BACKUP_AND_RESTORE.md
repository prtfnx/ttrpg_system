# Backup and restore

Audience: operators and maintainers protecting persisted game data.

Status: development recovery only. Independent production backup is not yet
implemented.

Last source audit: 2026-09-10

## Current development contract

Hosted relational state is in external PostgreSQL and asset bytes are in
configured Cloudflare R2. The procedure below uses Neon as the development
provider example; the repository does not establish the deployed provider or
its enabled recovery window.
Render's filesystem is disposable and is not a backup location.

For the Free development deployment:

- use Neon branch restore/time travel within the provider's available window;
- use a fresh Neon branch/database to rehearse `alembic upgrade head`;
- keep R2 lifecycle protection configured;
- compare relational asset keys with R2 objects; the standalone admin CLI
  currently has a writer-token limitation described in
  [Observability and logging](OBSERVABILITY_AND_LOGGING.md).

The R2 audit inventories the entire dedicated bucket because valid legacy keys
are not limited to an `assets/` prefix. Its default output contains counts
only; `--verbose` is an explicit operator choice that can reveal object keys.
The R2 token must allow bucket listing for audits and object deletion for smoke
cleanup and normal asset removal.

If a smoke test reports `r2_delete_failed` with `cleanup_required=true`, fix
the token and remove the temporary objects under `pending/operations/smoke-`.
Do not keep running the smoke command while cleanup is denied.

The former SQLite file backup tool and SQLite-bound R2 snapshot workflow were
removed. Their manifests cannot represent a PostgreSQL recovery point.

`asset_deletion_jobs` is part of relational recovery state. Restore it with the
matching `assets` and `session_assets` rows before restarting application
workers. A restored pending/retry/processing row is safe to redeliver because
R2 object deletion is idempotent; do not discard these rows merely because the
corresponding object appears absent. A `failed` row requires operator review
and an explicit retry after storage permission or availability is repaired.

## Development recovery

1. Stop or suspend Render to prevent writes.
2. Preserve logs and the failed branch while investigating.
3. Create or reset a Neon development branch at the desired recovery point.
4. Point a local environment at it and run:

   ```powershell
   cd apps/server
   alembic upgrade head
   alembic current --check-heads
   ```

5. Run application and asset smoke tests.
6. Update both Render database URLs to the verified recovery database/schema
   using their respective roles, then deploy one compatible writer.
7. Delete the failed branch only after verification and explicit approval.

## Production blocker

Before a public production release, implement and rehearse an independent,
encrypted PostgreSQL dump plus R2 snapshot contract with:

- matching recovery-point identifiers;
- checksums and manifest validation;
- off-provider retention;
- defined RPO/RTO and alerting;
- clean-environment restore drills.

Neon branch restore is useful development recovery, but it is not the
independent backup required for production.

## Restored writer ownership

Restore the schema and singleton writer record with relational state. A fresh
compatible process claims a new generation; do not reuse an old live cache or
clear the restored token. Stop competing processes before recovery and verify
that runtime and migration URLs point to the same recovered schema. See
[Writer handover](WRITER_HANDOVER.md).
