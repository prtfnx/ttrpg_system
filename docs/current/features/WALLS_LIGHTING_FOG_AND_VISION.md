# Walls, lighting, fog, and vision

Audience: contributors changing walls, doors, fog of war, dynamic lighting,
vision, or layer visibility.

Status: current.

Last source audit: 2026-09-24

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
- `packages/rust-core/src/geometry.rs`: CPU visibility-polygon boundary
  helpers.
- `packages/rust-core/src/occlusion.rs`: renderer-owned sight/light segment
  indexes and visibility ray casting.
- `packages/rust-core/src/lighting/`: WebGL point lights and stencil shadow
  volumes.
- `packages/rust-core/src/render/draw.rs`: frame order and occlusion-scene
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
- player visibility is computed as CPU ray-cast polygons by renderer-owned
  sight/light queries, stored as polygons in `FogOfWarSystem`, and composed
  into a darkness/fog overlay.

Consequently, a colored light and the area that it makes visible are generated
separately from the same light-sprite metadata. They use the same obstacle
shapes but can use different wall flags: `blocks_light` for colored light and
`blocks_sight` for token/light visibility polygons.

The persisted `dynamic_lighting_enabled` field enables player vision and the
fog compositor. It does not enable or disable decorative point-light color;
the UI labels this control “Player Vision & Fog” to make that distinction
explicit. Each light sprite has its own persisted `isOn` state.

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
map -> grid -> ordinary layers -> refresh the occlusion scene when dirty
    -> additive point lights with stencil shadows -> paint -> fog/vision overlay
    -> selection and tool previews
```

`FogPanel` draws hide/reveal rectangles on the canvas, updates the render
engine immediately, and sends the rectangle sets to the server through
`protocol.updateFog()`. Persisted fog is a separate mask from dynamic vision.

`LightingPanel` edits light sprites on the `light` layer. A light's color,
intensity, radius, game-unit radius, and on/off state are stored in sprite
metadata; its `x`/`y` fields are the light origin. Presets start with D&D-style
distances and are converted through the active table's unit converter. The
panel may create an optimistic local light, but `TableSyncService` and
`SpriteSyncService` are the only reconcilers of server-owned lights. The panel
does not re-register every store light when it renders or when an engine is
replaced. Enabled state uses the idempotent `set_light_enabled` export.

For each enabled light on the active table, `LightingSystem`:

1. clears the stencil buffer for that light;
2. projects every nearby, undirected blocking segment away from the light into
   a shadow quad and writes the union to stencil value 1;
3. draws a 64-segment radial-gradient circle only where stencil equals 0;
4. clips stencil and color writes to the active table's camera-transformed
   screen rectangle, so light cannot spill onto the workspace;
5. restores WebGL color, blend, scissor, attribute, and stencil state before
   processing the next light.

Segments are undirected: endpoint order and the side on which a light is
placed do not change whether a wall casts a shadow. Each light has an
independent stencil mask. Point-light colors accumulate additively.

`vision.service.ts` watches the game store. When dynamic lighting is enabled,
it:

1. filters token and light sources to the active table and resets all active,
   explored, position, and revision caches when that table or render engine
   changes;
2. reads the renderer's scalar occlusion revision and marks every source for
   recomputation when it changes;
3. finds sprites controlled by the current user, or the selected user during
   DM preview, with a positive vision radius;
4. places each vision origin at the sprite's current visual center;
5. converts game-unit vision and darkvision radii to pixels, falling back to
   legacy pixel fields;
6. packs changed vision/darkvision origins as `[x, y, radius, ...]` and asks
   the renderer's resident sight index to cast endpoint-offset and 32 regular
   rays, clip them to the nearest segment or maximum radius, and angle-sort the
   results;
7. submits enabled light origins to the equivalent renderer-owned light index;
8. adds/removes those polygons in `FogOfWarSystem`; in `persist_dimmed` mode it
   stores the previous visibility polygon under a unique `explored_*` id when
   a source moves. History is bounded to 128 polygons per source.

The vision texture encodes outside vision as 1.0, ordinary vision as 0.75,
explored space as 0.65, darkvision as 0.5, and lit space as 0.0. Light polygons
are stencil-gated to the union of the current user's vision/darkvision
polygons, so a remote light does not reveal space the user's tokens cannot see.
The final fog shader applies persistent fog first, then vision and ambient
light. DMs bypass dynamic vision unless they explicitly start player preview.

## Obstacle sources and invalidation

Rust builds both indexes from world-space segments:

- walls with `blocks_light` feed point-light shadows;
- walls with `blocks_sight` feed visibility ray casting;
- open doors feed neither pipeline; closed and locked doors follow their
  blocking flags;
- polygon obstacle sprites contribute their closed vertex loops;
- line obstacle sprites contribute their exact stored endpoints and keep those
  endpoints synchronized through move, rotate, scale, resize, and paste;
- circle obstacle sprites contribute a closed 32-segment ellipse boundary;
- remaining sprites on the `obstacles` layer contribute their rotated, scaled
  rectangular perimeter.

Obstacle sprites and lights carry explicit authoritative table IDs. Rust
filters both collections by the active table before building shadow or vision
geometry; it does not infer remote ownership from the current table.

Adding, removing, moving, resizing, scaling, rotating, pasting, or moving a
sprite into or out of the obstacle layer marks the renderer's occlusion scene
dirty. Wall CRUD, endpoint dragging, and translation do the same. The next
render, revision read, or visibility query atomically rebuilds both indexes and
advances one wrapping revision; multiple mutations before that consumer
coalesce into one rebuild. `vision.service.ts` watches wall and sprite state and
coalesces recomputation onto one owned animation-frame callback. Stopping
vision cancels queued work. It compares the revision rather than copying and
fingerprinting complete segment buffers in TypeScript.

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
- `pnpm.cmd run test:wasm`

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
- Circle occluders are 32-segment ellipse approximations rather than analytic
  curves. This is normally visually sufficient but can show facets at extreme
  zoom.
- Point-light shadow culling uses exact point-to-segment distance and projects
  included segments just beyond the light radius. A shared uniform-grid query
  narrows candidates and falls back to a full scan for broad or dense queries.
- CPU fog visibility batches token/darkvision origins against one sight index
  and enabled light origins against one light-blocking index per recompute.
  Both indexes live in the renderer and are also shared with point-light shadow
  candidate queries; obstacle arrays do not cross the WASM boundary.
- Visibility uses endpoint rays plus 32 regular rays. It is deterministic and
  adequate for ordinary maps but is not a robust computational-geometry
  visibility solver for collinear/overlapping segments or a source exactly on
  a wall.
- `persist_dimmed` accumulates up to 128 prior visibility footprints per source
  while vision remains active. The history is browser-session state, is cleared
  when the mode or service stops, and is not persisted to the server or restored
  after reload.
- `direction` is persisted and shown in the wall UI, but lighting and vision
  currently treat every blocking segment as two-sided. Movement and sound
  flags belong to other systems and do not affect these render passes.
- Remote light metadata updates reconcile color, intensity, radius, and enabled
  state onto the existing WASM light. Enabled state uses an idempotent setter,
  so replayed updates cannot invert the light.
