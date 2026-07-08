# Glossary

Audience: contributors who need shared names for app concepts.

Status: partial. Terms here are limited to concepts visible in current docs and
source paths.

Last source audit: 2026-07-08

## App and user terms

Virtual tabletop: the multiplayer tabletop app. The server owns shared state,
the browser owns UI, and Rust/WASM owns the canvas engine.

Session: a multiplayer game room handled by the server. WebSocket clients join
a session through `apps/server/api/game_ws.py` and session services under
`apps/server/service/`.

DM: the dungeon master role. DM-only behavior includes many combat overrides,
table environment edits, and some player/session controls.

Player: a user role that can participate in a session with player-scoped
permissions.

Spectator: a limited viewer role where supported by role-filtered state.

## Table and canvas terms

Table: a virtual play surface managed through table protocol handlers and
domain table code.

Active table: the table currently selected for a session. It is persisted by
server/database code and reflected in browser state.

Canvas: the browser play surface rendered through `WasmRuntime` and the Rust
`RenderEngine`.

Layer: a table/canvas grouping used for drawing or organizing objects. Layer
state is shared through app state and session protocol behavior.

Sprite: a rendered table object handled by sprite protocol code and canvas
runtime sync.

Token: a sprite used as a game actor or character representation.

Entity: a gameplay object or actor concept used across table, character, and
combat features.

Wall: a table obstacle handled by wall protocol code and Rust/canvas rendering.

Door: a wall-like table object with toggle behavior.

Fog: hidden or revealed table visibility state.

Lighting: visibility and illumination behavior handled across React feature
code, server state, and Rust lighting modules.

Measurement: distance and area tooling in the browser UI and canvas layer.

Paint stroke: freehand or drawing data synchronized through paint protocol
handlers and persisted in the database.

## Combat terms

Encounter: a combat or encounter workflow tracked by server combat/encounter
services and browser combat UI.

Combatant: an actor inside combat. Combatants are derived server-side from
tokens, linked characters, compendium/NPC data, and allowed DM overrides.

Combat command: the canonical combat mutation message. The browser sends
`combat_command`; the server validates and applies it through
`CombatCommandService`.

Command batch: one `combat_command` envelope containing one or more commands.
Batches are all-or-nothing.

Sequence id: the idempotency value on a combat command envelope. Repeated
accepted commands for the same requester return the stored result instead of
applying twice.

Action result: the accepted server response for a combat command. It contains
role-filtered combat state.

Action rejected: the rejected server response for a combat command. It includes
the failure reason and, for batches, the failed command index.

Cover zone: a table environment shape that affects combat cover decisions.

Terrain: table environment data that can affect movement or combat validation.

Planned turn: browser-side combat intent queued before commit. It is workflow
state, not accepted combat state.

## Architecture terms

Server authority: the rule that multiplayer state, persistence, roles, and
accepted combat mutations are decided by `apps/server`.

React app state: browser UI and workflow state, mostly in React state, feature
stores, and `apps/web-ui/src/store.ts`.

WebClientProtocol: the browser WebSocket adapter under
`apps/web-ui/src/lib/websocket/`.

ServerProtocol: the server protocol handler registered under
`apps/server/service/protocol/`.

Protocol message: a JSON message crossing the WebSocket boundary.

WasmRuntime: the TypeScript owner of generated Rust/WASM bindings and Rust
object lifecycle.

WasmRuntimePort: the app-facing interface React and services use instead of
importing generated WASM files directly.

RenderEngine: the Rust/WASM canvas engine created through the runtime.

Generated bindings: wasm-bindgen files under `apps/web-ui/src/lib/wasm/`.
Feature code should not import them directly.

Core table: the reusable Python domain package in `packages/core-table`.

Compendium: packaged game data loaders and related behavior under
`packages/core-table/core_table/compendiums/` and server/UI compendium areas.

Asset: uploaded or managed media/data used by the tabletop. Server asset and
storage behavior lives under protocol, service, router, and storage modules.
