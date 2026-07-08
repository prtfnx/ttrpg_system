# Deployment

Audience: operators and contributors preparing a deploy.

Status: partial. This page documents the deploy path currently present in the
repo and calls out the known gap in the Render build.

Last source audit: 2026-07-08

## Current deployment target

The checked-in cloud target is Render. The root `render.yaml` defines one Python
web service:

- service name: `ttrpg-server`;
- root directory: `apps/server`;
- build: install server dependencies and install `packages/core-table`;
- start: `uvicorn main:app --host 0.0.0.0 --port $PORT`;
- health check: `/health`;
- environment: `production`.

The server mounts `apps/server/static` at `/static` when that directory exists.
The React app is expected under `/static/ui/`, matching the Vite `base` setting
in `apps/web-ui/vite.config.ts`.

## Important gap

`render.yaml` currently does not build the React app or Rust/WASM package. It
only installs and starts the FastAPI service.

For a deploy that includes the current game client, the server must also have:

- `apps/server/static/ui`;
- `apps/server/templates/vite_assets.html`;
- `apps/server/templates/admin_assets.html`.

Those are produced by the repo build helper, not by the current Render build
command.

## Full app build

From the repository root on Windows/PowerShell:

```powershell
.\build_and_deploy.ps1
```

That script currently:

1. builds Rust/WASM from `packages/rust-core`;
2. writes generated bindings to `apps/web-ui/src/lib/wasm/generated`;
3. syncs generated WASM type files into `apps/web-ui/src/lib/wasm`;
4. runs TypeScript and Vite build in `apps/web-ui`;
5. copies `apps/web-ui/dist` into `apps/server/static/ui`;
6. copies generated WASM files into `apps/server/static/ui/wasm`;
7. regenerates Vite asset template tags from the Vite manifest.

The template generator is `apps/server/scripts/update_vite_assets.py`.

## Server-only Render build

The current Render build command is:

```text
pip install --upgrade pip
pip install -e ../../packages/core-table
pip install -r requirements.txt
```

The current Render start command is:

```text
uvicorn main:app --host 0.0.0.0 --port $PORT
```

This is enough to start FastAPI routes, templates, WebSocket entrypoints, and
the health endpoint. It is not enough to regenerate the bundled React client.

## Required environment

At minimum, production needs:

- `ENVIRONMENT=production`;
- `PORT`, supplied by Render;
- `DATABASE_URL`;
- `SECRET_KEY`;
- `SESSION_SECRET`, at least 32 characters.

`render.yaml` generates `SECRET_KEY`, but it does not list `SESSION_SECRET`.
`apps/server/main.py` raises at startup in production when `SESSION_SECRET` is
missing or shorter than 32 characters.

Optional production integrations:

- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BASE_URL`;
- email: `RESEND_API_KEY`, `EMAIL_FROM`;
- Cloudflare R2 assets: lowercase `r2_*` settings, plus `R2_ACCOUNT_ID` support
  in the R2 manager.

See [Environment variables](../reference/ENVIRONMENT_VARIABLES.md) for the
complete current list.

## Database and migrations

The server creates tables during startup through `create_tables()`. Numbered
migrations are separate and live under `apps/server/database/migrations/`.

Before deploying schema changes to an existing database, run the migration path
against a copy of the target database and confirm the app can start. Do not
assume `create_tables()` replaces a migration.

## Smoke check

After deploy:

1. Open `/health` and confirm a 200 response.
2. Open `/users/login`.
3. Log in or register in the configured auth mode.
4. Create or open a game session.
5. Confirm the game page loads React assets from `/static/ui/`.
6. Confirm the browser opens the game WebSocket.
7. If R2 is enabled, upload and re-open one asset.

## Deployment checklist

- Production `SESSION_SECRET` is set and long enough.
- Database URL points at the intended persistent database.
- Migrations were tested against a copy of the deployed database.
- Full UI assets exist if the deployment should serve the React game client.
- `vite_assets.html` matches the current Vite manifest.
- `/health` responds after deploy.
- One real session page loads without missing `/static/ui/` files.
