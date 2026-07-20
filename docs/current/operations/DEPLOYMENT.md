# Deployment

Audience: operators and contributors preparing a deploy.

Status: partial. The database path is implemented; the Render UI/WASM build gap
remains.

Last source audit: 2026-07-17

## Current target

The root `render.yaml` defines a Render Free Python web service in Frankfurt:

- root directory: `apps/server`;
- relational state: external Neon PostgreSQL through `DATABASE_URL`;
- object bytes: Cloudflare R2;
- no persistent disk or paid pre-deploy command;
- startup: `python scripts/migrate_and_start.py`;
- health check: `/health/ready`.

The startup wrapper applies Alembic migrations, verifies head, and then
`exec`s Uvicorn. Production startup independently rejects an unavailable or
stale schema.

## Required secrets and configuration

Configure at least:

- `DATABASE_URL`: direct Neon development-branch URL with `sslmode=require`;
- `SECRET_KEY`, `SESSION_SECRET`, and `METRICS_TOKEN`: strong secrets;
- `CORS_ORIGINS` and `BASE_URL`: explicit public origins;
- all required `R2_*` values.

Never store a real database URL in `render.yaml`, source, documentation, or
logs. Keep Render and Neon regions geographically close.

## Known build gap

The Render build installs Python dependencies but does not build the React
client or Rust/WASM package. A full client deploy must also produce
`apps/server/static/ui`, WASM assets, and Vite asset templates. This gap is
separate from the database migration.

## Verification

Before deploying:

```powershell
cd apps/server
alembic upgrade head
alembic current --check-heads
alembic check
python -m pytest -q
```

Use a disposable PostgreSQL database for the Alembic and database-sensitive
tests.

After deploying:

1. Confirm the bounded migration-completed event and expected revision.
2. Confirm `/health/live` and `/health/ready`.
3. Verify Neon contains `alembic_version` and all 24 application tables.
4. Exercise registration, sessions, a critical game mutation, chat, and R2
   upload/read.
5. Redeploy and cold-start after Render/Neon sleep; verify records persist.

Do not delete an old Render disk or Neon branch until the new service is
verified and an operator has explicitly accepted any data loss.
