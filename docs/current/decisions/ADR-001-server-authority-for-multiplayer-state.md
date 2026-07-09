# ADR-001: Server Authority for Multiplayer State

Status: accepted
Date: 2026-07-09

## Context

The app is a multiplayer virtual tabletop. Multiple browsers can join one game
session, change tables, move tokens, manage walls, send chat, and run combat.
Those changes need one accepted result for all clients.

Current source paths already follow that rule:

- `apps/server/api/game_ws.py` accepts game WebSocket connections.
- `apps/server/service/protocol/base.py` registers session message handlers.
- `apps/server/service/protocol/` validates and broadcasts domain messages.
- `apps/server/database/models.py` stores users, sessions, tables, entities,
  chat, assets, and combat snapshots.
- `apps/web-ui/src/lib/websocket/clientProtocol.ts` receives server messages
  and updates browser stores.

## Decision

The server is authoritative for multiplayer state.

Browsers may keep local workflow state and previews, but accepted cross-client
state comes from server routes, protocol handlers, and persistence. The server
owns auth, role checks, session membership, table membership, persisted game
objects, and broadcasts.

## Consequences

- Client UI can optimistically prepare intent, but server responses decide the
  accepted state.
- New multiplayer writes need a server handler, validation, persistence when
  durable, and tests at the server boundary.
- Browser stores mirror accepted state for rendering and interaction. They are
  not the source of truth for shared state.
- Rust/WASM may accelerate rendering and previews, but does not replace server
  authority for session-visible state.

## Links

- [App architecture](../APP_ARCHITECTURE.md)
- [State ownership](../STATE_OWNERSHIP.md)
- [Protocol boundary](../PROTOCOL_BOUNDARY.md)
- [WebSocket messages](../reference/WEBSOCKET_MESSAGES.md)
- [Database schema](../reference/DATABASE_SCHEMA.md)
