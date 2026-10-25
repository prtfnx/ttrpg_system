# Observability and logging

Status: usable. Structured logs, request correlation, protected Prometheus
metrics, audit retention, and optional OTLP traces are implemented. External
dashboards and alert delivery remain operator work.

Last source audit: 2026-10-21

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

## Action latency

Join browser and server records by message/correlation identity. The server
propagates each batch member's context into handlers and blocking workers.
Timings contain counts and durations, without SQL text, parameters or command
payloads. Operation identities belong in logs, not metric labels.

| Event | Meaning |
| --- | --- |
| `websocket.command.completed` | Dispatch duration plus `lock_wait_ms`, `worker_wait_ms`, `worker_ms`, `sql_count`, `sql_ms`, `commit_count` and `commit_ms`. Sprite write/replay transactions measure successful commit completion separately; `commit_ms` is null when no instrumented commit completed. INFO at 250 ms, DEBUG otherwise. SQL timings come from the instrumented SQLAlchemy engine. |
| `websocket.command.lock_wait` | Session mutation ownership took at least 250 ms. |
| `websocket.inbox.dispatched` | Admission wait was at least 250 ms or adjacent sprite frames merged. Includes `inbox_wait_ms`, `merged_frames`, `member_count`, `queued_frames` and `queued_bytes`. |
| `websocket.inbox.overflow` | The durable inbound limit was exceeded or dispatch failed; the socket closes for recovery. |
| `websocket.delivery.delayed` | A send took at least 250 ms or an item waited at least 500 ms. Sampled at most once per second per socket to bound recovery log volume. Includes `send_ms` and `queue_ms`. |
| `websocket.delivery.failed` | Includes queue/byte counts and `reason`: `queue_overflow`, `snapshot_queue_overflow`, `snapshot_budget_exceeded`, `send_timeout` or `send_failed`. Send exceptions include `error_type` and elapsed timings. |

Browser development logs emit `Command outcome received` with `queue_ms`,
`acknowledgement_ms`, `pending_count`, message ID and type. Queue time ends at
the first successful local send; acknowledgement time ends at the correlated
outcome. An unknown send time produces null timings. These durations do not
require synchronized browser/server clocks.

Production command timing is opt-in at build time: set
`VITE_COMMAND_TIMING_SAMPLE_RATE` to a finite fraction in `(0, 1]`; it defaults
to zero. The browser sends at most sixteen samples per minute to
`POST /api/telemetry/command-timing`. Intake honors `BROWSER_TELEMETRY_ENABLED`,
validates mutation type and bounded numeric durations, and shares the thirty-
request-per-minute IP telemetry cap. `browser.command.timing` records message
identity/type, queue and acknowledgement durations, and release. It contains no
command payload, table name or user text. Collection failures cannot interrupt
settlement. Join these sampled records to server command logs by message ID.

From `apps/server`, with the project Python environment and a disposable
PostgreSQL target in `TEST_POSTGRESQL_DATABASE_URL` (database name must contain
`test`), run:

```powershell
python -m pytest tests/integration/test_sprite_runs_postgresql.py -q --no-cov
```

The tests create and remove a unique schema using the existing migration/test
fixture. They exercise real transactions with an injected cursor delay; that
delay is a sensitivity check, not measured WAN latency. Without the test URL
they skip. For the local slow-database receipt probe, run:

```powershell
python -m pytest tests/unit/test_sprite_run_latency.py -k slow_database -s --no-cov
```

High SQL time points to database cursor work; high worker wait points to admission
or executor contention. Worker duration also includes Python work and database
connection/commit overhead, so it is not additive with SQL time. Dispatch duration
excludes inbound admission wait and network transit. Slow delivery records
distinguish socket congestion from mutation work. None measures one-way network
latency. Routine table staging and origin correction diagnostics use DEBUG;
an equal dictionary/Position origin no longer produces a false desync warning.

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

`scripts/r2_storage_admin.py` implements storage configuration, a temporary
create/read/delete smoke, and whole-bucket orphan comparison. Default audit
output is counts; verbose output can reveal object keys.

Current limitation: the CLI's `_record_admin_audit` uses an uninstrumented
`SessionLocal`. After a PostgreSQL writer has claimed ownership, its required
audit INSERT is rejected by the database trigger. Some R2 operations happen
before that final audit, so command failure does not prove no object operation
occurred. Stopping the app does not remove the persisted fence.

Do not use this CLI as evidence of a successful audited production operation
until its transaction is integrated with the maintenance writer context and
tested against a claimed PostgreSQL database. Do not bypass this by clearing
the token. See [Writer handover](WRITER_HANDOVER.md).

The smoke requires object delete for cleanup; inventory needs bucket list.
If a run reports `cleanup_required=true`, repair permissions and account for
its temporary `pending/operations/smoke-` objects before another run.

Normal application asset removal uses the instrumented runtime engine and
durable deletion outbox. Its audit actions include `asset.unlink`,
`asset.deletion.queued`, `asset.deletion.retry`, `asset.deletion.completed`, and
`asset.deletion.failed`. Monitor failed outbox rows separately from this CLI
limitation.

## Remaining operator work

- configure an external Prometheus scraper and dashboards;
- configure alert delivery for readiness, error rate, database failures,
  pending uploads, retrying or failed upload cleanup, and failed operational
  jobs;
- configure an OTLP backend if distributed traces are required;
- rehearse incident response without placing provider secrets in tickets or
  copied logs.

## Writer and persistence signals

Successful PostgreSQL startup emits `application.writer.claimed` with a
generation. Ownership loss emits `application.writer.superseded`. The old
process rejects admission with HTTP 503/Retry-After and closes WebSockets with
1012; `/health/live` remains available. `/health/ready` is unavailable on a
superseded process. The readiness preflight checks configured R2 values, not
network access or object permissions.

Failed canvas saves remain dirty and retry with backoff. A normal shutdown
that still has unsaved sessions logs an unconfirmed-persistence failure;
superseded cache retirement is a different condition. Do not claim recovery of
unacknowledged memory-only edits after process loss. See
[Persistence and application ownership](../explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md).

## Multi-client latency validation

From `apps/server`, run:

```powershell
python -m pytest tests/integration/test_multiclient_sync.py -q -s --no-cov
```

The default cases launch a real local Uvicorn process against a disposable,
migrated SQLite database. Two authenticated editors and a spectator use separate
WebSocket connections. The cases check concurrent edits, ordered receipts,
observer convergence, reconnect snapshots, conflicting actors, permissions,
actor-scoped undo, predecessor fences and retry after a committed but unread
receipt. Database reads verify durable state independently of client events.

`tests/integration/latency_proxy.py` relays ordered messages with fifty
milliseconds of injected delay in each direction. Each direction has a bounded
queue and timestamps arrival before delivery, so queued messages share the
propagation delay rather than paying one extra delay per message. The pipeline
probe reports eight dependent edits sent before receipts and compares them with
eight sequential edits, checking the same final state and individual undo steps.
Timing output is diagnostic; correctness checks do not depend on wall-clock
performance thresholds on a loaded test machine. Browser window, rebase and
rejection regressions live in `CanvasPipeline.test.ts`.

Setting `TEST_POSTGRESQL_DATABASE_URL` adds the same live cases against a unique
schema in that test database; its name must contain `test`. The fixture removes
only its own schema and explicitly configures the child server database URL.
Without that URL the PostgreSQL cases skip. A local delay relay and SQLite do
not establish production PostgreSQL, Internet jitter or deployment latency.
