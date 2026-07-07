# Server architecture

The server is a FastAPI app with WebSocket sessions and a Python tabletop
domain package behind it.

## Entry points

- `apps/server/main.py` creates the FastAPI app, middleware, static mounts,
  templates, and lifecycle startup.
- `apps/server/routers/` contains HTTP route groups.
- `apps/server/api/game_ws.py` contains WebSocket entry points.
- `apps/server/database/` contains SQLAlchemy models, CRUD, migrations, and
  session persistence helpers.

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

`GameSessionProtocolService` owns session protocol state:

- Creates a `TableManager`.
- Creates `ServerProtocol`.
- Tracks clients by client id and WebSocket.
- Loads tables from the database when available.
- Saves session state through database helpers.
- Coordinates server-side asset permissions.

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
  `apps/server/service/protocol/` mixin and register it in `base.py`.
- Add combat mutation behavior: add a `combat_command` command type and handler
  in `CombatCommandService`, then expose it through `useCombatCommands` on the
  client.
- Add reusable game rule behavior: use `packages/core-table/core_table/`.
- Add persistence: update `apps/server/database/` and add a migration.

## Verification

- Server tests: `pytest tests/ -q` from `apps/server`.
- Server lint: `ruff check .` from `apps/server`.
- Core table tests: `pytest -q` from `packages/core-table`.

Focused combat tests live mainly in:

- `apps/server/tests/unit/test_combat_command_service.py`;
- `apps/server/tests/unit/test_combat_protocol.py`;
- `apps/server/tests/unit/test_combat_state_presenter.py`;
- `apps/server/tests/unit/test_combatant_factory.py`;
- `apps/server/tests/unit/test_combat_persistence.py`.
