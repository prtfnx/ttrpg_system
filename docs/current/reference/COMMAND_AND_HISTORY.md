# Canvas commands and history

Audience: contributors changing canvas mutations, selection, or undo/redo.

Status: partial. Mixed-domain transactions, browser group commands and durable
selection history exist. Legacy single-command history remains separate.

Last source audit: 2026-10-07

## Ownership and current flow

React owns input and authoring intent. `WasmRuntime` owns renderer attachment
and callbacks. Rust owns geometry, picking, and local previews, not durable writes.
`wasmBridge.ts` forwards completed sprite transforms with action IDs and tracks
acknowledgements. Sprite protocol handlers authorize commands and invoke
`core_table.actions_core.ActionsCore`; accepted table snapshots persist before
success. Paint commands use `PaintObjectService` transactions, object versions,
table revisions and an operation-result ledger. Combat uses its separate
`CombatCommandService`, not canvas history.
`PaintObjectService.apply_in_transaction` stages a paint command inside a
trusted caller's active ORM transaction. It retains normal authorization,
version, budget and retry checks. The caller must roll back on an error result
and publish only after its outer commit succeeds. Standalone paint commands
still own their own transaction.
Standalone accepted paint create/update/delete also record their before/after
delta in `canvas_command_journal` inside that same transaction. Drawing,
non-uniform handle resizing, endpoint editing, rotation and restyle therefore
share durable selection history. Borrowed transactions do not record extra
child history entries; their caller records the composed command once.
`service/canvas_journal.py` owns shared retention. A failed journal write rolls
back the object, paint revision and retry ledger together. Identical standalone
retries return before history recording and never add a second undo step.

## Durable canvas transaction service

`apps/server/service/canvas_command_service.py` composes paint and sprite edits
inside one database transaction. The `canvas_command` handler holds the session
mutation lock, serializes against table saves, provides an isolated live table
snapshot, and publishes the returned table and events only after durable success.

Supported modes are transform, delete, copy, cut, paste, undo and redo. A
transform uses one translation, uniform scale and rotation around a shared world
pivot. Paint angles use radians; persisted sprite angles use degrees. Sprite
anchors round to integer coordinates. Line endpoints and polygon vertices remain
world-space geometry. Light moves are supported; group light resize and rotation
reject. Movement checks validate the exact group endpoint rather than snapping
each member independently. Combat tokens cannot use editor mutations. Both
live combat IDs and persisted active encounters fence editor operations, so an
unhydrated combat-engine cache after restart does not bypass combat authority.

The service rechecks database membership and permissions for every command,
including retries and inverse commands. Paint requires creator or DM authority.
Sprites require a visible layer and control or DM authority. Sprite deletion,
including undoing a paste, remains DM-only. Player sprite quotas still apply.
One invalid, stale, forbidden, occupied or out-of-bounds member rejects the whole
command. Commit failure does not publish a table or advance history.

`canvas_command_journal` stores per-actor, per-table deltas. Undo checks only the
affected objects, so unrelated remote edits survive. A changed affected object
blocks undo without advancing history. Paint comparisons ignore monotonically
increasing version/update timestamps, but retain content and provenance checks.
Restoring a deletion preserves creator, creation time, order and sprite controls.
New edits abandon that actor's redo branch; copying does not.

Copy captures authoritative server content. Paste accepts a clipboard token,
new IDs and a transform, not arbitrary sprite metadata or ownership fields.
Clipboard tokens are actor/table-scoped and expire after 24 hours. Fresh copies
receive server-owned paint provenance and normal sprite controls. Linked sprite
character and asset references stay shared, as with table copying.

Commands allow 1–100 objects, a 60 KiB request, a 1 MiB delta and bounded individual
event frames. Retained deltas share a 100-entry/4 MiB budget per actor/table and
expire after 48 hours. Expiring a delta preserves its small retry receipt.
The existing hourly paint retention job also removes journal rows older than
48 hours. Intent timestamps reject commands older than 24 hours or more than
60 seconds in the future. An identical operation ID/body returns the accepted
receipt without another write. Reusing an ID with another body rejects. Retries
request fresh hydration rather than replaying unversioned historical sprite
events. Process restart preserves journal history; legacy command paths do not
automatically enter this journal.

Regression owners: `apps/server/tests/unit/test_canvas_command_service.py` and
`test_paint_operation_cleanup.py`.

The canonical protocol schema defines `canvas_command`, `canvas_command_result`,
`canvas_history_request` and `canvas_history_state`. Command payloads reject
unknown fields and mode-inconsistent fields. Both generated language registries
share this contract. `packages/core-table/tests/test_canvas_protocol_schema.py`
owns the payload boundary tests.

`service/protocol/canvas.py` registers the command and history request handlers.
The server derives actor/session identity from the authenticated connection,
not the payload. `TableManager.table_write_lock` serializes snapshot writes,
deletes and composed editor transactions. Cancellation waits for the worker's
commit and live-table publication before releasing the session lock, even after
repeated cancellation. Accepted paint events broadcast normally; sprite events
use existing layer-filtered delivery. The sender receives canonical events
before its command receipt. A post-commit transport failure preserves success
and requests resynchronization. Unexpected storage errors return a safe message,
not database details. History reads share the session lock and return only the
current actor's availability, not scene snapshots or other users' history.
Regression owner: `apps/server/tests/unit/test_canvas_protocol.py`.

`CanvasCommandController.ts` owns browser command acknowledgements and clipboard
tokens. Its transport sends directly only on an open socket; it does not put
editor writes in the generic transport batch/queue. The controller registers an
intent before sending, accepts only its matching operation/table receipt, and
allows one pending editor command in the active actor/table scope. Missing
acknowledgements retry the identical body after ten seconds or reconnect. The
24-hour retry deadline reloads uncertain state instead of replaying an expired
intent. Actor/table replacement drops local pending references and clipboard
tokens. Durable accepted history stays on the server. Copy/duplicate waits for
the server clipboard token before paste; fresh paste IDs never contain client
metadata. A conflict or replay receipt requests fresh hydration. The controller
does not own domain previews or replace legacy history. The paint provider
attaches this owner to the selection controller for its session lifecycle.
Regression owner:
`apps/web-ui/src/features/painting/controller/__tests__/CanvasCommandController.test.ts`.

`PaintInteractionController.setCanvasCommandPort` connects selection intent to
this owner. With the port attached, mixed drags and selected-object deletion use
one expected-state command instead of per-member writes. Selection clipboard,
duplicate, shared-pivot uniform scale/rotation, one-unit arrow nudging (ten with
Shift), and Ctrl/Cmd undo/redo route through the same owner. Text-entry targets
retain their native shortcuts. Pending paint intent blocks a new selection
command; pending canvas intent blocks new pointer authoring. Locked members are
excluded from the editable command, and the server validates every included
member atomically. The sprite selection adapter captures the authoritative
transform projection rather than renderer preview coordinates. Regression owner:
`apps/web-ui/src/features/painting/controller/__tests__/PaintInteractionController.test.ts`.

## Transport batching

`batch_request` reduces WebSocket framing overhead. It is not a database
transaction and does not create one undo step. The session mutation lock covers
the batch; each child retains its normal authorization and persistence path.
The dispatcher preflights 1–50 message objects and rejects nested batches before
dispatching any child. Malformed children and unsupported types produce errors.
Child responses preserve their own correlation/causation IDs. `batch_response`
reports `failed_count` and `atomic: false`; no response does not prove persistence.
The summary remains schema-valid when no child returns a response.
Errors do not echo complete input payloads or internal exception details.
Mutation-coupled session autosave runs only after an accepted response, not after
permission or validation rejection.

Regression owners: `apps/server/tests/unit/test_command_batches.py` and
`test_protocol_serialization.py`.

## Existing history boundaries

Python `ActionsCore.batch_actions` is a trusted domain API, separate from
`batch_request`. It accepts 1–100 supported sprite/table edits for one canonical
table ID. Child commands cannot override session/table context or update identity,
indexing and control fields through generic updates. Malformed command names
reject without staging edits. The caller must authorize
each edit using existing protocol rules and hold the session mutation lock; this
API is not registered as a client message and does not itself verify membership.
Undo/redo callers must also recheck current permissions; history is not permission
to edit an object after role or control changes.
Persistent calls require explicit trusted session/actor IDs. An optional
`expected_state` content hash rejects stale starting state.
Supported edits are sprite create/delete/move/scale/rotate/update, sprite layer
changes, table update/move/scale, and layer visibility. Table create/delete,
wall, paint and combat commands are not domain batch operations. Light sprites
use the same sprite commands; renderer lighting APIs do not write domain history.

After authorization, inside the existing session mutation lock, a caller can use:

```python
result = await actions.batch_actions(
    [{"type": "rotate_sprite", "params": {"sprite_id": sprite_id, "angle": 90}}],
    table_id=table_id, session_id=session_id, actor_id=user_id,
)
```

The same trusted context scopes `undo_action` and `redo_action`. These calls are
declared by `core_table.async_actions_protocol.AsyncActionsProtocol`. They are
Python domain APIs, not new browser or WebSocket commands.

Commands apply to an isolated table. All must succeed and round-trip through table
serialization before one snapshot save. Failure leaves live state and history
unchanged, with no delayed retry of a rejected batch. Publication and history
follow durable success. Cancellation waits for commit/publication/history before
the caller releases its mutation lock; a cancelled request may have committed.

Accepted batches form one undo step in the existing Python stacks, scoped by
table/session/actor. Undo/redo checks the complete expected table state and saves
the inverse before publication. Conflicts and failed saves keep both stacks
unchanged. Another actor's command does not clear your redo entries; conflicting
state still blocks replay. History is process-local, at most 100 entries and
4 MiB of snapshot data; each before/after snapshot is bounded to 1 MiB.
Server restart does not preserve this undo history. Legacy single commands are
accepted-command audit entries, not falsely reversible history. Python table
update/move/scale enter the audit only after persistence succeeds.
Regression owners: `packages/core-table/tests/test_action_batches.py` and
`apps/server/tests/unit/test_action_batch_persistence.py`.

The sprite bridge registers pending state before sending, including synchronous
acknowledgements. It allows at most one unconfirmed transform per sprite/property
and 100 pending commands overall. A subsequent transform of that property restores
the pending preview and asks the user to wait. Accepted server seeds take
precedence over late acknowledgements; rejection restores the current authoritative
baseline, not an obsolete pre-command snapshot. Timers cannot revert another
active table. Protocol replacement, cleanup and sprite removal release tracking.
Renderer rollback waits for the current WASM callback to unwind. It rechecks the
table, lifecycle and latest baseline before applying; stale queued work is dropped.
Non-interactive roles, invalid transforms and synchronous send failures do not
leave untracked writes or delayed failure timers. The bridge remains a confirmation
tracker, not an undo journal. Regression owner:
`apps/web-ui/src/lib/wasm/__tests__/wasmBridge.test.ts`.
Legacy sprite-selection movement still uses the sprite bridge confirmation
owner. The shared paint provider attaches the canvas command owner instead;
mixed editor movement uses its atomic server transaction. Combat tokens reject
editor group mutation and must use the separate combat command path.

Rust `ActionsClient` is an isolated local-domain utility, not the renderer's
authoritative multiplayer scene. Its undo/redo reverses table and sprite CRUD,
updates, layer changes and visibility. Each inverse checks the expected current
state; a conflicting or unsupported entry fails without advancing the stacks.
Undo and audit stacks retain at most 100 entries. Local batches accept 1–100
supported actions, suppress intermediate notifications, roll back on any failure,
and produce one history entry on success. These guarantees concern only the
utility's local maps; they do not persist or broadcast a canvas edit.
Action results and history serialize as JSON-compatible plain objects rather
than JavaScript `Map` instances. Invalid fields, malformed updates, non-finite
positions and non-positive dimensions reject before mutation or history recording.
The checked-in optimized artifact in `apps/web-ui/src/lib/wasm/generated/`
includes these local action fixes. Rebuild it from `packages/rust-core` with
`wasm-pack build --release --target web --out-dir ../../apps/web-ui/src/lib/wasm/generated --features wasm-start`.
Regression owners: `packages/rust-core/src/actions/mod.rs` and
`packages/rust-core/tests/wasm_node.rs`.

`ActionsCore` and Rust `ActionsClient` have separate process-local history stacks.
They are not a shared durable per-user editor history. The runtime bridge tracks
pending confirmations, not undo steps. Paint's retry ledger is an idempotency
record, not an undo journal. Multiplayer undo must not treat remote events or
unconfirmed previews as accepted local edits.

## Missing

Legacy single-command sprite history remains separate: normal separate-mode
sprite commands and standalone text edits do not enter the durable canvas
journal. Group resize and rotation
currently use panel controls, not group pointer handles. Transport batches
cannot supply atomicity.
See [Measurement and painting](../features/MEASUREMENT_AND_PAINTING.md) for the
currently supported selection operations and limits.
