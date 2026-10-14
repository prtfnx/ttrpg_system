# Measurement and painting

Audience: contributors changing measurement, paint tools, reconciliation, or rendering.

Status: usable. Completed measurements and paint objects are server-authoritative.

Last source audit: 2026-10-09

## Ownership

| Boundary | Owner |
| --- | --- |
| Measurement UI and geometry | `apps/web-ui/src/features/measurement/` |
| Measurement authorization and persistence | `apps/server/service/protocol/measurements.py` |
| Paint tools, gestures, selection, and reconciliation | `apps/web-ui/src/features/painting/` |
| Paint wire handlers and previews | `apps/server/service/protocol/paint.py` |
| Durable paint transactions | `apps/server/service/paint_object_service.py` |
| Paint payload contract | `packages/core-table/protocol/paint_object.schema.json` |
| Ordered renderer scene and geometry hit tests | `packages/rust-core/src/systems/paint_scene.rs` |
| Paint meshes, drafts, and GPU resources | `packages/rust-core/src/systems/paint.rs` |

## Measurements

The browser computes distances, angles, shapes, and snapping. A completed line
or shape has a stable ID; the server validates finite, bounded geometry,
persists it per table, and broadcasts the canonical record. Dedicated snapshot
events reconcile reconnects and table changes without echoing received writes.
Blocking persistence runs in worker-owned ORM sessions, not on the event loop.

Creators can replace/delete their measurements. DMs can delete any measurement
and clear a table; spectators cannot write. A table allows 500 measurements,
each with at most 64 KiB of serialized geometry. Drag previews remain local.

Spell-area template definitions and helpers are internal building blocks, not
selectable UI tools. Measurement-template placement is unsupported. Paint
objects do not replace gameplay shape sprites, walls, obstacles, or fog.

## Paint contract and authority

Each freehand path, line, rectangle, square, ellipse, or circle is one editable
object. Geometry uses local coordinates. The transform contract applies positive
X/Y scale, then rotation in radians about the local origin, then translation.
Rotation is optional for legacy objects and defaults to zero. Its inclusive
range is `[-pi, pi]`; non-finite and out-of-range values are rejected. The angle
is stored in the existing transform document, without new database columns.
Square/circle
resizing keeps uniform scale; freehand editing changes the whole object, not
individual control points. A one-point freehand path renders as a dot.

The canonical schema separates editable fields from server-owned table,
creator, version, ordering, and timestamps. The protocol generator packages
the schema and publishes matching browser limits. `core_table.paint` and
`apps/web-ui/src/features/painting/model/paintObject.ts` reject unknown or
malformed fields, non-finite values, invalid styles, and oversized objects.
Known Python tags use cached validators derived from the canonical geometry
branch, avoiding repeated point traversal. Unknown tags use the general
validator. Schema parity tests cover editable and authoritative forms.

Current schema limits are 60 KiB per serialized object, 8,192 points per
freehand path, 2,000 objects per table, and 100,000 aggregate points per table.
Coordinates, dimensions, pressure, and scale also have schema bounds. Use the
schema as the authority when changing a limit; do not duplicate new constants
in consumers.
The server also checks the complete authoritative DTO's byte size after adding
metadata and before committing create/update. Editable input near the limit
can therefore return `invalid_payload` even if its editable fields fit.
Rejection rolls back object state, revision/order, and operation ledger, and
does not broadcast an unreadable object. This byte check does not repeat
geometry validation.

Owners, co-DMs, trusted players, and players can create objects. A creator or
DM can update/delete an object; spectators have read access only. Server
transactions derive authority from database membership and check that the
table belongs to the authenticated session. UI gating never grants permission.
Table lookup, session ownership and the actor's optional membership use one
query. A missing membership is allowed only for the actual session owner.

`PaintObjectService` serializes mutations through table-scoped locks and
`paint_state`. Normal table creation and migration seed revision-zero state
rows. Each accepted command assigns one table revision; updates increment the
object version without changing creator or `z_order`. Durable writes and their
operation results commit together before network delivery. Writer fencing
also applies to the object, state, and ledger tables.
Standalone writes stage the object, revision, operation receipt and undo delta
before one flush; seeding a missing paint-state row is a separate step. Borrowed
transactions retain explicit flushes so later composed commands see staged edits.
Regression owner: `apps/server/tests/unit/test_paint_object_service.py`.

Table budgets use SQL counts and JSON array lengths rather than loading every
path. Replacement checks exclude the old object. Non-point-growing updates
skip this aggregate because neither table object count nor point count can
increase. The membership join locks the target virtual table, not the shared
session row, so unrelated tables do not serialize through that join.

### Commands, retries, and rollout gate

Create/update/delete commands carry explicit `table_id` and UUID `operation_id`.
Update/delete also require the exact `expected_version`; a stale version
returns `version_conflict` with confirmed object state rather than overwriting
it. The sender receives the accepted `paint_object_event`; other session
clients receive one broadcast. Replaying the same operation ID/body returns
its recorded result without another write or broadcast. Reusing an ID with a
different body fails.

The supported retry window defaults to 24 hours. Older recorded commands return
`retry_window_expired`; the browser discards expired intent and resynchronizes
before offering another edit. Ledger retention defaults to 48 hours and must
exceed the retry window. An hourly bounded job removes expired ledger rows.
See [Environment variables](../reference/ENVIRONMENT_VARIABLES.md) for settings.

`PAINT_OBJECT_WRITES_ENABLED` defaults to false in production and true in
development. Disabled durable commands return `paint_disabled` before opening
a transaction; authorized snapshots remain available. The gate also drops new
previews but permits authorized cancellation. Configuration is process-owned:
restart after changing it. Disabling writes does not make new data readable by
old binaries. See [Database migrations](../operations/DATABASE_MIGRATIONS.md)
for cutover and rollback procedures.

## Canvas tools and gestures

The toolbar's `activeTool` is the only paint-mode source. `PaintControllerProvider`
owns one scene controller and one interaction controller per connected session,
plus one `CanvasCommandController` for shared editor receipts and history,
beneath the protocol and WASM runtime providers. Subscriptions start in
committed React effects and disconnect on cleanup, including Strict Mode
effect replay. Object count, selection, pending state, and errors are
event-driven; no full-scene serialization polling is used.

The panel offers Draw, Line, Rectangle, Square, Ellipse, Circle, Select/Edit,
and Delete to interactive roles. Color, world-space width, and fill map to
implemented styles. Selected metadata shows kind, owner, and version;
mutation actions require creator/DM authority. There is no template tool,
canvas-only paint mode, cosmetic marker/eraser, or global stroke undo/redo.

`PaintInteractionController` captures one primary pointer and the table ID at
pointer-down. Each coalesced sample converts canvas backing pixels through the
Rust camera once. Local drafts update immediately; release sends at most one
durable command. Mouse, pen pressure, and touch use the same Pointer Events
route. Right/middle-button pan and wheel zoom retain their normal routes.
Paint consumes its left-button and deletion shortcuts without intercepting
text inputs or another tool's sprite/wall shortcuts.

Cancel, lost capture, Escape, tool/table change, failed capture, disable, and
unmount clear the draft and release capture. Closing the panel selects normal
selection. Hydration or unavailable world-coordinate conversion cancels an
in-flight gesture; it cannot commit its last valid sample as a successful
release. Detach/context loss disables input until a live canvas is restored.
Legacy mouse/key listeners keep stable identities and read the current tool at
dispatch, so switching tools does not recreate the renderer. Canvas engine
and multi-selection references follow runtime replacement.

Raw capture is limited to 32,768 non-identical samples. Completion simplifies
with world tolerance `max(width * 0.1, 0.25)`, preserving endpoints, pressure
discontinuities, and interpolated pressure deviation up to 0.08. Paths still
over the point/byte limits fail visibly; they are not truncated. Validation
errors cancel the gesture and use the panel/toast error channel.

Moving changes translation. Corner resizing anchors the opposite corner;
rectangle, ellipse, and freehand scale independently by axis, while square and
circle use uniform scale. Line handles edit the selected endpoint only.
Geometry helpers preserve the opposite resize anchor in the rotated coordinate
frame. Rotation uses the visual center as its pivot, adjusting translation so
the center stays fixed; Shift snapping uses 15-degree increments.
Selection/handles use screen-space hit tolerance through camera zoom.
Rust uses the same scale/rotate/translate mapping for cached triangles, bounds,
picking, and corner/endpoint handles. A single paint selection shows a rotation
handle 28 backing pixels beyond its top edge. Multiple IDs can be selected
through `paint_select_objects`; invalid IDs reject the selection replacement.
Filled rectangles, squares, ellipses, and circles select from their interiors;
outline-only forms select from the stroke band, not their empty centers.

`SelectionManager` keeps namespaced paint/sprite references in local editor
state. Paint Select/Edit supports rectangle selection and Shift/Ctrl/Cmd
additive selection. The rectangle includes intersecting transformed bounds in
either drag direction. Dragging a selected member moves editable members of
the retained selection; other users' objects remain inspectable but unchanged.
Marquee and group previews are local and cleared on cancellation. A committed
paint version change cancels an in-flight edit based on the old version.
Group movement and selected-object deletion use one atomic canvas transaction.
One stale or invalid editable member rejects all included edits. Locked members
are not mutated. The server publishes only after the sprite snapshot, paint
state and actor-scoped journal commit together. Clipboard, history, permissions,
budgets and retry behavior are defined in
[Canvas commands and history](../reference/COMMAND_AND_HISTORY.md).
Ending or cancelling a sprite preview restores the latest authoritative store
position, not the gesture's starting position. Hidden-layer sprites can still
restore, but removed sprites and inactive tables cannot. Replacing the sprite
adapter cancels through the old adapter before releasing it.
Delete and paint restyle cancel an active gesture before submitting their
commands. They discard drag previews and release pointer capture; a late
pointer-up cannot submit the abandoned transform after the command.
Restyling selected paint uses one atomic canvas command and one undo step,
including a single selected painting. It changes only editable paint members,
preserves retained sprite and locked-object selection, and waits for the server
receipt. Pending paint or canvas commands block another restyle. A stale member
rejects the whole command, leaving every included painting unchanged.

Sprite movement uses control ownership; deletion remains DM-only even for
player-controlled text. Changing layer visibility cancels local gestures.

Ctrl/Cmd+A selects confirmed paint and, in combined mode, visible active-layer
sprites. Entity-list sprite selection is reconciled into the same namespaced
selection without losing retained paint. Hidden or non-resident IDs are pruned;
selection changes cancel a stale local gesture. This does not create a durable
group entity or grant permission to edit other users' objects.

The adapter uses `WasmRuntimePort` for picking, selection and previews. Sprite
world bounds convert store degrees to radians, matching the renderer. Shared
selection owns Delete/Escape/select-all shortcuts and replaces legacy sprite-only
shortcuts while Paint or combined Select owns input. Ctrl/Cmd+C/X/V/D copies,
cuts, pastes or duplicates the editable selection. Arrow keys nudge by one world
unit; Shift uses ten. Ctrl/Cmd+Z undoes an accepted canvas action; Shift+Z or Y
redoes it. These are server journal operations, not renderer-local undo.
Undo/redo also works in default separate sprite-selection mode. Accepted normal
sprite transforms, sprite create/remove and standalone text edits share the
paint journal. Stat/combat changes are not reversible editor actions; current
permissions still gate every inverse. Text undo/redo advances text revisions.
The panel also exposes clipboard/history buttons and relative scale-percent
and rotation-degree inputs. Group scale preserves proportions and rotation
uses the editable selection's bounds center. A shared frame also provides four
corner handles and an outward rotation handle. Corner dragging preserves the
opposite corner and proportions; Shift snaps rotation to 15 degrees. The frame
covers editable members only. Single-paint handles keep their existing behavior.
One pointer gesture previews all members locally and submits one atomic command
on release. Cancellation, capture loss, role/table changes and remote changes
to any captured paint version or sprite transform discard the gesture and restore
current authoritative state. No intermediate pointer sample writes to storage.
The frame and previews go through `WasmRuntimePort`; group math lives in
`controller/selectionTransforms.ts`. Controller, adapter and geometry regressions
live in `features/painting/controller/__tests__/`.
Form controls keep normal text-editing keyboard behavior.
Shared input routing also suppresses the legacy Ctrl/Cmd+X route, leaving cut
with the same authoritative selection command owner as copy and paste.

`features/canvas/services/spriteCommands.ts` owns correlated confirmation for
sprite editor saves. It releases subscriptions on acknowledgement, rejection,
cancellation, send failure, or a fifteen-second timeout. A timeout is uncertain
and does not automatically resend. Text creation and editing use this boundary;
cancelling the UI cannot retract a command already accepted by the server.

Legacy line and polygon moves, rotations, and resizes also update their stored
world-space geometry. Accepted shape transforms send a complete authoritative
sprite upsert to the sender and visible peers; clients do not independently
reapply the transform to those vertices. Database reloads preserve the result.
The protocol regressions live in `apps/server/tests/unit/test_shape_sprites.py`.

Sprite hydration retains finite world vertices in the browser store as well
as Rust. Legacy `{x, y}` polygon points normalize to coordinate pairs; malformed
points do not become invented vertices at the origin. Line endpoints hydrate
through the same representation.
Core-table also normalizes valid historic object points when constructing or
loading an entity, so movement and shared history operate on coordinate pairs.
It preserves malformed historic geometry for inspection rather than deleting
it during load. `core_table/shape_geometry.py` validates finite coordinates
within ±1,000,000 and at most 1,000 vertices.
Selection uses their world-space bounds without applying scale or rotation a
second time. A remote vertex change cancels an active gesture even when the
sprite's anchor and transform fields have not changed.

Canonical canvas sprite upserts replace the existing renderer sprite before
installation. The renderer's add API appends; treating these updates as new
instances would leave stale duplicates visible. Polygon hydration retains
authoritative dimensions, scale, rotation and control IDs in the game store,
so later selection commands compare against persisted state rather than
default transforms. Regression owners: the sprite synchronization tests and
`GameCanvas/__tests__/usePaintInputRouting.test.ts`.
`store.addSprite` retains width and height for both insertion and replacement;
only the legacy `imageUrl` field is retired. Text and shape selection therefore
uses saved dimensions rather than a 50×50 fallback. The real-store adapter
regression lives in `controller/__tests__/spriteSelectionPort.test.ts`.
Text metadata edits replace the existing renderer sprite before installing its
new dimensions and derived texture. They retain texture-service ownership;
repeated edits do not append stale text instances. Sprite synchronization tests
cover replacement order and preservation of scale, dimensions and controls.

Losing an interactive role immediately disables Paint authoring and cancels its
local gesture. Combined Select remains a read-only inspection path for a
spectator; creator/DM paint checks and normal sprite-control checks still guard
every attempted mutation.

The Help window uses the current Table objects/Text sprite/Paint tool names,
distinguishes separate camera-pan behavior from combined dragging, and labels
the 15-degree paint rotation shortcut separately from sprite rotation.

The real-WebGL paint regression checks that a rotated filled object renders
and picks at the same world position, exposes its center-pivot rotation handle,
and retains a valid multi-object selection after rejecting unknown IDs.

With the per-member combined-selection preference enabled, the default Select
tool routes sprites and paint through the same interaction controller. Sprite
picking stays on the visible, selectable active layer and active table. Sprites
draw above paint and therefore win overlapping picks. Hidden/inactive sprites
do not enter the selection. Tool, layer, membership, table, hydration, and
renderer changes cancel stale gestures. The default separate mode keeps the
existing sprite/wall selection route; combined mode is for sprites and paint,
not wall editing. Mouse compatibility handlers suppress the shared controller's
left-button gestures and delete/escape shortcuts, preserving camera input.

## Hydration, reconciliation, and previews

Paint is not embedded in `TABLE_RESPONSE`. Each table selection requests a
separate ordered snapshot from one consistent database transaction. The
server closes the transaction before transmitting byte-bounded chunks.

Each request has a fresh envelope `message_id`; chunks retain correlation as
internal `request_id`. The browser accepts only the active request's table,
snapshot ID, revision, count, and controller generation. It installs the
complete scene atomically, never moves its revision backwards, and blocks
durable edits while hydration is incomplete. A ten-second deadline applies
even if no first chunk arrives; failed/incomplete requests retry with fresh
correlation. Snapshot assembly is capped at 2,000 chunks and 32 MiB including
chunk metadata.

Events received during hydration are deduplicated by revision and bounded to
256 events or 4 MiB. After installation the controller discards events at/below
the snapshot revision and applies contiguous higher revisions. A gap,
inconsistent metadata, or overflow starts a fresh snapshot. Table changes
immediately clear visible meshes/drafts and ignore stale chunks.

Unresolved durable commands keep independent exact bodies/IDs outside the
generic reconnect queue. Switching tables removes their visible drafts, not
the intent. Reconnect or return to a table retries only inside the supported
window. Inactive-table acknowledgements resolve their pending operations
without changing or resynchronizing the visible table. Pending intent across
tables is capped at 128 operations or 4 MiB. Regular expiry checks discard
stale intent even without reconnect; active-table expiry starts hydration.
Rejections remove optimistic drafts and retain confirmed state.
Only one unresolved create/update/delete intent may target an object at a time.
A second local edit reports a wait-for-confirmation error without sending or
replacing the retained draft. Acceptance or rejection releases that object;
unrelated objects may still be edited. This prevents a local group gesture from
immediately conflicting with its own earlier unconfirmed version.

The browser retains validated authoritative snapshots/events independently of
WebGL. A recreated renderer receives the latest confirmed scene plus current
pending/remote drafts and selection; canvas loss is not itself a network gap.
Object identity, immutable ownership/order, versions, and aggregate budgets
are checked before browser state is retained.

Previews are ephemeral and never change revisions or persistence. The browser
coalesces to 20 Hz and drops sends above 64 KiB of queued socket data. The
server derives actor identity, checks interactive table membership with a
five-second bounded cache, validates drafts, caps relay payloads at 16 KiB,
and clamps expiry to two seconds. Preview traffic uses a separate rate budget.
The controller allows 256 remote drafts and retains at most 1,024 two-second
sequence tombstones so stale previews cannot resurrect cancelled, expired,
or committed drafts. Losing every preview does not affect durable state.
New committed events also install an object-wide two-second preview grace
period in the same bounded cache. This blocks a delayed first preview even
when no actor sequence was observed before commit. Best-effort previews for
a rapid next edit of that object may be suppressed during this period; local
drafts and durable writes remain immediate. Replayed events at/below the
confirmed revision do not clear a newer preview or extend the grace period.

## Renderer

Rust never originates paint writes. `WasmRuntimePort` exposes typed object
snapshots, contiguous upsert/delete, revision/count, hit tests, selection, and
transient drafts. The renderer orders committed objects by immutable
`z_order, id`, culls world bounds without reordering, and draws under fog.

Paths and forms use cached triangle geometry, not WebGL line widths. Pressure
scales path width; caps/joins are round; fill and outline have separate meshes.
WebGL antialiasing supplies triangle-edge coverage where supported; the fallback
is hard triangle edges. Meshes and retained GPU buffers rebuild only for
inserted/changed objects and are reused on unchanged frames. Deletion, table
switch, detach, and context loss release buffers. Separately keyed draft meshes
do not alter committed revisions or buffers. Mesh-rebuild diagnostics support
unchanged-scene regression checks.

## Legacy data and regression owners

Retired stroke commands return `upgrade_required`; there is no live stroke
CRUD, table hydration, Rust-local input path, or browser template wire API.
`PaintStroke` and `PaintTemplate` source tables remain for maintenance exports
and the rollback window, not ordinary runtime reads/writes. Deterministic
conversion, private atomic no-replace backups/reports, quarantine review,
template export, and the first-new-format-write rollback boundary belong to
[Database migrations](../operations/DATABASE_MIGRATIONS.md). Removing UI or
runtime entry points never deletes these source rows.

Focused regressions live in the painting controller/component tests, browser
protocol tests, server paint object/protocol tests, core-table schema tests,
and Rust paint scene/geometry tests. `test_postgresql_contract.py` verifies
simultaneous writers, identical-command retries with one revision/broadcast,
JSONB budgets, and writer fencing. It requires an explicitly disposable target;
SQLite does not prove row-lock behavior.

`features/painting/model/__tests__/paintProtocol.test.ts` covers incoming event,
snapshot, preview, and cancellation boundaries: required UUIDs, safe integer
ordering/identity, object-table consistency, chunk completion, draft identity,
and finite expiry. Controller tests cover duplicate and reordered delivery
after those envelopes have passed validation.

`apps/web-ui/src/lib/wasm/__tests__/paintRendering.wasm-test.ts` checks real
WebGL pixels, pressure/width, shapes, alpha order, and busy-scene buffer/mesh
retention. It also checks that filled interiors and empty outline centers agree
with Rust selection hit tests. These deterministic tests are not a multiplayer
latency benchmark.
Use [Testing strategy](../TESTING_STRATEGY.md#isolated-paint-acceptance-and-load-checks)
for reproducible built-UI acceptance/load checks and safety constraints.
Measured run results are not permanent guarantees about the live deployment.
