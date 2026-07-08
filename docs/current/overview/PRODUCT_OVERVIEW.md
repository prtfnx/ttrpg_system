# Product overview

Audience: contributors who need to understand what the app is before changing
features.

Status: partial. This page describes the visible product shape from current
server, React, and protocol code.

Last source audit: 2026-07-08

## What it is

The app is a multiplayer virtual tabletop.

The server handles accounts, sessions, persistence, permissions, and accepted
game mutations. The React client handles the live table UI. The Rust/WASM
engine handles the browser canvas.

Main source owners:

- `apps/server`: FastAPI app, auth, sessions, HTTP routes, WebSockets,
  persistence, and combat authority.
- `apps/web-ui`: React client, feature panels, WebSocket client, app state,
  and WASM runtime boundary.
- `packages/core-table`: reusable tabletop rules and domain models.
- `packages/rust-core`: canvas engine, rendering, geometry, lighting, fog,
  paint, planning, and WASM exports.

## How a user enters the app

1. The server renders auth and dashboard pages from `apps/server/templates/`.
2. Users register or log in through routes in `apps/server/routers/users.py`.
3. A user creates or joins a game session through
   `apps/server/routers/game.py`.
4. `/game/session/{session_code}` renders `game_client.html`.
5. The template injects session, user, and role data into
   `window.__INITIAL_DATA__`.
6. React bootstraps from `apps/web-ui/src/App.tsx`, connects WebSocket protocol
   state, creates `WasmRuntime`, and mounts `GameClient`.

## Roles

Current session roles are defined in
`apps/web-ui/src/features/session/types/roles.ts`:

- `owner`: displayed as DM and treated as a DM role.
- `co_dm`: second DM role.
- `trusted_player`: elevated non-DM role.
- `player`: normal interactive role.
- `spectator`: limited viewing role.

The right panel uses role gates to show or hide tabs. For example, table
management, players, lighting, fog, backgrounds, map, and performance panels
are DM-only in current React code.

## Main play surface

`GameClient` in `apps/web-ui/src/features/canvas/components/GameClient.tsx`
combines:

- `GameCanvas` for the rendered table;
- `ToolsPanel` for table tools;
- `RightPanel` for feature tabs;
- `SessionManagementPanel`;
- `ChatOverlay`;
- `CombatDock`;
- `TokenConfigModal`;
- WebSocket protocol state from `useAuthenticatedWebSocket`;
- WASM runtime access from `useWasmRuntime`.

## Main feature areas

The current React app has feature folders for:

- actions;
- assets and backgrounds;
- auth;
- canvas, entities, fog, lighting, measurement, painting, and table tools;
- character management;
- chat;
- combat;
- compendium data;
- customization;
- game/session flow;
- network/player management.

See [Feature map](../explanation/FEATURE_MAP.md) for source and test pointers.

## Current architecture rule of thumb

- Server accepts multiplayer state.
- React helps the user plan and interact.
- Rust/WASM renders and previews canvas-heavy work.
- `core-table` holds reusable domain logic.

For combat, this rule is stricter: React may plan a turn and Rust/WASM may draw
previews, but the server accepts combat mutations through `combat_command` and
`CombatCommandService`.
