# Measurement and painting

Audience: contributors changing measurement tools, brush tools, paint sync, or
table units.

Status: current but partial. Paint strokes, replay, and creator-owned undo are
implemented. Measurements and paint templates are browser-local product
choices.

Last source audit: 2026-07-21

## Ownership

- `apps/web-ui/src/features/measurement/` owns browser measurement state.
- `apps/web-ui/src/features/painting/` owns painting UI and template state.
- `apps/server/service/protocol/paint.py` authorizes and persists paint writes.
- `apps/server/service/protocol/tables.py` includes paint state during table
  synchronization.
- `apps/server/database/models.py` defines `PaintStroke`.
- `packages/rust-core/src/systems/paint.rs` owns canvas paint rendering and
  local stroke history.

## Measurement flow

The browser calculates distances, angles, shapes, snapping, and spell-template
geometry. Table unit changes synchronize the measurement service and WASM
runtime. Export/import applies to the local measurement document only.

Measurements are not shared multiplayer state and are not restored by the
server. If shared measurements become a release requirement, define their
visibility, ownership, lifetime, and reconnect model before adding persistence.

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

Paint templates are browser-local. Persist them only after deciding whether
they belong to a user, session, or table.

## Verification

Run the measurement and painting Vitest suites, browser protocol tests, server
paint/table protocol tests, and Rust paint/WASM tests. Include a multi-client
acceptance test for any change to stroke identity or undo authority.
