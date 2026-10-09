# Canvas commands and history

Audience: contributors changing canvas mutations, selection, or undo/redo.

Status: partial. Current command paths exist; mixed-domain atomic history is not
implemented.

Last source audit: 2026-10-06

## Ownership and current flow

React owns input and authoring intent. `WasmRuntime` owns renderer attachment
and callbacks. Rust owns geometry, picking, and local previews, not durable writes.
`wasmBridge.ts` forwards completed sprite transforms with action IDs and tracks
acknowledgements. Sprite protocol handlers authorize commands and invoke
`core_table.actions_core.ActionsCore`; accepted table snapshots persist before
success. Paint commands use `PaintObjectService` transactions, object versions,
table revisions and an operation-result ledger. Combat uses its separate
`CombatCommandService`, not canvas history.

## Transport batching

`batch_request` reduces WebSocket framing overhead. It is not a database
transaction and does not create one undo step. The session mutation lock covers
the batch; each child retains its normal authorization and persistence path.
The dispatcher preflights 1–100 message objects and rejects nested batches before
dispatching any child. Malformed children and unsupported types produce errors.
Child responses preserve their own correlation/causation IDs. `batch_response`
reports `failed_count` and `atomic: false`; no response does not prove persistence.
Errors do not echo complete input payloads or internal exception details.
Mutation-coupled session autosave runs only after an accepted response, not after
permission or validation rejection.

Regression owners: `apps/server/tests/unit/test_command_batches.py` and
`test_protocol_serialization.py`.

## Existing history boundaries

`ActionsCore` and Rust `ActionsClient` have separate process-local history stacks.
They are not a shared durable per-user editor history. The runtime bridge tracks
pending confirmations, not undo steps. Paint's retry ledger is an idempotency
record, not an undo journal. Multiplayer undo must not treat remote events or
unconfirmed previews as accepted local edits.

## Missing

Mixed paint/sprite transactional writes, per-user accepted-command history,
conflict-safe inverse commands, and group clipboard/resize/rotation shortcuts are
not implemented. Existing transport batches cannot supply those guarantees.
See [Measurement and painting](../features/MEASUREMENT_AND_PAINTING.md) for the
currently supported selection operations and limits.
