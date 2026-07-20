# Backup and restore

Audience: operators and maintainers protecting persisted game data.

Status: development recovery only. Independent production backup is not yet
implemented.

Last source audit: 2026-07-17

## Current development contract

Relational state is in Neon PostgreSQL and asset bytes are in Cloudflare R2.
Render's filesystem is disposable and is not a backup location.

For the Free development deployment:

- use Neon branch restore/time travel within the provider's available window;
- use a fresh Neon branch/database to rehearse `alembic upgrade head`;
- keep R2 lifecycle protection configured;
- use `scripts/r2_storage_admin.py audit` to compare relational asset keys with
  R2 objects.

The former SQLite file backup tool and SQLite-bound R2 snapshot workflow were
removed. Their manifests cannot represent a PostgreSQL recovery point.

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
6. Replace Render's `DATABASE_URL` with the verified branch URL and deploy.
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
