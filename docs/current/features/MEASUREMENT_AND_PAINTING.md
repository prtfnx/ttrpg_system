# Measurement and painting

Audience: contributors changing measurement tools, brush tools, paint stroke
sync, or table unit behavior.

Status: current but partial.

Last source audit: 2026-07-09

## Source owners

- `apps/web-ui/src/features/measurement/`: measurement panels, simple
  measurement display, advanced measurement hook, and measurement service.
- `apps/web-ui/src/features/painting/`: paint panel, paint hook, brush presets,
  and paint template service.
- `apps/web-ui/src/features/canvas/components/ToolsPanel.tsx`: tool selection
  entry point.
- `apps/web-ui/src/store.ts`: table unit state and sync to measurement/WASM.
- `apps/server/service/protocol/paint.py`: paint stroke create, delete, and
  clear handlers.
- `apps/server/service/protocol/tables.py`: table unit settings and join-time
  paint stroke sync inside `table_response`.
- `apps/server/database/models.py`: `PaintStroke` persistence.
- `packages/rust-core/src/systems/paint.rs`: WASM paint stroke storage,
  brush state, undo/redo, serialization, and rendering.

## What the feature does

Measurement is browser-owned. It calculates distances, angles, shapes, grid
snapping, spell templates, and exported measurement data in
`advancedMeasurementSystem`. Table unit changes call
`advancedMeasurementSystem.syncWithTableUnits()` and update WASM table units.

Painting is shared state. The WASM paint system owns active drawing and
rendering. When a completed stroke is accepted in the browser, the protocol
sends the serialized stroke to the server so it can be persisted and replayed
for other clients.

## Measurement state

`advancedMeasurementSystem` stores measurements, shapes, grids, templates,
history, settings, and callbacks in memory. It supports square, hex,
isometric, and triangular grid calculations. It can export and import its own
JSON data, but it does not currently persist measurements to the server.

The lightweight `MeasurementTool` listens for `measurementComplete` browser
events and displays the last result while active.

## Paint protocol

Current paint messages:

- `paint_stroke_create`
- `paint_stroke_delete`
- `paint_stroke_clear`
- `paint_sync`

`usePaintSystem()` sends:

- `createPaintStroke()` after `paint_end_stroke()`;
- `deletePaintStroke()` after undo removes the last stroke;
- `createPaintStroke()` after redo restores a stroke;
- `clearPaintStrokes()` after local clear.

Server behavior:

- Create is allowed for roles that can interact.
- Delete and clear are DM-only.
- Create stores `stroke_data` as JSON text in `PaintStroke`.
- Delete removes one stroke by id.
- Clear removes all strokes for a table.
- Each accepted mutation broadcasts the same paint message to the session.

## Persistence and join sync

`PaintStroke` stores `table_id`, `stroke_id`, serialized `stroke_data`,
`created_by`, and `created_at`.

`handle_table_request()` includes persisted paint strokes in `table_response`
so a joining client can rebuild the paint layer for the active table. WASM also
has helpers to add a remote stroke, remove by id, clear, and load serialized
stroke lists.

## Tests to run

- `apps/web-ui/src/features/measurement/services/__tests__/advancedMeasurement.service.test.ts`
- `apps/web-ui/src/features/measurement/components/**/__tests__/`
- `apps/web-ui/src/features/painting/components/__tests__/PaintPanel.test.tsx`
- `apps/web-ui/src/features/painting/hooks/__tests__/usePaintSystem.test.tsx`
- `apps/web-ui/src/features/painting/services/__tests__/paintTemplate.service.test.ts`
- `apps/web-ui/src/lib/websocket/__tests__/clientProtocol.test.ts`
- `apps/server/tests/unit/test_tables_protocol.py`
- Rust tests under `packages/rust-core/src/systems/paint.rs` and
  `packages/rust-core/tests/`

Use Vitest for measurement and paint UI changes. Use server protocol tests when
paint persistence or permissions change. Use Rust/WASM tests for brush,
serialization, undo/redo, or render behavior.

## Known edges

- Measurements are local browser state, not multiplayer server state.
- Paint templates are stored by the browser-side template service, not in the
  database.
- Paint undo/redo sync depends on the last WASM stroke id matching the server
  stroke id.
