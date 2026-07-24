# Measurement and painting

Audience: contributors changing measurement tools, brush tools, paint sync, or
table units.

Status: current. Paint strokes, completed measurement geometry, and paint
templates are server-authoritative multiplayer state.

Last source audit: 2026-07-23

## Ownership

- `apps/web-ui/src/features/measurement/` owns browser measurement state.
- `apps/web-ui/src/features/painting/` owns painting UI and template state.
- `apps/server/service/protocol/measurements.py` authorizes completed
  measurement writes and snapshot synchronization.
- `apps/server/service/protocol/paint.py` authorizes and persists paint writes.
- `apps/server/database/models.py` defines `SharedMeasurement`, `PaintStroke`,
  and `PaintTemplate`.
- `packages/rust-core/src/systems/paint.rs` owns canvas paint rendering and
  local stroke history.

## Measurement flow

The browser calculates distances, angles, shapes, snapping, and spell-template
geometry. A completed line or shape is sent with a stable id; the server
validates finite, bounded geometry, persists it for the active table, and
broadcasts the canonical record. Clients request an authoritative snapshot
after reconnect and table changes and reconcile dedicated server events
without echoing them back.

Creators can replace or delete their own geometry. DMs can delete any
measurement and clear a table; spectators cannot write. A table is limited to
500 records and each serialized geometry payload to 64 KiB. Active drag
previews remain local and ephemeral.

## Paint flow

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
paint/table protocol tests, and Rust paint/WASM tests. Include a multi-client
acceptance test for any change to stroke identity or undo authority.
