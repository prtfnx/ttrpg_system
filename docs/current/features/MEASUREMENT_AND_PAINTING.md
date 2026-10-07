# Measurement and painting

Audience: contributors changing measurement, paint tools, reconciliation, or rendering.

Status: usable. Completed measurements and paint objects are server-authoritative.

Last source audit: 2026-10-05

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
object. Geometry uses local coordinates; translation and positive X/Y scale
place it in world coordinates. Version one has no rotation. Square/circle
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

`PaintObjectService` serializes mutations through table-scoped locks and
`paint_state`. Normal table creation and migration seed revision-zero state
rows. Each accepted command assigns one table revision; updates increment the
object version without changing creator or `z_order`. Durable writes and their
operation results commit together before network delivery. Writer fencing
also applies to the object, state, and ledger tables.

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
Selection/handles use screen-space hit tolerance through camera zoom.

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
retention. These deterministic tests are not a multiplayer latency benchmark.
Use [Testing strategy](../TESTING_STRATEGY.md#isolated-paint-acceptance-and-load-checks)
for reproducible built-UI acceptance/load checks and safety constraints.
Measured run results are not permanent guarantees about the live deployment.
