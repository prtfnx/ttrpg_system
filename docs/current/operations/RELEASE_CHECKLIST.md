# Release checklist

Status: current and practical. The checked-in Render target is a Free preview;
use the production upgrade gate below before public-production approval.

Last source audit: 2026-08-19

## Scope

The deployable application contains:

- FastAPI server in `apps/server`;
- React/Vite client in `apps/web-ui`;
- tracked Rust/WASM release output generated from `packages/rust-core`;
- shared Python domain package in `packages/core-table`;
- Alembic schema history for Neon PostgreSQL;
- Cloudflare R2 object storage.

The root Render build installs both language workspaces, builds Vite, and
packages the UI into the Python service. It does not compile Rust: generated
WASM is reviewed and committed, and CI rebuilds it to reject drift.

## Before merging

1. Identify the changed ownership boundary: server, protocol, web, WASM,
   persistence, storage, or deployment.
2. Update its current documentation in the same branch.
3. Add an incremental Alembic revision for every database shape change.
4. Update both sides of any WebSocket contract.
5. Rebuild and commit generated WASM when Rust exports or release settings
   change.
6. Do not edit an Alembic revision that has already been deployed.
7. Run the focused tests first, then the full gates below.

## Full local gates

Server:

```powershell
cd apps/server
python -m pytest
python -m ruff check .
cd ../..
pnpm.cmd dlx pyright@1.1.411
```

PostgreSQL, against an empty disposable target:

```powershell
$env:TEST_POSTGRESQL_DATABASE_URL = "postgresql://..."
python -m pytest `
  tests/integration/test_alembic_baseline.py `
  tests/integration/test_postgresql_contract.py `
  --no-cov
alembic current --check-heads
alembic check
```

Web UI:

```powershell
cd apps/web-ui
pnpm exec tsc -b
pnpm exec vitest run --project jsdom
pnpm exec vite build
pnpm.cmd run lint:css
pnpm.cmd run validate:css
```

Rust/WASM:

```powershell
cd packages/rust-core
cargo test --locked
wasm-pack test --node --test wasm_node --locked
pnpm.cmd run test:browser
wasm-pack build `
  --target web `
  --release `
  --out-dir ../../apps/web-ui/src/lib/wasm/generated `
  -- `
  --features wasm-start
git diff --exit-code -- ../../apps/web-ui/src/lib/wasm/generated
```

Deployment artifact and docs, from the repository root:

```powershell
python apps/server/scripts/package_web_ui.py
pnpm.cmd run docs:check
```

## Artifact checks

Confirm:

- `apps/web-ui/dist/.vite/manifest.json` exists;
- `apps/server/static/ui/index.html` and hashed Vite assets exist;
- `apps/server/static/ui/wasm/` contains the generated JS and optimized WASM;
- `apps/server/templates/vite_assets.html` and `admin_assets.html` match the
  current manifest;
- the bundled compendium manifest verifies all five SRD starter payloads;
- `THIRD_PARTY_NOTICES.md` and `/api/compendium/status` expose the active SRD
  attribution and provenance.

The compendium gate is mandatory. When `COMPENDIUM_DIR` replaces the bundled
starter, verify that the external catalog has distribution rights, the exact
five-file shape, and a manifest produced after the final payload change. Local
ignored exports are not a deployable release artifact.

## Configuration preflight

Production requires:

- `ENVIRONMENT=production`;
- strong generated or operator-managed `SECRET_KEY`, `SESSION_SECRET`, and
  `METRICS_TOKEN`;
- explicit `CORS_ORIGINS` and correct `BASE_URL`;
- Neon `DATABASE_URL` for the runtime role;
- Neon `DATABASE_MIGRATION_URL` for the owner/migration role;
- complete R2 settings with put, get/head, delete, and list permissions;
- a dedicated R2 Standard bucket, expiry cleanup for `pending/`, and Cloudflare
  billing notifications;
- an explicit `ASSET_LINK_MODE`; for `worker`, the deployed custom-domain URL,
  a matching 32+ character HMAC secret, exact origin allowlist, private R2 and
  Durable Object bindings, conservative budgets, and fail-closed routing;
- reviewed `ASSET_*` limits, including a plan-wide byte ceiling no higher than
  `9000000000` for the free R2 release profile, five-minute download URLs,
  15-minute upload URLs, a 30-minute confirmation window, and the session/actor
  link caps;
- optional `COMPENDIUM_DIR` only when deploying a separately licensed complete
  catalog;
- optional OAuth, email, and telemetry settings used by the release.

Confirm database URLs use SSL and are absent from Git, logs, tickets, and
command output. The application byte ceiling covers confirmed and pending
objects represented in PostgreSQL. It is not a provider-side billing hard stop.
Presigned bearer URLs can be replayed until expiry. Worker mode prevents upload
replay and budgets browser-originated R2 operations, but trusted API-side calls
bypass that counter. Unrelated objects are invisible to both application
counters. Keep the bucket dedicated and review the whole-bucket orphan audit
before release.

## Database preflight

1. Read [Database migrations](DATABASE_MIGRATIONS.md).
2. Upgrade and test a disposable PostgreSQL database or Neon branch.
3. Run `alembic current --check-heads` and `alembic check`.
4. Confirm the application tables at the current Alembic head, including the
   `0006_upload_intent_cleanup` limiter/quota and cleanup state, plus
   `alembic_version`.
5. Confirm constraints, concurrent idempotency, readiness mismatch, and stale
   connection recovery tests pass.
6. Prefer a forward fix; use Neon branch recovery only within the documented
   development policy.

## Render deployment

Render runs the repository-root build:

```text
pip install -e packages/core-table
pip install --require-hashes -r apps/server/requirements.txt
pnpm install --frozen-lockfile
pnpm --filter @ttrpg/web-ui build
python apps/server/scripts/package_web_ui.py
```

It then starts:

```text
cd apps/server && python scripts/migrate_and_start.py
```

The wrapper takes a PostgreSQL advisory lock, upgrades and verifies Alembic,
disposes the migration engine, and replaces itself with Uvicorn.

The Blueprint uses one Free preview instance, disables automatic deploys, and
provides a 60-second graceful shutdown window. Free has no Render maintenance
mode, so only backward-compatible expand/contract migrations may run while the
old and new deploys can overlap. Trigger the reviewed deploy manually, confirm
revision/artifact health, and run the smoke test. Connected clients receive a
retryable shutdown notice and WebSocket close code `1012`.

Before public production, change the Blueprint to `plan: starter` or a larger
capacity-tested paid instance, restore `maintenanceMode.enabled: false`, and
use the maintenance release flow in [Deployment](DEPLOYMENT.md). Record the
selected plan and acceptance evidence in the release record.

## Smoke test after deploy

1. Check `/health/live` and `/health/ready`.
2. Open the landing, registration, and login flows.
3. Create or open a game session and load the integrated client.
4. Confirm Vite and WASM requests do not return 404.
5. Connect to the WebSocket and persist one table mutation.
6. Exercise chat and one idempotent combat action.
7. Upload, read, and delete one small R2-backed asset. In Worker mode, also
   confirm that a repeated PUT returns `409`, an expired capability returns
   `403`, an authorized second GET is served from cache, and a forced budget
   exhaustion fails before R2 access.
8. Redeploy the same commit and confirm database state remains.
9. Allow Render and Neon to sleep, then confirm a cold-start reconnect and
   persisted state.
10. Check bounded logs, metrics, and Neon/R2 usage without copying secrets.

## Rollback and release record

- Code rollback and schema recovery are separate decisions.
- R2 bytes are separate from PostgreSQL metadata.
- Use a reviewed forward migration when newer writes may exist.
- Do not delete an old Neon branch or Render disk without explicit operator
  approval.

Record the commit, migrations, commands run, manual smoke results, known gaps,
and the rollback decision point.
