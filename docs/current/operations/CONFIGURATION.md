# Configuration

Audience: contributors and operators changing runtime configuration.

Status: usable.

Last source audit: 2026-07-20

## Source of truth

Server configuration starts in `apps/server/config.py`.

`Settings` reads environment variables and `apps/server/.env` through Pydantic
settings. Some code also reads environment variables directly, mainly:

- `apps/server/main.py`;
- `apps/server/database/database.py`;
- `apps/server/storage/r2_manager.py`;
- `apps/server/routers/auth.py`;
- `apps/server/routers/users.py`.

Use [Environment variables](../reference/ENVIRONMENT_VARIABLES.md) for the full
variable table. This page explains how to apply them safely.

## Local server

For normal local development:

```powershell
.\scripts\dev-server.ps1
```

That starts `uvicorn main:app --reload` from `apps/server`, on port `8000` by
default. In development, `main.py` accepts a missing or short `SESSION_SECRET`
and falls back to a known development secret.

The default database is:

```text
apps/server/ttrpg.db
```

Override it with `DATABASE_URL` only when intentionally testing another
database.

## Production server

In production, set:

- `ENVIRONMENT=production`;
- `SESSION_SECRET`, at least 32 characters;
- `SECRET_KEY`, a real JWT secret;
- `DATABASE_URL`, using the Neon runtime application role;
- `DATABASE_MIGRATION_URL`, using the Neon schema-owner role;
- `BASE_URL`, matching the public app origin when OAuth or email links are
  enabled.

`main.py` refuses to start in production without a strong `SESSION_SECRET`.
It also rejects SQLite database URLs and wildcard CORS in production.

## Auth and email

Password login works without Google OAuth. Google OAuth is enabled only when
both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present.

OAuth callback URL is built from:

```text
{BASE_URL}/auth/callback
```

Email uses Resend. When `RESEND_API_KEY` is empty, the email service logs the
HTML instead of sending real mail. Set `EMAIL_FROM` to the verified sender used
by the Resend account.

## R2 assets

R2 is disabled unless `r2_enabled` is true.

When enabled, the manager requires:

- `r2_access_key`;
- `r2_secret_key`;
- `r2_bucket_name`;
- either `r2_endpoint`, `r2_account_id`, or `R2_ACCOUNT_ID`.

Environment names are case-insensitive through Pydantic settings. The Render
Blueprint uses uppercase `R2_*` names.

Asset upload/download flows return clear errors when R2 is not configured.
Leave R2 disabled unless you are testing cloud asset storage.

The operational R2 token also needs:

- object put, head/get, and delete for asset and smoke flows;
- bucket object listing for the orphan audit.

Use a token scoped to the dedicated application bucket. Missing delete
permission leaves stale objects even when the relational row has been removed.

## Browser configuration

The Vite client can read:

- `VITE_WS_URL`;
- `VITE_WS_HOST`;
- `VITE_WS_PORT`;
- `VITE_API_BASE_URL`.

Those defaults are implemented in
`apps/web-ui/src/shared/config/appConfig.ts`, and examples live in
`apps/web-ui/.env.example`.

Important current behavior:

- the main authenticated game protocol in
  `apps/web-ui/src/lib/websocket/clientProtocol.ts` builds
  `/ws/game/{sessionCode}` from the current browser location;
- compendium calls use the relative `/api/compendium` path;
- at least one character equipment service still has a hard-coded
  `http://localhost:12345/api/compendium` base.

Check the actual call site before assuming `VITE_API_BASE_URL` controls every
request.

## CORS and cookies

`CORS_ORIGINS` is comma-separated and defaults to `*`.

Session cookies are configured in `main.py`:

- `same_site="lax"`;
- `https_only=True` only when `ENVIRONMENT=production`;
- max age: one hour.

When debugging auth in production, check the public scheme, cookie settings,
and `BASE_URL` together.

## Change checklist

- Update `config.py` or the direct environment read intentionally.
- Update [Environment variables](../reference/ENVIRONMENT_VARIABLES.md) when a
  new variable is added.
- Update `render.yaml` only for variables that should be part of the Render
  blueprint.
- Keep secrets out of committed `.env` files.
- Test production-only behavior with `ENVIRONMENT=production` before deploy.
