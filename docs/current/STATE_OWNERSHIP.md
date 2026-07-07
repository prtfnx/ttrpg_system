# State ownership

The app has several state owners. Keep each kind of state in the place that can
maintain it without reaching across domains.

## Server state

Owned by `apps/server` and the database.

Use server state for:

- Authenticated users and roles.
- Session membership.
- Persistent tables and active table selection.
- Characters, assets, chat history, combat state, and saved table data.
- Cross-client authority and validation.
- Accepted combat commands, combat snapshots, action journal entries, and
  combat `state_version`.

## Python domain state

Owned by `packages/core-table`.

Use the domain package for reusable tabletop rules and data models that the
server can test without FastAPI or browser code.

## Browser protocol state

Owned by `WebClientProtocol` and `ProtocolProvider`.

Use protocol state for:

- WebSocket connection lifecycle.
- Reconnect and heartbeat behavior.
- Message batching.
- Registered message handlers.
- Sending typed protocol commands.

`ProtocolService` exists for code that cannot use React context directly.

## React app state

Owned by React state, feature stores, and `useGameStore`.

Use React component state for local UI interaction. Use feature stores for
feature-specific workflows. Use `useGameStore` for shared gameplay state such
as tables, sprites, walls, layers, grid settings, role, and connection status.

Combat React state is workflow state:

- selected actor and panel state;
- planned action queue before commit;
- pending opportunity-attack confirmation;
- local movement and targeting previews.

It is not authoritative after a command is accepted or rejected. The server
response updates the combat store.

## WASM runtime state

Owned by `WasmRuntime`.

Use runtime state for:

- WASM module readiness.
- Canvas attachment.
- Rust object lifecycle.
- Renderer access.
- Runtime error and version snapshots.

`WasmRuntimeStore` exposes immutable snapshots through `useSyncExternalStore`.

## Rust engine state

Owned by `packages/rust-core`.

Use Rust engine state for:

- Renderer, camera, WebGL resources, textures, layers, and grid.
- Geometry-heavy behavior.
- Lighting, fog, collision, paint, planning, and local actions.
- Engine-only input state.

Rust should report app-level intent through runtime callbacks, not browser
globals.

For combat, Rust planning state is preview state only. It may estimate movement
range, path, LOS, and AoE candidates. It does not decide final legality or
spend resources.

## Rules

- Do not mirror the same source of truth in multiple domains unless there is a
  clear sync owner.
- Server is authoritative for multiplayer state.
- Server is authoritative for combat mutations and persistence.
- React is authoritative for UI workflows.
- `WasmRuntime` is authoritative for Rust object lifetime.
- Rust is authoritative for local engine internals.
- Use explicit methods, callbacks, and protocol messages between domains.
