# Environment variables

Audience: contributors and operators configuring the FastAPI server.

Status: usable.

Last source audit: 2026-07-20

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

## Database-sensitive Render settings

`render.yaml` keeps both database URLs as `sync: false`; add them in the Render
dashboard. Use the intended Neon branch/database, require SSL, and never log or
commit either value. Prefer a restricted role for `DATABASE_URL` and a direct
owner connection for `DATABASE_MIGRATION_URL`.

R2, email, OAuth, and observability variables remain defined in `config.py` and
`render.yaml`. See [Deployment](../operations/DEPLOYMENT.md) for the required
hosted set.
