# State ownership

Audience: contributors deciding where new state or behavior belongs.

Status: usable.

Last source audit: 2026-08-17

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

Each live session has one fair mutation lock in `ServerProtocol`. Table,
sprite, wall, paint, measurement, session-setting, character, combat,
encounter, chat-write, player-status, moderation, and asset-write handlers use
that lock. Accepted mutations for one session therefore run in arrival-waiter
order. Reads of shared session state use the same boundary, while transport
ping, ephemeral previews, independent durable-store reads, and different
sessions can proceed concurrently. Final disconnect waits for earlier
mutations before persisting and cleaning the session service.

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

`WebClientProtocol` owns exactly one reconnect timer. Manual disconnect
cancels that timer and disables automatic reconnect. Retryable transport
failures use capped exponential backoff with full jitter; policy, protocol,
unsupported-data, invalid-payload, oversized-message, and banned-user closes
are terminal. A successful connection resets the retry budget.

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

Rust does not own browser transport. `WebClientProtocol` receives and sends
network messages; runtime methods pass normalized data and compute requests
across the WASM boundary.

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
