# Testing strategy

Audience: contributors choosing and running verification for a change.

Status: current.

Last source audit: 2026-08-17

Tests should sit at the boundary where behavior is owned. Avoid testing a lower
layer through an unrelated higher layer when a direct boundary test is clearer.

## Server

Use pytest in `apps/server`.

The authoritative pytest and coverage configuration is
`apps/server/pyproject.toml`; do not add a second pytest configuration file.
Fixtures and assertions that need the database's naive UTC representation use
`apps/server/utils/time.py::utc_now`, matching production timestamp semantics.

- Unit tests: services, protocol handlers, auth helpers, and rules adapters.
- Integration tests: HTTP routes, database behavior, and route/service wiring.
- E2E tests: real WebSocket connection and session flow.
- Benchmarks/load tests: movement, WebSocket behavior, and known hot paths.

`tests/unit/test_protocol_serialization.py` verifies same-session mutation
ordering, batch ordering, rollback-safe state reads, safe concurrent ping
dispatch, and cross-session concurrency. When adding a mutating message family,
extend that boundary suite if its ordering or rollback behavior differs. Keep
domain rollback assertions in the domain service tests and use the authenticated
Locust scenario only as a post-correctness load check.

Connection-lifecycle tests also assert that handshake lookup, durable session
construction, autosave, and final persistence execute on a worker thread.
`tests/unit/test_blocking.py` verifies the shared admission limit and
cancellation-safe capacity release for queued and already-running
async-to-sync submissions.
Paint persistence regression tests cover the same thread boundary for stroke
create/delete/clear and template upsert/delete/sync, plus stroke retry
idempotency. Measurement tests cover upsert/delete/clear/sync. For new
async-to-sync boundaries, add an event-loop responsiveness regression and
assert that the worker creates and closes its own SQLAlchemy session.

Session protocol tests cover worker-thread execution for rules, mode, layer,
and active-table operations. They also verify that a foreign-session table and
a failed layer-settings write cannot produce an accepted broadcast.

Canvas persistence tests cover session-scoped exact sprite counts, detached
table hydration, movement-policy/settings round trips, and character-link
lookups. Sprite and table protocol tests inject deliberately slow persistence
helpers and assert that an independent event-loop heartbeat still runs.

Character persistence tests cover session-scoped linked-token writes and XP
audit records. Character and draft protocol tests inject slow manager,
permission, and token-persistence calls and assert that an independent
event-loop heartbeat still runs. The token-sync regression also verifies that
detached sprite IDs resolve through the in-memory sprite-to-entity index before
the broadcast is emitted.

Combat command tests assert worker-thread execution for duplicate lookup,
journal persistence, restore, combatant construction, movement validation,
and table saves. A deliberately blocked persistence fake verifies that an
independent event-loop heartbeat still advances, while existing rollback tests
cover failed journal writes and token movement reversal.

Asset deletion tests cover unlink commit failure before any R2 call, durable
retry after storage failure, idempotent repeated cleanup, preservation when
another session link remains, and event-loop responsiveness. Model and Alembic
tests must include the deletion-outbox table. PostgreSQL contract coverage is
the authority for row-lock behavior across workers.

Run:

```powershell
pytest tests/ -q
ruff check .
```

### PostgreSQL integration contract

Database-sensitive integration tests use an explicitly disposable database from
`TEST_POSTGRESQL_DATABASE_URL`. They skip when the variable is absent and
fail closed unless its database name contains `test`. Every application table
must be empty at suite start. An operator can use
`ALLOW_POSTGRESQL_INTEGRATION_TARGET=1` only for a uniquely named, short-lived
schema that will be dropped after the run.

CI supplies a fresh PostgreSQL service and requires:

- baseline upgrade from an empty database;
- `alembic current --check-heads` and `alembic check`;
- named uniqueness and foreign-key action inspection;
- PostgreSQL identifier-length validation;
- invalid foreign-key rejection;
- real `SELECT ... FOR UPDATE` serialization;
- concurrent chat and combat idempotency constraints;
- readiness at head and on a deliberately mismatched revision;
- recovery when `pool_pre_ping` encounters a terminated idle backend;
- ORM writes and generated primary keys across every model family.

SQLite remains useful for fast unit tests, but it is not evidence for hosted
schema, constraint, or locking behavior.

Never point this suite at the populated Neon development database or its
`public` schema.

### Authenticated WebSocket load test

`apps/server/tests/loadtest/locustfile.py` requires an authenticated disposable
session. Set `LOAD_TEST_TOKEN` and `LOAD_TEST_SESSION`, then pass the HTTP
origin explicitly with Locust's required `--host` option:

```powershell
$env:LOAD_TEST_TOKEN = "<valid JWT>"
$env:LOAD_TEST_SESSION = "<session code>"
$env:LOAD_TEST_ORIGIN = "http://localhost:8000"
locust -f apps/server/tests/loadtest/locustfile.py `
  --host http://localhost:8000
```

Optional sprite-mutation coverage also needs `LOAD_TEST_TABLE` and
`LOAD_TEST_SPRITE` for a sprite controlled by every load-test identity. Run
this only against a disposable local or reviewed test session, never
production.

## Core table

Use pytest in `packages/core-table`.

Test reusable tabletop rules here when the behavior does not need FastAPI,
database state, or browser code.

The package-local pytest configuration adds the flat-layout package root to
the test import path, so the documented command works without an editable
install or a shell-specific `PYTHONPATH` override. CI still installs the wheel
in editable mode to exercise its packaging metadata as a separate contract.

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
- Asset-boundary tests: TypeScript covers fetch ownership, concurrent download
  deduplication, hash mismatch, Blob eviction, and object-URL/abort cleanup;
  Rust covers stable byte-to-xxHash vectors.
- Download tests in jsdom: stub the anchor `click()` browser boundary, assert
  that it was invoked, and verify object URL cleanup. Use a browser project for
  real navigation and download behavior.
- Lifecycle tests: disconnect resource-owning clients and clear their timers in
  `afterEach` so cleanup still runs after a failed assertion and cannot affect a
  later test.
- Canvas input-store tests cover immutable snapshots and subscription cleanup.
  Keyboard-shortcut hook tests must exercise selection, clipboard, undo/redo,
  and focus transitions instead of reading `InputManager` private fields.

The jsdom coverage run enforces global statement, branch, function, and line
thresholds in `apps/web-ui/vitest.config.ts`. These thresholds are the
whole-number floor of the latest verified full-suite baseline and must not be
lowered to accommodate a change. Raise the relevant floors when sustained test
improvements move the baseline upward.

Run:

```powershell
pnpm.cmd exec tsc -b --pretty false
pnpm.cmd exec vitest run --project jsdom
pnpm.cmd exec vitest run --project browser
pnpm.cmd exec vitest run --project browser-components
pnpm.cmd run lint:css
pnpm.cmd run validate:css
```

## Rust/WASM

Use native Rust tests for pure logic and wasm-bindgen tests for exported WASM
behavior.

Run from `packages/rust-core`:

```powershell
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
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
