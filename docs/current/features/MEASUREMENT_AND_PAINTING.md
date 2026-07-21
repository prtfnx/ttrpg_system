# Measurement and painting

Audience: contributors changing measurement tools, brush tools, paint sync, or
table units.

Status: current but partial. Paint strokes persist and replay. Measurements and
paint templates are browser-local, and multiplayer paint undo still needs an
explicit authoritative identity contract.

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
sent to the server, persisted for its table, and broadcast to the session.
Joining clients receive persisted strokes in the table response.

Roles allowed to interact can create strokes. Delete and clear are DM-only on
the server. Accepted create, delete, and clear operations broadcast the same
mutation so clients converge.

## Unresolved boundary

Local undo asks WASM for its last stroke id and sends that id to the server;
redo sends the restored stroke again. That assumes the local id is the same
stable server identity and leaves non-DM undo inconsistent with the DM-only
delete policy.

Before calling collaborative undo/redo complete:

1. make create return or acknowledge the authoritative stroke id;
2. retain that id in the browser history entry;
3. define whether creators may delete their own stroke or undo remains DM-only;
4. test two clients, reconnect, retry/idempotency, and unauthorized deletion.

Paint templates are browser-local. Persist them only after deciding whether
they belong to a user, session, or table.

## Verification

Run the measurement and painting Vitest suites, browser protocol tests, server
paint/table protocol tests, and Rust paint/WASM tests. Include a multi-client
acceptance test for any change to stroke identity or undo authority.
