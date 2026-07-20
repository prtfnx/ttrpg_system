# Deployment

Audience: operators and contributors preparing a deploy.

Status: usable for the application and database path. A licensed, verified
compendium artifact is still required before the production readiness check can
pass.

Last source audit: 2026-07-20

## Current target

The root `render.yaml` defines one Render Free Python web service in Frankfurt:

- source root: the repository root, so the build can access every monorepo
  package;
- relational state: Neon PostgreSQL;
- object bytes: Cloudflare R2;
- local filesystem: build output and disposable runtime files only;
- startup: `cd apps/server && python scripts/migrate_and_start.py`;
- health check: `/health/ready`;
- no persistent disk or paid pre-deploy command.

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

Production readiness requires all compendium export files plus a verified
`manifest.json`. The manifest records the artifact version, exact required
files, sizes, and SHA-256 checksums.

The repository does not currently contain a licensed production artifact or a
trusted download location. Do not commit local ignored exports, disable this
readiness gate, or invent a manifest. Before deployment, publish an approved
artifact through the project's release process and make it available to the
Render build.

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
3. Verify Neon contains `alembic_version` and all 24 application tables.
4. Exercise registration, login, sessions, a critical game mutation, chat, and
   R2 upload/read/delete.
5. Redeploy the same commit, then cold-start after Render and Neon sleep.
6. Confirm the previously written records and assets still exist.
7. Confirm no database URL, object key, or credential appears in logs.

Do not delete an old Render disk or Neon branch until the new service is
verified and an operator has explicitly accepted any data loss.
