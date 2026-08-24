# Observability and logging

Status: usable. Structured logs, request correlation, protected Prometheus
metrics, audit retention, and optional OTLP traces are implemented. External
dashboards and alert delivery remain operator work.

Last source audit: 2026-08-17

## Logging

`apps/server/utils/logger.py` configures one stdout handler. Production defaults
to JSON; local development can use text. Log values are bounded and redact
credential-like keys, bearer tokens, JWTs, and signed query parameters.
Both formats emit UTC timestamps. Each text formatter uses a typed UTC
converter instead of replacing `logging.Formatter` state globally.

Live account or membership revocation emits
`websocket.access.revoked` with the authenticated user ID and bounded
connection count. Notice, protocol-cleanup, and close failures have separate
bounded event names. These events do not include JWTs, cookies, or session
codes.

Every HTTP request receives an `X-Request-ID`. A valid inbound request ID is
preserved; otherwise the server creates one. Request and trace context flows
into logs and selected `audit_logs` rows.

Startup and migration events contain bounded event names and Alembic revision
identifiers. They must never contain either database URL, a Neon hostname/role,
R2 credentials, presigned URLs, or object keys.

## Health

- `GET /health/live` is a constant-time process liveness check.
- `GET /health/ready` verifies the runtime database connection, required
  tables, Alembic head, packaged static UI, R2 configuration, and the verified
  compendium artifact.

Readiness failures return bounded codes such as:

- `database_unavailable`;
- `required_schema_missing`;
- `schema_revision_mismatch`;
- `static_ui_missing`;
- `asset_storage_not_configured`;
- `compendium_manifest_required`.

Readiness verifies R2 configuration, not network permission. Use the R2 smoke
and audit commands for object-level and list-level checks.

## Metrics and tracing

`GET /metrics` exposes Prometheus data only when metrics are enabled and the
request carries the configured bearer token. Metrics use bounded labels for:

- HTTP and WebSocket outcomes and durations;
- database operations, transactions, and pool state;
- auth, rate limits, email, assets, and background jobs;
- durable pending-upload count and oldest age, plus bounded queued,
  processing, retry, and failed upload-cleanup counts;
- browser error reports.

Asset rate metrics use bounded `asset_upload_shared` and
`asset_download_shared` limiter labels. Alert on denied spikes and on the
`asset.rate_limit.unavailable` event: the asset flow deliberately fails closed
when PostgreSQL cannot make a shared decision. Also alert before Cloudflare R2
storage or Class A/B operations reach the account's included monthly usage;
application metrics do not observe replay of an issued presigned URL.

`OTEL_EXPORTER_OTLP_ENDPOINT` enables sampled FastAPI and SQLAlchemy traces.
When it is empty, no exporter is configured. Keep exporter headers in Render
secrets.

## Database operations

On startup, expect:

1. `database.migration.started`;
2. migration lock/upgrade activity;
3. `database.migration.completed` with the bounded head revision;
4. normal server startup.

If startup stops before Uvicorn, check migration-role connectivity and schema
state. If readiness later returns `database_unavailable`, check the runtime
role and Neon availability. `pool_pre_ping` replaces a stale idle connection,
but cannot replay an interrupted transaction.

## R2 operations

Run from the repository root:

```powershell
python scripts/r2_storage_admin.py smoke
python scripts/r2_storage_admin.py audit
```

The smoke command creates, reads, and deletes one temporary object. The audit
compares database keys with the entire dedicated bucket and reports counts by
default. Both commands record a bounded privileged audit event.

An R2 token needs object delete for smoke cleanup and bucket list for the
inventory audit. Stop after `cleanup_required=true`; fix permissions and remove
objects under `pending/operations/smoke-` before trying again.

Normal asset removal emits distinct audit actions for `asset.unlink`,
`asset.deletion.queued`, `asset.deletion.retry`,
`asset.deletion.completed`, and terminal `asset.deletion.failed`. The bounded
background worker records `asset_deletion` job duration/outcome metrics and
`asset.deletion.cleanup.*` logs. Alert on failed job executions and durable
`failed` outbox rows; object keys stay out of these events.

## Remaining operator work

- configure an external Prometheus scraper and dashboards;
- configure alert delivery for readiness, error rate, database failures,
  pending uploads, retrying or failed upload cleanup, and failed operational
  jobs;
- configure an OTLP backend if distributed traces are required;
- rehearse incident response without placing provider secrets in tickets or
  copied logs.
