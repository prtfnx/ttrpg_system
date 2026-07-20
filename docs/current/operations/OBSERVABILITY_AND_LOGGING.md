# Observability and logging

Status: current but partial. The app has basic logs, a shallow health endpoint,
and selected audit records. It does not yet have metrics, tracing, dashboards,
or alerting.

Last source audit: 2026-07-08

## What exists today

Server logs go to stdout through `apps/server/utils/logger.py`.
`setup_logger()` configures the root Python logger once, clears duplicate
handlers, writes to `sys.stdout`, and uses this format:

```text
timestamp - logger_name - level - message
```

The default level in the helper is `DEBUG`. Many server modules create named
loggers through `setup_logger(__name__)`. When `apps/server/main.py` is run
directly, Uvicorn starts with `log_level="warning"` and `access_log=True`.
Production deployment through Render uses the `render.yaml` start command, so
confirm the actual runtime log level in the hosting service logs.

The browser has `apps/web-ui/src/shared/utils/logger.ts`:

- `debug`, `info`, and `log` only emit in Vite development mode.
- `warn` and `error` always emit.
- `protocolLogger.message()` and `protocolLogger.connection()` only emit in
  development mode.
- `protocolLogger.error()` always emits.

That means production browser protocol traffic is intentionally quiet unless an
error path logs.

## Health check

`GET /health` is defined in `apps/server/main.py` for Render:

```json
{
  "status": "healthy",
  "service": "ttrpg-server",
  "version": "1.0.0"
}
```

This only proves that the FastAPI process can answer the route. It does not
check PostgreSQL access, migration state, R2 credentials, email configuration,
WebSocket readiness, or whether the React static files were copied.

Use it as a process liveness check, not as a full readiness check.

## Audit records

Security and session events can be written to the `audit_logs` table. The model
lives in `apps/server/database/models.py`, and helpers live in
`apps/server/utils/audit.py`.

Current audit coverage includes selected invitation/admin/session/account
events, password and email actions, and several security utilities. It is not a
complete product event stream. Treat audit rows as security history, not as
analytics or performance telemetry.

The audit helper redacts common sensitive keys such as password, token, and
secret when formatting extra event data.

## Asset counters

There are in-memory counters in the asset path:

- `AssetManager.get_stats()` reports confirmed assets, uploaded assets,
  pending uploads, failed uploads, R2 configuration, and active sessions.
- `R2AssetManager.get_stats()` reports upload/download counts, bytes, and
  errors.

These are useful while debugging code, but there is no current HTTP endpoint or
metrics exporter for them. They reset with the Python process.

## How to check problems today

Server startup:

1. Check `/health`.
2. Check server stdout for startup lines from `main.py`.
3. In production, verify `SESSION_SECRET`, database path, CORS origins, and the
   Render start command before assuming an app bug.

HTTP route failure:

1. Check browser network status and response body.
2. Check server stdout for exceptions from the router or service.
3. Reproduce with the smallest request path before checking WebSocket code.

WebSocket or protocol failure:

1. In development, check browser `protocolLogger` output.
2. Check server logs from `api/game_ws.py`, `service/game_session.py`,
   `service/game_session_protocol.py`, and `service/protocol/*`.
3. Confirm the message type is registered on both the browser and server sides.

Asset upload failure:

1. Check browser network errors around presigned URL use.
2. Check server logs from `service/asset_manager.py` and
   `storage/r2_manager.py`.
3. Remember that R2 object data is outside PostgreSQL; the database stores
   metadata and session links, not object bytes.

Database failure:

1. Check `/health/ready` for bounded database and revision codes.
2. Check the startup wrapper's bounded Alembic events.
3. Confirm the intended Neon branch/database in the provider console without
   copying the connection secret into logs or incidents.

## Known gaps

- No structured JSON logging.
- No request ID or correlation ID passed across HTTP, WebSocket, and browser
  logs.
- No metrics endpoint.
- No tracing.
- No alerting rules.
- No dashboard.
- `/health` is liveness-only.
- Asset stats are in memory and not externally exposed.
- Audit logs are useful but not comprehensive telemetry.

## Change checklist

When adding observability:

1. Keep sensitive values out of logs.
2. Prefer structured fields over long formatted strings for new machine-read
   paths.
3. Add a request or correlation ID before adding broad log volume.
4. Add readiness checks separately from the current `/health` liveness route.
5. If exposing metrics, decide whether counters must survive process restart.
6. Add tests for redaction and endpoint behavior, not for incidental wording of
   log messages.
