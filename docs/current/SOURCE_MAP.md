# Source map

This map lists the main source areas and their current responsibility.

## Workspace

- `package.json`: pnpm/Turbo workspace commands.
- `pnpm-workspace.yaml`: workspace package list.
- `turbo.json`: task orchestration.
- `build_and_deploy.ps1`: local build/deploy script.

## Server

- `apps/server/main.py`: FastAPI app setup, middleware, static files, and app
  lifecycle.
- `apps/server/api/game_ws.py`: WebSocket entry points.
- `apps/server/routers/`: HTTP route groups.
- `apps/server/service/game_session.py`: WebSocket connection manager.
- `apps/server/service/game_session_protocol.py`: per-session protocol service,
  table manager, client registry, persistence hooks, and asset permissions.
- `apps/server/service/protocol/`: server protocol handlers split by domain.
- `apps/server/service/combat_command_service.py`: canonical combat command
  parser, validator, transaction, rollback, and mutation service.
- `apps/server/service/combat_engine.py`: live in-memory combat orchestration.
- `apps/server/service/combatant_factory.py`: server-side combatant derivation
  from token, character, monster, and safe DM override data.
- `apps/server/service/combat_persistence_service.py`: command journal,
  snapshot persistence, idempotency result lookup, and restore helpers.
- `apps/server/service/combat_state_presenter.py`: role-filtered combat state
  and event views.
- `apps/server/service/server_protocol.py`: compatibility shim for the
  domain-split protocol package.
- `apps/server/database/`: SQLAlchemy models, database setup, CRUD, migrations,
  and session persistence helpers.

## React client

- `apps/web-ui/src/app/`: app-level entry exports and providers.
- `apps/web-ui/src/features/`: user-facing feature areas.
- `apps/web-ui/src/features/combat/`: combat dock, command hook, planning,
  DM controls, action panels, combat stores, and focused tests.
- `apps/web-ui/src/shared/`: shared UI, hooks, services, and utilities.
- `apps/web-ui/src/lib/websocket/`: browser WebSocket protocol adapter and
  message definitions.
- `apps/web-ui/src/lib/api/ProtocolService.ts`: active protocol singleton for
  code outside `ProtocolProvider`.
- `apps/web-ui/src/lib/wasm/runtime/`: runtime boundary for generated Rust/WASM
  bindings.
- `apps/web-ui/src/lib/wasm/`: generated WASM files plus hand-written sync
  services.
- `apps/web-ui/src/store.ts`: broad Zustand store for table, sprite, wall,
  layer, grid, role, and connection state.

## Python domain package

- `packages/core-table/core_table/table.py`: virtual table model.
- `packages/core-table/core_table/protocol.py`: shared table protocol message
  types and behavior.
- `packages/core-table/core_table/server.py`: table manager used by the server.
- `packages/core-table/core_table/combat.py`: combat model.
- `packages/core-table/core_table/pathfinding.py`: pathfinding behavior.
- `packages/core-table/core_table/dice.py`: dice utilities.
- `packages/core-table/core_table/compendiums/`: compendium loaders and token
  resolution.

## Rust/WASM engine

- `packages/rust-core/src/lib.rs`: Rust crate exports.
- `packages/rust-core/src/render/`: WASM-facing renderer, input handling, sync,
  state, and draw logic.
- `packages/rust-core/src/rendering/`: WebGL rendering primitives.
- `packages/rust-core/src/event_system/`: canvas event handling.
- `packages/rust-core/src/systems/`: paint, planning, and collision systems.
- `packages/rust-core/src/actions/`: undoable table and sprite actions.
- `packages/rust-core/src/net/`: WASM-facing network, asset, and table sync
  helpers.
- `packages/rust-core/src/lighting/`: lighting and visibility logic.
- `packages/rust-core/Cargo.toml`: crate type, wasm features, dependencies, and
  test/benchmark configuration.

## Tests

- `apps/server/tests/`: pytest unit, integration, e2e, benchmark, and load-test
  coverage for the server.
- `packages/core-table/tests/`: pytest tests for domain behavior.
- `packages/rust-core/tests/`: wasm-bindgen tests for Rust/WASM boundary
  behavior.
- `apps/web-ui/src/**/*.test.ts(x)`: Vitest tests for React, runtime, protocol,
  and shared code.
