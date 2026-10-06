# Testing strategy

Audience: contributors choosing and running verification for a change.

Status: current.

Last source audit: 2026-09-24

Tests should sit at the boundary where behavior is owned. Avoid testing a lower
layer through an unrelated higher layer when a direct boundary test is clearer.
WASM integration tests use separate renderer and actions-client doubles.
The shared renderer double includes canvas input-context capabilities such as
`can_undo`/`can_redo`; action panels receive the actions client, not the renderer.
Runtime store notifications can expose an attached engine before canvas effects
run, so mocks must implement the capabilities those effects actually consume.

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

Run repository-wide Python static gates after installing both the locked server
development requirements and editable core-table package:

```powershell
ruff check apps/server packages/core-table
mypy apps/server --ignore-missing-imports --no-error-summary
pnpm.cmd dlx pyright@1.1.411
```

Pyright is pinned because diagnostic behavior changes between releases. The
gate covers both Python packages. CI invokes Pyright without `--warnings`, so
errors fail the command while configured warnings are reported. Resolve new
diagnostics; do not hide a project diagnostic to compensate for a dependency missing from the
selected virtual environment.

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
`tests/unit/test_http_route_threading.py` locks down the normal-`def` contract
for blocking HTTP handlers and injects a slow database call to prove the ASGI
event loop remains responsive.
OAuth callback integration tests assert that provider exchange and database
persistence execute on different threads, and cover subject resolution,
creation, and rejection of email-only linking
with both success and failure audit records.
Paint persistence regression tests cover worker-owned object
create/update/delete and snapshots, optimistic conflicts, retry idempotency,
authorization, preview isolation, operation-ledger cleanup, cutover artifacts,
and template export. PostgreSQL-only coverage proves gap-free concurrent
revisions and writer fencing; SQLite is not treated as concurrency evidence.
Measurement tests cover upsert/delete/clear/sync. For new
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

Asset quota tests cover limiter state shared by independent workers, restart
expiry, fail-closed store errors, per-user and plan-wide byte reservations,
pending and final session/actor link decisions, idempotent duplicate linking,
and cleanup when a final-link race rejects a newly promoted object. Run the
PostgreSQL contract suite for database-sensitive changes because SQLite does
not implement `SELECT ... FOR UPDATE` row locking.

The browser-only Rust/WASM suite uses pinned `wasm-pack 0.13.1`,
`wasm-bindgen-test-runner 0.2.117`, and Chrome/ChromeDriver build
`151.0.7922`. Run the Node WASM test once to provision the matching bindgen
runner, then use the wrapper so `wasm-pack` cannot substitute a driver for a
different Chrome build:

```powershell
cd packages/rust-core
wasm-pack test --node --test wasm_node --locked
pnpm.cmd run test:browser
```

On Windows the wrapper downloads the pinned ChromeDriver archive into ignored
`target/` storage and verifies its SHA-256. CI pins Chrome for Testing and
passes the action's matching driver to the same wrapper.

Run:

```powershell
pytest tests/ -q
ruff check .
```

### PostgreSQL integration contract

Database-sensitive integration tests use an explicitly disposable database from
`TEST_POSTGRESQL_DATABASE_URL`. They skip when the variable is absent and
fail closed unless its database name contains `test`. Every application table
must be empty at suite start except migration-owned singleton seed rows.
Some older fixtures accept `ALLOW_POSTGRESQL_INTEGRATION_TARGET=1`; the writer
handover suite deliberately requires a database name containing `test`.

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
- ORM writes and generated primary keys across every model family;
- writer triggers on every application table, rejected legacy/stale writes,
  migration coordination, and transaction draining across two processes;
- two real Uvicorn servers with authenticated WebSockets, retryable retirement,
  and reload of acknowledged table state.

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

### Isolated paint acceptance and load checks

`apps/server/scripts/verify_paint_release.py` launches the production-built UI
through the test-only `paint_release_app.py` entry point. It invokes
`apps/web-ui/scripts/verify-paint-release.mjs` with installed Playwright Chromium
and actual authenticated WebSockets. It does not replace server asset files.

Prerequisites: repository Python environment with the server/core-table
dependencies, Node, installed web UI dependencies, Playwright Chromium,
`wasm-pack`, and a disposable loopback PostgreSQL instance. Its administrator
must be able to create/drop databases. The archived legacy revision used by
the runner must exist in local Git history; see `LEGACY_COMMIT` in the script.

Build optimized WASM and the UI from the repository root, then launch the runner
from `apps/server` with the repository Python environment activated:

```powershell
./scripts/build-wasm.ps1
pnpm.cmd --dir apps/web-ui run build
cd apps/server
python -m scripts.verify_paint_release --postgres-url postgresql://test_admin@127.0.0.1:55473/paint_contract_test
```

If Chromium is missing, install the project's matching browser with
`pnpm.cmd exec playwright install chromium` from `apps/web-ui`.

The runner rejects remote hosts, database names without `test`, alternate
drivers, and connection query parameters. It does not use the application's
configured database URL. Never use a forwarded production database, even if
its address appears local. The runner creates two randomly named databases;
teardown stops its own server/browser and drops only those databases. It does
not install or stop PostgreSQL. The browser has a ten-minute watchdog.

Two contexts run the full UI; eight additional authenticated contexts exercise
the socket protocol. Checks cover all six forms, edits and deletion, actor
authority, optimistic conflicts, reconnect/server restart, preview loss,
context loss, and snapshot races. The busy fixture has 1,000 paths and 100,000
points. Nine writers submit concurrent edit batches; every client must finish
with identical ordered objects and revision.

The browser script fixes the following local acceptance budgets before sampling:

| Measurement | Pass condition |
| --- | --- |
| Local input-to-preview p95 | At most 50 ms |
| Event delivery / command round-trip p95 | At most 250 ms each |
| Server handler p95 histogram upper bound | At most 250 ms |
| CPU render mean / p95 | At most 10 ms / 16.7 ms |
| Snapshot assembly time / size | At most 5 seconds / 32 MiB |
| Retained GPU buffers / WASM memory | No growth after warm-up |
| Post-GC JS heap / external backing storage | Growth at most 64 MiB |
| Peak / final outgoing socket queue | At most 64 KiB / zero |
| Normal-load rejections, revision gaps, resyncs, lost updates | Zero |

Memory is sampled after garbage collection every four batches. Each accepted
edit must rebuild only the changed object's mesh. Frame/preview timing ends at
CPU render submission, not GPU completion or display scan-out. Loopback
thresholds are not arbitrary-network guarantees or a multi-hour soak test.

The synthetic cutover fixture backs up legacy strokes, explicitly quarantines
invalid rows, exports templates, and verifies idempotent conversion. Before a
new-format write it tests downgrade plus archived server hydration; afterward
it keeps the schema and tests a write-disabled successor writer's reads. A real
WebGL pixel check verifies one converted path. This is not a live backup restore
or a full restart of an identified deployed old release.

Failures return nonzero and retain diagnostics. Fixtures, test JWTs, backups,
logs, and measured results remain in the printed private temporary directory;
do not commit them. Passing the runner does not enable production writes.
Follow [Database migrations](operations/DATABASE_MIGRATIONS.md) for the actual
cutover and rollback boundary, and [Measurement and painting](features/MEASUREMENT_AND_PAINTING.md)
for controller and authorization contracts.

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
- Runtime component tests should use `createMockWasmRuntime` or a mock that
  explicitly implements `WasmRuntimePort`. Do not maintain partial untyped
  runtime doubles; lifecycle additions such as `start()` must be enforced by
  TypeScript across shared fixtures.
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
pnpm.cmd run test:browser
```

The browser command intentionally uses the pinned wrapper described above;
do not replace it with an unpinned `wasm-pack test --headless --chrome` gate.

Renderer performance work uses the deterministic scene builders in
`packages/rust-core/src/performance_fixtures.rs`. Native tests validate their
shape, while the real-browser WASM suite validates that a rendered frame
publishes non-zero operation counters. Timing baselines must use an optimized
WASM build and record the browser, canvas size, warmup, sample count, and scene
outside `docs/current`; submission timing is not GPU timing and is not a
portable CI threshold.

Run `pnpm.cmd run test:wasm` from `apps/web-ui` after changing generated
bindings, renderer lifecycle, WebGL resources, or occlusion behavior. That
Chromium suite covers table replacement, context loss/restoration, viewport
culling, batched shadows, renderer-owned sight/light queries, and occlusion
updates before the next rendered frame.

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

## Persistence, identity, and guest regressions

Use [Persistence and application ownership](explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md)
for atomic snapshot, worker cancellation, save-recovery, and fencing test owners.
Run `test_sprite_identity_security.py`, `test_sprite_event_visibility.py`, and
`test_sprite_quotas.py` for token identity, per-recipient visibility, and live
quota behavior. `test_demo_system.py` and `test_demo_guest_migration.py` cover
separate guest authentication, expiry, and account isolation.

Record exact commands, runtime versions, pass/skip counts, and unexercised
provider checks in a dated report outside current docs. Do not turn one run's
pass count into a permanent architecture guarantee or mark skipped PostgreSQL
tests as validation. No test result alone verifies the live deployment.
