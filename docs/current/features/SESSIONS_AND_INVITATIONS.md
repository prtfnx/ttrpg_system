# Sessions and invitations

Audience: contributors changing session entry, player management, invitations,
or session-level rules.

Status: current but partial.

Last source audit: 2026-07-09

## Source owners

- `apps/server/routers/game.py`: lobby, create/join session, session page,
  settings page, player list, role change, kick, and user-session API.
- `apps/server/routers/invitations.py`: invitation creation, lookup,
  acceptance, listing, and revocation.
- `apps/server/service/protocol/session.py`: WebSocket handlers for game mode,
  session rules, layer settings, and active-table persistence helpers.
- `apps/server/database/models.py`: `GameSession`, `GamePlayer`, and
  `SessionInvitation`.
- `apps/web-ui/src/features/session/`: player list, role controls, invitation
  manager, services, hooks, and role types.
- `apps/web-ui/src/features/canvas/components/GameClient.tsx`: connects the
  authenticated session WebSocket and mounts the session management panel.

## What the feature does

A session is the multiplayer room identified by `game_sessions.session_code`.
The owner creates it through `/game/create`; users join through `/game/join`,
the session page, or an invitation accept flow. Membership and authority live in
`game_players`, not in the account record.

Invitations are REST-managed links. They store an invite code, target session,
pre-assigned role, max-use count, expiration, and active flag. Accepting an
invitation creates a `GamePlayer` row with the invitation role.

## Main workflows

Session entry:

1. The user authenticates through account auth.
2. The browser opens `/game/session/{session_code}`.
3. The server validates membership and renders initial session data.
4. `GameClient` opens the authenticated WebSocket.
5. The protocol `WELCOME` message gives the browser the authoritative session
   role, permissions, visible layers, and user context.

Player management:

- `GET /game/api/sessions/{session_code}/players` returns players with roles
  and permissions.
- `POST /game/api/sessions/{session_code}/players/{user_id}/role` changes a
  role after `can_assign_role()` passes.
- `DELETE /game/api/sessions/{session_code}/players/{user_id}` removes a
  non-owner player.

Invitation management:

- `POST /api/invitations/create` creates an invite for a DM-controlled session.
- `GET /api/invitations/{invite_code}` shows invite details.
- `POST /api/invitations/{invite_code}/accept` accepts an invite for the
  current user.
- `GET /api/invitations/session/{session_code}` lists invites.
- `DELETE /api/invitations/{invitation_id}` deactivates an invite.

## State and authority

The server owns session membership, roles, session rules, game mode, and invite
validity. Browser code can hide controls, but server routes and WebSocket
handlers must reject unauthorized changes.

Session rules and game mode are WebSocket state:

- `session_rules_request`
- `session_rules_update`
- `session_rules_changed`
- `game_mode_change`
- `game_mode_state`

`handle_session_rules_update()` validates with
`core_table.session_rules.SessionRules`, persists JSON to `GameSession`, clears
the per-session rules cache, and broadcasts the new rules. Game mode updates
validate against `core_table.game_mode.GameMode`, persist, and broadcast.

## Persistence

- `GameSession.session_rules_json` stores session rules.
- `GameSession.game_mode` stores the current game mode.
- `GamePlayer.role` stores the user's role in one session.
- `GamePlayer.active_table_id` stores that user's active table.
- `SessionInvitation` stores invite code, role, lifetime, use count, and active
  state.
- Role changes and invitation actions write audit logs.

## Tests to run

- `apps/server/tests/unit/test_session_protocol.py`
- `apps/server/tests/unit/test_session_settings.py`
- `apps/server/tests/unit/test_roles.py`
- `apps/server/tests/unit/test_invitation_flows.py`
- `apps/server/tests/integration/test_invitation_routes.py`
- `apps/web-ui/src/features/session/**/__tests__/`

Run the matching server `pytest` target for route/protocol changes and the
matching Vitest files for browser session UI changes.

## Known edges

- The rendered session page still derives an initial `owner` or `player` role
  before the WebSocket welcome message supplies the authoritative session role.
- Invitation service includes client methods for revoke and refresh paths, but
  the current router exposes delete-based revocation and does not expose a
  refresh route.
