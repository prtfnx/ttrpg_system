# Environment variables

Audience: contributors and operators configuring the FastAPI server.

Status: usable.

Last source audit: 2026-07-17

Server settings are defined in `apps/server/config.py`; ignored `.env` files
are loaded by Pydantic settings.

## Database

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./ttrpg.db` | PostgreSQL is mandatory when `ENVIRONMENT=production`. Provider `postgresql://` URLs are normalized to Psycopg 3. |
| `DB_POOL_SIZE` | `5` | Persistent PostgreSQL pool connections. |
| `DB_MAX_OVERFLOW` | `5` | Temporary connections above the pool size. |
| `DB_POOL_TIMEOUT_SECONDS` | `10` | Bounded pool checkout wait. |
| `DB_CONNECT_TIMEOUT_SECONDS` | `10` | Bounded PostgreSQL connect wait. |

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

`render.yaml` keeps `DATABASE_URL` as `sync: false`; add it in the Render
dashboard. Use the intended Neon branch/database, require SSL, and never log or
commit the value.

R2, email, OAuth, and observability variables remain defined in `config.py` and
`render.yaml`. See [Deployment](../operations/DEPLOYMENT.md) for the required
hosted set.
