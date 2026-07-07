# App architecture

The app is a multiplayer virtual tabletop. The server owns authority and
persistence. The browser owns UI and local interaction. Rust/WASM owns the
canvas engine.

## System shape

```text
browser React app
  apps/web-ui
      |
      | HTTP + WebSocket
      v
FastAPI server
  apps/server
      |
      | imports
      v
Python domain package
  packages/core-table

browser React app
  apps/web-ui
      |
      | WasmRuntimePort
      v
Rust/WASM engine
  packages/rust-core
```

## Domains

Server:

- Creates the FastAPI app in `apps/server/main.py`.
- Serves HTTP routes from `apps/server/routers/`.
- Accepts game WebSockets in `apps/server/api/game_ws.py`.
- Tracks session sockets in `ConnectionManager`.
- Uses `GameSessionProtocolService` for per-session protocol state,
  persistence, table management, and asset permissions.
- Owns accepted combat mutations through `CombatCommandService`.

React client:

- Runs from `apps/web-ui`.
- Uses `WebClientProtocol` for browser WebSocket behavior.
- Uses `useGameStore` for broad app state such as tables, sprites, walls,
  layers, grid settings, user role, and connection state.
- Uses `WasmRuntime` for all Rust/WASM access.
- Uses `CombatDock` and `useCombatCommands` for combat workflow and command
  composition.

Python domain package:

- Lives in `packages/core-table`.
- Provides table, protocol, combat, pathfinding, dice, rules, and compendium
  behavior used by the server.

Rust/WASM engine:

- Lives in `packages/rust-core`.
- Handles rendering, input-heavy canvas behavior, geometry, lighting, fog,
  collision, paint, planning, and local action helpers.
- Is consumed by the React app through generated wasm-bindgen files owned by
  `WasmRuntime`.

## Main flows

Join session:

```text
browser -> game WebSocket -> ConnectionManager -> GameSessionProtocolService
```

Send protocol command:

```text
WebClientProtocol -> WebSocket -> GameSessionProtocolService -> ServerProtocol
```

Resolve combat command:

```text
CombatDock -> useCombatCommands -> combat_command -> CombatCommandService
    -> CombatPersistenceService -> CombatStatePresenter -> ACTION_RESULT
```

Receive table update:

```text
server protocol -> WebClientProtocol handler -> useGameStore + WasmRuntime
```

Canvas interaction:

```text
React canvas -> WasmRuntimePort -> Rust RenderEngine -> runtime callback
```

## Ownership rules

- Server code owns auth, persistence, session membership, and cross-client
  authority.
- Server code owns combat rules, resources, action economy, movement
  acceptance, and persisted combat outcomes.
- `core-table` owns reusable tabletop domain behavior.
- React owns UI workflow and browser state.
- `WasmRuntime` owns generated WASM bindings and Rust object lifecycle.
- Rust owns local rendering and geometry-heavy engine behavior.
- Browser globals are not architecture boundaries.

For combat details, read [Battle flow](BATTLE_FLOW.md).

## Change guide

- Change HTTP behavior in `apps/server/routers/`.
- Change WebSocket entry behavior in `apps/server/api/game_ws.py`.
- Change server-side session protocol behavior in `apps/server/service/`.
- Change shared tabletop domain behavior in `packages/core-table/core_table/`.
- Change browser protocol behavior in `apps/web-ui/src/lib/websocket/`.
- Change app state in feature stores or `apps/web-ui/src/store.ts`.
- Change WASM behavior through `packages/rust-core` and
  `apps/web-ui/src/lib/wasm/runtime`.
