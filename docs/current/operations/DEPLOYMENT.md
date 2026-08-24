# Deployment

Audience: operators and contributors preparing a deploy.

Status: usable for a Free preview deployment. Public production requires a
paid, capacity-tested Render instance.

Last source audit: 2026-07-29

## Current target

The root `render.yaml` defines one Render Free Python preview web service in
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
- no persistent disk.

Keep the Render and Neon regions close to reduce request and WebSocket
transaction latency.

The Free instance is a preview choice, not a public-production target. It can
spin down after 15 minutes without inbound HTTP or WebSocket traffic, takes
approximately one minute to wake, has monthly usage limits, can be restarted
without advance notice, and does not provide maintenance mode, shell access,
one-off jobs, or persistent disks. The browser's 30-second WebSocket heartbeat
keeps an active game session from being idle, but an unused preview is expected
to sleep.

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

## Free preview release flow

Automatic deploys are disabled. For each reviewed release:

1. Confirm CI, the disposable PostgreSQL migration contract, and the release
   artifact are green.
2. Confirm every database change is backward-compatible with the currently
   deployed application. Render temporarily overlaps old and new instances
   during its zero-downtime deploy, and Free has no maintenance mode.
3. Announce the preview restart and trigger a manual deploy of the recorded
   commit. Observe migration/startup
   logs. The old process sends connected clients a retryable shutdown notice,
   persists final protocol state, and closes WebSockets with code `1012`.
4. Confirm the deploy is healthy, at the expected Alembic revision, and serving
   the expected artifact and compendium digests.
5. Run the preview smoke test, including cold-start and WebSocket reconnect.

Do not scale above one instance until the in-memory OAuth state cache, rate
limits, and connection coordination have shared-store designs.

Use expand/contract migrations for the preview: add compatible schema first,
deploy code that works with both shapes, and remove obsolete schema only in a
later release. Do not deploy a destructive or backward-incompatible migration
while an older instance can still write.

## Production upgrade requirement

Before treating this service as public production:

1. Change `plan: free` to `plan: starter` or a larger instance selected from
   production-shaped load results.
2. Restore the paid-only Blueprint setting:

   ```yaml
   maintenanceMode:
     enabled: false
   ```

3. Use maintenance mode for migration-sensitive releases, then verify the
   deployed revision and artifacts before reopening public traffic.
4. Re-run capacity, cold-start, reconnect, observability, backup, and restore
   acceptance on the selected paid plan.

`ENVIRONMENT=production` remains correct for the Free public preview. It keeps
strong-secret, cookie, origin, CORS, and PostgreSQL startup checks enabled.

## Required secrets and configuration

Configure in the Render dashboard:

- `DATABASE_URL`: SSL-enabled Neon URL for the runtime application role;
- `DATABASE_MIGRATION_URL`: direct SSL-enabled Neon owner/migration URL;
- `SECRET_KEY`, `SESSION_SECRET`, and `METRICS_TOKEN`;
- explicit `CORS_ORIGINS` and the public `BASE_URL`;
- the required `R2_*` values;
- `ASSET_LINK_MODE`, plus `ASSET_WORKER_BASE_URL` and the shared
  `ASSET_WORKER_HMAC_SECRET` when Worker mode is selected;
- reviewed `ASSET_*` quotas, including a plan-wide storage ceiling that covers
  every application object in the dedicated bucket;
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

For the free R2 release profile, use Standard storage, keep the application
ceiling at or below 9,000,000,000 bytes, apply expiry cleanup to `pending/`, and
configure Cloudflare billing notifications. Keep the release defaults at five
minutes for download URLs, 15 minutes for upload URLs, and 30 minutes for
upload confirmation. Do not share the bucket with untracked workloads.

### Optional Worker asset gateway

Worker mode can be deployed independently without changing the browser or
WebSocket contract:

1. In `apps/server/asset_gateway/wrangler.jsonc`, set the dedicated R2 bucket,
   exact browser origin allowlist, and conservative daily/monthly limits.
2. From that directory, run `pnpm test`, `pnpm run check`, and
   `pnpm dlx wrangler@latest deploy --dry-run`.
3. Install a random 32+ character secret with
   `pnpm dlx wrangler@latest secret put ASSET_WORKER_HMAC_SECRET`.
4. Attach a custom domain or route. Cache API persistence is not available on
   `workers.dev`; configure route failure behavior as fail closed.
5. Deploy the Worker, then exercise an expired capability, upload replay,
   authorized cache miss/hit, and budget rejection before routing production
   clients through it.
6. Configure that HTTPS origin and the same secret on FastAPI, then set
   `ASSET_LINK_MODE=worker` and redeploy the API.

The gateway reserves budget before browser-originated R2 calls. An upload
conservatively reserves six normal-lifecycle operations: PUT and promotion
copy as two Class A units, then confirmation HEAD/GET and two promotion checks
as four Class B units.
An authorized download cache miss reserves one Class B unit. Both consume the
weighted daily allowance; cache hits consume Worker capacity but avoid R2
reads. Keep the remaining headroom for retries, deletion, smoke, and audit
calls. Switching the API back to `ASSET_LINK_MODE=presigned` is the rollback;
keep direct R2 CORS valid if that fallback must remain immediately available.

Do not delete an old Render disk or Neon branch until the new service is
verified and an operator has explicitly accepted any data loss.
