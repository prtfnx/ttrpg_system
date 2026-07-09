# Walls, lighting, fog, and vision

Audience: contributors changing walls, doors, fog of war, dynamic lighting,
vision, or layer visibility.

Status: current but partial.

Last source audit: 2026-07-09

## Source owners

- `apps/server/service/protocol/walls.py`: wall create, update, remove, batch
  create, and door toggle handlers.
- `apps/server/service/protocol/tables.py`: table settings, table load, fog
  rectangle updates, and join-time wall/layer/fog sync.
- `apps/server/service/protocol/session.py`: layer settings updates.
- `apps/server/database/models.py`: `Wall`, table lighting columns, layer
  settings, fog-related table state, and token vision columns.
- `apps/web-ui/src/features/fog/`: fog rectangle panel and server update flow.
- `apps/web-ui/src/features/lighting/`: lighting panel and vision service.
- `apps/web-ui/src/features/canvas/components/WallConfigModal.tsx`: wall and
  door editing UI.
- `apps/web-ui/src/features/canvas/components/LayerPanel.tsx`: layer controls.
- `packages/rust-core/src/wall_manager.rs`: WASM wall state.
- `packages/rust-core/src/fog.rs`: fog texture and dynamic vision polygons.
- `packages/rust-core/src/lighting/`: visibility and lighting helpers.

## What the feature does

Walls are persistent table geometry. They can block movement, light, sight, or
sound. A wall can also be a door with `closed`, `open`, or `locked` state.

Fog rectangles are DM-authored hide/reveal masks for a table. Dynamic lighting
adds per-token and per-light vision polygons on top of fog state. Vision
sources come from controlled sprites with vision radius fields.

## Protocol messages

Wall and door messages:

- `wall_create`
- `wall_update`
- `wall_remove`
- `wall_batch_create`
- `wall_data`
- `door_toggle`

Table, fog, and layer messages:

- `table_settings_update`
- `table_settings_changed`
- `table_update` with `type: fog_update`
- `table_response`
- `layer_settings_update`

## Authority rules

Wall create, update, remove, and batch create are DM-only. The server writes
the wall through table actions, then broadcasts `wall_data`.

Door toggle uses the wall handler, not a client-only shortcut:

- spectators cannot toggle doors;
- players with interaction permission can toggle open and closed doors;
- locked doors require a DM;
- non-door walls are rejected.

Table lighting settings are DM-only. The server validates fog mode, ambient
light, grid units, grid toggles, and color hex values before persisting and
broadcasting `table_settings_changed`.

Layer settings are DM-only and persist into `VirtualTable.layer_settings`.

## Persistence

`Wall` stores wall id, table id, endpoints, type, blocking flags, door flags,
secret flag, direction, creator, and timestamps.

`VirtualTable` stores:

- `layer_visibility`;
- `layer_settings`;
- `dynamic_lighting_enabled`;
- `fog_exploration_mode`;
- `ambient_light_level`;
- grid size, distance unit, grid toggles, and colors.

Fog rectangles are updated through table actions from `table_update` with
`fog_update`. `table_response` includes walls, layer settings, and paint/fog
table data needed for join-time sync.

Token vision fields live on `Entity`; see
[Sprites, tokens, and entities](SPRITES_TOKENS_AND_ENTITIES.md).

## Browser and WASM flow

`FogPanel` draws hide/reveal rectangles on the canvas, updates the render
engine immediately, and sends the rectangle sets to the server through
`protocol.updateFog()`.

`LightingPanel` manages light sprites on the `light` layer. Light behavior is
stored in sprite metadata and rendered through WASM.

`vision.service.ts` watches the game store. When dynamic lighting is enabled,
it:

1. gets obstacle segments from the render engine;
2. finds controlled sprites with vision radius;
3. computes visibility polygons through `WasmRuntime`;
4. adds or removes fog polygons on the render engine;
5. optionally keeps explored polygons when `fog_exploration_mode` is
   `persist_dimmed`.

## Tests to run

- `apps/server/tests/unit/test_walls_protocol.py`
- `apps/server/tests/unit/test_dynamic_lighting.py`
- `apps/server/tests/unit/test_tables_protocol.py`
- `apps/web-ui/src/features/fog/components/__tests__/FogPanel.test.tsx`
- `apps/web-ui/src/features/lighting/components/__tests__/LightingPanel.test.tsx`
- `apps/web-ui/src/features/lighting/services/__tests__/vision.service.test.ts`
- `apps/web-ui/src/features/canvas/components/__tests__/WallConfigModal.test.tsx`
- `apps/web-ui/src/features/canvas/utils/__tests__/wallVisuals.test.ts`
- `packages/rust-core/tests/wasm_browser.rs`
- `packages/rust-core/tests/wasm_node.rs`

Use server tests for wall authority and persistence. Use Vitest for panel,
store, and protocol behavior. Use Rust/WASM tests for render-engine fog,
vision, or wall changes.

## Known edges

- Dynamic lighting is computed client-side from server-synced table and token
  data. Keep server role checks on the settings and wall mutation paths.
- Light sources are sprites on the `light` layer rather than a separate server
  table.
