# Walls, lighting, fog, and vision

Audience: contributors changing walls, doors, fog of war, dynamic lighting,
vision, or layer visibility.

Status: current.

Last source audit: 2026-09-15

## Source owners

- `apps/server/service/protocol/walls.py`: wall create, update, remove, and
  door toggle handlers.
- `apps/server/service/protocol/tables.py`: table settings, table load, fog
  rectangle updates, and join-time wall/layer/fog sync.
- `apps/server/service/protocol/session.py`: layer settings updates.
- `apps/server/database/models.py`: `Wall`, table lighting columns, layer
  settings, fog-related table state, and token vision columns.
- `apps/web-ui/src/features/fog/`: fog rectangle panel and server update flow.
- `apps/web-ui/src/features/lighting/`: lighting panel and vision service.
- `apps/web-ui/src/lib/wasm/wasmBridge.ts`: completed light and wall drag
  persistence; callbacks from WASM must not synchronously re-enter the render
  engine.
- `apps/web-ui/src/features/canvas/components/WallConfigModal.tsx`: wall and
  door editing UI.
- `apps/web-ui/src/features/canvas/components/LayerPanel.tsx`: layer controls.
- `packages/rust-core/src/wall_manager.rs`: WASM wall state.
- `packages/rust-core/src/fog.rs`: fog texture and dynamic vision polygons.
- `packages/rust-core/src/geometry.rs`: CPU visibility-polygon ray casting.
- `packages/rust-core/src/lighting/`: WebGL point lights, stencil shadow
  volumes, and obstacle-segment storage.
- `packages/rust-core/src/render/draw.rs`: frame order and obstacle cache
  refresh.

## What the feature does

Walls are persistent table geometry. They can block movement, light, sight, or
sound. A wall can also be a door with `closed`, `open`, or `locked` state.

Fog rectangles are DM-authored hide/reveal masks for a table. Dynamic vision
adds per-token line-of-sight polygons and intersects them with per-light
visibility polygons. Vision sources come from sprites controlled by the
current user and having a positive vision radius.

The implementation has two related but distinct pipelines:

- visible point-light color is rendered by `LightingSystem` directly into the
  main WebGL framebuffer with additive blending and stencil shadow volumes;
- player visibility is computed as CPU ray-cast polygons by
  `compute_visibility_polygon`, stored as polygons in `FogOfWarSystem`, and
  composed into a darkness/fog overlay.

Consequently, a colored light and the area that it makes visible are generated
separately from the same light-sprite metadata. They use the same obstacle
shapes but can use different wall flags: `blocks_light` for colored light and
`blocks_sight` for token/light visibility polygons.

## Protocol messages

Wall and door messages:

- `wall_create`
- `wall_update`
- `wall_remove`
- `wall_data`
- `door_toggle`

Table, fog, and layer messages:

- `table_settings_update`
- `table_settings_changed`
- `table_update` with `type: fog_update`
- `table_response`
- `layer_settings_update`

## Authority rules

Wall create, update, and remove are DM-only. The server writes the wall through
table actions, then broadcasts `wall_data`. Wall identifiers, table ownership,
and creator identity are server-owned: creation accepts only endpoints and
allowlisted wall properties, while updates accept a non-empty allowlist of
mutable properties. The canonical JSON Schema rejects unknown properties,
invalid enum values, non-boolean flags, and coordinates outside the protocol's
maximum canvas before dispatch. Table actions also validate endpoints against
the selected table's actual dimensions before persistence. The unused
partial-success `wall_batch_create` command was removed;
a future import API must define atomicity and bounded batch behavior explicitly.

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

The server is authoritative for persistent walls, table lighting settings,
fog data, entity vision fields, and light sprites. The browser store mirrors
that state. `WasmRuntime` owns the one live `RenderEngine`, hydrates table
state into it, and runs its animation frame loop.

The frame path is:

```text
map -> grid -> ordinary layers -> refresh obstacle segments when dirty
    -> additive point lights with stencil shadows -> paint -> fog/vision overlay
    -> selection and tool previews
```

`FogPanel` draws hide/reveal rectangles on the canvas, updates the render
engine immediately, and sends the rectangle sets to the server through
`protocol.updateFog()`. Persisted fog is a separate mask from dynamic vision.

`LightingPanel` manages light sprites on the `light` layer. A light's color,
intensity, radius, game-unit radius, and on/off state are stored in sprite
metadata; its `x`/`y` fields are the light origin. Presets start with D&D-style
distances and are converted through the active table's unit converter. The
panel registers those lights with `LightingSystem` and persists changes as
sprite protocol messages.

For each enabled light on the active table, `LightingSystem`:

1. clears the stencil buffer for that light;
2. projects every nearby, undirected blocking segment away from the light into
   a shadow quad and writes the union to stencil value 1;
3. draws a 64-segment radial-gradient circle only where stencil equals 0;
4. restores WebGL color, blend, attribute, and stencil state before processing
   the next light.

Segments are undirected: endpoint order and the side on which a light is
placed do not change whether a wall casts a shadow. Each light has an
independent stencil mask. Point-light colors accumulate additively.

`vision.service.ts` watches the game store. When dynamic lighting is enabled,
it:

1. gets separate sight-blocking and light-blocking obstacle segments from the
   render engine;
2. finds sprites controlled by the current user, or the selected user during
   DM preview, with a positive vision radius;
3. places each vision origin at the sprite's current visual center;
4. converts game-unit vision and darkvision radii to pixels, falling back to
   legacy pixel fields;
5. casts rays at every obstacle endpoint with small angular offsets plus 32
   regular rays, clips each ray to the nearest segment or maximum radius, and
   angle-sorts the result into a visibility polygon;
6. builds equivalent visibility polygons for enabled light sprites using the
   light-blocking segments;
7. adds/removes those polygons in `FogOfWarSystem`; in `persist_dimmed` mode it
   also writes a session-local `explored_*` polygon when a source moves.

The vision texture encodes outside vision as 1.0, ordinary vision as 0.75,
explored space as 0.65, darkvision as 0.5, and lit space as 0.0. Light polygons
are stencil-gated to the union of the current user's vision/darkvision
polygons, so a remote light does not reveal space the user's tokens cannot see.
The final fog shader applies persistent fog first, then vision and ambient
light. DMs bypass dynamic vision unless they explicitly start player preview.

## Obstacle sources and invalidation

Both pipelines consume flat world-space segments in
`[x1, y1, x2, y2, ...]` form:

- walls with `blocks_light` feed point-light shadows;
- walls with `blocks_sight` feed visibility ray casting;
- open doors feed neither pipeline; closed and locked doors follow their
  blocking flags;
- polygon obstacle sprites contribute their closed vertex loops;
- every other sprite on the `obstacles` layer contributes its rotated,
  scaled rectangular perimeter. Circles and line sprites therefore use a
  rectangle approximation for occlusion.

Adding, removing, moving, resizing, scaling, rotating, pasting, or moving a
sprite into or out of the obstacle layer marks the render engine's obstacle
cache dirty. Wall CRUD, endpoint dragging, and translation do the same. The
next frame rebuilds point-light obstacle segments. `vision.service.ts` watches
wall and sprite state and schedules visibility recomputation on the next
animation frame; it fingerprints the complete segment buffer to avoid stale
polygons.

## WASM callback rule

An exported `RenderEngine` method taking `&mut self` owns wasm-bindgen's mutable
borrow until it returns to JavaScript. Runtime callbacks invoked from inside
that method must not synchronously call another exported method on the same
engine. Completed wall drags therefore defer the store update and network send
to a microtask. The store may then forward the authoritative endpoints to
`update_wall()` after `handle_mouse_up()` has released its borrow.

## Tests to run

- `apps/server/tests/unit/test_walls_protocol.py`
- `packages/core-table/tests/test_protocol_schema.py`
- `apps/web-ui/src/shared/protocol/__tests__/messageProtocol.test.ts`
- `apps/web-ui/src/lib/websocket/__tests__/clientProtocol.test.ts`
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

## Current limitations

- Dynamic lighting is computed client-side from server-synced table and token
  data. Keep server role checks on the settings and wall mutation paths.
- Light sources are sprites on the `light` layer rather than a separate server
  table.
- The point-light renderer and fog/vision compositor are separate passes. They
  share inputs but do not share one visibility mesh, so discrepancies are
  possible at polygon edges.
- Non-polygon obstacle sprites use rotated rectangles; circles do not yet have
  curved occluders, and line shapes use their thin bounding rectangle.
- Point-light shadow culling uses segment midpoint distance and a fixed
  10,000-world-unit extrusion. Very long segments or unusually large tables
  can leak light.
- Each token, darkvision source, and light independently calls the CPU
  visibility function, which rebuilds its spatial index for the same segment
  buffer on every call. The point-light path also scans every segment per
  light; its stored spatial grid is not queried during rendering.
- Visibility uses endpoint rays plus 32 regular rays. It is deterministic and
  adequate for ordinary maps but is not a robust computational-geometry
  visibility solver for collinear/overlapping segments or a source exactly on
  a wall.
- `persist_dimmed` does not yet provide a cumulative, server-persisted explored
  map. The browser reuses one `explored_<sprite>` id and writes the newly
  computed polygon, so older footprints are not accumulated and disappear on
  reload.
- `direction` is persisted and shown in the wall UI, but lighting and vision
  currently treat every blocking segment as two-sided. Movement and sound
  flags belong to other systems and do not affect these render passes.
- The light panel's incremental registration is strongest for local edits.
  A later refactor should make remote metadata updates explicitly reconcile
  every existing WASM light property rather than relying on add/remove and
  local setter calls.
