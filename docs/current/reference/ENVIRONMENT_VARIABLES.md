# Environment variables

Audience: contributors and operators configuring the FastAPI server.

Status: partial. This page covers environment variables used by current server
code and deployment config.

Last source audit: 2026-07-08

## Source of truth

Server settings live in `apps/server/config.py`.

Direct environment reads also exist in:

- `apps/server/main.py`
- `apps/server/database/database.py`
- `apps/server/routers/auth.py`
- `apps/server/routers/users.py`
- `apps/server/storage/r2_manager.py`
- `render.yaml`

`Settings` reads `.env` through Pydantic settings with `extra="ignore"`.

## Core server variables

| Variable | Default | Used by | Notes |
| --- | --- | --- | --- |
| `ENVIRONMENT` | `development` | `config.py`, `main.py`, routers | `production` enables stricter session-cookie behavior and requires a strong `SESSION_SECRET`. |
| `PORT` | `12345` when running `main.py` directly | `main.py`, `render.yaml` | Render provides this. `scripts/dev-server.ps1` passes `--port` to uvicorn instead. |
| `BASE_URL` | `http://localhost:8000` | auth, email links | Used for OAuth callback and account email links. |
| `CORS_ORIGINS` | `*` | `main.py`, `render.yaml` | Comma-separated list passed to FastAPI CORS middleware. |
| `DATABASE_URL` | local SQLite at `apps/server/ttrpg.db` | `database/database.py`, `render.yaml` | Uses SQLite-specific `check_same_thread=False` only when the URL contains `sqlite`. |

## Auth and session variables

| Variable | Default | Used by | Notes |
| --- | --- | --- | --- |
| `SECRET_KEY` | development placeholder | JWT auth | Must be set to a real secret outside local development. |
| `ALGORITHM` | `HS256` | JWT auth | Used for encode/decode. |
| `SESSION_SECRET` | development placeholder | Starlette session middleware and OAuth state | In production, `main.py` raises if this is missing or shorter than 32 characters. |
| `GOOGLE_CLIENT_ID` | empty | Google OAuth | OAuth is disabled when missing. |
| `GOOGLE_CLIENT_SECRET` | empty | Google OAuth | OAuth is disabled when missing. |

## Email variables

| Variable | Default | Used by | Notes |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | empty | `service/email.py` | If unset, email HTML is logged instead of sent. |
| `EMAIL_FROM` | `noreply@ttrpg-system.com` | `service/email.py` | Sender address for Resend emails. |

Email flows currently include password reset, password changed notification,
email-change verification, and old-email notification.

## R2 asset variables

R2 settings are fields on `Settings` and are used by
`apps/server/storage/r2_manager.py`.

| Setting/env | Default | Notes |
| --- | --- | --- |
| `r2_enabled` | `False` | R2 operations are disabled unless true. |
| `r2_access_key` | empty | Required when R2 is enabled. |
| `r2_secret_key` | empty | Required when R2 is enabled. |
| `r2_bucket_name` | empty | Required when R2 is enabled. |
| `r2_endpoint` | empty | Full endpoint URL. Optional if account id is provided. |
| `R2_ACCOUNT_ID` / `r2_account_id` | empty | Used to build `https://{account_id}.r2.cloudflarestorage.com`. |
| `r2_public_url` | empty | If set, used to build public object URLs. |

The current `Settings` fields use lowercase R2 names. `R2_ACCOUNT_ID` is also
read directly from the environment by `R2AssetManager`.

## Render deployment variables

`render.yaml` currently configures:

- `PYTHON_VERSION=3.11`
- generated `PORT`
- `ENVIRONMENT=production`
- external `DATABASE_URL`
- generated `SECRET_KEY`
- `CORS_ORIGINS=*`

`SESSION_SECRET` is not listed in `render.yaml`, but production startup requires
it. Add it in the deployment environment before running in production.

## Local development notes

For normal local development:

- leave `ENVIRONMENT` unset or set it to `development`;
- use the default SQLite database unless testing another database;
- set `RESEND_API_KEY` only when you want real email delivery;
- leave R2 disabled unless testing asset upload/download through cloud storage.

If `ENVIRONMENT=production`, set a strong `SESSION_SECRET` or the server will
fail during startup.
