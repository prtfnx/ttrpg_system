# Server architecture

Audience: contributors changing the Python server or shared domain package.

Status: usable.

Last source audit: 2026-09-10

The server is a FastAPI app with WebSocket sessions and a Python tabletop
domain package behind it.

## Entry points

- `apps/server/main.py` creates the FastAPI app, middleware, static mounts,
  templates, and lifecycle startup.
- `apps/server/routers/` contains HTTP route groups.
- `apps/server/api/game_ws.py` contains WebSocket entry points.
- `apps/server/database/` contains SQLAlchemy models, CRUD, migrations, and
  session persistence helpers.

Database timestamp columns use a naive UTC representation for compatibility
across SQLite tests and PostgreSQL. Produce those values with
`apps/server/utils/time.py::utc_now`; do not call the deprecated
`datetime.utcnow()` API or insert local time.

## HTTP execution model

HTTP path operations that use the server's synchronous SQLAlchemy, email, or
filesystem APIs are normal `def` functions. FastAPI dispatches those operations
to its worker thread pool, keeping blocking calls off the application event
loop. Routes that await an async provider or live WebSocket operation remain
`async def`; their synchronous transaction must be a narrow worker function
that owns and closes its SQLAlchemy session.

Low-frequency account-revocation and session-administration routes instead
remain normal `def` handlers for their complete SQLAlchemy transaction. After
the commit succeeds, they use AnyIO's worker-to-event-loop bridge to close,
update, or notify live sockets. This preserves commit-before-revocation
ordering without running the transaction on the event loop.

## Session runtime

Game WebSockets flow through this path:

```text
game_ws.py -> ConnectionManager -> GameSessionProtocolService -> ServerProtocol
```

`ConnectionManager` owns socket lifecycle:

- Accepts clients into a session.
- Stores socket-to-user metadata.
- Creates or reuses a session protocol service.
- Loads or creates persistent session state.
- Disconnects clients and cleans session state.

The WebSocket endpoint opens its handshake database session only after origin
validation. Authentication and membership checks share that short-lived
session, and a `finally` block closes it before the long-lived socket loop. The
whole synchronous handshake lookup runs through `utils.blocking.run_blocking`; the worker
creates and closes its own SQLAlchemy session.

The connection manager does not retain one SQLAlchemy `Session` for the
lifetime of a game. It gives each protocol service a task-scoped session
registry. The handshake, client initialization, each inbound protocol message,
and each persistence operation release their current task session when the
logical operation ends. Delayed table saves also release their own task
session.

Durable protocol initialization, mutation-triggered autosave, and final
disconnect save also run in worker threads. Each worker resolves a fresh
session from the task/thread-scoped registry. Never construct an ORM `Session`
on the event-loop thread and pass that instance to `asyncio.to_thread`.

Migrated async-to-sync paths use `utils.blocking.run_blocking`. Its semaphore
applies admission control on the server process's application event loop before
work is submitted to Python's executor, so a slow database or object store
cannot grow the executor queue without bound. Configure the limit with
`BLOCKING_WORKER_CONCURRENCY`; cancellation while waiting releases capacity
without submitting work. Cancelling an already-submitted coroutine keeps its
capacity reserved until the underlying thread finishes because Python cannot
stop a running thread.

Choice encounter loads/writes and join metadata hydration now use bounded
workers with fresh worker-owned sessions. Session mutation ownership orders
join restoration, registration and welcome enqueueing with choice transitions;
socket draining happens outside the lock. Admitted choice mutations retain
ownership through settlement/publication despite repeated cancellation. Cancelled
join reads cannot restore their late results. See [Encounters](features/ENCOUNTERS.md).

Sprite-control checks keep their in-memory fast path. Unloaded-token checks use
`service/sprite_control.py` with the authenticated numeric session ID, scoped
entity/character queries and normalized `CharacterPermission.can_control` grants.
Empty or malformed token controllers remain DM-only; storage errors deny.
Compendium token resolver initialization (mapping-file reads) and database asset
lookup execute together in a worker and return detached asset metadata. Existing
asset IDs skip this lookup. The worker limit covers submitted jobs; it does not
make every protocol handler nonblocking or add durable retry/outcome receipts.

Chat write, history, and moderation handlers follow the same rule: validate
the command on the event loop, execute the complete database transaction and
serialization in a synchronous worker function, then deliver the plain result
over WebSocket on the event loop.

Canvas database fallbacks follow it as well. Sprite quota/rules/character-link
lookups and table wall/layer/paint hydration or settings writes execute in
`canvas_persistence_service` through `utils.blocking.run_blocking`. Each helper owns its
ORM session and returns detached scalar/dictionary data; shared in-memory table
state is read or mutated only after control returns to the event loop.

Character protocol fallbacks follow the same ownership rule. Character and
draft manager calls, recipient permission queries, XP audit writes, and linked
token stat persistence run in workers. Direct protocol persistence lives in
`character_protocol_persistence_service`, creates a session inside the worker,
and returns detached token/table identifiers. In-memory character-token state
and WebSocket delivery remain on the event-loop thread.

A per-session lifecycle lock covers first-client protocol construction and
last-client cleanup. Concurrent first connections share one reconstructed
protocol service. A reconnect cannot attach to a service while its final save
and cleanup are running.

`GameSessionProtocolService` owns session protocol state:

- Creates a `TableManager`.
- Creates `ServerProtocol`.
- Tracks clients by client id and WebSocket.
- Loads tables from the database when available.
- Saves session state through database helpers.
- Coordinates server-side asset permissions.

Recognized protocol messages have one dispatch path. If a protocol handler
raises, `ConnectionManager` logs the exception, returns one generic `error`
message, and stops dispatch. It does not retry the message through the legacy
message switch.

`ServerProtocol` classifies handlers that mutate authoritative state and runs
them under one fair `asyncio.Lock` per session. Direct responses are sent after
the lock is released. Handler-owned broadcasts remain inside the mutation
operation, and bounded send timeouts prevent a peer from holding the lock
forever. Reads of shared in-memory session state use the same lock to avoid
observing state that may roll back. Ping, ephemeral previews, and independent
durable-store queries do not acquire it. Whole batch requests acquire the lock
once, so nested commands cannot bypass ordering. Sprite and table autosave runs
before the mutation releases the lock.

When the last socket leaves, `ConnectionManager` waits for all earlier queued
mutations before the final save and protocol cleanup. Because each protocol
service owns its lock, separate sessions do not share mutation ordering.
Remaining synchronous operations can still stall all work on the event loop;
independent locks do not guarantee responsiveness across sessions.

`TableManager` starts empty. It contains only tables created for or loaded
from the current session. Missing table IDs return no table; the domain layer
does not create or substitute an unpersisted default table.

## Protocol handlers

Protocol behavior is split by domain under `apps/server/service/protocol/`.

- `base.py`: main `ServerProtocol` class and handler registration.
- `tables.py`: table CRUD, active table, settings.
- `sprites.py`: sprite CRUD and live previews.
- `walls.py`: wall and door operations.
- `paint.py`: versioned paint-object commands, snapshots, and previews;
  blocking persistence uses worker-owned ORM sessions while validation and
  WebSocket delivery remain on the event loop. Legacy templates have no
  protocol module and are available only to the maintenance exporter.
- `measurements.py`: completed measurement sync with the same worker-owned ORM
  session boundary.
- `session.py`: session rules, game mode, layer settings, and player
  active-table persistence use worker-owned ORM sessions; accepted updates are
  broadcast only after the durable operation succeeds.
- `assets.py` and `asset_deletion_service.py`: asset transport plus
  transactional unlink and retryable R2 deletion outbox processing.
- `players.py`: player status, list, kick, ban.
- `characters.py`: character save, load, update, drafts, advancement, rolls,
  logs, and worker-offloaded linked-token persistence.
- `combat.py`: combat, turns, conditions, cover, opportunity attacks.
- `chat.py`: chat messages and history.
- `helpers.py`: shared send, broadcast, and session helpers.

`apps/server/service/server_protocol.py` is only a compatibility shim that
re-exports `ServerProtocol`.

## Combat services

Combat writes go through `apps/server/service/combat_command_service.py`.

Important supporting services:

- `CombatantFactory`: derives combatants from table tokens, linked
  characters, compendium/NPC data, and explicit DM display/core-stat
  overrides.
- `CombatPersistenceService`: persists accepted command journal rows and the
  latest combat snapshot with monotonic `state_version`.
- `CombatStatePresenter`: creates role-filtered combat views for DM, player,
  and spectator clients.
- `CombatEngine`: owns the live in-memory combat state for a session.

The async command path offloads duplicate lookup, accepted-command
persistence, restore, character lookup, movement rule loading/validation, and
table saves. Normal completion applies state versions, restoration, and
role-filtered delivery on the event loop. Cancelling `run_blocking` does not
stop an already running thread, so command ownership waits for that worker's
settlement. Pre-combat environment edits use `TableManager.save_table_async`,
which captures a detached snapshot on the event loop and creates a worker-owned
ORM session. Their table write lock remains held through SQL settlement.

Combat command settlement finishes before propagating cancellation, and
protocol dispatch keeps session ownership through peer publication. Repeated
cancellation cannot release that lock while SQL, rollback, or publication is
still pending. Focused regressions cover commit success/failure and a waiting
state reader. `test_combat_movement_transaction.py` also covers detached
environment-save inputs, failed saves, and cancellation during the snapshot
transaction.
Current terrain/cover commands require one DM command outside active combat;
see [Battle flow](BATTLE_FLOW.md).

Combat commit-response failures resolve the journal under a fresh session-row
barrier. Unavailable lookups quarantine the cache, serialized work, snapshots,
and empty-session cleanup; heartbeats remain available. A later authoritative
request installs and publishes the verified outcome before running its handler.
See [Battle flow](BATTLE_FLOW.md) for the recovery contract and regressions.

`protocol/combat.py` should stay a boundary layer: parse the websocket message,
build context, call the service, and send filtered responses.

## Domain package

The server imports `packages/core-table` for reusable tabletop behavior:

- `core_table.protocol`: shared message model and message types.
- `core_table.server`: table manager.
- `core_table.table`: virtual table model.
- `core_table.combat`, `game_mode`, `session_rules`: game systems.
- `core_table.pathfinding`, `dice`, `conditions`: reusable rules utilities.

Reusable rule modules live in `core-table`, but the package boundary is
currently incomplete: `TableManager` owns database persistence, wall actions
import server CRUD, and token/compendium resolution imports server database
code. Installing the package alone does not establish independence for these
paths.

TODO: extract infrastructure behind explicit server adapters when reuse needs
it. Keep new FastAPI, database, WebSocket, and deployment behavior in
`apps/server`; [ADR-005](decisions/ADR-005-core-table-is-reusable-domain-logic.md)
describes the intended boundary and its current exceptions.

## Change guide

- Add HTTP endpoint: use `apps/server/routers/`.
- Add WebSocket connection behavior: use `apps/server/api/game_ws.py` or
  `ConnectionManager`.
- Add protocol message behavior: add a handler in the matching
  `apps/server/service/protocol/` mixin, register it in `base.py`, and add its
  message type to `MUTATING_MESSAGE_TYPES` when it changes authoritative state.
- Add combat mutation behavior: add a `combat_command` command type and handler
  in `CombatCommandService`, then expose it through `useCombatCommands` on the
  client.
- Add reusable game rule behavior: use `packages/core-table/core_table/`.
- Add persistence: update `apps/server/database/` and add a migration.

## Verification

- Server tests: `pytest tests/ -q` from `apps/server`.
- WebSocket database-session tests:
  `pytest tests/unit/test_database_session_scope.py tests/unit/test_game_session_protocol.py tests/unit/test_game_ws_security.py tests/unit/test_connection_shutdown.py -q`
  from `apps/server`.
- Server lint: `ruff check .` from `apps/server`.
- Core table tests: `pytest -q` from `packages/core-table`.

Focused combat tests live mainly in:

- `apps/server/tests/unit/test_combat_command_service.py`;
- `apps/server/tests/unit/test_combat_protocol.py`;
- `apps/server/tests/unit/test_combat_state_presenter.py`;
- `apps/server/tests/unit/test_combatant_factory.py`;
- `apps/server/tests/unit/test_combat_persistence.py`.

## Persistence and process lifecycle

`main.AppState`, HTTP dependencies, and WebSocket endpoints use the same
`get_connection_manager()` singleton. Startup attaches PostgreSQL writer
ownership to this manager before loading live sessions. The ownership monitor
rejects replaced-server admission and closes its real sockets with retry code
1012. One Uvicorn worker is enforced by `scripts/migrate_and_start.py`.

Async full-table saves capture detached snapshots on the event loop and
persist them atomically in worker-owned sessions. Combat environment saves use
this path; wall command persistence also uses worker-owned sessions. Remaining
join/choice/permission/compendium database paths still require worker migration. Failed existing-table saves remain
pending; normal final disconnect retains failed state for retry, while a
superseded process retires
its obsolete cache. A failed command is not a universal in-memory rollback.
See [Persistence and application ownership](explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md).

`scripts/extract_protocol_mixins.py` is a retired one-off extractor that exits
without rewriting files. Edit the current protocol modules directly; the
`server_protocol.py` import shim does not make the extractor a supported tool.
