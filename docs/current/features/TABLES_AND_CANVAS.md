# Tables and canvas

Audience: contributors changing table management, active-table switching,
canvas bootstrap, or table settings.

Status: current but partial.

Last source audit: 2026-11-04 (metadata/transform acceptance)

## Source owners

- `apps/server/service/protocol/table_creation.py`: create/copy/import installation
  and uncertain-outcome recovery.
- `apps/server/service/table_creation_service.py`: worker-owned table/receipt acceptance.
- `apps/server/service/protocol/tables.py`: table list, load, delete,
  active-table, table update, scale, move, and table settings handlers.
- `apps/server/service/protocol/session.py`: layer settings and active-table
  database helpers.
- `apps/server/service/canvas_persistence_service.py`: worker-owned table
  hydration and settings persistence.
- `apps/server/routers/game.py`: authenticated table-preview upload and read
  endpoints.
- `apps/server/database/models.py`: `VirtualTable`, `GamePlayer.active_table_id`,
  walls, paint objects/revision state, layer settings, and table lighting
  columns.
- `apps/web-ui/src/store.ts`: table list, active table, optimistic create,
  switch, delete, units, walls, and table lighting state.
- `apps/web-ui/src/features/table/`: table management panels, thumbnails,
  templates, and table hooks.
- `apps/web-ui/src/features/canvas/components/GameCanvas.tsx`: canvas surface.
- `apps/web-ui/src/features/canvas/services/InputManager.ts`: keyboard actions
  and the read-only canvas-input context store.
- `apps/web-ui/src/features/canvas/hooks/useKeyboardShortcuts.tsx`: reactive
  shortcut availability display.
- `apps/web-ui/src/features/canvas/components/GameClient.tsx`: game shell,
  WebSocket connection, runtime user context, and canvas/panel layout.
- `apps/web-ui/src/lib/wasm/runtime/`: TypeScript boundary to the Rust renderer.
- `packages/rust-core/src/`: render engine, table manager, input, lighting,
  fog, paint, and sprite rendering.

## What the feature does

A table is one playable map or scene inside a session. The browser keeps a
table list and active table in the game store. The server keeps persisted
`VirtualTable` rows and serves a role-filtered table payload when a client
asks for a table.

The canvas is the interactive render surface. React owns panels, selected
tools, active table choice, and protocol calls. Rust/WASM owns the render
engine and canvas-side geometry/rendering work through `WasmRuntime`.

Map imagery uses the normal authorized asset and table/sprite rendering flow.
There is no released multi-layer background-LOD, texture-streaming, or weather
renderer contract. The former Backgrounds panel and its simulation-only
service were removed because changing their controls did not change visible
renderer state. Reintroducing those features requires explicit
`WasmRuntimePort` operations, deterministic texture/effect cleanup, visible
rendering tests, and persistence/synchronization behavior where applicable.

An empty session has no table until a DM creates one or persisted tables load.
The domain manager and renderer do not invent a default table. Every active
table and sprite table ID comes from persisted or server-confirmed state.
Before the first table payload arrives, the renderer draws an empty frame and
table-scoped interactions are no-ops. The browser rejects table and sprite
sync payloads that omit a non-empty `table_id`.

Once a table is active, Rust draws a bounded table plane in the persisted
background color over a darker workspace, then map imagery and the grid. The
plane remains visible when no map is configured, a map texture fails to load,
or the grid is disabled; those states must not make the table indistinguishable
from the surrounding canvas.

## Main workflows

Table list:

1. Browser calls `requestTableList()`.
2. `clientProtocol.ts` sends `table_list_request`.
3. `handle_table_list_request()` returns `table_list_response`.
4. The browser transforms server tables and stores them in `useGameStore`.

Create table:

1. `createNewTable()` adds a local optimistic table with a `local_` id.
2. The store sends `new_table_request` with `local_table_id`.
3. The server commits the detached table, initial paint state and scoped
   operation receipt together, then installs it in live indexes before success.
4. The server broadcasts `table_update` with `operation: create` containing
   only table ID, name, width, and height. Scene layers, walls, and metadata are
   excluded from this announcement. Other clients obtain scene contents through
   the normal role-filtered `table_request`. The creating DM receives
   `new_table_response` with the full scene to map the local ID to server data.

Copy a populated table:

`new_table_request` with `source_table_id` deep-copies the source scene and
assigns new table, sprite, wall, and cover-zone IDs. Local entity indexes,
asset references, linked characters, and controller lists are retained;
copying a map does not clone its character records or asset bytes. Paint
objects and saved previews are separate resources and are not copied. The
duplicate button explains this limitation.

Persistent creation saves a detached draft before registering it in live
table indexes or action history. A reported save failure leaves no phantom
live table, dirty-table retry, or undo entry. Raw `table_data` imports retain
their proposed sprite IDs and can fail on ownership conflicts.

Create, copy and import use the original envelope message identity, scoped
to actor, numeric session and `table_create`. Current database DM authority is
required before execution or replay. A reused identity with changed normalized
input conflicts; different deliberate identities create different tables. A
copy captures the source at first acceptance, not again on replay. Source and
target table ownership prevents snapshot saves from overtaking capture or live
installation. Copying a source with unresolved dirty persistence fails. Linked
characters must be active in this session; their canonical stats replace stale
import/copy hints inside acceptance without changing source versions.

Receipts retain only bounded outcome metadata for the retained session lifetime.
A replay reads the current table, never its original snapshot. It does not
replace a resident live table or rebroadcast an already-resident creation. A
recovered/uncached committed table announces metadata once when installed. A retained receipt for a
later-deleted table reports `table_deleted` and cannot resurrect it. Imports
retain proposed sprite identities and reject collisions atomically.

Commit-response loss resolves behind the same session-row barrier. If lookup is
unavailable, the session quarantines serialized state work and background table
snapshots until recovery installs the verified outcome or proves rollback.
Repeated cancellation retains ownership through settlement, installation and
publication. Notifications failing after acceptance report success requiring
resync. Only new requests accepted by this receipt path have this guarantee;
do not blindly retry an unconfirmed create sent to an older server.

TODO: copying paint/previews and persisted
browser ownership of uncertain operations. This is not universal idempotency.
`test_table_copy_persistence.py` covers standalone populated copy/reload/delete;
`test_table_creation_service.py` owns the atomic receipt and recovery contracts.

Switch table:

1. `switchToTable()` validates the id and calls `setActiveTableId()`.
2. `setActiveTableId()` sends `table_active_set` when protocol is available.
3. The server writes `GamePlayer.active_table_id`.
4. The browser asks for `table_request`; the protocol emits the received table
   payload to the runtime-owned `TableSyncService`.
5. `TableSyncService` validates and normalizes the complete snapshot once. If
   no renderer is attached, it retains the snapshot and flushes it on
   attachment.
6. Rust parses and validates the full renderer DTO before mutation, then
   restores camera state and replaces ordinary layers. An invalid table,
   layer, geometry value, or duplicate sprite ID leaves the visible resident
   table intact.
7. The service replaces the browser sprite and wall mirrors, table-derived
   lights, fog rectangles, layer settings, units, grid settings, and table
   lighting settings from that snapshot. Paint hydration is separate: the
   paint controller first clears the renderer to an empty revision-zero scene,
   then applies one bounded versioned object snapshot and queued later events.
8. `frameTableId` becomes ready only after required textures settle and a
   subsequent render frame completes.

Required texture readiness includes derived text textures. The coordinator
does not publish `frameTableId` while text is awaiting font shaping or image
decoding. Table replacement retains only the current table's text resources;
detach/context restoration rebuilds them from authoritative metadata. This
boundary is covered by `WasmSyncCoordinator.test.ts` and the real-browser text
rendering tests.

Table previews:

1. For DMs, `table_list_response` includes `has_preview`, `preview_etag`, and
   `preview_updated_at` without loading image bytes. Cards request an image
   only when `has_preview` is true and only when they are near the viewport.
2. Hover or keyboard focus opens the image in a larger, non-interactive
   preview. For a DM, hovering an inactive table conditionally revalidates its
   saved WebP by ETag. It does not hydrate, render, or switch that table.
3. Only the active, hydrated table with a committed render frame can generate
   a new preview. Rust temporarily fits the complete table into a bounded
   capture camera, reads pixels synchronously, then restores the interactive
   camera and frame.
4. The browser debounces changes, limits capture frequency, and keeps at most
   24 generated object URLs. It flushes a dirty active preview before a table
   switch.
5. For a DM, the browser keys persisted image URLs by preview ETag, encodes a
   canonical 640x360 WebP, and uploads it. Other roles can keep a scoped
   in-memory preview but never call the DM-only persistence routes. Upload
   failure leaves the in-memory preview usable for the current session.

Preview invalidation covers sprite transforms and CRUD, table/grid and layer
settings, walls, paint, fog, and ambient lighting. Inactive tables are not
loaded into WASM just to refresh a thumbnail; their last persisted image stays
visible until that table becomes active.

Feature code must not call the renderer's `handle_table_data` directly. The
runtime port intentionally does not expose a complete-table hydration method.

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
- `table_update_request` (client mutation)
- `table_update` (server broadcast)
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

`table_settings_update` accepts JSON booleans for
`dynamic_lighting_enabled`, `grid_enabled`, and `snap_to_grid`. The server
rejects strings, numbers, and `null` for these fields instead of coercing
them.

The shared protocol schema defines the complete `table_settings_changed`
payload. The browser validates table IDs, lighting and grid value types,
ranges, units, and colors before dispatching a settings broadcast.

All settings controls share `tableSettingsBuffer.ts`: local preview is
immediate; only unsent same-table patches merge. A 150 ms trailing debounce
and 500 ms maximum wait bound accumulation. A dependent command flushes older
settings first. Accepted settings update the baseline underneath later intent;
denial removes its matching patch. Identical validated settings receive a durable receipt without
rewriting settings values or incrementing their revision. See [Action confirmation](../reference/ACTION_CONFIRMATION.md).

## State and persistence

Server-owned:

- table rows and dimensions;
- a sparse per-layer entity-position index. Table width and height are pixel
  dimensions, so empty positions are implicit and memory grows with placed
  entities instead of `width * height * layer_count`;
- per-table dynamic lighting, fog exploration mode, ambient light, grid units,
  grid toggles, and colors;
- persisted walls and layer settings for join-time table sync;
- versioned paint objects, table revision state, and retry results hydrated by
  a separate bounded snapshot;
- each player's active table.
- a deferred, bounded WebP preview for each table. Preview bytes are excluded
  from normal table queries and hydration.

Active-table reads and writes run outside the asyncio event-loop thread with a
worker-owned ORM session. Layer settings are also persisted off-thread and are
constrained to a table in the authenticated session before any broadcast.
Join-time wall/layer fallbacks are loaded together in one worker-owned session,
and validated table lighting/grid settings are persisted through the same
async-to-sync boundary. Paint objects use their dedicated snapshot worker and
never appear in `TABLE_RESPONSE`. ORM rows do not cross back to the event loop.

Browser-owned:

- active UI panel state;
- local optimistic table rows before server confirmation;
- active tool and canvas interaction state;
- immutable input-context snapshots for selection, clipboard, undo/redo, and
  canvas focus; shortcut UI reads them through a subscribed external-store
  boundary and unsubscribes on unmount;
- transformed table list used by panels.

WASM-owned:

- render engine state for the active table;
- canvas event interpretation and draw-time state reached through
  `WasmRuntime`.

The authoritative server `asset_id` is the texture key across snapshot
normalization, asset download, browser verification, and the Rust texture
cache. A legacy `texture_path` may help the server resolve old records, but it
must not replace an enriched `asset_id` at the renderer boundary. Map imagery
and token sprites use this same rule.

Legacy `background_image` metadata is retained for wire compatibility. A value
matching the canonical lowercase 16-hex asset identity is migrated in memory
to a bounded, non-store `map`-layer sprite. Filenames, object keys, paths,
arbitrary IDs, URLs, and presigned bearer tokens are never interpreted as
texture identities. New and updated maps must be ordinary persisted
`map`-layer sprites carrying an authorized canonical `asset_id`.

Only the active hydrated table is visually ready. Switching tables drops the
prior readiness record and unloads GPU textures not shared with the new table;
late downloads for a superseded table are unloaded immediately.

Table previews are DM-only because a renderer capture can contain hidden
layers. `POST /game/api/sessions/{session_code}/tables/{table_id}/preview`
accepts only a valid 640x360 WebP up to 512 KiB. The matching `GET` endpoint
uses a private ETag response and returns 404 until a preview exists. Both
endpoints require owner or co-DM membership and constrain the table to the
authenticated session.

The Canvas2D wall overlay is a view of the `obstacles` layer. It is DM-only,
honors obstacle visibility and opacity, and clears its pixels when the layer is
hidden. It does not define separate wall visibility state.

## Tests to run

- `apps/server/tests/unit/test_tables_protocol.py`
- `apps/server/tests/unit/test_canvas_persistence_service.py`
- `apps/server/tests/unit/test_game_session_protocol.py`
- `apps/server/tests/integration/test_table_previews.py`
- `apps/server/tests/integration/test_alembic_baseline.py`
- `apps/web-ui/src/lib/websocket/__tests__/clientProtocol.test.ts`
- `apps/web-ui/src/features/table/**/__tests__/`
- `apps/web-ui/src/features/canvas/components/**/__tests__/`
- `apps/web-ui/src/features/canvas/hooks/**/__tests__/`
- `apps/web-ui/src/features/canvas/services/__tests__/InputManager.test.ts`
- `apps/web-ui/src/features/layout/components/RightPanel/__tests__/RightPanel.test.tsx`
- `packages/core-table/tests/test_virtual_table.py`
- `packages/rust-core/tests/wasm_browser.rs`
- `packages/rust-core/tests/wasm_node.rs`
- `apps/web-ui/src/lib/wasm/__tests__/wasmCore.wasm-test.ts`
- `apps/web-ui/src/lib/wasm/runtime/__tests__/WasmRuntime.test.ts`
- `apps/web-ui/src/features/table/services/__tests__/tableThumbnail.service.test.ts`

Use server protocol tests for authority and persistence changes. Use Vitest for
React store, protocol, and panel behavior. Use Rust/WASM tests when the render
engine contract changes.
The browser WASM suite performs a complete A-to-B scene switch with distinct
sprites and light state, forces `WEBGL_lose_context`, restores the context, and
asserts that the retained B snapshot renders again through the production
runtime lifecycle.

## Known edges

- Table creation is optimistic in the browser. Keep `local_table_id` mapping
  working when changing create responses.
- Some join-time payloads are assembled from both in-memory table state and
  database fallbacks after server restart.

## Durable transforms and reload

`table_scale` and `table_move` change shared table transforms, so they require
owner/co-DM authority. They are not personal camera pan/zoom commands. Scale
must be finite, greater than zero, and at most 100; movement components must be
finite and within the wire schema's coordinate bound. Domain actions persist these
changes before success and broadcast.

Full save/load preserves lighting, fog mode, unit/grid geometry, grid enabled,
snap-to-grid, grid color, and background color through domain serialization
and database hydration. Defaults apply when old data lacks a value, not when a
saved value is false or otherwise differs from the default.

Snapshot atomicity, pending failures, and cross-process ownership are described
in [Persistence and application ownership](../explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md).
Regression coverage includes `test_table_transform_persistence.py`,
`test_table_settings_roundtrip.py`, and the atomic/async persistence suites in
`apps/server/tests/unit/`.

## Confirmed table deletion in the browser

Typed `success` deletion receipts and peer `table_update` deletion events remove
the table summary, including inactive tables. Deleting the active scene clears
the active pointer, sprites, walls and selection without echoing an active-table
change to the server. Sprite-deletion successes do not retire a table.

The protocol retains retired identities for its session lifetime. Delayed table
snapshots, active-table replies, create notifications and table-list entries
cannot restore those identities. Buffered settings and unsent table commands
are discarded, and a table recovery timeout is cancelled when deletion is
confirmed. A deliberate `deleteTable(tableId, originalRequestId)` retry preserves
the original request identity; its original is retained by the negotiated tab-scoped recovery journal.
Regression owners: `src/lib/websocket/__tests__/clientProtocol.test.ts` and
`tableSettingsBuffer.test.ts` in `apps/web-ui/`.

The session-owned `TableSyncService` also retires the deleted identity and drops
matching pending/latest renderer snapshots. Deleting its resident scene cancels
the current interaction and clears sprites, paint objects/drafts, walls, derived
lights, fog, vision and selection. Renderer reattachment and delayed hydration
cannot restore that cached scene. Deleting an inactive table preserves the
resident scene. The runtime clears matching hydration/frame readiness and
invalidates preview capture; the sync coordinator releases its texture readiness.
The existing generated WASM interface supplies these cleanup operations; this
change does not replace generated artifacts. Regression owners:
`tableSync.service.test.ts`, `WasmSyncCoordinator.test.ts` and `WasmRuntime.test.ts`
under `apps/web-ui/src/lib/wasm/`.

## Durable settings outcomes and browser ordering

Production settings patches use `TableSettingsService` and the session-owned
settings protocol mixin. Current database DM authority and target session are
checked in acceptance. The patch, settings revision and original scoped request
receipt commit together. No-op patches retain an outcome without incrementing
the counter or sending a redundant peer event. New settings reject while the
table has unresolved dirty persistence. Generic CRUD/snapshot settings changes
also advance the revision. Table hydration includes the current SQL revision.

Unknown commits or failed live installation fence serialized session work and
snapshots until the stable session-row lookup resolves them. Repeated cancellation
cannot release ownership before installation and publication. Replays use current
settings/revision, never an old receipt's patch; a later-deleted target instead
reconciles deletion. Current authority is required to disclose an original result.

The browser settings buffer rejects older revisions while retaining later local
intent. An unknown request keeps its original message/body, pauses newer settings
transmission and survives canonical snapshot reconciliation. After hydration it
may send that exact original once for the current connection to obtain its
receipt; accepted/rejected settlement releases newer queued settings. A later
connection loss permits another original probe, with no replacement identity.
This ownership is restored from the negotiated tab-scoped journal after same-tab reloads.
Regression owners: `test_table_settings_service.py`, `test_tables_protocol.py`,
`tableSettingsBuffer.test.ts` and `clientProtocol.test.ts`.

## Saved table requests across page reloads

Supported create/copy/import, delete and settings envelopes are saved before
transmission in the current tab. Welcome negotiation binds recovery to the
authenticated actor and retained session instance. Restoring a create reconciles
identity and requests canonical state, even if its first acceptance occurs after
reload; it never hydrates an older scene over a newer active table or resets the
creation form. Restored settings rejoin their original buffer ownership and keep
newer local intent behind uncertain originals. A later-deleted target follows
the existing retirement path.

The provider's saved-change notice exposes retry and explicit forgetting. Full,
corrupt or unavailable storage prevents supported high-risk transmission instead
of dropping older evidence. Tab closure, storage clearing and unsupported server
contracts do not gain automatic replay guarantees. Generic table transforms and
character/choice commands retain their separate recovery contracts.

## Metadata and transform recovery

`TableEditService` owns production table movement, uniform scaling and metadata
patches (name, dimensions and legacy grid fields). It accepts affected SQL fields
and a bounded original-intent receipt atomically under current DM authority.
These commands no longer change live state before a full snapshot save. Matching
retries return original acceptance and current affected fields without restoring
old names, dimensions or transforms. Grid aliases retain settings revisions.

Unknown commits and failed cache installation quarantine reads, mutations,
snapshots, cleanup and join until fresh session/table-barrier settlement and
current installation. Recovery preserves unrelated retained table/entity/wall
state; a later-deleted table is retired in both resident indexes. Current database
authority gates private receipts. Cancellation cannot release ownership early.

The unchanged generic success envelope carries `domain: table_edit`, original
`operation_id`, `table_id`, `replayed` and `resync_required`; it contains no old
scene. Peers get table resync hints, or deletion for a verified retired table.
The browser reloads the table list and active scene. An uncertain inactive-table
edit probes the list without replacing the active scene. `moveTable`, `scaleTable`
and `updateTable` return request IDs and accept original IDs for deliberate retries
with identical complete input. Wire validation requires a nonblank original ID
up to 128 characters; clients omitting it must upgrade.

Metadata/transform originals remain outside persisted v1/v2 recovery journals.
Fog replacement now accepts fog-layer rows and its original receipt atomically,
with current-projection recovery. Layer/session mutation acceptance still needs review.
This change does not add general offline replay, a new migration or universal
session atomicity.

## Fog replacement and committed panel state

Fog replacement, including empty clear, now uses the same session/table pending
ownership lifecycle as field edits, with its own `fog_edit` receipt domain. Only
current fog-layer rows install after acceptance/settlement; unrelated retained
state is preserved. Colliding retained entity IDs keep quarantine rather than
overwriting another object. Normal SQL reload reconstructs the rectangle view
from canonical fog marker entities, so restart does not silently lose it.

The shared wire schema requires an original nonblank fog request ID. The browser
receives a small success receipt and asks for current reconciliation, rather than
applying an old rectangle list. `updateFog` returns/accepts original request IDs
for deliberate complete-input retries. Fog remains outside persisted v1/v2 retry
journals. After validated renderer/store installation, `fog-hydrated` publishes
canonical rectangle IDs to the panel. A panel opened later reads retained store
fog. The panel updates its list without clearing/reinstalling renderer state.

## Layer patches and table switches

Database-backed layer edits merge supplied visibility, opacity, RGB color and
blend properties into the named layer, preserving other saved values. Acceptance
and the original receipt share one transaction. Unknown outcomes retain the
existing table-edit owner through current-layer installation, including join,
snapshot and cleanup protection. Success reloads current state rather than
replaying historical styles; game mode/session rules acceptance remains separate.

Snapshot validation normalizes all seven renderer layers before any mutation.
Hydration restores saved values or renderer defaults on every table switch:
opacity 1, white RGB, alpha blending except additive light and multiply fog, and
visibility from saved layer settings or the table visibility map (otherwise true).
This prevents an unstyled scene inheriting the previous scene's opacity/color.
Legacy `color` RGB/RGBA and canonical `tint_color` are readable; alpha remains
controlled by opacity. Unknown legacy metadata is retained in SQL, not applied.
