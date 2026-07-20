# Release checklist

Status: current and practical. Use this before a production deploy or a
release-like handoff.

Last source audit: 2026-07-17

## Scope

This app is a monorepo with four release-sensitive parts:

- FastAPI server in `apps/server`.
- React/Vite client in `apps/web-ui`.
- Rust/WASM engine in `packages/rust-core`.
- Shared Python domain package in `packages/core-table`.

Render deployment is configured in `render.yaml`, but that file only installs
and starts the Python server. The current full UI build and copy step lives in
`build_and_deploy.ps1`. The copied server UI directory is ignored by Git except
for `.gitkeep`, so local copied artifacts do not deploy to Render by
themselves.

## Before merging

1. Confirm the change has a clear owner: server/API/protocol, web UI,
   Rust/WASM, persistence/migration, or deployment/configuration.
2. Read the matching docs in `docs/current/`.
3. If behavior changed, update the current doc in the same branch.
4. If a database shape changed, add and review an Alembic revision under
   `apps/server/database/alembic/versions/`.
5. If a WebSocket message changed, update both browser and server protocol
   definitions.
6. If the Rust exports changed, rebuild generated WASM bindings before testing
   the browser path.
7. Run `pnpm.cmd run docs:check` if any current docs changed.

## Local verification

Run the smallest focused tests first, then widen.

Server:

```powershell
cd apps/server
python -m pytest
```

The server pytest config collects `tests/`, enables coverage, and has a
`fail_under = 60` coverage gate.

Web UI:

```powershell
cd apps/web-ui
pnpm exec vitest run --project jsdom
pnpm exec tsc -b
pnpm exec vite build
```

Rust/WASM:

```powershell
cd packages/rust-core
cargo test
wasm-pack build --release --target web --out-dir ../../apps/web-ui/src/lib/wasm/generated --features wasm-start
```

Full helper:

```powershell
.\build_and_deploy.ps1 -Test
.\build_and_deploy.ps1
```

The `-Test` mode currently runs Rust native tests and web jsdom tests. It does
not run Python tests. The full build mode builds WASM, builds Vite, copies
`apps/web-ui/dist` to `apps/server/static/ui`, copies generated WASM under that
static UI folder, and runs `apps/server/scripts/update_vite_assets.py`.

Docs:

```powershell
pnpm.cmd run docs:check
```

## Build artifacts to check

After `.\build_and_deploy.ps1`, check:

- `apps/web-ui/dist/.vite/manifest.json` exists.
- `apps/server/static/ui/` contains the copied Vite build.
- `apps/server/static/ui/wasm/` contains the copied generated WASM files.
- `apps/server/templates/vite_assets.html` was regenerated.
- `apps/server/templates/admin_assets.html` was regenerated.

`apps/server/api/game_ws.py` reads `templates/vite_assets.html` when rendering
the integrated game client. If that template is stale, the server can start
while the browser receives wrong asset paths.

## Configuration preflight

Production must have:

- `ENVIRONMENT=production`
- `SESSION_SECRET` set to a strong value with at least 32 characters
- `CORS_ORIGINS` set deliberately, not accidentally left broad
- the intended PostgreSQL `DATABASE_URL`
- Google OAuth values if Google login is enabled
- email provider values if email/reset flows are enabled
- R2 values if object storage is enabled

Important source-checked caveat: `render.yaml` currently generates
`SECRET_KEY`, but `apps/server/main.py` enforces `SESSION_SECRET` in production.
Set `SESSION_SECRET` explicitly in Render.

## Database

Before deploy:

1. Read `docs/current/operations/DATABASE_MIGRATIONS.md`.
2. Apply migrations to a disposable PostgreSQL database.
3. Run `alembic current --check-heads` and `alembic check`.
4. Confirm the resulting 24-table schema and critical PostgreSQL behavior.

Do not treat migration rollback as automatic. Prefer a reviewed forward fix;
use Neon branch recovery only within the documented development policy.

## Deployment

Render uses:

```text
rootDir: apps/server
buildCommand:
  pip install --upgrade pip
  pip install -e ../../packages/core-table
  pip install -r requirements.txt
startCommand:
  python scripts/migrate_and_start.py
healthCheckPath: /health/ready
```

Because this Render build does not run the React/WASM build, change the Render
build command to build/copy those artifacts or provide them through another
deployment artifact path. A local `build_and_deploy.ps1` run is not enough if
the generated files remain ignored and are not uploaded with the deploy.

## Smoke test after deploy

1. Open `/health/live` and `/health/ready`.
2. Open the landing/login flow.
3. Register or log in with a test account.
4. Create or open a game session.
5. Open the integrated game client.
6. Confirm the browser loaded Vite assets and WASM without 404s.
7. Connect to the WebSocket session.
8. Move or create a simple table object.
9. If the release touched combat, run one combat command through the UI.
10. If the release touched assets, upload one small asset and confirm it appears.
11. Check server logs for startup, route, WebSocket, or asset errors.

## Rollback notes

- Code rollback is normal Git/deployment rollback.
- Database recovery uses a verified Neon branch during development.
- R2 object data is separate from PostgreSQL metadata.
- Generated UI assets can be stale independently of Python server code.
- If a migration already changed data, decide whether branch recovery or a
  corrective forward migration is safer before deploying code.

## Release notes

For each release, record:

- commit or tag
- migrations included
- commands run
- manual smoke result
- known gaps accepted for this release
- rollback decision point
