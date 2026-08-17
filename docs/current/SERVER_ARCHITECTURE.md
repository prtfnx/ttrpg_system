# Server architecture

Audience: contributors changing the Python server or shared domain package.

Status: usable.

Last source audit: 2026-08-17

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
whole synchronous handshake lookup runs through `asyncio.to_thread`; the worker
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

Chat write, history, and moderation handlers follow the same rule: validate
the command on the event loop, execute the complete database transaction and
serialization in a synchronous worker function, then deliver the plain result
over WebSocket on the event loop.

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
service owns its lock, work in separate game sessions remains concurrent.

`TableManager` starts empty. It contains only tables created for or loaded
from the current session. Missing table IDs return no table; the domain layer
does not create or substitute an unpersisted default table.

## Protocol handlers

Protocol behavior is split by domain under `apps/server/service/protocol/`.

- `base.py`: main `ServerProtocol` class and handler registration.
- `tables.py`: table CRUD, active table, settings.
- `sprites.py`: sprite CRUD and live previews.
- `walls.py`: wall and door operations.
- `paint.py`: paint stroke sync.
- `assets.py`: asset upload, download, hash, list, delete.
- `players.py`: player status, list, kick, ban.
- `characters.py`: character save, load, update, rolls, logs.
- `combat.py`: combat, turns, conditions, cover, opportunity attacks.
- `session.py`: layer settings, game mode, session rules.
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

`protocol/combat.py` should stay a boundary layer: parse the websocket message,
build context, call the service, and send filtered responses.

## Domain package

The server imports `packages/core-table` for reusable tabletop behavior:

- `core_table.protocol`: shared message model and message types.
- `core_table.server`: table manager.
- `core_table.table`: virtual table model.
- `core_table.combat`, `game_mode`, `session_rules`: game systems.
- `core_table.pathfinding`, `dice`, `conditions`: reusable rules utilities.

Keep reusable tabletop rules in `core-table`. Keep FastAPI, database,
WebSocket, and deployment behavior in `apps/server`.

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
