# Measurement and painting

Audience: contributors changing measurement tools, brush tools, paint sync, or
table units.

Status: current but partial. Paint strokes, completed measurement geometry,
and paint templates are server-authoritative multiplayer state. Advanced
measurement-template placement is not available in the UI.

Last source audit: 2026-10-01

## Ownership

- `apps/web-ui/src/features/measurement/` owns browser measurement state.
- `apps/web-ui/src/features/painting/` owns painting UI and template state.
- `apps/server/service/protocol/measurements.py` authorizes completed
  measurement writes and snapshot synchronization.
- `apps/server/service/protocol/paint.py` authorizes and persists paint writes.
- `apps/server/database/models.py` defines `SharedMeasurement`, `PaintStroke`,
  `PaintObject`, paint operation state, and `PaintTemplate`.
- `packages/rust-core/src/systems/paint.rs` owns canvas paint rendering and
  local stroke history.
- `packages/rust-core/src/systems/paint_scene.rs` owns the staged authoritative
  object scene, deterministic ordering, bounds, and shared geometry hit tests.

## Measurement flow

The browser calculates distances, angles, shapes, and snapping. A completed
line or shape is sent with a stable id; the server validates finite, bounded
geometry, persists it for the active table, and broadcasts the canonical
record. Clients request an authoritative snapshot after reconnect and table
changes and reconcile dedicated server events without echoing them back.

Spell-area template definitions and geometry helpers remain internal building
blocks, but template placement is not a selectable tool or tab. Do not expose
it until preview, placement units, snapping, persistence/sync, role authority,
undo, and reconnect behavior are implemented and tested together. This avoids
presenting a control that can only end in a placeholder error.

Creators can replace or delete their own geometry. DMs can delete any
measurement and clear a table; spectators cannot write. A table is limited to
500 records and each serialized geometry payload to 64 KiB. Active drag
previews remain local and ephemeral.

Measurement upsert/delete/clear/sync persistence runs in worker threads. Each
worker owns its synchronous ORM session; validated identifiers and geometry
cross into the worker, while authorization and WebSocket delivery remain on
the event-loop thread.

## Paint flow

`packages/core-table/protocol/paint_object.schema.json` defines the version-one
payload contract for the replacement object model. It covers freehand paths,
lines, rectangles, squares, ellipses, and circles; separates client-editable
fields from server-owned identity metadata; and publishes the transport and
table resource budgets. The generator packages the schema with `core_table`.
`core_table.paint` applies the schema, rejects non-finite JSON values and
oversized serialized payloads, preserves square/circle aspect ratios, and can
enforce aggregate table object and point budgets at server boundaries.
`src/features/painting/model/paintObject.ts` provides the matching strict
browser types and runtime checks from the generated schema limits.
`apps/server/service/paint_legacy_migration.py` deterministically maps legacy
IDs, orders objects per table, validates converted payloads, hashes the source,
and reports every rejected row without copying raw paint data into the report.
`apps/server/scripts/cutover_legacy_paint.py` is the maintenance-only cutover
entry point. Every run writes a private lossless backup and a separate bounded
mapping/quarantine report before mutation. Apply mode requires the reviewed
source checksum, holds the existing database writer fence plus paint-table
locks, refuses quarantine unless explicitly acknowledged, verifies every
persisted object, leaves source rows intact for rollback, and is idempotent
until object state becomes live or otherwise diverges.
Backup/report and template-export artifacts are published with an atomic
no-replace filesystem operation, so concurrent maintenance processes cannot
win an existence-check race and overwrite one another's evidence.
`apps/server/service/paint_object_service.py` owns durable object transactions.
It derives roles from database membership, serializes mutations through
`paint_state`, assigns revisions and z-order, enforces ownership and optimistic
versions, records accepted operation IDs, and reads ordered snapshots. The
server registers create, update, delete, and snapshot handlers; blocking ORM
work runs in worker threads. Accepted mutations broadcast canonical object
events, retries return the recorded event without rebroadcasting, conflicts
include the current object, and snapshots are split into bounded ordered
chunks after the transaction closes. Operation replays are accepted only
within the configured retry window; an older recorded operation is rejected
with `retry_window_expired` so the client must obtain a fresh snapshot rather
than risk applying stale intent. A bounded hourly background job removes ledger
rows only after the longer configured retention period.
Migration `0010_paint_objects` seeds `paint_state` for existing tables, and
normal table creation adds the revision-zero state row in the same transaction
as each new table, including the bootstrapped demo table. Durable paint writers
therefore always lock an existing table-scoped row; their first mutation cannot
race to create the lock target.

The active browser uses the object protocol. The server keeps the three legacy
stroke message names registered only to return a deterministic
`upgrade_required` error; they cannot write, delete, clear, or broadcast legacy
state after cutover. The browser protocol exposes explicitly scoped durable
object commands and strict typed event, snapshot, preview,
preview-cancel, and operation-rejection events. Durable paint sends do not
enter the generic reconnect queue; the paint controller must retain and retry
the exact operation ID/body. Preview sends are best-effort and drop when the
browser WebSocket queue exceeds 64 KiB. The server derives actor identity,
authorizes interactive table membership through a short-lived cache, validates
drafts, caps relays at 16 KiB, and never writes durable preview state.
Join-time table hydration no longer queries or publishes `paint_strokes`;
clients obtain the current drawing exclusively through a versioned object
snapshot. Browser table hydration likewise ignores legacy stroke fields and
does not invoke the old Rust stroke loader or table selector.
The generic database CRUD module no longer exposes legacy stroke create, read,
delete, or clear functions. The `PaintStroke` model and source table remain
available only to the cutover verifier and rollback backup window.
The browser protocol no longer registers legacy stroke broadcasts, exposes
stroke create/delete/clear commands, or publishes legacy stroke DOM events.
`WasmRuntimePort` exposes only object snapshots, mutations, hit tests,
selection, and transient drafts; the legacy stroke load/add/remove/clear
facade is removed.
The toolbar keeps Rust in ordinary selection mode while an object paint tool
is active; it no longer enters or exits the retired Rust-local stroke mode.
`RenderEngine` no longer exports the old local stroke lifecycle, brush,
undo/redo, synchronization, or bulk-load methods, and its frame pass renders
only authoritative objects and transient object drafts.
The generic Rust mouse router has no paint input mode or stroke-start/move/end
branch. Pointer Events are owned exclusively by `PaintInteractionController`,
preventing an unsynchronized second drawing path.
The former exported Rust `PaintSystem`, legacy stroke storage, brush presets,
and stroke lifecycle tests are removed. The internal `PaintObjectRenderer`
contains only the authoritative scene, retained meshes, selection, and drafts.
The now-unused WebGL `LINE_STRIP` primitive is removed; every paint path uses
portable cached triangle geometry for width, pressure, caps, and joins.
Object snapshots now establish the renderer's active paint table directly;
draft-only browser tests activate an empty revision-zero snapshot instead of
calling a separate legacy table selector.
Selecting a different table also installs that empty scene before requesting
its asynchronous snapshot. This clears committed meshes from the previous
table immediately; chunks from an older controller generation remain ignored.
The controller rejects create, update, and delete submissions while that
snapshot is incomplete. Hydration is therefore a real readiness boundary, not
only a loading label, and no durable edit can be based on an unseen scene.
The browser runtime port and shared runtime types no longer expose default
brush presets; the object panel's explicit color, width, and fill state is the
only paint styling surface.
Real-browser WASM coverage activates paint through snapshots and no longer
asserts the removed brush-preset export; shared runtime test fixtures mirror
the narrower object-only port.
Shared module, integration, table-sync, and protocol mocks no longer advertise
the deleted stroke system or accept legacy hydration fields.
Generic renderer test helpers likewise omit the removed paint input mode.

`PaintController` now owns the staged authoritative browser scene. It assembles
bounded out-of-order snapshot chunks atomically, queues events during hydration,
applies only contiguous revisions, detects gaps, ignores stale tables, retains
exact pending operation bodies for retry, expires operations after the supported
window, and restores a recreated renderer from confirmed state. It also
coalesces local previews to 20 Hz and rejects stale, cancelled, or expired remote
previews. The application now mounts one controller per connected session
beneath the protocol and WASM runtime providers. The provider follows the
active table, subscribes to typed protocol events, advances snapshot and
preview expiry, disposes session state deterministically, and restores
confirmed objects after a WebGL canvas is attached or restored. The live canvas
and object panel use this controller.
Pending create/update commands and remote previews are mirrored into separately
keyed transient renderer drafts. Acceptance, rejection, cancellation, expiry,
and table changes remove those keys; renderer restoration reapplies only the
still-current pending and preview state.

Gesture geometry is constructed in world coordinates with local object points.
Rectangle and ellipse drags normalize either direction; square and circle drags
lock both axes to the larger delta. Freehand completion uses a spatial
simplifier while retaining endpoints and pressure discontinuities, then applies
the canonical 8,192-point ceiling. A freehand click remains a one-point dot.
`PaintInteractionController` owns one primary pointer and captures the active
table at pointer-down. It converts backing-pixel canvas coordinates through the
Rust camera once per coalesced sample, publishes renderer-only drafts and 20 Hz
previews, and emits at most one create/update command on release. Cancel, lost
capture, Escape, tool/table change, disable, unbind, and failed capture all
clear the local draft. Selection movement, deletion, and restyling check creator
or DM authority before submitting a versioned command.
The session provider creates that interaction controller beside the scene
controller and derives enablement only from the toolbar's `activeTool`. The live
canvas binds its Pointer Events route and suppresses matching legacy left-mouse
and delete handlers while paint mode is active. Right/middle-button camera input
and wheel zoom remain on the established canvas route. Closing the panel selects
the normal selection tool and therefore cancels any captured paint gesture.
The panel exposes Draw, Line, Rectangle, Square, Ellipse, Circle, Select/Edit,
and Delete to every interactive role. Its color, width, and fill controls map
directly to implemented object styles. Selection metadata reports object kind,
owner, and version; mutation actions are disabled when controller authorization
does not permit the current actor to edit that object. Templates, canvas-only
mode, fake marker/eraser choices, and global stroke undo/redo are no longer in
the active panel.
The obsolete polling `usePaintSystem` hook, its duplicate pointer interaction,
brush presets, and its tests have been removed. Object counts, pending state,
selection, and errors now update through controller subscriptions instead of
serializing the full legacy stroke scene every 250 ms.
The browser paint-template service and its tests are also removed because no
active object workflow imports it. Persisted template rows are deliberately
left intact on the server until a separate export/retirement migration is
approved; removing the browser service does not delete user data.

The replacement Rust scene does not originate
writes. It atomically validates/replaces snapshots, accepts only contiguous
table revisions and object versions, orders by immutable `z_order` then ID,
and provides transformed bounds and geometry-based topmost hit testing. The
render engine exposes snapshot, upsert, delete, revision/count, and hit-test
WASM methods; table switches clear stale object state. `WasmRuntimePort`
provides typed snapshot/upsert/delete, revision/count, and hit-test wrappers
and invalidates framed previews only after accepted scene changes. Authoritative
objects now tessellate into cached triangle geometry only on snapshot or
accepted change, render in stable object order under fog, and cull against the
world viewport. Paths use pressure-scaled triangle widths with round joins and
caps; filled and outlined forms use separate meshes. Hit-test tolerance is
converted from screen pixels through camera zoom. Triangle data is uploaded to
retained GPU buffers on first draw after a snapshot or changed object, reused
on unchanged frames, and explicitly deleted on update, deletion, table switch,
renderer detach, or context loss. Transient controller drafts use the same
validated geometry and triangle tessellation as committed objects, but remain
in a separately keyed scene that does not change table revision or retained
object buffers. Draft meshes replace in place, cull in world space, draw after
committed paint and below fog, and clear on table changes. The renderer requests
WebGL antialiasing for triangle-edge coverage;
implementations without multisample support fall back to hard triangle edges.
The typed runtime boundary exposes the lifetime mesh-rebuild count for
unchanged-frame regression checks.
Selected objects expose renderer-owned handles: exact transformed endpoints for
lines and transformed corner handles for every other kind. Handle hit tolerance
is converted from screen pixels through camera zoom. The renderer draws
screen-size-stable handle squares in the transient paint layer and clears
selection when its object disappears or the active table changes.
Resize commands keep the opposite corner anchored. Rectangle, ellipse, and
freehand objects may scale independently by axis; freehand points are not
rewritten. Square and circle use one uniform scale, while line handles replace
only the selected endpoint in local coordinates and preserve the other end.
The pointer controller tests a selected handle before testing object bodies.
Authorized handle drags remain transient until release and then send exactly
one complete versioned update. Selected handle overlays are reapplied after a
renderer/context recreation and cleared on deselection, deletion, disable, or
table change.

Paint templates are a retired legacy format. Before disabling their remaining
wire API, operators run `python scripts/export_paint_templates.py --output
<private-path>` from `apps/server`. The maintenance command takes the writer
fence, exports every raw stroke and thumbnail field without reinterpretation,
records a deterministic SHA-256 checksum, writes a private atomic artifact,
and refuses to replace an existing file. Keep that verified export through the
rollback window; the database table is retained read-only until a later
explicit removal migration.
The browser has no template handlers, send helpers, reconnect queue entries,
or protocol events; no production UI can read or mutate the legacy format.

## Verification

Run the measurement and painting Vitest suites, browser protocol tests, server
paint/table protocol tests, and Rust paint/WASM tests. The advanced-panel
component tests assert that unfinished measurement-template controls stay
hidden. Server tests assert that measurement and paint-template database
operations leave the event-loop thread and that retired stroke commands always
fail with `upgrade_required` without a write or broadcast. Durable-object tests
cover idempotent commands, optimistic conflicts, authoritative snapshots,
bounded chunks, and worker-thread database execution.
`test_postgresql_contract.py` separately launches simultaneous writers against
one paint table and requires distinct gap-free revisions and z-order values,
then verifies a fresh service snapshot. This test is skipped unless
`TEST_POSTGRESQL_DATABASE_URL` targets an explicitly disposable test database;
SQLite results are not evidence for row-lock behavior.
