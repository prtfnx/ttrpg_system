# Tables and canvas

Audience: contributors changing table management, active-table switching,
canvas bootstrap, or table settings.

Status: current but partial.

Last source audit: 2026-07-09

## Source owners

- `apps/server/service/protocol/tables.py`: table list, create, load, delete,
  active-table, table update, scale, move, and table settings handlers.
- `apps/server/service/protocol/session.py`: layer settings and active-table
  database helpers.
- `apps/server/database/models.py`: `VirtualTable`, `GamePlayer.active_table_id`,
  walls, paint strokes, layer settings, and table lighting columns.
- `apps/web-ui/src/store.ts`: table list, active table, optimistic create,
  switch, delete, units, walls, and table lighting state.
- `apps/web-ui/src/features/table/`: table management panels, sync panel,
  thumbnails, templates, and table hooks.
- `apps/web-ui/src/features/canvas/components/GameCanvas.tsx`: canvas surface.
- `apps/web-ui/src/features/canvas/components/GameClient.tsx`: game shell,
  WebSocket connection, runtime user context, and canvas/panel layout.
- `apps/web-ui/src/lib/wasm/runtime/`: TypeScript boundary to the Rust renderer.
- `packages/rust-core/src/`: render engine, table manager, input, lighting,
  fog, paint, and sprite rendering.

## What the feature does

A table is one playable map or scene inside a session. The browser keeps a
table list and active table in the game store. The server keeps persisted
`VirtualTable` rows and serves the complete table payload when a client asks
for a table.

The canvas is the interactive render surface. React owns panels, selected
tools, active table choice, and protocol calls. Rust/WASM owns the render
engine and canvas-side geometry/rendering work through `WasmRuntime`.

## Main workflows

Table list:

1. Browser calls `requestTableList()`.
2. `clientProtocol.ts` sends `table_list_request`.
3. `handle_table_list_request()` returns `table_list_response`.
4. The browser transforms server tables and stores them in `useGameStore`.

Create table:

1. `createNewTable()` adds a local optimistic table with a `local_` id.
2. The store sends `new_table_request` with `local_table_id`.
3. The server creates the table through table actions and persists when a
   session id is available.
4. The server broadcasts `table_update` with `operation: create` and returns
   `new_table_response` to map the local id to server data.

Switch table:

1. `switchToTable()` validates the id and calls `setActiveTableId()`.
2. `setActiveTableId()` sends `table_active_set` when protocol is available.
3. The server writes `GamePlayer.active_table_id`.
4. The browser asks for `table_request` and passes received table data to
   `WasmRuntime.handleTableData()`.

DM force switch:

- The browser sends `table_active_set_all`.
- The server requires a DM role, broadcasts `table_active_set_all_response`,
  and persists the target active table for connected non-DM users.

## Protocol messages

Table management uses these current WebSocket messages:

- `table_list_request`
- `table_list_response`
- `new_table_request`
- `new_table_response`
- `table_request`
- `table_response`
- `table_update`
- `table_delete`
- `table_active_request`
- `table_active_response`
- `table_active_set`
- `table_active_set_all`
- `table_active_set_all_response`
- `table_settings_update`
- `table_settings_changed`
- `layer_settings_update`
- `table_scale`
- `table_move`

Sprite-category `table_update` payloads are rejected. Use dedicated sprite
messages for sprite changes.

## State and persistence

Server-owned:

- table rows and dimensions;
- per-table dynamic lighting, fog exploration mode, ambient light, grid units,
  grid toggles, and colors;
- persisted walls, paint strokes, and layer settings for join-time sync;
- each player's active table.

Browser-owned:

- active UI panel state;
- local optimistic table rows before server confirmation;
- active tool and canvas interaction state;
- transformed table list used by panels.

WASM-owned:

- render engine state for the active table;
- canvas event interpretation and draw-time state reached through
  `WasmRuntime`.

## Tests to run

- `apps/server/tests/unit/test_tables_protocol.py`
- `apps/server/tests/unit/test_game_session_protocol.py`
- `apps/web-ui/src/lib/websocket/__tests__/clientProtocol.test.ts`
- `apps/web-ui/src/features/table/**/__tests__/`
- `apps/web-ui/src/features/canvas/components/**/__tests__/`
- `apps/web-ui/src/features/canvas/hooks/**/__tests__/`
- `packages/rust-core/tests/wasm_browser.rs`
- `packages/rust-core/tests/wasm_node.rs`

Use server protocol tests for authority and persistence changes. Use Vitest for
React store, protocol, and panel behavior. Use Rust/WASM tests when the render
engine contract changes.

## Known edges

- Table creation is optimistic in the browser. Keep `local_table_id` mapping
  working when changing create responses.
- Some join-time payloads are assembled from both in-memory table state and
  database fallbacks after server restart.
