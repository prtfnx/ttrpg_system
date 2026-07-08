# Add an HTTP route

Audience: contributors adding FastAPI routes, pages, or JSON endpoints.

Status: usable.

Last source audit: 2026-07-08

## Route ownership

HTTP routes live under `apps/server/routers/` and are included explicitly from
`apps/server/main.py`.

Current routers:

- `users`: account pages, login, registration, profile settings, password reset.
- `auth`: Google OAuth entry and callback.
- `game`: game dashboard, session pages, session settings, player admin APIs.
- `compendium`: public `/api/compendium` JSON endpoints.
- `invitations`: `/api/invitations` JSON endpoints.
- `demo`: demo pages.

The WebSocket endpoint is separate, in `apps/server/api/game_ws.py`. Do not add
WebSocket behavior through an HTTP router.

## Steps

1. Pick an existing router when the feature belongs to an existing domain.
2. Create a new router module only when the domain is genuinely new.
3. Use `APIRouter` with a clear prefix when the route is API-shaped.
4. Add route dependencies for database access, current user, and permissions.
5. Include the router from `apps/server/main.py`.
6. Return JSON for API clients and templates or redirects for browser pages.
7. Add an integration test under `apps/server/tests/integration/`.
8. Update current docs if the route becomes part of a contributor workflow.

## Router shape

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.database import get_db

router = APIRouter(prefix="/api/example", tags=["example"])


@router.get("/status")
async def get_example_status(db: Session = Depends(get_db)):
    return {"ok": True}
```

Then include it in `apps/server/main.py`:

```python
from routers import example

app.include_router(example.router)
```

## Authentication and errors

Use the helpers already used by nearby routes. `main.py` has custom handlers for
401 and 403 that return JSON when the request accepts `application/json`, and
redirect browser requests to the auth error page.

For session-owned behavior, check the current user and session membership in
the route or in a helper close to the route. Do not rely on the browser to hide
unauthorized controls.

## Tests

Use the existing integration style:

```powershell
cd apps/server
python -m pytest tests\integration\test_game_routes.py -q
```

For a new router, add a new `test_<domain>_routes.py` file or extend the
nearest existing file. Current route tests use `client`, `auth_client`, and
database fixtures from `apps/server/tests/conftest.py`.

## Checklist

- Router is included from `main.py`.
- Prefix and tag match the owning domain.
- API routes return JSON, not HTML redirects, unless that is intentional.
- Authentication and ownership checks are server-side.
- Integration tests cover success and at least one failure path.
- Docs mention the route only if contributors need to know it exists.
