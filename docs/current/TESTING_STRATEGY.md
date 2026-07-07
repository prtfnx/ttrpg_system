# Testing strategy

Tests should sit at the boundary where behavior is owned. Avoid testing a lower
layer through an unrelated higher layer when a direct boundary test is clearer.

## Server

Use pytest in `apps/server`.

- Unit tests: services, protocol handlers, auth helpers, and rules adapters.
- Integration tests: HTTP routes, database behavior, and route/service wiring.
- E2E tests: real WebSocket connection and session flow.
- Benchmarks/load tests: movement, WebSocket behavior, and known hot paths.

Run:

```powershell
pytest tests/ -q
ruff check .
```

## Core table

Use pytest in `packages/core-table`.

Test reusable tabletop rules here when the behavior does not need FastAPI,
database state, or browser code.

Run:

```powershell
pytest -q
ruff check .
```

## Web UI

Use Vitest in `apps/web-ui`.

- JSDOM tests: React logic, hooks, stores, protocol adapters, services, and
  runtime contracts that do not need a real browser.
- Browser tests: canvas, WebGL, real DOM behavior, and WASM paths that jsdom
  cannot model.
- Runtime tests: `WasmRuntimePort`, callback routing, attach/detach, and error
  snapshots.

Run:

```powershell
pnpm.cmd exec tsc -b --pretty false
pnpm.cmd exec vitest run --project jsdom
pnpm.cmd exec vitest run --project browser
pnpm.cmd exec vitest run --project browser-components
```

## Rust/WASM

Use native Rust tests for pure logic and wasm-bindgen tests for exported WASM
behavior.

Run from `packages/rust-core`:

```powershell
cargo test
cargo check --target wasm32-unknown-unknown --features wasm-start
wasm-pack test --node
wasm-pack test --headless --chrome
```

## What to test for a change

- Protocol message: client message type, client send or handler, server handler,
  and one boundary test on each side.
- Combat command: service behavior, role/ownership validation, rollback,
  persistence/idempotency when accepted, and one UI or protocol test for the
  user-facing send path.
- React UI change: component or hook behavior plus any store/protocol/runtime
  call it owns.
- WASM export change: Rust boundary test, regenerated bindings, runtime method,
  and runtime contract test.
- Persistence change: migration, CRUD/session helper behavior, and route or
  protocol integration.
- Cross-domain change: one test at each changed boundary.

Focused battle-flow suites:

- `apps/server/tests/unit/test_combat_command_service.py`;
- `apps/server/tests/unit/test_combat_protocol.py`;
- `apps/server/tests/unit/test_combat_state_presenter.py`;
- `apps/server/tests/unit/test_combatant_factory.py`;
- `apps/server/tests/unit/test_combat_persistence.py`;
- `apps/web-ui/src/features/combat/hooks/__tests__/useCombatCommands.test.ts`;
- `apps/web-ui/src/features/combat/components/__tests__/CombatDock.test.tsx`;
- `apps/web-ui/src/features/combat/components/__tests__/DMCombatPanel.test.tsx`;
- `apps/web-ui/src/lib/websocket/__tests__/clientProtocol.test.ts`;
- `packages/rust-core` native tests for preview-only planning behavior.

## Rules

- Mock the boundary being used, not hidden globals.
- Keep tests close to the owner of the behavior.
- Prefer small focused tests over broad integration tests for normal changes.
- Add broader tests when changing a shared contract.
- Do not use jsdom as proof that WebGL or real WASM canvas behavior works.
