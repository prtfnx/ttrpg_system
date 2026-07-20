# Debug common failures

Audience: contributors who have the app running but something does not connect,
render, build, or persist.

Status: usable.

Last source audit: 2026-07-20

## Start with the boundary

Most failures belong to one of these boundaries:

- HTTP route: FastAPI router, auth/session dependency, template, or JSON shape.
- WebSocket protocol: message enum, handler registration, client helper, or
  role/session metadata.
- WASM runtime: Rust export, generated binding, runtime port, or canvas event.
- Persistence: SQLAlchemy model, Alembic revision, Neon connection/role, or
  session ownership.
- Storage: R2 configuration, presigned URL, upload confirmation, or asset hash.

Find the boundary first. It is faster than guessing through the whole app.

## Server will not start

Check:

```powershell
cd apps/server
python main.py
```

Common causes:

- `ENVIRONMENT=production` with a weak secret, wildcard CORS, or non-PostgreSQL
  database URL.
- Missing Python dependencies.
- Database import or migration errors.
- A missing packaged UI or verified production compendium artifact.
- A router was added but not importable from `main.py`.

The health endpoints are:

```text
/health/live
/health/ready
```

## HTTP route returns the wrong thing

Check whether the route is a browser page or an API endpoint. `main.py` has
custom 401 and 403 handlers that return JSON only when the request accepts
`application/json`; browser requests redirect to the auth error page.

Useful tests:

```powershell
cd apps/server
python -m pytest tests\integration -q
```

## WebSocket message is ignored

Check all four places:

1. Python enum in `packages/core-table/core_table/protocol.py`.
2. TypeScript enum in `apps/web-ui/src/lib/websocket/message.ts`.
3. Handler registration in `apps/server/service/protocol/base.py`.
4. Browser helper or response handler in
   `apps/web-ui/src/lib/websocket/clientProtocol.ts`.

If a message mutates combat, prefer the existing `combat_command` envelope
instead of adding a new direct mutation message.

## Canvas or WASM behavior does nothing

Check:

- Rust export exists under `packages/rust-core/src/`.
- `wasm-pack build` regenerated browser bindings.
- `WasmRuntimePort` and `WasmRuntime` expose the operation.
- React code uses runtime hooks instead of importing generated bindings
  directly.
- The canvas tool maps to the correct active tool or callback.

Useful focused checks:

```powershell
cd apps/web-ui
pnpm.cmd exec tsc -b --pretty false
pnpm.cmd exec vitest run --project jsdom src/lib/wasm
```

## Data is not saved

Check the owner:

- character data: character protocol and character manager;
- table, sprite, wall, paint, fog, and combat data: protocol handler plus
  database model;
- compendium data: exported JSON files, not normal app persistence;
- assets: `Asset` rows are created only after upload confirmation.

For schema changes, models do not replace Alembic revisions.

```powershell
cd apps/server
alembic current --check-heads
alembic check
```

If the app is deployed, check whether `DATABASE_MIGRATION_URL` can migrate and
whether the restricted `DATABASE_URL` can perform normal reads/writes. Do not
paste either URL into logs or issues.

## Asset image does not appear

Check:

- R2 environment variables are configured.
- The server returned an upload or download URL.
- The browser sent `asset_upload_confirm`.
- The asset row exists in the database after confirmation.
- The runtime received `asset-downloaded` or `asset-uploaded` protocol events.

Current asset listing is incomplete, so an empty asset-list response does not
prove that uploads are broken.

## Compendium data is missing

Check:

- `/api/compendium/status`;
- exported JSON files under
  `packages/core-table/core_table/compendiums/exports/`;
- `apps/server/routers/compendium.py`;
- `apps/web-ui/src/features/compendium/services/compendiumService.ts`.

Compendium route tests allow either available-data or missing-data status codes
for some endpoints, because local data availability can vary.

## Last resort checklist

- Reproduce with one focused route, message, or component.
- Read the server log around the first failure, not the last cascade.
- Run the smallest matching test file before a full suite.
- Update docs only after the source behavior is confirmed.
