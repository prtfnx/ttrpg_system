# Deployment

Audience: operators and contributors preparing a deploy.

Status: usable for the application, database, and bundled compendium path.

Last source audit: 2026-07-23

## Current target

The root `render.yaml` defines one Render Starter Python web service in
Frankfurt:

- source root: the repository root, so the build can access every monorepo
  package;
- relational state: Neon PostgreSQL;
- object bytes: Cloudflare R2;
- local filesystem: build output and disposable runtime files only;
- startup: `cd apps/server && python scripts/migrate_and_start.py`;
- health check: `/health/ready`;
- exactly one instance, manual reviewed deploys, and a 60-second shutdown
  window;
- maintenance mode available for the operator-controlled release window;
- no persistent disk.

Keep the Render and Neon regions close to reduce request and WebSocket
transaction latency.

## Build and startup flow

```text
Render build
  |
  +-- install core-table + server dependencies
  +-- install pnpm workspace dependencies
  +-- Vite production build (uses tracked, optimized WASM)
  +-- package_web_ui.py
        |
        +-- apps/server/static/ui
        +-- templates/vite_assets.html
        +-- templates/admin_assets.html

Render start
  |
  +-- DATABASE_MIGRATION_URL (schema owner, when configured)
  +-- PostgreSQL advisory lock
  +-- alembic upgrade head + head verification
  +-- dispose migration engine
  +-- exec Uvicorn
        |
        +-- DATABASE_URL (runtime application role)
        +-- Neon PostgreSQL: relational state and R2 metadata
        +-- Cloudflare R2: asset bytes
```

The UI packager validates the Vite manifest and required WASM files, generates
template fragments, and atomically replaces the server UI directory. A partial
build cannot silently replace the previous packaged UI.

The startup wrapper fails before application traffic if migration or head
verification fails. Production startup independently checks database
connectivity and Alembic head.

## Maintenance release flow

Automatic deploys are disabled. For each reviewed release:

1. Confirm CI, the disposable PostgreSQL migration contract, and the release
   artifact are green.
2. Enable Render maintenance mode and confirm new public traffic is rejected.
3. Trigger a manual deploy of the recorded commit and observe migration/startup
   logs. The old process sends connected clients a retryable shutdown notice,
   persists final protocol state, and closes WebSockets with code `1012`.
4. Confirm the deploy is healthy, at the expected Alembic revision, and serving
   the expected artifact and compendium digests.
5. Disable maintenance mode, then run the public smoke test.

Do not scale above one instance until the in-memory OAuth state cache, rate
limits, and connection coordination have shared-store designs.

## Required secrets and configuration

Configure in the Render dashboard:

- `DATABASE_URL`: SSL-enabled Neon URL for the runtime application role;
- `DATABASE_MIGRATION_URL`: direct SSL-enabled Neon owner/migration URL;
- `SECRET_KEY`, `SESSION_SECRET`, and `METRICS_TOKEN`;
- explicit `CORS_ORIGINS` and the public `BASE_URL`;
- the required `R2_*` values;
- optional OAuth, email, and telemetry values used by the deployment.

For an initial development cutover, `DATABASE_MIGRATION_URL` may equal
`DATABASE_URL`. Separate them before public use so normal requests do not run
with schema-owner privileges.

Never store either database URL in `render.yaml`, source, documentation, logs,
or health responses. Render supplies `PORT`; do not generate or hard-code it.

## Compendium artifact gate

Production uses the packaged, manifest-verified SRD 5.1 starter by default.
The build needs no compendium download. Its manifest records the artifact
version, ruleset, starter scope, exact required files, source revision,
license, attribution, sizes, and SHA-256 checksums.

To deploy a separately licensed complete catalog, set `COMPENDIUM_DIR` to an
absolute runtime directory containing the same five JSON payloads and a valid
`manifest.json`. The current Render service has no persistent disk, so a custom
directory must be supplied by the image/build or another durable deployment
mechanism. Do not point it at ignored local exports. See
[Characters and compendiums](../features/CHARACTERS_AND_COMPENDIUMS.md) for the
contract and manifest command.

## Verification

Before deploying, use a uniquely named, disposable PostgreSQL database or
schema:

```powershell
cd apps/server
alembic upgrade head
alembic current --check-heads
alembic check
python -m pytest `
  tests/integration/test_alembic_baseline.py `
  tests/integration/test_postgresql_contract.py `
  --no-cov
```

Then build the deployable browser assets from the repository root:

```powershell
pnpm --filter @ttrpg/web-ui build
python apps/server/scripts/package_web_ui.py
```

After deploying:

1. Confirm the bounded migration-completed event and expected revision.
2. Confirm `/health/live` and `/health/ready`.
3. Verify Neon contains `alembic_version` and all application tables expected
   by the current Alembic head.
4. Exercise registration, login, sessions, a critical game mutation, chat, and
   R2 upload/read/delete.
5. Redeploy the same commit, then cold-start after Render and Neon sleep.
6. Confirm the previously written records and assets still exist.
7. Confirm no database URL, object key, or credential appears in logs.

Do not delete an old Render disk or Neon branch until the new service is
verified and an operator has explicitly accepted any data loss.
