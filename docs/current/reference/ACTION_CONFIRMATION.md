# Action confirmation and continuous editing

Audience: contributors changing optimistic table edits, command transport, or recovery.

Status: usable.

Last source audit: 2026-10-16

## Ownership

The server owns accepted state. Local previews remain immediate while a command
waits for durable confirmation. A denial removes that action's pending intent;
the client replays later intent over its authoritative baseline. It does not
restore an old whole-table snapshot over another client's accepted changes.

| Domain | Client owner |
| --- | --- |
| Sprite transforms and light movement | `apps/web-ui/src/lib/wasm/wasmBridge.ts`: confirmed transforms plus ordered pending actions. |
| Shared sprite/paint selection and property edits | `CanvasCommandController.ts`, `CanvasOptimisticState.ts`, and `createCanvasOptimism.ts` under `features/painting/controller/`. |
| Standalone paint | `PaintController.ts`: confirmed objects, visible projection, object versions and durable retry identities. |
| Table settings | `apps/web-ui/src/lib/websocket/tableSettingsBuffer.ts`: authoritative settings plus pending patches. |
| Walls and doors | `apps/web-ui/src/lib/websocket/wallCommandSync.ts`: confirmed walls, pending patches/toggles and temporary creation identities. |

Canvas edits on disjoint objects can proceed independently. Same-object canvas
and paint edits preview immediately but wait at the wire boundary for their
predecessor so expected state/version can be rebased. Shared sprite edits also
wait for an outstanding raw sprite command on that object. Clipboard and history
operations retain their ordering barriers. Actor/table replacement clears the
shared editor scope. Combat retains its separate command/sequence authority.

The common mutation ledger in `commandTracking.ts` covers every server mutation
type. It excludes queries, previews and the outer batch envelope. Characters,
assets, chat and player administration retain their domain result handling;
the ledger does not turn them into speculative table edits or sprite batches.

## Accumulation and persistence

| Boundary | Contract |
| --- | --- |
| Browser transport | Flush after 30 ms or 15 members; split by complete UTF-8 envelope size at 64 KiB. Send a valid near-limit member directly if only its batch wrapper would overflow. |
| Table settings | Preview immediately; merge only unsent patches for the same table. Flush after 150 ms idle, within 500 ms of continuous input, or before a following dependent command. |
| Compatible sprite run | `service/sprite_command_batch.py` privately stages contiguous sprite create/remove/move/scale/rotate and editor-only updates, within the server's 50-member transport limit. |
| Database | Commit each compatible run's affected sprite rows, journal entries and receipts together. Preserve each gesture's history boundary. Other domains retain their own transactions. |

`service/sprite_delta_persistence.py` writes changed sprites and the table
timestamp without rewriting unrelated sprites, walls or settings. Both legacy
sprite commands and composed canvas commands use this boundary. Validation
denials are independent within a transport run. A failed shared write transaction
publishes none of that run's provisional state. Identical table settings return
a correlated confirmation without another write or redundant peer broadcast.

Success means the database committed. There is no multi-second memory-only
write-behind cache. Isolated commands can still require individual transactions.
Already-persisted sprite updates do not trigger a duplicate session autosave.
Wall writes use worker-owned transactions before replacing live state.

## Outcomes and recovery

Responses retain causation/correlation and relevant action, operation, table and
sprite identities, including schema rejection before dispatch. Only bounded
identity fields are echoed from rejected input. An unexpected handler failure
reports an uncertain outcome and requests recovery; it cannot prove rollback.
Early generic errors also release their matching canvas/paint command owner.

Completed batch members receive individual correlated outcomes after their
transaction/run finishes. A later unrelated member cannot withhold them. The
final `batch_response` excludes streamed outcomes and retains its counts and
`atomic: false` summary. Table snapshots and paint chunks are not nested inside
an oversized aggregate reply. A post-commit history/publication failure remains
durable success with `resync_required`.

Raw sprite confirmation uncertainty starts recovery after five seconds. The
common ledger and editor acknowledgement retry interval are ten seconds.
Timeout is not denial. Paint/canvas retries retain their operation/envelope
identity, original body and intent timestamp. Other non-idempotent writes are
not blindly replayed on reconnect.

Recovery requests the complete active table plus a separate revisioned paint
snapshot. Only validated store/renderer hydration resolves commands in the
request's watermark; newer pending intent is replayed over the new baseline.
Paint keeps its own revision and operation fences. A table recovery that does
not complete within ten seconds closes the socket for reconnect/hydration.
Incoming frames remain ordered; replaced socket callbacks are ignored.

## Delivery and disposable previews

`service/websocket_outbox.py` provides one FIFO writer per registered socket,
shared by protocol frames, connection-manager frames and lifecycle notices.
Mutation handlers enqueue canonical events and receipts without waiting for a
slow peer's network writes. Existing layer filtering still controls recipients.

Ordinary delivery permits 256 queued items and 4 MiB, including ordinary bytes
in flight. Preview overflow can drop samples. Durable overflow or send failure
disconnects that peer for recovery. Table and paint recovery use at most two
ordered snapshot streams, each capped at 2,048 frames and 128 MiB serialized
total. Frames serialize lazily; the domain snapshot itself is still materialized.
The browser paint assembler independently caps recovery at 2,000 chunks/32 MiB.

Sprite samples capture their table before the throttle runs. Commit and cleanup
cancel trailing timers; a sample cannot acquire another table's ID after a
switch. The server validates bounded expiry/sequence metadata and supplies the
source client identity. Remote previews ignore older sequences, wrong tables,
invalid data and expired samples. A bounded lease restores the current store
projection if no canonical event arrives. A two-second grace period after a
canonical transform blocks delayed first samples; it can suppress peer previews
for a rapid next gesture, while local editing and durable commits remain immediate.

The client drops disposable previews above 64 KiB socket buffering. The common
ledger caps outstanding mutations at 256; shared canvas intent is capped at 100.
Existing server rate accounting still applies per batch member.

## Regression owners and limits

Browser coverage: `clientProtocol.test.ts`, `commandTracking.test.ts`,
`tableSettingsBuffer.test.ts`, `wasmBridge.test.ts`, `remoteSync.service.test.ts`,
`useSpriteDragSync.test.ts`, and the painting controller tests. Real renderer
coverage lives in `apps/web-ui/src/lib/wasm/__tests__/paintRendering.wasm-test.ts`.

Server coverage: `test_sprite_editor_protocol.py`, `test_sprite_editor_commands.py`,
`test_sprite_command_persistence.py`, `test_batch_message.py`,
`test_websocket_outbox.py`, `test_sprite_event_visibility.py`,
`test_game_session_protocol.py`, `test_tables_protocol.py`,
`test_wall_command_persistence.py` and `test_command_policy.py` under
`apps/server/tests/unit/`. The policy test compares client/server mutation sets.
SQL probes cover repeated and distinct-target bursts and unrelated table size;
they measure isolated SQLite work, not deployed PostgreSQL latency.

One session mutation lock remains. Whole-table clone/diff CPU work and
per-command authorization/history reads remain; table-level parallel execution
is not implemented. Current WebSocket processing metrics exclude time a frame
waited before `receive_text()` returned. Unit/browser tests do not establish a
production latency bound or substitute for PostgreSQL integration.

See [Canvas commands and history](COMMAND_AND_HISTORY.md),
[Protocol boundary](../PROTOCOL_BOUNDARY.md), and
[Measurement and painting](../features/MEASUREMENT_AND_PAINTING.md).
