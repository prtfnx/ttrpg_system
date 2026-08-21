# TODO

## 2026-08-14 integrated audit backlog

This section records the remaining work found by the 2026-08-14 source-flow
audit. It is a plan, so it intentionally lives outside `docs/current/`.
`docs/current/` must continue to describe only behavior that is implemented
and verified.

### 2026-08-17 closeout

Completed and committed today:

- [x] Bounded all explicit async-to-sync server submissions with configurable,
  cancellation-safe admission control (`4d55ccdd`).
- [x] Moved blocking HTTP-only routes into FastAPI's worker pool and added a
  route-threading/event-loop responsiveness contract (`a2e757d0`).
- [x] Kept account/session administration transactions off the event loop and
  applied live socket changes only after commit (`577e71cf`).
- [x] Isolated Google OAuth identity/audit persistence in worker-owned sessions
  while keeping provider exchange asynchronous (`439b8713`).
- [x] Corrected the remaining top-level invitation page threading path
  (`3dc0456d`).
- [x] Full server verification: 1,128 passed, 10 skipped, 79.54% coverage;
  Ruff, compilation, and current-documentation validation passed.

### 2026-08-19 release closeout

Completed and committed for the current-feature release:

- [x] Added PostgreSQL quota primitives (`1bad333e`) and moved all asset
  upload/download token buckets to the shared database store with explicit,
  observable fail-closed behavior (`3fd363b1`).
- [x] Added a serialized 9,000,000,000-byte application storage ceiling,
  pending reservations, idempotent links, and both session (1,000) and
  actor/session (250) durable link caps (`0ffde6bd`).
- [x] Exposed and documented the release quota controls (`64123fb0`,
  `e666698e`).
- [x] Restored the pinned zero-diagnostic Pyright CI gate (`4c0670f0`).
- [x] Repaired the browser-only Rust/WASM gate with a pinned matching Chrome,
  ChromeDriver, wasm-pack, and wasm-bindgen runner (`8d10ce86`).
- [x] Source-audited the UI token and contrast-validation contract
  (`721a7f86`).

Remaining implementation or decisions, in priority order:

1. Complete generated browser WebSocket payload types/runtime schemas. This is
   intentionally deferred type-safety work, not a current authorization bypass.
2. Capture the operator-owned disposable PostgreSQL, deployed R2 smoke/orphan
   audit, and post-deploy cold-start evidence from the release checklist.
3. Product backlog below remains: character/NPC creation UX, compendium monster
   creation, manual fog, optional media/animation/3D ideas, advanced mechanics,
   map-building/AI tooling, and the underspecified character-window item.

Commit publication status is intentionally not tracked in this file because it
becomes stale after a push or history rewrite. Use `git status --short --branch`
and `git log origin/main..HEAD` as the authoritative checks.

### 2026-08-20 asset gateway follow-up

The configurable presigned/Worker link path and a dependency-free Worker
gateway are implemented. This is a functional implementation milestone, not
yet the completed production rollout. The detailed provisioning and acceptance
procedure is in
[`docs/guide/PRODUCTION_DEPLOYMENT_GUIDE.md`](docs/guide/PRODUCTION_DEPLOYMENT_GUIDE.md).

Release blockers found by the post-implementation source audit:

- [ ] Reserve the full normal upload operation cost. The current gateway
  reserves two Class A and two Class B operations, while verification and
  promotion can use two Class A and four Class B operations before retries.
- [ ] Replace UTC calendar-month operation counters with a rolling 30-day
  window or the configured Cloudflare billing-cycle boundary.
- [ ] Keep expired pending-upload bytes reserved until the corresponding R2
  object is durably deleted; the one-day lifecycle is recovery defense, not an
  immediate quota release signal.
- [ ] Add the nested asset gateway package to CI and run a real deployed
  browser-to-Worker-to-R2-to-server confirmation integration test.
- [ ] Verify WAF rate limiting, billing visibility, secret rotation, cold
  start, cache, replay, quota exhaustion, and presigned rollback in staging.

Keep public untrusted asset upload disabled until these blockers close. A
private trusted preview may retain `ASSET_LINK_MODE=presigned` with manual R2
usage review, but that is not a hard guarantee of staying inside the free
allowance.

### Verified foundations

These boundaries were verified during the audit. Do not reopen them without a
new regression or changed requirement.

- [x] WebSocket handshakes reject invalid origins, expired or revoked access
  tokens, disabled users, missing sessions, and users who are not session
  members.
- [x] Protocol handlers derive `session_code`, `user_id`, and `username` from
  authenticated server-side connection state instead of caller-controlled
  message fields.
- [x] The browser WebSocket client cancels reconnect timers on explicit
  disconnect and does not retain ghost sockets after retries.
- [x] The obsolete Rust WebSocket client and development NetworkPanel were
  removed. `WebClientProtocol` is the game WebSocket owner.
- [x] Asset upload requests validate size, extension, content type, xxHash,
  decoded image bytes, session membership, and upload intent ownership.
- [x] Asset quotas cover pending uploads, owned object count, and stored bytes;
  PostgreSQL locks serialize durable quota reservation for one user.
- [x] Character persistence and the main asset upload/download/list operations
  are offloaded from the asyncio event-loop thread.
- [x] Table boolean fields and wall commands use strict validation.
- [x] Duplicate protocol errors after handler exceptions were removed.
- [x] React theme CSS uses the shared token system and has automated token and
  contrast validation.
- [x] Rust remains the rendering, geometry, lighting, collision, planning,
  paint, and local canvas-computation engine.

### P0 - live authorization must remain authoritative

- [x] Synchronize active WebSocket authorization after role changes.
  - Completed: `6be08034` updates every matching live connection, protocol
    client state, and asset permissions only after the database commit.
  - Original evidence (resolved): `apps/server/routers/game.py::change_player_role` committed the new
    database role and broadcasts `player_role_changed`, but it does not update
    `GameSessionProtocolService.client_info` or the connection manager's cached
    role.
  - Impact: a connected owner or co-DM who is demoted can continue passing
    server-side `is_dm` checks until that socket reconnects.
  - Implementation boundary: add one connection-manager operation that updates
    every active connection for the target user in the target session. Update
    both connection registries and refresh asset permissions from the new role.
    Apply the update before broadcasting the accepted role change.
  - Acceptance criteria:
    - demotion takes effect for the next WebSocket command without reconnect;
    - promotion also takes effect without reconnect;
    - connections for the same user in other sessions are unchanged;
    - a failed database role update cannot change live connection authority.
  - Tests: add route/service integration coverage with an active socket and
    protocol authorization checks before and after promotion and demotion.
  - Docs: update `docs/current/features/AUTH_AND_ROLES.md`,
    `docs/current/features/SESSIONS_AND_INVITATIONS.md`, and
    `docs/current/operations/SECURITY.md` in the same commit.

- [x] Disconnect active sockets when durable session membership is removed.
  - Completed: `6be08034` closes every indexed socket for the removed member
    with policy code 1008 and converges HTTP removal with live cleanup.
  - Original evidence (resolved): the HTTP `DELETE /game/api/sessions/{session_code}/players/{id}`
    route deletes `GamePlayer` but does not close active sockets. Most canvas,
    chat, and combat handlers trust the connection identity established at the
    handshake and do not repeat the membership query for every message.
  - Impact: a user removed through the HTTP session-management flow can keep
    mutating the session until disconnect. Asset handlers are safer because
    they repeat durable membership checks, but other protocol domains do not.
  - Implementation boundary: after the membership transaction commits, locate
    every matching socket, send a stable terminal reason, remove it from both
    registries, and close it with a policy close code. Reuse the same operation
    from every kick/removal path so HTTP and WebSocket kick semantics converge.
  - Acceptance criteria:
    - all tabs for the removed user are closed promptly;
    - reconnect is rejected because membership no longer exists;
    - unrelated users and sessions remain connected;
    - cleanup and final session persistence run exactly once.
  - Tests: cover HTTP kick with a connected client, multiple sockets for one
    user, reconnect rejection, and idempotent repeated removal.
  - Docs: update the auth, sessions, WebSocket-message, and security pages.

- [x] Invalidate already-open sockets after account session revocation or
  disablement.
  - Completed: `ec54d7b5` indexes sockets by account and revokes them after
    password reset/change and account disablement commits.
  - Original evidence (resolved): `resolve_active_user_from_token` verified `session_version` and
    `disabled` only during the WebSocket handshake. Password reset/change and
    account disablement do not notify active sockets.
  - Impact: a stolen or previously authorized socket can remain active after
    the HTTP/JWT session has been revoked.
  - Preferred design: keep an index from `user_id` to active sockets and close
    those sockets after the revoking database transaction commits. If changes
    can originate outside this process, add a bounded periodic version check or
    shared revocation notification before introducing multiple workers.
  - Acceptance criteria:
    - password reset, global logout/session-version bump, and disablement close
      existing sockets;
    - password change can deliberately preserve only the newly reissued HTTP
      session while still invalidating older sockets;
    - close behavior is observable without logging token material.
  - Tests: integration tests for each revocation source and a negative test
    proving a different user remains connected.
  - Docs: document active-socket revocation in auth, security, observability,
    and WebSocket references.

### P0 - serialize authoritative multiplayer mutations

- [x] Add per-session serialization for shared protocol state mutations.
  - Completed: `cbf529e6` serializes authoritative same-session mutations while
    allowing read-only and cross-session progress.
  - Original evidence (resolved): `ServerProtocol.handle_client` awaited handlers directly while
    every connection runs in its own task. `TableManager`,
    `GameSessionProtocolService`, and `CombatEngine._active` are shared mutable
    objects, and combat movement/rollback contains await points without a
    session command lock or queue.
  - Impact: simultaneous combat, table, sprite, wall, paint, or batch commands
    can interleave. This can produce lost updates, rollback of another user's
    accepted state, inconsistent broadcasts, or state/database divergence.
  - Preferred design: use one FIFO mutation queue or `asyncio.Lock` per game
    session. Keep read-only messages and socket sends outside the critical
    section where safe. Define which handlers mutate state instead of locking
    every ping and list request.
  - Acceptance criteria:
    - accepted mutations for one session have a deterministic order;
    - different sessions can progress concurrently;
    - database persistence and rollback correspond to the same serialized
      mutation;
    - disconnect/cleanup cannot destroy a protocol service while a mutation is
      still running;
    - batch requests cannot bypass the same ordering rule.
  - Tests: deterministic concurrent combat commands, simultaneous sprite/table
    edits, rollback isolation, disconnect during mutation, and cross-session
    concurrency. Add a focused load test after correctness tests pass.
  - Docs: update `STATE_OWNERSHIP.md`, `SERVER_ARCHITECTURE.md`,
    `PROTOCOL_BOUNDARY.md`, `BATTLE_FLOW.md`, and the testing strategy.

### P1 - remove blocking I/O from async request paths

- [x] Offload or replace the remaining synchronous database/storage work in
  active async handlers.
  - Completed across `d1b83bf5`, `42cf639d`, `148dd9c5`, `e9f50167`,
    `5c07dfa9`, `00bee6cf`, `411f022f`, `ea7f4288`, `4d55ccdd`,
    `a2e757d0`, `577e71cf`, `439b8713`, and `3dc0456d`.
  - Current boundary: synchronous HTTP routes use FastAPI's bounded AnyIO
    worker pool; mixed async persistence uses worker-owned sessions through
    bounded `run_blocking`; no ORM session is passed into an executor task.
  - Confirmed paths:
    - WebSocket handshake, durable session initialization, welcome-time ban and
      rules loading, autosave, and disconnect-time save;
    - chat send, history, and moderation;
    - paint stroke create/delete/clear and paint-template operations;
    - measurement create/delete/clear/sync;
    - combat duplicate lookup, accepted-command journal persistence, combat
      restore, character lookup, and table save callbacks;
    - session settings and active-table persistence;
    - remaining sprite, table, and character database fallbacks;
    - asset deletion, including the R2 request.
  - Impact: synchronous SQLAlchemy and boto3 work blocks the single asyncio
    event-loop thread. A 50 ms database or storage call delays every socket and
    HTTP coroutine on that worker for the same 50 ms. Paint, chat, combat, and
    autosave are the highest-frequency risks.
  - Implementation guidance:
    - introduce narrow synchronous service functions that create and close
      their own SQLAlchemy session inside the worker thread;
    - call those services through `asyncio.to_thread`, or adopt a reviewed
      async database/storage stack as a separate architectural change;
    - never move a task-scoped SQLAlchemy `Session` between threads;
    - preserve command ordering while moving persistence off-thread;
    - bound executor concurrency so a slow database cannot create an unbounded
      work queue.
  - Acceptance criteria:
    - no direct `SessionLocal`, synchronous query/commit, boto3, or synchronous
      session save remains in a high-frequency async handler;
    - service failures still rollback in-memory state where required;
    - a deliberately slow persistence fake does not delay an independent event
      loop heartbeat.
  - Tests: add event-loop responsiveness regressions for chat, paint,
    measurement, combat, autosave, and asset deletion, matching the existing
    character and asset tests.
  - Docs: update each affected feature guide and document the async persistence
    boundary in `SERVER_ARCHITECTURE.md` and `TESTING_STRATEGY.md`.

### P1 - make asset deletion recoverable

- [x] Replace the current R2-delete-before-database-commit sequence.
  - Completed: `3a6418a9` transactionally unlinks metadata and uses a durable,
    retryable, idempotent deletion outbox after commit.
  - Original evidence (resolved): `handle_asset_delete_request` deleted the R2 object while a
    database transaction is open, then deletes metadata and commits.
  - Impact: when R2 deletion succeeds and the database commit fails, rollback
    restores metadata that points to a missing object. The R2 call also holds a
    database transaction open and blocks the event loop.
  - Preferred design: unlink the asset from the session transactionally, mark
    an unreferenced object as pending deletion, commit, then process object
    deletion through an idempotent cleanup job/outbox. Record retry state and
    do not make user-facing success depend on an unrecoverable cross-system
    pseudo-transaction.
  - Acceptance criteria:
    - database commit failure never loses an R2 object;
    - R2 failure leaves a durable retryable deletion record;
    - repeated cleanup is idempotent;
    - assets with remaining session links are never removed;
    - audit events distinguish unlink, queued deletion, completed deletion,
      and permanent failure.
  - Tests: commit failure after unlink, R2 failure and retry, duplicate cleanup,
    concurrent unlink of the final two references, and event-loop
    responsiveness.
  - Docs: update asset/storage, backup/restore, observability, and security
    documentation.

### P1 - complete asset abuse controls for scale-out

- [x] Move short-window asset throttles to a shared limiter before enabling
  multiple workers or instances.
  - Completed: `3fd363b1` stores per-user token buckets in PostgreSQL, serializes
    updates across workers, covers filename and identifier download paths, and
    denies URL issuance with a distinct observable error when the store fails.
  - Acceptance criteria:
    - one identity has one effective burst/hour budget across workers;
    - limiter failure behavior is explicit and observable;
    - limits remain keyed by authenticated `user_id`, not filename, IP alone,
      username, or payload identity;
    - durable quotas remain the final storage guard.
  - Tests: shared-store concurrency, worker restart, key expiry, unavailable
    limiter behavior, and continued PostgreSQL quota serialization.
  - Docs: update environment variables, deployment, security, observability,
    and asset guides before changing worker count.

- [x] Decide and enforce a durable per-session asset-link quota.
  - Completed: `0ffde6bd` chose both a 1,000-link session ceiling and a
    250-link actor/session ceiling, counts pending reservations, makes duplicate
    linking idempotent, and serializes the final reservation in PostgreSQL.
  - Acceptance criteria: define whether the quota belongs to the session, the
    actor, or both; make duplicate linking idempotent; serialize final-link
    reservation; and return a stable quota error.
  - Tests and docs: add cross-worker link-reservation tests and document the
    chosen limit in asset, environment, and security references.

### P1 - restore the intended Rust/WASM boundary

- [x] Move HTTP asset fetching and browser download orchestration out of Rust.
  - Completed: `41b24631` makes TypeScript own fetch, presigned URLs, retries,
    Blob/object-URL lifetime, and cache orchestration; Rust only hashes bytes.
  - Original evidence (resolved): Rust `AssetManager::download_asset` created a browser `Request`,
    calls `window.fetch`, reads the response, and owns a download queue.
  - Impact: this contradicts the rule that TypeScript owns browser transport.
    It couples the compute engine to HTTP/CORS behavior and makes transport
    failures harder to observe and test at the normal browser boundary.
  - Preferred design: TypeScript fetches authorized bytes and passes an
    `ArrayBuffer` or typed array through `WasmRuntimePort`. Rust may calculate
    xxHash, validate bytes, or perform other measured CPU-heavy work.
  - Acceptance criteria:
    - no Rust module calls `fetch`, owns URLs, or implements download retries;
    - feature code still reaches Rust only through `WasmRuntime`;
    - presigned URL handling remains in TypeScript;
    - hash mismatch remains fail-closed.
  - Tests: TypeScript transport tests, Rust byte/hash tests, runtime boundary
    tests, and real browser WASM tests.
  - Docs: update `RUST_WASM_ENGINE.md`, `WASM_REACT_BOUNDARY.md`,
    `WEB_UI_ARCHITECTURE.md`, the feature map, and the asset guide.

- [x] Replace the large cloning in-WASM asset byte cache.
  - Completed: `41b24631` removed the Rust byte cache. `BrowserAssetCache` uses
    a bounded 64 MiB browser Blob cache, returns metadata/object URLs rather
    than cloned WASM vectors, and deterministically revokes URLs on eviction,
    clear, and disposal.
  - Original state (resolved): Rust retained up to 100 MiB of `Vec<u8>` values and
    `get_asset_data` clones the complete byte vector on every access.
  - Impact: WASM linear memory growth and cross-boundary copies can duplicate
    large assets and cause avoidable pauses or out-of-memory failures.
  - Acceptance criteria: define the real cache owner, avoid full-byte clones,
    release object URLs/textures deterministically, and base cache limits on
    measured browser memory behavior.
  - Tests: repeated large-asset access, eviction, disposal, hash-cache hits,
    and memory/performance benchmarks.

### P2 - finish protocol payload contracts

- [ ] Generate discriminated TypeScript payload types and runtime schemas for
  the complete WebSocket registry.
  - Current truth: the canonical registry contains 173 message types, while
    only a minority have type-specific conditional JSON schemas.
    `Message.data` remains `Record<string, unknown>`, so handlers frequently
    cast or manually inspect untyped values.
  - Scope:
    - define request, response, and broadcast direction for every retained
      message;
    - add payload schemas for all active message types;
    - generate discriminated TypeScript unions from the canonical schema;
    - make handler registration and `createMessage` type-safe by message type;
    - reject invalid payloads before domain handlers run;
    - keep intentional extension points explicit instead of using unrestricted
      `additionalProperties` everywhere.
  - Acceptance criteria: no ordinary protocol caller needs `as unknown as`,
    schema generation is deterministic, Python and TypeScript bindings cannot
    drift, and unsupported directions fail closed.
  - Tests: generator freshness, one valid/invalid payload pair per schema
    family, browser parse tests, Python parse tests, and boundary integration
    tests.
  - Docs: update protocol boundary, WebSocket reference, add-message guide,
    and testing strategy. This work remains deferred until the higher-priority
    authority and concurrency issues are complete.

### P2 - complete or remove visible placeholder behavior

- [x] Implement advanced measurement-template placement or hide the tool.
  - Completed by hiding the unfinished selectable UI in `c629c95f`; the
    internal primitives remain latent until the full placement contract exists.
  - Original state (resolved): selecting a template and clicking the canvas returned
    `Template placement is not implemented yet.`
  - Acceptance criteria: either implement preview, placement, units, snapping,
    persistence/sync, role authorization, undo, and reconnect behavior, or
    remove the selectable tool until that complete flow exists.
  - Tests: component interaction, geometry, protocol authorization, multi-client
    sync, reconnect, and Rust rendering where used.
  - Docs: correct `MEASUREMENT_AND_PAINTING.md` so it does not imply that an
    unavailable template-placement workflow is complete.

- [x] Implement or remove optimized background and weather renderer controls.
  - Completed in `9ddddc5c` by deleting the production-reachable simulated
    controls, placeholder service, styling, and misleading documentation.
  - Original state (resolved): background LOD code loaded a texture but did not configure
    the intended renderer layer; weather apply/remove methods only log.
  - Acceptance criteria: either add explicit `WasmRuntimePort` operations with
    cleanup and rendering tests, or remove the exposed configuration controls
    and service claims.
  - Docs: document only the background behavior that is visibly implemented.

- [x] Make the keyboard-shortcut display react to InputManager state.
  - Completed in `a1cf2c69` with a typed read-only external-store snapshot,
    subscription lifecycle, immutable selection values, and regression tests.
  - Original state (resolved): the hook read private `inputManager['context']` once and
    contains no event subscription, so enabled/disabled shortcut state can
    become stale.
  - Acceptance criteria: expose a typed read-only context/subscription API,
    update the display on selection, clipboard, undo/redo, and focus changes,
    and unsubscribe on unmount.
  - Tests: state transitions, cleanup after failed tests/unmount, and no access
    to private fields.

### P2 - repair quality-gate and documentation gaps

- [x] Make the documented core-table test command work in a clean checkout.
  - Completed in `0ab70b09`; exact package-local `pytest -q` passes 209 tests
    without a shell-specific `PYTHONPATH` override.
  - Original reproduction (resolved): `pytest -q` from `packages/core-table` failed collection with
    14 `ModuleNotFoundError: core_table` errors. `PYTHONPATH=.` makes all 209
    tests pass.
  - Preferred fix: configure the test environment/package installation in
    `pyproject.toml` or workspace tooling instead of requiring an undocumented
    shell-specific environment variable.
  - Acceptance criteria: the exact command in `docs/current/TESTING_STRATEGY.md`
    passes from a clean checkout and in CI.

- [x] Return Pyright to a clean baseline after the deferred type-safety work.
  - Current diagnostics:
    - error in `packages/core-table/tests/test_table_manager.py` when assigning
      an undeclared `crud` attribute to a module;
    - two missing-module-source warnings for `jsonschema` imports in
      `core_table/protocol.py`.
  - Current 2026-08-17 result: one error in the dynamic `database.crud` test
    double and two `jsonschema` source warnings because the local `.venv311`
    was not provisioned with the already-declared core-table dependency. Two
    temporary `main.py` await warnings were fixed in `3dc0456d`.
  - Acceptance criteria: pinned Pyright reports zero errors and warnings for
    all configured files without hiding project-owned diagnostics, and the
    same command runs in CI after the editable core-table install.
  - Completed: `4c0670f0`; Pyright 1.1.411 analyzes 232 files with zero errors
    and warnings, and CI provisions Node plus the declared Python dependency.

- [x] Repair the headless Chrome Rust/WASM test runner.
  - Current result: native Rust tests and 33 Node WASM tests pass, but
    `wasm-pack test --headless --chrome` exits after a WebDriver HTTP 404 while
    closing the browser test window.
  - Acceptance criteria: the exact documented command runs the browser-only
    WebGL/DOM tests locally and in CI with pinned compatible browser, driver,
    wasm-pack, and wasm-bindgen versions.
  - Tests/docs: keep a CI job for the browser-only suite and document its
    required browser/tool versions.
  - Completed: `8d10ce86`; the pinned wrapper runs all four browser-only tests
    against Chrome/ChromeDriver 151.0.7922 and verifies the Windows driver
    archive checksum.

- [x] Refresh current documentation after the corresponding code fixes.
  - Completed: `721a7f86` source-audited the token reference and documented the
    25-combination 4.5:1 contrast gate.
  - Completed: Rust/WASM transport and Blob-cache documentation, auth/session
    live-authority documentation, measurement-template availability, removed
    background controls, HTTP threading, OAuth state storage, and testing
    strategy were source-audited and updated through 2026-08-17.
  - Acceptance criteria: source-audit dates are updated only after checking the
    complete relevant flow, status is marked `partial` wherever a known gap
    remains, and `python scripts/check_docs.py` passes.

### 2026-08-19 release verification

- Server: 1,138 passed, 10 skipped, 79.80% total coverage. The skipped set
  includes disposable PostgreSQL-only checks, so SQLite success is not proof
  of hosted locking and migration behavior.
- Core-table: the documented package-local `pytest -q` command passes 209
  tests without an environment override.
- Web UI: 2,760 passed across 190 files. TypeScript, the production Vite build,
  Stylelint, CSS token validation, and all 25 theme/accent contrast combinations
  passed.
- Rust: formatting, Clippy with warnings denied, native tests, and the wasm32
  build passed. Native tests: 244 passed. Node WASM tests: 33 passed. The pinned
  Chrome runner passed all 4 browser-only WebGL/DOM tests.
- Ruff and `scripts/check_docs.py` passed. Pinned Pyright 1.1.411 analyzed 232
  files with zero errors and warnings.
- Security-sensitive server coverage remains uneven: connection/session,
  asset protocol, and combat protocol modules need focused behavioral tests in
  addition to the total coverage threshold.

## Core

### GUI
1. [x] Complete character representation and make gui for character manager
2. [x] Complete gui to support all operations with sprites, character, character manager. Including:
    - [x] Manage tables
    - [ ] Create characters and npc
    - [x] Layer managment
    - [x] Tools like measure, paint
    - [ ] Create monsters from compendium
3. [x] All settings move to menu with redacting
4. [x] Server operations
5. [ ] Maybe switch gui lib??????
6. [x] Connection status indication with all players

### SDL app
1. [x] Rotation for sprites
2. [x] Right click context menu
3. [x] Develop and implement working space with table. Only table is implemented now
4. [x] Scale options refactor
5. [x] Layer render system
6. [x] Test for NET connection lost, bad internet and implement logic in client_sdl for it
7. [x] Implement file storage with adequate functional
8. [ ] Basic manual fog of war
9. [ ] Audio and video(?) support

### Virtual Table
1. [x] Implement proper DND-like character system with actions, hp, AC, rolls, spells, items
2. [x] Connect virtual table characters and sdl table tokens with sync hp and etc
3. [x] Actions characters can do to GUI
4. [x] Level up system????
5. [x] Implement basic DND mechanic like long rest and spell slots
6. [x] Connection managment on serverside
7. [x] Log actions and revert system

### Common
1. [x] Unit tests, integration tests
2. [x] Documentation
3. [x] Deployment and host

### Server
1. [x] Implement clean protocol-implementation. For now it's for testing pretty dirty
2. [x] Make proper interface and layer abstarctions

## Optional

### GUI
1. [x] Make it more fantasy, glancy buttons and icons

### SDL app
1. [x] Realtime context reading, like walls for movement, measure distance, render possible movement, select target, possible attack
2. [ ] Animations maybe?
3. [x] ~~Light system with fog of war dynamical for each character. And point of view light. Light for maps.~~
4. [x] Layer with hight to implement point of view for attacks, for hiding and etc
5. [ ] 3d regime?????

### Virtual Table
1. [ ] Implement complex dnd mechanic like spells effect, auto-attack, show possible movement. Traps and skill usage on map
2. [x] Character manager with easy step-by-step creation
3. [ ] Rewrite in GO
4. [ ] Implement tools for map building. Use AI to generate maps, encounters, loot
5. [ ] Implement AI for monsters and automate their actions


### New Discovery
[x] For action protocol consistenly use or name or id. 

### WORK NOW:
1) [x] Implement proper client storage manager - client_protocol and storage_manager
2) [x] Implement flow for assets
3) [x] Implement render managment for layers
4) [x] Light objects

### Issues:
1) [ ] Proper character window logic



