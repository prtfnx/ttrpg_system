# Local first run

Audience: new contributors setting up the app on Windows/PowerShell.

Status: partial. This covers the current server-integrated run path. It does
not cover production deployment.

Last source audit: 2026-07-08

## What you will run

The real app entry is the FastAPI server. Auth, dashboard, and session pages
come from `apps/server`. React mounts inside `/game/session/{session_code}`
after the server injects initial user/session data.

Use Vite dev for focused React work, but do not treat it as the full app smoke
test unless the auth/session integration has been wired for that mode.

## Prerequisites

Install these before starting:

- Node and pnpm. The root `package.json` declares `pnpm@9.15.0`.
- Python 3.11 or newer for the server.
- Rust and Cargo for `packages/rust-core`.
- `wasm-pack` for the normal WASM build path.

## One-time setup

Run from the repository root.

Install JavaScript dependencies:

```powershell
pnpm install
```

Create and activate a Python virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install the editable Python domain package and server dependencies:

```powershell
.\scripts\setup-python.ps1
```

That script installs `packages/core-table` in editable mode and then installs
`apps/server/requirements.txt`.

## Build the browser client for the server

For a local dev build with debug-friendly output:

```powershell
.\build_and_deploy.ps1 -dev
```

This script currently:

- builds Rust/WASM into `apps/web-ui/src/lib/wasm/generated`;
- syncs generated WASM type files into `apps/web-ui/src/lib/wasm`;
- builds the React app with Vite;
- copies `apps/web-ui/dist` into `apps/server/static/ui`;
- generates server template asset tags from the Vite manifest.

For a WASM-only rebuild:

```powershell
.\build_and_deploy.ps1 -WasmOnly
```

## Start the server

Keep the Python virtual environment active, then run:

```powershell
.\scripts\dev-server.ps1
```

The default URL is:

```text
http://localhost:8000
```

The server creates or verifies local SQLite tables on startup. By default the
database file is `apps/server/ttrpg.db` unless `DATABASE_URL` is set.

## First smoke path

1. Open `http://localhost:8000/users/register`.
2. Create a local user.
3. Go to the dashboard.
4. Create a game session.
5. Open the session page.
6. Confirm the React game client loads.
7. Confirm the WebSocket connection reaches the game session.
8. Confirm the canvas area and right panel appear.

If login redirects or the React client does not load, rebuild with
`.\build_and_deploy.ps1 -dev` and restart the server.

## Useful focused commands

Server tests:

```powershell
cd apps/server
pytest tests/ -q
```

Web UI typecheck and JSDOM tests:

```powershell
cd apps/web-ui
pnpm.cmd exec tsc -b --pretty false
pnpm.cmd exec vitest run --project jsdom
```

Rust tests:

```powershell
cd packages/rust-core
cargo test
```

Core table tests:

```powershell
cd packages/core-table
pytest -q
```

## Common setup problems

Missing `core_table` import:

- Activate `.venv`.
- Run `.\scripts\setup-python.ps1` again.

Stale or missing WASM bindings:

- Run `.\build_and_deploy.ps1 -WasmOnly`.
- If React types still fail, run the full `.\build_and_deploy.ps1 -dev`.

React assets missing from the server page:

- Run `.\build_and_deploy.ps1 -dev`.
- Check that `apps/server/templates/vite_assets.html` was regenerated.
- Check that `apps/server/static/ui` exists.

Production-secret error:

- If `ENVIRONMENT=production`, the server requires a strong
  `SESSION_SECRET`.
- For local development, leave `ENVIRONMENT` unset unless you are testing
  production behavior.

Vite dev server confusion:

- `pnpm --dir apps/web-ui dev` starts the React dev server.
- The current full app still depends on FastAPI auth/session pages, so use the
  server-integrated smoke path above for first-run verification.
