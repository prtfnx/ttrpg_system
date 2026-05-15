# Test Coverage Analysis & Improvement Plan

_Generated: 2026-05-08_

---

## 1. Current State — Hard Numbers

### Python Server (`apps/server`)

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Overall coverage | **56%** | 60% | ❌ FAILING |
| Total statements | 11,949 | — | — |
| Missing statements | 5,310 | — | — |

### Web UI (`apps/web-ui`)

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Overall coverage | **31%** | 30% | ✅ barely |
| Total statements | 15,397 | — | — |
| Missing statements | 10,641 | — | — |

### WASM / Rust (`packages/rust-core`)

| Test suite | Count | CI | Status |
|-----------|-------|-----|--------|
| Node tests | 26 | ✅ | Passing |
| Browser tests | 2 | ✅ | Passing |
| Line coverage | N/A | — | Not measured |

### Core Table (`packages/core-table`)

| Metric | Value | Notes |
|--------|-------|-------|
| Test files | 8 | pytest |
| Coverage | Not measured | No coverage.json |

---

## 2. Honest Assessment per Layer

### 2.1 Server — Protocol Layer (the big hole)

The single largest coverage gap is the entire `service/protocol/` directory —
the layer that handles WebSocket messages dispatched from `game_ws.py`.
These handlers contain real business logic (move validation, state mutation,
DB writes) but are almost untested.

| File | Coverage | Missing stmts | Problem |
|------|----------|---------------|---------|
| `service/protocol/sprites.py` | 4.3% | 490 | Sprite create/update/delete/move handlers |
| `service/protocol/tables.py` | 4.7% | 369 | Table join/leave/settings handlers |
| `service/protocol/assets.py` | 9.2% | 247 | Asset upload/delete/search handlers |
| `service/protocol/walls.py` | 10.2% | 97 | Wall draw/edit/delete handlers |
| `service/protocol/session.py` | 10.7% | 134 | Layer settings, fog, grid config |
| `service/game_session_protocol.py` | 11.1% | 305 | Top-level WS message dispatcher |
| `service/asset_manager.py` | 13.3% | 430 | File upload, R2 storage integration |
| `service/protocol/players.py` | 13.7% | 126 | Player join/leave/ping handlers |
| `service/protocol/combat.py` | 14.3% | 516 | Combat action handlers (biggest) |
| `service/protocol/helpers.py` | 14.5% | 112 | Shared helper utilities |
| `service/game_session.py` | 17.1% | 174 | Session lifecycle management |
| `service/protocol/encounter.py` | 18.5% | 44 | Encounter start/end handlers |
| `api/game_ws.py` | 24.5% | 112 | WebSocket endpoint / connection manager |

**Why this matters:** A bug in combat.py (516 untested stmts) or sprites.py
(490 untested stmts) goes to production invisibly. These are exactly the paths
that run during every live game session.

**Root cause:** The `game_session_protocol.py` dispatcher takes a live WebSocket
connection, live DB session, and a running `GameSession` object. Tests never
set these up together — the unit tests mock too many layers out, and the real
WebSocket path is exercised only by the thin `test_websocket.py` E2E test.

### 2.2 Server — Supporting Services

| File | Coverage | Notes |
|------|----------|-------|
| `storage/r2_manager.py` | 21.1% | R2/S3 calls entirely unmocked |
| `database/session_utils.py` | 19.7% | Session persistence helpers |
| `managers/character_manager.py` | 53.8% | Character CRUD/stats — half untested |
| `routers/auth.py` | 47.8% | Password reset, email verify paths missing |
| `utils/audit.py` | 44.7% | Audit log write paths |

### 2.3 Server — Well-Covered Areas (don't waste effort here)

| File | Coverage | Notes |
|------|----------|-------|
| `service/combat_engine.py` | 82.2% | Good |
| `routers/game.py` | 85.8% | Good |
| `routers/users.py` | 85.2% | Good |
| `routers/compendium.py` | 80.7% | Good |
| `service/encounter_engine.py` | 94.6% | Excellent |
| `service/attack_resolver.py` | 72.6% | Acceptable |
| `database/models.py` | 99.6% | Essentially complete |
| `database/schemas.py` | 100% | Complete |

### 2.4 Web UI

Overall 31% — barely above threshold — but the distribution is brutal:
- Zustand stores: partially covered
- All canvas/table rendering: 0%
- All combat UI: 0%
- Character sheet: 0%
- `clientProtocol.ts` (823 stmts): 0% — the entire client-side WS protocol layer

The existing 4 test files (`ComponentBestPractices`, `ComponentCoverage`,
`ComponentUnitTests`, `UIComponentTests`) test mocked components with shallow
renders. They achieve coverage breadth but not depth — they import a component
and check it renders without crashing, which inflates statement coverage numbers
without testing actual behaviour.

**The 30% threshold is set dangerously low.** A codebase at 31% has meaningful
untested logic in every feature.

### 2.5 WASM / Rust

26 node tests cover the exported API surface well for pure-logic functions.
Real gaps:

- `LightingSystem` — no tests (shadow polygon computation is complex)
- `FogSystem` / `RevealFog` — no tests
- `RenderEngine` / `LayerManager` — no tests (requires full WebGL context)
- `NetworkClient` / sync logic — no tests
- `CollisionSystem.movement_range()` — not tested (Dijkstra flood-fill)

The 2 browser tests are environment smoke tests, not logic tests. They confirm
WebGL2 is available but exercise no actual rendering code.

### 2.6 Core Table

Combat, dice, conditions, pathfinding, game mode: generally well-tested.
Gaps:

- `table.py` (`VirtualTable`) — no direct tests; tested only indirectly via server
- `Character.py` — no direct tests; complex model with many computed properties
- `actions_core.py` — action system untested at this layer
- `async_actions_protocol.py` — zero tests
- `protocol.py` — message serialization tested only by server unit tests

---

## 3. Test Pyramid Analysis

The project's test distribution is **inverted** compared to best practice:

```
Best practice (Fowler pyramid):
          /\
         /E2E\          few — slow, brittle
        /------\
       /  Integ  \      moderate — DB, WS, HTTP
      /------------\
     /    Unit       \  many — fast, isolated
    /------------------\

This project (actual):
          /\
         /???\ ← E2E: 3 files (thin)
        /------\
       /  Integ  \ ← integration: 7 files (OK but narrow scope)
      /------------\
     / Unit (many)  \ ← unit: 36 files, but MISSING service/protocol entirely
    /------------------\
    ← protocol layer: 4-14% → this is the inverted ice cream cone problem
```

**The core problem:** Business-critical code lives in `service/protocol/` but
there are no unit tests that instantiate and call those handlers directly.
The unit tests mostly test helper objects (combat engine, attack resolver,
rules engine) rather than the handlers that actually execute during a game.

---

## 4. What "Good" Looks Like

Based on Martin Fowler's test pyramid and industry practice:

- **Unit tests**: Fast, isolated, no DB. Should cover every handler, service
  function, and utility path including error/edge cases. Target: >80% per file.
- **Integration tests**: Spin up real DB (SQLite in-memory), call routers
  through FastAPI's `TestClient`. Test the full request→handler→DB→response
  chain. Existing integration tests do this well — extend the pattern.
- **E2E / WS tests**: Keep few, cover the critical user journeys (connect WS,
  join session, take turn in combat, disconnect). Don't test every message type
  here — push that down to integration.
- **Web UI**: Prefer React Testing Library over shallow renders. Test hooks
  and stores directly, not just that components render without crashing.
  The 30% threshold should be raised to 60%.
- **WASM**: Node tests are correct for pure logic. Add tests for the
  missing systems (lighting, fog, movement_range).

---

## 5. Step-by-Step Improvement Plan

### Phase 1 — Stop the Bleeding (fix CI, prevent regression)
_Goal: get server coverage back above 60% threshold before adding new features_

**Step 1.1 — Test the WS protocol dispatcher (`game_session_protocol.py`)**
- Create `tests/unit/test_game_session_protocol.py`
- Build a `MockGameSession` fixture that stubs DB calls but runs real handler logic
- Test each top-level message type dispatch: does it call the right sub-handler?
- Gain: ~50 statements covered, brings dispatcher from 11% to ~40%

**Step 1.2 — Add protocol handler unit tests for combat.py (the biggest gap)**
- Create `tests/unit/test_protocol_combat.py`
- Fixture: a `GameSession` with mocked DB and a real `CombatEngine`
- Test: `ATTACK`, `MOVE`, `END_TURN`, `APPLY_DAMAGE`, `GRANT_ACTION` message handlers
- This is the most gameplay-critical code — bugs here affect every combat session
- Gain: covers ~200 of the 516 missing statements

**Step 1.3 — Add protocol handler unit tests for sprites.py**
- Create `tests/unit/test_protocol_sprites.py`
- Test: `SPRITE_CREATE`, `SPRITE_UPDATE`, `SPRITE_DELETE`, `SPRITE_MOVE`
- Use existing `test_sprites_protocol.py` pattern (already at 100%)
- Gain: ~150 statements

**Step 1.4 — Add protocol handler unit tests for tables.py**
- Create `tests/unit/test_protocol_tables.py`
- Test: `TABLE_JOIN`, `TABLE_LEAVE`, `TABLE_SETTINGS_UPDATE`, `TABLE_GRID_CHANGE`
- Gain: ~100 statements

After Phase 1: estimated server coverage ~63% (above 60% threshold)

---

### Phase 2 — Fill Core Logic Gaps
_Goal: reach 75% server coverage, add meaningful WASM/core-table tests_

**Step 2.1 — `character_manager.py` (53% → 75%)**
- Add tests for: character creation with full stat block, level-up logic,
  equipment bonus application, spell slot computation
- These are stateless enough to test without DB

**Step 2.2 — `routers/auth.py` (47% → 80%)**
- Add integration tests for: password reset flow (request + confirm token),
  email verification confirm endpoint, token refresh expiry edge case
- Use existing `TestClient` + `test_auth_routes.py` pattern

**Step 2.3 — `api/game_ws.py` (24% → 60%)**
- Expand `test_websocket.py` with `starlette.testclient.WebSocketTestSession`
- Test: connection auth failure, disconnect cleanup, rate limiting,
  invalid JSON rejection

**Step 2.4 — Core Table: add `test_table.py`**
- Test `VirtualTable` directly: create, activate, add entity, remove entity
- Test coordinate transforms at edge of grid

**Step 2.5 — Core Table: add `test_character.py`**
- Test Character model: stat modifier computation, proficiency bonus,
  spell slots per class/level, save DC calculation

**Step 2.6 — WASM: extend `wasm_node.rs` for missing systems**
- Add `lighting_` tests: `compute_shadows` with known geometry (no shadows
  in open room, shadow behind wall)
- Add `collision_movement_range_` tests: verify flood-fill returns reachable
  cells within speed limit
- Add `fog_reveal_` test: reveal tokens bring cells from hidden to visible

---

### Phase 3 — Web UI Coverage (raise bar from 30% to 60%)
_Goal: meaningful component tests, not just render smoke tests_

**Step 3.1 — Raise vitest threshold**
- Edit `vitest.config.ts`: `lines: 30 → 50`, `functions: 30 → 50`, `branches: 25 → 40`
- Do this AFTER adding tests, not before — setting a threshold you can't meet
  just makes CI red

**Step 3.2 — Test Zustand stores directly**
- Stores are pure functions — no DOM needed
- Create `src/test/__tests__/stores/` with tests for:
  - `combatStore`: actions update state correctly, turn advancement works
  - `sessionStore`: join/leave session, active table selection
  - `entityStore`: entity CRUD, selection state
- These give high ROI: 1 test file → 50-100 stmts covered

**Step 3.3 — Test hooks with `renderHook`**
- `useCombat`, `useSession`, `useCanvas` — render with mocked store,
  assert returned values and callbacks
- Mock `useWasm` with a fake WASM module

**Step 3.4 — Test `clientProtocol.ts` (823 stmts at 0%)**
- This is the most critical untested frontend file
- It's pure message-building functions — no DOM, no React
- Unit test each message builder: does `buildMoveMessage(x,y)` return
  the correct shape?
- Should be straightforward pure-function testing

**Step 3.5 — Add one integration test per major feature**
- Not "does it render" but "does the user journey work":
  - Combat panel: user clicks "End Turn" → store action called
  - Character sheet: user changes HP → store updated
  - Asset panel: user uploads file → API mock called with correct payload

---

### Phase 4 — Quality and Maintainability

**Step 4.1 — Fix the coverage threshold in `pytest.ini`**
- Raise `fail_under = 60` → `fail_under = 75` once Phase 1+2 are done
- This makes CI enforce the new baseline

**Step 4.2 — Add mutation testing (optional, high value)**
- Install `mutmut` for Python, `@stryker-mutator/jest-runner` for JS
- Run on `service/combat_engine.py` and `packages/core-table/core_table/combat.py`
  to verify tests actually catch logic errors, not just achieve line coverage

**Step 4.3 — Property-based testing for dice and combat math**
- Install `hypothesis` (Python) for `dice.py` and `combat_engine.py`
- Example: for any roll `NdM+K`, result is always in `[N+K, N*M+K]`
- This catches arithmetic edge cases that example-based tests miss

**Step 4.4 — WASM: add `cargo tarpaulin` or `llvm-cov` to CI**
- Add Rust coverage step to `.github/workflows/ci.yml`
- `cargo llvm-cov --all-features --lcov --output-path lcov.info`
- Upload to Codecov or similar for trend tracking

---

## 6. Priority Matrix

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| Protocol handler tests (sprites, combat, tables) | 🔴 Critical | Medium | **Do first** |
| Game session dispatcher tests | 🔴 Critical | Medium | **Do first** |
| `clientProtocol.ts` unit tests | 🔴 Critical | Low | **Do first** |
| Raise Python threshold to 75% | 🟠 High | Low | After Phase 1 |
| Auth router gap (password reset) | 🟠 High | Low | Phase 2 |
| Zustand store tests | 🟠 High | Low | Phase 2 |
| Character manager tests | 🟡 Medium | Medium | Phase 2 |
| WASM lighting/fog tests | 🟡 Medium | Medium | Phase 2 |
| Hook tests with renderHook | 🟡 Medium | Medium | Phase 3 |
| Mutation testing | 🟢 Low | High | Phase 4 |
| Property-based testing | 🟢 Low | Medium | Phase 4 |

---

## 7. What NOT to Do

- **Don't chase 100% coverage.** Migrations (correctly excluded), trivial
  getters, `__init__.py` files — these add no value to test.
- **Don't write tests that only assert "no exception was raised."** The
  existing component smoke tests inflate numbers without protecting behaviour.
- **Don't duplicate test logic across layers.** If `combat_engine.py` is
  covered at 82% by unit tests, don't re-test the same paths through
  the WebSocket E2E test — test only the WS dispatch wiring there.
- **Don't start with Phase 3/4 while Phase 1 is failing CI.** The server
  is already below its 60% threshold — that's a production risk.

---

## 8. Summary

The test suite has a well-structured skeleton (36 server unit files, 7 integration
files, 8 core-table files) but a critical coverage hole in the exact layer that
runs during every live game session: `service/protocol/`. Getting that layer from
~10% to ~60% is the single most impactful testing work this codebase needs.

The web UI is barely above its threshold with tests that don't exercise real
behaviour. Pure-function testing of `clientProtocol.ts` and Zustand stores would
double meaningful frontend coverage with relatively little effort.

WASM coverage is reasonable for the exported API surface. The gaps
(LightingSystem, FogSystem, movement_range) are real but lower priority than
the server protocol layer.
