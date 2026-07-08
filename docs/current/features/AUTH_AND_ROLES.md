# Auth and roles

Status: current but uneven. Account authentication works through server routes
and HTTP-only cookies. Session authorization is a separate role system attached
to each game session.

Last source audit: 2026-07-08

## Source owners

- `apps/server/routers/users.py`: username/password login, registration,
  account settings, password reset, email verification, logout, `/users/me`.
- `apps/server/routers/auth.py`: optional Google OAuth login and callback.
- `apps/server/utils/roles.py`: session role names, permissions, visible
  layers, role assignment rules, and sprite limits.
- `apps/server/routers/game.py`: player list, role changes, player removal,
  and role-change WebSocket broadcast.
- `apps/server/routers/invitations.py`: invitation creation and acceptance with
  pre-assigned roles.
- `apps/web-ui/src/features/auth/`: browser auth service and authenticated
  WebSocket hook.
- `apps/web-ui/src/app/providers/AuthProvider.tsx`: React auth context.
- `apps/web-ui/src/features/session/types/roles.ts`: browser session role
  helpers.

## Two different questions

Keep these separate:

1. Account auth: who is logged in?
2. Session role: what can that user do inside this game session?

Account auth uses `users.id`, `users.username`, JWT cookies, and `/users/me`.
Session role uses `game_players.role` for one session. A user can own one
session, be a player in another, and be a spectator in a third.

Do not use account login as proof of permission to mutate a session. Check the
`GamePlayer` row for the target session.

## Login flow

Password login posts to `/users/login`.

The server:

1. Rate-limits by client IP.
2. Authenticates the username and password.
3. Creates a JWT with `sub` and `sv`.
4. Stores the JWT in a `token` cookie.
5. Redirects to the dashboard, a session, or an invitation target.

The cookie is HTTP-only, `sameSite=lax`, and secure only when
`ENVIRONMENT=production`. The token lifetime is currently 360 minutes.

`get_current_user()` reads the cookie first, then an `Authorization: Bearer`
header. It validates the JWT, loads the user by username, and rejects the token
if its `sv` claim no longer matches `users.session_version`.

Password reset, password change, and account deletion bump `session_version` to
invalidate old JWTs. Password change re-issues a token so the current browser
can stay logged in.

## Browser auth

`authService.initialize()` calls `/users/me` with credentials included. Because
the cookie is HTTP-only, the browser stores a sentinel token value
`authenticated-via-cookie` rather than the real JWT.

`AuthProvider` wraps the React app, initializes `authService`, exposes
`useAuth()`, and merges account permissions from `/users/me` with session
permissions stored in the game store.

Current rough edges:

- `authService.validateToken()` tries to call `/users/refresh`, but there is no
  matching server route.
- `UserInfo.role` is typed as `dm | player`, while session roles are
  `owner | co_dm | trusted_player | player | spectator`.
- `/users/me` returns a broad account-level `dm`/`player` view based on owned
  sessions. It is not the same as the current session role.

## Google OAuth

Google OAuth is optional and lives in `apps/server/routers/auth.py`.

When configured, `/auth/google` starts the flow and `/auth/callback` creates or
links a user, then sets the same `token` cookie as password login. OAuth state
and nonce are stored in an in-memory server-side cache, so this flow assumes a
single process unless that cache is replaced.

## Session roles

Current session roles:

- `owner`
- `co_dm`
- `trusted_player`
- `player`
- `spectator`

The server role helper defines permissions, visible layers, and sprite limits.
The browser role helper defines the role type plus `isDM`, `isElevated`,
`canInteract`, and display labels.

Role effects are not only UI decoration. Server handlers check roles before
admin actions, role changes, invitations, player kicks, and several protocol
mutations.

## Role changes

`POST /game/api/sessions/{session_code}/players/{user_id}/role` changes a
session role.

The server:

1. Finds the current user's `GamePlayer` row in that session.
2. Requires `owner` or `co_dm`.
3. Finds the target player.
4. Calls `can_assign_role()`.
5. Writes the new role.
6. Adds an audit log.
7. Broadcasts `PLAYER_ROLE_CHANGED` with the new permissions and visible
   layers.

Current assignment rules:

- No one can change the owner role.
- No one can assign owner.
- Only owner or co-DM can change roles.
- Co-DM cannot assign co-DM.

## Invitations

Invitations carry a pre-assigned role. Owners and co-DMs can create them, but
the server rejects invalid roles, owner invitations, and co-DM inviting another
co-DM.

Accepting an invitation creates a `GamePlayer` row with the invitation role.
Existing players are redirected or rejected instead of being added twice.

## Change checklist

When changing auth or roles:

1. Decide whether the change belongs to account auth or session role authority.
2. Keep permission checks on the server, even if the browser hides controls.
3. Update both Python and TypeScript role definitions if role names change.
4. Update `get_permissions()` and `get_visible_layers()` together.
5. Check invitation creation, invitation acceptance, role change, and player
   kick paths.
6. Check `AuthProvider`, `authService`, and game-store session permissions.
7. Add or update tests in server auth/role tests and web auth/session tests.
