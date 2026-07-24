# Security

Audience: operators and contributors changing auth, roles, session access, or
public routes.

Status: current. This page documents current controls and the remaining
single-instance limitations visible in the codebase.

Last source audit: 2026-07-23

## Main security boundaries

The app currently relies on:

- JWT auth tokens issued by `apps/server/routers/users.py`;
- an HTTP-only `token` cookie for browser sessions;
- Starlette session middleware for OAuth state;
- server-side session roles from `utils/roles.py`;
- per-route and per-protocol permission checks;
- in-memory rate limiters for login, registration, password reset, and demo
  access;
- audit rows for selected admin and account events.
- trusted-origin and Fetch Metadata enforcement for unsafe browser writes;
- response security headers, including CSP, clickjacking, MIME-sniffing,
  referrer, browser-feature, opener-isolation, and production HSTS controls.

Do not treat hidden UI controls as authorization. Server routes and WebSocket
handlers must enforce the rule.

## Secrets

Production must set:

- `SECRET_KEY` for JWT signing;
- `SESSION_SECRET` for Starlette session cookies;
- `DATABASE_URL` for runtime PostgreSQL access;
- `DATABASE_MIGRATION_URL` for schema-owner access during migration;
- OAuth, email, and R2 secrets only when those integrations are enabled.

`Settings` refuses production startup unless both application secrets are
strong, CORS is explicit, the metrics token is strong when metrics are
enabled, and both configured database URLs use PostgreSQL. `render.yaml`
generates the application secrets and metrics token.

Keep `.env` files and database files out of commits.

Use separate Neon roles before public use:

- `DATABASE_MIGRATION_URL`: direct owner connection for Alembic;
- `DATABASE_URL`: restricted runtime role with only required schema usage,
  table DML, and sequence privileges.

Do not grant migration DDL or schema ownership to the runtime role.

## Cookies and tokens

Login sets a `token` cookie with:

- `httponly=True`;
- `samesite="lax"`;
- `secure=True` only when `ENVIRONMENT=production`;
- max age based on `ACCESS_TOKEN_EXPIRE_MINUTES`, currently 360 minutes.

JWT payloads include:

- `sub`: username;
- `sv`: user session version;
- `exp`: expiration time.

Password reset, password change, and account delete increment
`session_version`, invalidating older tokens.

## Passwords and account recovery

Passwords are hashed with bcrypt.

Current password requirements:

- 8 to 128 characters;
- at least one uppercase letter;
- at least one lowercase letter;
- at least one digit.

Password reset tokens are generated with `secrets.token_urlsafe(32)`, stored as
SHA-256 hashes, expire after 15 minutes, and are single-use. Forgot-password
responses are intentionally the same whether or not the email exists.

## OAuth

Google OAuth is enabled only when both `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are present.

OAuth callback URL is:

```text
{BASE_URL}/auth/callback
```

The OAuth router uses Authlib and an in-memory cache for state/nonce data. That
cache is single-process; use a shared store before running multiple workers.

## Roles and permissions

Current session roles:

- `owner`;
- `co_dm`;
- `trusted_player`;
- `player`;
- `spectator`.

`owner` and `co_dm` are DM roles. `trusted_player` is elevated but not DM.
`spectator` cannot interact.

Role helpers in `utils/roles.py` define:

- visible layers;
- permission labels;
- sprite limits;
- who can assign roles.

Many WebSocket protocol handlers check `is_dm`, `can_interact`, visible layers,
or ownership before mutating state. Keep new server-side behavior aligned with
these helpers.

## Rate limiting

Current in-memory limits:

- login: 10 attempts per 5 minutes per IP;
- registration: 5 attempts per 10 minutes per IP;
- password reset: 3 attempts per 5 minutes per IP;
- demo access: 3 demos per IP per hour.

The limiter reads `X-Forwarded-For` and `X-Real-IP` before falling back to the
request client host. Because it is in memory, limits reset when the process
restarts and are not shared across workers.

## Input and audit helpers

`utils/security.py` validates session codes, invite-code format, and some user
input patterns.

`utils/audit.py` records selected invitation, admin, password, email, and
account events. Audit formatting redacts fields named password, token, or
secret.

Audit coverage is not complete for every sensitive operation. When adding new
admin behavior, add an audit row deliberately.

## Browser-write and response protection

Unsafe cookie-authenticated browser requests must originate from a configured
same-site origin. Cross-site Fetch Metadata is rejected, untrusted
`Origin`/`Referer` is rejected, and a cookie-authenticated write without either
header is rejected. Non-browser clients that do not present the browser cookie
remain subject to their route authentication contract.

The global response policy emits CSP, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and
`Cross-Origin-Opener-Policy`; production also emits HSTS. The present CSP
allows existing inline script and style blocks. Removing those allowances
requires migrating server templates to nonces or external assets.

## Known gaps to preserve honestly

- `CORS_ORIGINS` defaults to `*` for development; production validation rejects
  it and Render requires an explicit dashboard value.
- OAuth state cache is in-memory and single-process.
- Rate limiting is in-memory and single-process.
- The CSP still permits existing inline script and style blocks.

Do not document these as solved until code changes make them true.

## Verification

Useful focused tests:

```powershell
cd apps/server
python -m pytest tests\unit\test_security.py tests\unit\test_roles.py tests\unit\test_password_validation.py tests\unit\test_audit.py
```

For auth route changes, also run:

```powershell
python -m pytest tests\unit\test_auth.py tests\integration\test_auth_routes.py tests\integration\test_user_routes.py
```

## Change checklist

- Server enforces authorization, not only the UI.
- New secrets are documented and not committed.
- Production cookie behavior is checked with `ENVIRONMENT=production`.
- Admin or account-sensitive behavior has audit coverage.
- Rate limits are considered for public unauthenticated routes.
- Tests cover denied paths, not only success.
