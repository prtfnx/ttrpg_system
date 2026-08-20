# Environment variables

Audience: contributors and operators configuring the FastAPI server.

Status: usable.

Last source audit: 2026-08-19

Server settings are defined in `apps/server/config.py`; ignored `.env` files
are loaded by Pydantic settings.

## Database

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./ttrpg.db` | Runtime application connection. PostgreSQL is mandatory when `ENVIRONMENT=production`; provider URLs are normalized to Psycopg 3. |
| `DATABASE_MIGRATION_URL` | unset | Optional schema-owner connection used by Alembic/startup migrations. Falls back to `DATABASE_URL`; production accepts PostgreSQL only. |
| `DB_POOL_SIZE` | `5` | Persistent PostgreSQL pool connections. |
| `DB_MAX_OVERFLOW` | `5` | Temporary connections above the pool size. |
| `DB_POOL_TIMEOUT_SECONDS` | `10` | Bounded pool checkout wait. |
| `DB_CONNECT_TIMEOUT_SECONDS` | `10` | Bounded PostgreSQL connect wait. |
| `BLOCKING_WORKER_CONCURRENCY` | `16` | Maximum synchronous database/storage/compute calls admitted to the asyncio worker executor per process; valid range 1-128. |
| `TEST_POSTGRESQL_DATABASE_URL` | unset | Empty/disposable PostgreSQL target for integration tests; never point it at a durable application database. |

SQLite is a development/unit-test convenience only. Hosted state must use
PostgreSQL and Alembic.

## Core and security

| Variable | Default | Notes |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `production` enables fail-closed security and PostgreSQL validation. |
| `PORT` | `8000` in the startup wrapper | Render supplies this. |
| `BASE_URL` | `http://localhost:8000` | Public URL used for callbacks and links. |
| `CORS_ORIGINS` | `*` | Must list explicit origins in production. |
| `SECRET_KEY` | development placeholder | Must be a strong non-default production secret. |
| `SESSION_SECRET` | development placeholder | Must be at least 32 characters in production. |
| `METRICS_TOKEN` | empty | Required when production metrics are enabled. |
| `WS_SEND_TIMEOUT_SECONDS` | `5.0` | Per-message protocol send deadline. Valid range is 0.1-60 seconds; tune only with production load evidence. |

## Asset resource limits

| Variable | Default | Notes |
| --- | --- | --- |
| `ASSET_MAX_FILE_BYTES` | `52428800` | Maximum declared and verified image size (50 MiB). |
| `ASSET_UPLOADS_PER_MINUTE` | `10` | Shared PostgreSQL-backed per-user upload burst bucket. |
| `ASSET_UPLOADS_PER_HOUR` | `50` | Shared PostgreSQL-backed per-user sustained upload bucket. |
| `ASSET_DOWNLOADS_PER_HOUR` | `2000` | Shared PostgreSQL-backed per-user download URL bucket. |
| `ASSET_DOWNLOAD_URL_TTL_SECONDS` | `300` | Download bearer URL lifetime; valid range 30-3600 seconds. |
| `ASSET_UPLOAD_URL_TTL_SECONDS` | `900` | Upload bearer URL lifetime; valid range 60-3600 seconds. |
| `ASSET_UPLOAD_INTENT_TTL_SECONDS` | `1800` | Durable upload reservation and confirmation lifetime; must be at least the upload URL lifetime and at most 86400 seconds. |
| `ASSET_LINK_MODE` | `presigned` | Browser transfer backend: direct R2 `presigned` URLs or the metered `worker` gateway. |
| `ASSET_WORKER_BASE_URL` | empty | Absolute Worker custom-domain URL; required in `worker` mode and HTTPS-only in production. |
| `ASSET_WORKER_HMAC_SECRET` | empty | Shared capability-signing secret; required in `worker` mode, at least 32 characters, and identical to the Worker secret. Never log it. |
| `ASSET_MAX_PENDING_UPLOADS_PER_USER` | `10` | Durable cap on unconfirmed, unexpired upload intents across sessions. |
| `ASSET_MAX_ASSETS_PER_USER` | `500` | Durable cap on confirmed stored objects attributed to one user. |
| `ASSET_MAX_STORAGE_BYTES_PER_USER` | `1073741824` | Durable confirmed-plus-pending storage quota per user (1 GiB). |
| `ASSET_MAX_TOTAL_STORAGE_BYTES` | `9000000000` | Plan-wide confirmed-plus-pending reservation ceiling (9 decimal GB). |
| `ASSET_MAX_LINKS_PER_SESSION` | `1000` | Hard ceiling for distinct asset links and pending link reservations in one session. |
| `ASSET_MAX_LINKS_PER_ACTOR_PER_SESSION` | `250` | Per-actor share of the session link ceiling. |

Asset throttles, pending/count/byte quotas, the plan-wide byte reservation, and
link quotas remain effective across process restarts and multiple workers.
Limiter-store failure denies asset URL issuance. The global byte ceiling must
cover every application sharing the bucket; it cannot account for unrelated
objects. Presigned URLs remain replayable until expiry. Worker capabilities
add one-use uploads and operation budgets but cannot count trusted backend R2
operations, so provider usage alerts and capacity headroom remain required.

## Compendium

| Variable | Default | Notes |
| --- | --- | --- |
| `COMPENDIUM_DIR` | bundled `core_table/compendiums/bundled_srd51` | Optional absolute directory for a separately licensed complete artifact. It must contain the exact five JSON payloads and a verified `manifest.json`. Restart the server after changing it. |

The bundled SRD 5.1 starter is production-valid and needs no environment
setting. See [Characters and compendiums](../features/CHARACTERS_AND_COMPENDIUMS.md)
before replacing it; a manifest records integrity and attribution but does not
grant distribution rights.

## Database-sensitive Render settings

`render.yaml` keeps both database URLs as `sync: false`; add them in the Render
dashboard. Use the intended Neon branch/database, require SSL, and never log or
commit either value. Prefer a restricted role for `DATABASE_URL` and a direct
owner connection for `DATABASE_MIGRATION_URL`.

R2, email, OAuth, and observability variables remain defined in `config.py` and
`render.yaml`. See [Deployment](../operations/DEPLOYMENT.md) for the required
hosted set.
