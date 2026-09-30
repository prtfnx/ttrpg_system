# Measurement and painting

Audience: contributors changing measurement tools, brush tools, paint sync, or
table units.

Status: current but partial. Paint strokes, completed measurement geometry,
and paint templates are server-authoritative multiplayer state. Advanced
measurement-template placement is not available in the UI.

Last source audit: 2026-09-29

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
`apps/server/service/paint_legacy_migration.py` prepares legacy rows for a
future cutover without writing the database. It deterministically maps IDs,
orders objects per table, validates converted payloads, hashes the source, and
reports every rejected row without copying raw paint data into the report.
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

The browser has not switched to these object messages yet, so the active UI
still uses the legacy stroke flow described below. The server retains both
paths during this staged cutover. The server-side object preview and preview
cancel relays are active, but have no browser producer or consumer yet. They
use the disposable preview traffic budget, derive actor identity from the
connection, authorize interactive table membership through a short-lived
cache, validate drafts, cap relays at 16 KiB, and never write durable state.

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
renderer detach, or context loss. Controller draft meshes are still pending,
so legacy stroke rendering remains alongside the object path during the staged
cutover. The renderer requests WebGL antialiasing for triangle-edge coverage;
implementations without multisample support fall back to hard triangle edges.
The typed runtime boundary exposes the lifetime mesh-rebuild count for
unchanged-frame regression checks.

The WASM paint system owns active drawing and rendering. A completed stroke is
sent with its stable id. The server requires the serialized stroke id to match,
accepts it for a table in the authenticated session, persists it, and broadcasts
the canonical record. An identical retry by the creator is idempotent. Joining
clients receive persisted strokes in the table response.

Roles allowed to interact can create strokes and delete their own strokes. DMs
can delete any stroke in their session and clear a table. Create, delete, and
clear first constrain the supplied table to the authenticated session; a DM
cannot mutate a foreign session by knowing a table or stroke id. Accepted
operations broadcast the same mutation so clients converge.

Paint persistence is blocking SQLAlchemy work, so stroke create/delete/clear
and template upsert/delete/sync run in worker threads. Each worker creates and
closes its own ORM session; only validated values cross the thread boundary,
and WebSocket broadcasts stay on the event-loop thread. This keeps paint
traffic from blocking unrelated connections and avoids sharing a synchronous
ORM session between threads.

## Undo and redo

Local undo removes the last WASM stroke and requests deletion with its accepted
id. The server permits that only when the connected user created the stroke or
has a DM role. Redo recreates the same stroke through the idempotent create
path. Cross-session table access, mismatched identities, and deletion of another
creator's stroke fail closed.

Paint templates are session-scoped and server-authoritative. The browser keeps
only an optimistic in-memory cache, requests a snapshot on session entry and
reconnect, and reconciles confirmations and live changes. Creators may replace
or delete their own templates; DMs may delete any template. Import/export
remains available.

The server validates template names, descriptions, WASM stroke structure,
finite coordinates, stroke widths, thumbnail media/base64 shape, and bounded
payloads. Limits are 100 templates per session, 500 strokes per template,
20,000 points per stroke, 1 MiB per template, and 128 KiB per thumbnail.

## Verification

Run the measurement and painting Vitest suites, browser protocol tests, server
paint/table protocol tests, and Rust paint/WASM tests. The advanced-panel
component tests assert that unfinished measurement-template controls stay
hidden. Include a multi-client acceptance test for any change to stroke
identity or undo authority. Server tests also assert that measurement, stroke,
and paint-template database operations leave the event-loop thread and that an
identical stroke-create retry does not broadcast twice. Durable-object tests
cover idempotent commands, optimistic conflicts, authoritative snapshots,
bounded chunks, and worker-thread database execution.
`test_postgresql_contract.py` separately launches simultaneous writers against
one paint table and requires distinct gap-free revisions and z-order values,
then verifies a fresh service snapshot. This test is skipped unless
`TEST_POSTGRESQL_DATABASE_URL` targets an explicitly disposable test database;
SQLite results are not evidence for row-lock behavior.
