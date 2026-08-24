# Production deployment guide

Audience: the operator deploying the TTRPG application to Neon, Render, and
Cloudflare R2/Workers.

Status: source-audited and locally verified on 2026-08-20. The code-owned
accounting, cleanup, CI, diagnostics, and secret-rotation gates are complete.
Public Worker-backed uploads still require the account-owned staging and
operational evidence below.
The shorter current contract remains in
[`docs/current/operations/DEPLOYMENT.md`](../current/operations/DEPLOYMENT.md).

This guide uses PowerShell commands from the repository root and these example
values:

| Name | Example | Meaning |
| --- | --- | --- |
| Application origin | `https://table.example.com` | Render application URL used by browsers. |
| Asset gateway origin | `https://assets.example.com` | Cloudflare Worker custom domain. |
| R2 bucket | `ttrpg-assets-production` | Dedicated private Standard R2 bucket. |
| Render service | `ttrpg-server` | Web service defined by `render.yaml`. |

Replace every example before deployment. An origin is only scheme plus host
and optional port. Do not append a path, query, or fragment.

## 1. Architecture and release decision

```text
Browser
  |
  | HTTPS / HTTP-only login cookie / WebSocket
  v
Render: FastAPI + packaged React/WASM
  |                         |
  | PostgreSQL              | signed asset capability
  v                         v
Neon                    Cloudflare Worker
                            |       |
                            |       +-- SQLite Durable Object: nonce + budget
                            |
                            +-- private R2 binding

Render also uses a bucket-scoped R2 S3 token for verification, promotion,
deletion, smoke tests, and audits. The browser never receives that token.
```

The API supports two browser transfer modes:

- `ASSET_LINK_MODE=presigned`: browser PUT/GET goes directly to R2. This is the
  compatibility and rollback mode.
- `ASSET_LINK_MODE=worker`: browser PUT/GET goes through the signed Worker
  gateway. The WebSocket payload shape does not change.

The configured URL lifetimes are five minutes for downloads, 15 minutes for
uploads, and 30 minutes for durable upload confirmation. A five-hour game does
not require a five-hour URL: the application requests a new download URL when
needed and retains verified bytes in its bounded browser Blob cache.

## 2. Mandatory release gates

Do not enable public, untrusted asset uploads until the staging and operator
items in sections 2.4 and 2.5 are complete. Application limits deliberately
leave headroom, but neither link mode is an account-level billing hard stop.

### 2.1 Correct operation accounting

Implemented. The Worker reserves the following worst-case successful flow:

1. Worker `put`: one Class A operation.
2. Server `head_object` and `get_object`: two Class B operations.
3. Promotion destination check, copy, and post-copy check: two more Class B
   operations and one Class A operation.
4. Source deletion: free under current R2 pricing.

Each accepted upload now reserves two Class A and four Class B operations plus
six weighted daily units before accepting its body. The regression tests pin
those values. Keep configured limits below the provider allowance to leave
headroom for failures, manual audits, and smoke tests, which the gateway cannot
observe.

### 2.2 Align the budget window with Cloudflare billing

Implemented. The Durable Object aggregates reservations into hourly buckets,
retains the boundary bucket until its entire hour is older than 30 days, and
sums every active bucket before accepting another R2 operation. This bounds
Durable Object row growth and conservatively overcounts by at most one hour.
The weighted daily guard still resets at UTC midnight. The rolling window does
not depend on account metadata.

Cloudflare states that dashboard usage is billing-cycle aligned, not
calendar-month aligned: [Monitor billable usage](https://developers.cloudflare.com/billing/manage/billable-usage/).

### 2.3 Keep pending bytes reserved until deletion

Implemented. Upload intents that may own R2 bytes remain part of per-user and
global storage accounting after capability expiry. A PostgreSQL-backed cleanup
state machine waits one hour beyond expiry for in-flight PUTs to settle, then
deletes the key without holding a database transaction over R2 I/O. Failed
deletes retry with bounded backoff and remain charged; only `cleaned` releases
the reservation. Rejected verification, client-reported failure, promotion
failure, metadata failure, superseded links, and legacy terminal states enter
the same path. The one-day lifecycle remains disaster recovery rather than the
primary accounting mechanism.

Cloudflare notes that lifecycle deletion is typically processed within 24
hours and can take longer: [R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

### 2.4 Put the gateway in CI and run a real integration test

Implemented for the local/CI portion. The explicit `asset-gateway` CI job runs:

```powershell
pnpm test:asset-gateway
Set-Location apps/server/asset_gateway
pnpm dlx wrangler@4.124.0 deploy --dry-run
```

The unit tests still fake Cache API, R2, and the Durable Object environment.
The remaining gate is a deployed staging Worker with a real private staging
bucket and a real browser upload/confirmation/download/delete cycle.

### 2.5 Complete operational hardening

- Rejection and budget failures now emit structured events containing only
  method/kind/status, and downloads expose `X-Asset-Cache: HIT|MISS`. Confirm
  those signals appear in staging without capability query strings, object
  keys, hashes, or secrets being added to application logs.
- Configure the one Free-plan WAF rate-limit rule for `/v1/assets/` and tune it
  using a multi-map session. Free-plan counting is IP-based, so account for
  players sharing NAT: [WAF rate limiting availability](https://developers.cloudflare.com/waf/rate-limiting-rules/).
- Exercise the implemented dual-key shared-secret rotation procedure in
  staging, including removal of the previous key after one hour.
- Capture live quota rollover, cache miss/hit, expired-token, replay, failure,
  cold-start, and rollback evidence.

Until these gates close, a private trusted preview can use presigned mode with
strict invitations and manual usage monitoring. That is not a guarantee that
the R2 free allowance cannot be exceeded.

## 3. Accounts, tools, and names

Prepare:

- a GitHub/GitLab repository containing the reviewed commit;
- a Neon project and production branch;
- a Render account connected to the repository;
- a Cloudflare account with R2 enabled;
- a domain delegated to Cloudflare DNS for the Worker custom domain;
- Python 3.11, Node 22, pnpm 9, Git, and Wrangler access locally.

Authenticate Wrangler without storing an API token in the repository:

```powershell
Set-Location apps/server/asset_gateway
pnpm dlx wrangler@latest login
pnpm dlx wrangler@latest whoami
Set-Location ../../..
```

Choose a dedicated bucket. The R2 free allowance is account-wide, not a
per-bucket guarantee, so do not run other workloads in the same account if the
goal is strict isolation. R2 currently includes 10 GB-month Standard storage,
1 million Class A operations, and 10 million Class B operations per month:
[R2 pricing](https://developers.cloudflare.com/r2/pricing/).

## 4. Generate and store application secrets

Generate four independent random values of at least 32 characters:

- `SECRET_KEY`;
- `SESSION_SECRET`;
- `METRICS_TOKEN`;
- `ASSET_WORKER_HMAC_SECRET`.

Prefer a password manager. A local PowerShell generator is:

```powershell
$secretBytes = New-Object byte[] 48
$randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
$randomGenerator.GetBytes($secretBytes)
[Convert]::ToBase64String($secretBytes)
$randomGenerator.Dispose()
Remove-Variable secretBytes, randomGenerator
```

Run it separately for every secret. Store the values directly in the password
manager, Render secret fields, and Cloudflare Worker secret prompt. Do not put
them in source, `render.yaml`, `wrangler.jsonc`, tickets, screenshots, or shell
scripts.

The Worker and Render values for `ASSET_WORKER_HMAC_SECRET` must be byte-for-byte
identical. The other three secrets must be different from it and from each
other.

## 5. Provision Neon PostgreSQL

1. Create the production Neon project/branch near Render Frankfurt.
2. Obtain a direct SSL connection string for migrations.
3. Create or select a restricted runtime role with CRUD/sequence permissions
   on the application schema.
4. Obtain its pooled SSL connection string for normal application traffic.
5. Record them as:

   - `DATABASE_MIGRATION_URL`: direct owner/migration connection;
   - `DATABASE_URL`: pooled restricted runtime connection.

Neon pooled URLs contain `-pooler` in the hostname. Keep a direct connection
available for migrations: [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

Before production, verify migrations against a separate disposable Neon branch:

```powershell
Set-Location apps/server
$disposableDatabaseUrl = '<DISPOSABLE_POSTGRESQL_URL>'
$env:DATABASE_URL = $disposableDatabaseUrl
$env:DATABASE_MIGRATION_URL = $disposableDatabaseUrl
$env:TEST_POSTGRESQL_DATABASE_URL = $disposableDatabaseUrl
alembic upgrade head
alembic current --check-heads
alembic check
python -m pytest `
  tests/integration/test_alembic_baseline.py `
  tests/integration/test_postgresql_contract.py `
  --no-cov
Remove-Item Env:DATABASE_URL, Env:DATABASE_MIGRATION_URL, Env:TEST_POSTGRESQL_DATABASE_URL
Remove-Variable disposableDatabaseUrl
Set-Location ../..
```

Never point `TEST_POSTGRESQL_DATABASE_URL` at the durable production database.

## 6. Create the private R2 bucket

Create a dedicated Standard bucket. Automatic location is acceptable;
`weur` is a best-effort location hint near the selected Render region:

```powershell
Set-Location apps/server/asset_gateway
pnpm dlx wrangler@latest r2 bucket create ttrpg-assets-production `
  --location weur `
  --storage-class Standard
pnpm dlx wrangler@latest r2 bucket list
Set-Location ../../..
```

Cloudflare documents `weur` as Western Europe and notes that location hints are
not residency guarantees: [R2 data location](https://developers.cloudflare.com/r2/reference/data-location/).

In R2 > bucket > Settings:

- confirm the storage class is Standard;
- keep public `r2.dev` access disabled;
- do not attach a public R2 custom domain—the Worker custom domain is separate;
- confirm the bucket contains no unrelated objects.

If legal requirements demand the EU jurisdiction rather than a location hint,
create the bucket with that jurisdiction, add `"jurisdiction": "eu"` to the
Worker R2 binding, and configure Render `R2_ENDPOINT` as
`https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`. Jurisdiction cannot be
changed after bucket creation.

## 7. Create the Render runtime R2 credentials

The Worker R2 binding does not use S3 credentials. Render still needs them for
verification, promotion, deletion, and audits.

In Cloudflare Dashboard > R2 > Overview > Manage API Tokens:

1. Create an account token with **Object Read & Write**.
2. Scope it to `ttrpg-assets-production` only.
3. Copy the Access Key ID and Secret Access Key immediately; the secret is
   shown once.
4. Record the Cloudflare Account ID.

Map them later to:

```text
R2_ACCOUNT_ID=<Cloudflare account ID>
R2_ACCESS_KEY=<R2 Access Key ID>
R2_SECRET_KEY=<R2 Secret Access Key>
R2_BUCKET_NAME=ttrpg-assets-production
R2_ENABLED=true
```

The endpoint for a default-jurisdiction bucket is
`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. See
[R2 authentication](https://developers.cloudflare.com/r2/api/tokens/).

Use a separate temporary administrator credential if bucket configuration
permissions are needed. Do not give the Render runtime token account-wide
bucket administration authority.

## 8. Apply R2 CORS and lifecycle configuration

Direct R2 CORS is required by presigned mode and should remain available for
rollback. Worker mode enforces its own CORS allowlist.

Create an ignored `apps/server/.env` locally containing the R2 setup credential
and the database URL required for the operational audit record. Confirm it is
ignored before adding secrets:

```powershell
git check-ignore apps/server/.env
```

Then run from the repository root:

```powershell
python scripts/r2_storage_admin.py apply-config `
  --origin https://table.example.com
python scripts/r2_storage_admin.py smoke
```

`apply-config` replaces the placeholder origin while applying
`r2-cors-config.json` and the one-day `pending/` lifecycle from
`r2-lifecycle-config.json`. `smoke` must report success and delete its temporary
object. Run `audit` only after the first successful application migration so it
can compare R2 with the production asset tables.

Do not run `audit --delete-orphans` during initial setup. Never use `--verbose`
in CI or copied terminal output because it prints object keys.

Cloudflare also supports applying CORS and lifecycle through its dashboard or
Wrangler: [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/) and
[R2 lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

After configuration, remove the temporary administrator credential from the
local `.env` and retain only the restricted runtime credential when another
smoke/audit is required.

## 9. Configure the Worker

Edit `apps/server/asset_gateway/wrangler.jsonc`:

```jsonc
{
  "name": "ttrpg-asset-gateway",
  "workers_dev": false,
  "preview_urls": false,
  "routes": [
    {
      "pattern": "assets.example.com",
      "custom_domain": true
    }
  ],
  "r2_buckets": [
    {
      "binding": "ASSETS",
      "bucket_name": "ttrpg-assets-production"
    }
  ],
  "vars": {
    "ALLOWED_ORIGINS": "https://table.example.com",
    "ASSET_CLASS_A_MONTHLY_LIMIT": "800000",
    "ASSET_CLASS_B_MONTHLY_LIMIT": "8000000",
    "ASSET_R2_DAILY_LIMIT": "80000",
    "ASSET_CACHE_TTL_SECONDS": "86400"
  }
}
```

Keep the existing Durable Object binding and `v1` SQLite migration. For an EU
jurisdiction bucket, add `"jurisdiction": "eu"` to the `ASSETS` binding.

Cloudflare Custom Domains create the DNS record and certificate. The hostname
must belong to an active Cloudflare zone and cannot already have a conflicting
CNAME: [Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Use a custom domain, not `workers.dev`, because the R2 Cache API example states
that Cache API operations on `workers.dev` deployments have no effect:
[R2 Cache API](https://developers.cloudflare.com/r2/examples/cache-api/).

If the application is intentionally reachable from multiple browser origins,
list them comma-separated in `ALLOWED_ORIGINS` and in Render `CORS_ORIGINS`.
Do not add `*`.

## 10. Validate and deploy the Worker infrastructure

Keep the API in `presigned` mode while provisioning the gateway.

```powershell
Set-Location apps/server/asset_gateway
pnpm test
pnpm run check
pnpm dlx wrangler@latest deploy --dry-run
pnpm run deploy
```

The initial deployment has no shared secret and therefore returns `503` before
touching R2. Install the secret interactively:

```powershell
pnpm dlx wrangler@latest secret put ASSET_WORKER_HMAC_SECRET
```

Paste the password-manager value when prompted. Cloudflare documents that
`wrangler secret put` creates and immediately deploys a new Worker version:
[Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

For a later zero-downtime rotation:

1. Copy the current active value into the Worker secret
   `ASSET_WORKER_HMAC_PREVIOUS_SECRET`.
2. Generate a new independent value and replace the Worker
   `ASSET_WORKER_HMAC_SECRET` with it.
3. After that Worker deployment succeeds, replace the Render
   `ASSET_WORKER_HMAC_SECRET` with the same new value and deploy the API.
4. Exercise both a newly issued capability and one issued before the API
   change. The Worker accepts either signature during this overlap.
5. Wait one hour, which is the maximum capability lifetime accepted by the
   gateway, then run:

   ```powershell
   pnpm dlx wrangler@latest secret delete ASSET_WORKER_HMAC_PREVIOUS_SECRET
   ```

6. Verify new upload and download capabilities again. Never remove or replace
   the active Worker value before the previous value is installed.

Verify the name, R2 binding, Durable Object namespace/migration, custom domain,
and secret name in Workers & Pages. Then verify fail-closed behavior:

```powershell
curl.exe -i https://assets.example.com/v1/assets/not-authorized
```

The response should be `403`. A missing secret should produce `503`. It must
never expose an object or redirect to a public bucket.

For a Worker Route placed in front of another origin, explicitly select **fail
closed** so exhaustion returns an error instead of bypassing the Worker. A
Worker Custom Domain is preferable here because the Worker itself is the
origin. Workers Free currently stops at 100,000 requests/day:
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## 11. Configure the Free-plan WAF guard

In Cloudflare Dashboard > Security > Security rules > Rate limiting rules,
create the single Free-plan rule for the asset path:

```text
Path starts with /v1/assets/
Counting characteristic: IP
Period: 10 seconds
Action: Block
Mitigation timeout: 10 seconds
```

Start with a threshold comfortably above a normal multi-map burst, for example
100 requests per 10 seconds per IP, then validate with players behind the same
home/office NAT. The WAF rule protects Worker availability; the Durable Object
protects accepted R2 operations. Neither replaces authenticated API issuance
limits.

## 12. Configure Cloudflare billing visibility

In Manage Account > Billing > Billable Usage:

1. Confirm R2 and Workers usage is visible.
2. Create the smallest practical dollar budget alert, such as an `R2 spend
   warning`.
3. Add at least two operator email recipients.
4. Review usage daily during rollout.

Budget alerts notify; they do not stop usage or billing:
[Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/).

Record the account billing-cycle start day for incident comparison with the
Worker's conservative rolling 30-day application window.

## 13. Configure Render and deploy the application

First push the exact reviewed Git commits. The repository `render.yaml` uses
the repository root, manual deployment, one Free preview instance, and
`/health/ready`.

Create or sync a Render Blueprint from `render.yaml`. For an existing service,
remember that Render ignores new `sync: false` values during Blueprint updates;
add them manually in the service Environment page:
[Render Blueprint variables](https://render.com/docs/blueprint-spec).

Set these required values:

| Variable | Production value |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Neon pooled restricted runtime URL |
| `DATABASE_MIGRATION_URL` | Neon direct owner/migration URL |
| `SECRET_KEY` | independent generated secret |
| `SESSION_SECRET` | independent generated secret |
| `METRICS_TOKEN` | independent generated secret |
| `BASE_URL` | `https://table.example.com` |
| `CORS_ORIGINS` | `https://table.example.com` |
| `R2_ENABLED` | `true` |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY` | restricted R2 access key ID |
| `R2_SECRET_KEY` | restricted R2 secret access key |
| `R2_BUCKET_NAME` | `ttrpg-assets-production` |
| `ASSET_LINK_MODE` | initially `presigned` |
| `ASSET_WORKER_BASE_URL` | `https://assets.example.com` |
| `ASSET_WORKER_HMAC_SECRET` | exact Worker shared secret |

Leave `R2_PUBLIC_URL` empty. Set `R2_ENDPOINT` manually only for a
jurisdiction-specific endpoint. Retain the checked-in `ASSET_*` limits unless a
reviewed lower value is chosen.

Optional feature variables are:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google OAuth;
- `RESEND_API_KEY` and a verified `EMAIL_FROM` for email;
- `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` for telemetry;
- `COMPENDIUM_DIR` only for a separately licensed, packaged replacement.

Attach and verify `table.example.com` as the Render custom domain. Update
`BASE_URL`, `CORS_ORIGINS`, R2 CORS, and Worker `ALLOWED_ORIGINS` together if
the application origin changes.

Trigger a manual deploy of the recorded commit. Render runs migrations under a
PostgreSQL advisory lock before starting Uvicorn. Watch for the migration
completion event and do not accept a deploy with a readiness `503`.

Verify:

```powershell
Invoke-RestMethod https://table.example.com/health/live
Invoke-RestMethod https://table.example.com/health/ready
```

Both must succeed. Render uses the ready endpoint for traffic cutover:
[Render health checks](https://render.com/docs/health-checks/).

## 14. Presigned-mode smoke test

Before attempting Worker mode:

1. Register/login and create a session.
2. Join from a second account.
3. Upload a small PNG map.
4. Confirm it appears for authorized session members only.
5. Change maps and reload the browser.
6. Confirm the texture hash verification succeeds.
7. Delete the asset and confirm it disappears from the session.
8. Run `python scripts/r2_storage_admin.py smoke` with the restricted runtime
   R2 credential.
9. Run the dry-run orphan audit and record its bounded counts.
10. Confirm secrets, object keys, and signed URLs are absent from normal logs.

Then redeploy the same commit, allow the Free preview and Neon compute to sleep,
and repeat login, WebSocket reconnect, and asset read checks.

## 15. Worker-mode staging cutover

Perform this section only after every gate in section 2 is closed.

1. Use a staging API, staging Neon branch, staging Worker, and separate staging
   R2 bucket.
2. Configure the staging API with `ASSET_LINK_MODE=worker`.
3. Upload a valid image and confirm:
   - the returned URL uses the Worker origin;
   - exactly one PUT succeeds;
   - replay of that same PUT returns `409` before another R2 write;
   - wrong size/type/hash returns `400`;
   - an expired capability returns `403`;
   - confirmation promotes the object from `pending/` to `assets/`;
   - authorized GET works and an unauthorized request does not;
   - a repeated GET is served from cache in the same Cloudflare location;
   - forced budget exhaustion returns `429` before R2 access.
4. Test a real five-hour session with multiple map changes and browser reloads.
5. Test Worker and Render cold starts, transient R2 failure, failed
   confirmation cleanup, and rollback to presigned mode.
6. Compare Durable Object counters with Cloudflare R2 analytics after metrics
   have settled. Investigate any unexplained difference before production.

After staging acceptance, change the `ASSET_LINK_MODE` value in `render.yaml`
to `worker` in a reviewed commit, sync the Blueprint, deploy, and repeat the
smoke suite. A dashboard-only override is acceptable for a short staging test,
but a later Blueprint sync will restore the checked-in value.

## 16. Rollback

If Worker mode causes errors:

1. Set Render `ASSET_LINK_MODE=presigned`.
2. Save and deploy the existing build.
3. Confirm direct R2 CORS and a fresh upload/download.
4. Leave the Worker deployed but stop issuing new capabilities.
5. Preserve its Durable Object state and logs for diagnosis.

Outstanding Worker capabilities expire within 15 minutes. Do not delete the
Worker, Durable Object namespace, R2 bucket, or Neon branch during incident
response.

Database rollback and code rollback are separate decisions. Prefer a forward
fix once newer database writes exist.

## 17. Ongoing operations

Daily during initial rollout:

- inspect Cloudflare R2 storage, Class A, Class B, Worker request, and Durable
  Object usage;
- inspect Render readiness, error rate, WebSocket reconnects, and asset
  confirmation/deletion failures;
- investigate unexpected `403`, `409`, `429`, `503`, or Worker `1027` results.

Weekly:

```powershell
python scripts/r2_storage_admin.py audit
```

Review missing/orphan counts before any deletion. Run deletion only after an
operator reviews the age gate and backup/recovery implications.

For every release, record:

- Git commit and Alembic revision;
- Worker version and Wrangler version;
- R2 bucket and Worker hostname;
- configuration changes without secret values;
- automated test results;
- live smoke, cold-start, cache, replay, quota, and rollback evidence;
- known gaps and the operator accepting them.

## 18. Definition of production-complete Worker mode

Worker mode is production-complete only when all of the following are true:

- section 2 gates are implemented and tested;
- a real staging browser-to-Worker-to-R2-to-Render round trip passes;
- R2 byte and operation accounting stays below the configured bounds through
  failure, expiry, restart, and billing-cycle rollover;
- Worker tests run in CI;
- WAF, fail-closed behavior, alerts, logs, and secret rotation are verified;
- presigned rollback is tested against production-equivalent CORS;
- backup/restore and orphan reconciliation evidence is recorded;
- a production-shaped multi-map session passes without exhausting browser,
  Worker, Render, Neon, or R2 limits.

Passing unit tests and `wrangler deploy --dry-run` proves that the code and
bindings package correctly. It does not prove this definition by itself.
