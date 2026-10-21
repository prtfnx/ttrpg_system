# Action confirmation and continuous editing

Audience: contributors changing optimistic table edits, command transport, or recovery.

Status: usable.

Last source audit: 2026-10-20

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
| Server admission | `service/websocket_inbox.py` keeps at most 64 waiting frames and 2 MiB per connection. Pings bypass mutation work. Disposable previews cannot grow a busy queue. Durable overflow closes the connection for recovery. |
| Compatible sprite run | Merge already-queued, adjacent compatible sprite frames into at most 50 commands. Do not add a debounce delay or cross query/other-domain barriers. `sprite_command_batch.py` privately stages the run. |
| Database | Commit final affected sprite rows, individual journal entries and receipts together. Coalesce repeated writes to the same sprite within the run while preserving every gesture's history boundary. Other domains retain their own transactions. |

`service/sprite_delta_persistence.py` writes affected sprites and the table
timestamp without rewriting unrelated sprites, walls or settings. Raw commands
copy target entities and index containers; canvas commands fork a locked table
in their worker and replace affected entities. Unrelated entity metadata is not
serialized to stage these edits. External snapshot-based service callers retain
their full-snapshot fallback. Index-container copying still scales with table size.

Batch replay preflight groups lookups by actor/table. Each write still checks
authorization inside its transaction. Validation denials are independent within
a run. A failed shared transaction publishes none of that run's provisional state.
Identical table settings confirm without another write or redundant broadcast.
Wall writes use worker-owned transactions before replacing live state.

Success means the database committed. There is no multi-second memory-only
write-behind cache. Isolated commands can still require individual transactions.
Autosave and idle cleanup flush failed pending writes instead of rewriting every
loaded table. The explicit full-session save API remains available. Last-client
disconnect retains the session cache for a five-second reconnect grace period;
shutdown still attempts cleanup immediately and retains failed writes for retry.

## Outcomes and recovery

Responses retain causation/correlation and relevant action, operation, table and
sprite identities, including endpoint and schema rejection before dispatch.
Only bounded identity fields are echoed from rejected input. An unexpected
handler failure reports `outcome_unknown` with `resync_required`; it cannot prove
rollback. Early generic errors also release matching canvas/paint command owners.

Completed batch members receive individual correlated outcomes after their
transaction/run finishes. A later unrelated member cannot withhold them. The
final `batch_response` excludes streamed outcomes and retains counts and
`atomic: false`. Snapshots and paint chunks use separate bounded streams.
Failure of the optional in-memory sprite history cache after commit keeps the
accepted result and canonical peer publication; the transactional journal owns
undo. Batched cache failures can additionally request a fresh snapshot.

Raw sprite recovery uses a five-second idle confirmation watchdog. The common
ledger uses ten seconds idle. Correlated table outcomes restart remaining idle
watchdogs, bounded by a sixty-second lifetime for each pending command. This
does not turn a timeout into denial. Paint/canvas acknowledgement retries use
ten seconds and retain operation/envelope identity, body and intent timestamp.
Other non-idempotent writes are not blindly replayed on reconnect.

Recovery requests the complete active table plus a separate revisioned paint
snapshot. Only validated store/renderer hydration resolves commands in the
request watermark; newer pending intent is replayed over the new baseline.
Canvas transmission and retry pause during recovery, including a version
conflict, until the validated snapshot rebases queued intent. Recovery that does
not complete within ten seconds replaces the socket. Old recovery timers and
socket callbacks cannot close or mutate the replacement connection.

Wall edits targeting a provisional creation remain local until its correlated
canonical wall arrives. The client remaps those commands to the server wall ID
and sends them in order. Creation denial removes dependent previews. When a
recovery snapshot resolves creation without its mapping, untransmitted dependent
wall edits are discarded because their server identity cannot be reconstructed.

The session-owned table sync service invalidates its cached snapshot on canonical
sprite, wall and settings changes, including while the renderer is detached.
Reattachment requests a fresh snapshot when that cache is invalid, rather than
reinstalling stale table contents. Texture readiness resets with renderer detach.

## Delivery and disposable previews

`service/websocket_outbox.py` provides one FIFO writer per registered socket,
shared by protocol frames, connection-manager frames and lifecycle notices.
Mutation handlers enqueue canonical events and receipts without waiting for a
slow peer's network writes. Existing layer filtering still controls recipients.

Ordinary delivery permits 256 queued items and 4 MiB, including ordinary bytes
in flight. Preview overflow can drop samples. Durable overflow or send failure
disconnects that peer for recovery. Table and paint recovery permit two queued
snapshot streams, each capped at 2,048 frames and 128 MiB serialized total.
Frames serialize lazily; the domain snapshot itself is still materialized.
The browser paint assembler caps recovery at 2,000 chunks/32 MiB.

Failed browser batch transmission retains exact queued commands and reconnects.
Following direct commands cannot overtake that batch. Heartbeats send directly;
the server reader handles them while mutation dispatch is waiting. Any valid
incoming message also establishes browser liveness while a pong is delayed.

Sprite samples capture their table before throttling. Commit and cleanup cancel
trailing timers. The server validates bounded expiry/sequence metadata and
supplies source identity. Remote previews reject older sequences, wrong tables,
invalid data and expired samples. A bounded lease restores the current store
projection if no canonical event arrives. A two-second grace after a canonical
transform blocks delayed first samples; it can suppress peer previews during a
rapid next gesture. Expiry still depends on client wall clocks. These preview
limitations do not delay durable commands.

The client drops previews above 64 KiB socket buffering. The common ledger caps
outstanding mutations at 256; shared canvas intent is capped at 100. Existing
server rate accounting still applies per member, including queries.

## Verification and limits

Browser regression owners include `clientProtocol.test.ts`,
`commandTracking.test.ts`, `wallCommandSync.test.ts`, `tableSync.service.test.ts`,
`wasmBridge.test.ts` and painting controller tests. Server owners include
`test_websocket_inbox.py`, `test_sprite_editor_protocol.py`,
`test_sprite_command_persistence.py`, `test_canvas_protocol.py`,
`test_websocket_rate_limit.py`, `test_connection_shutdown.py` and
`test_game_session_protocol.py`. `test_command_policy.py` compares client/server
mutation sets. SQL probes measure isolated SQLite work, not deployed PostgreSQL.

One session mutation lock remains. Authorization and history reads remain per
command. Same-object canvas edits still require predecessor confirmation before
transmission. A large ordered snapshot can delay later frames on its own socket;
the server send timeout applies per frame, while browser recovery has a total
ten-second watchdog. Tests do not establish a production latency bound.
Use the timings in [Observability and logging](../operations/OBSERVABILITY_AND_LOGGING.md)
to separate queue, lock, worker, SQL and delivery delays.

See [Canvas commands and history](COMMAND_AND_HISTORY.md),
[Protocol boundary](../PROTOCOL_BOUNDARY.md), and
[Measurement and painting](../features/MEASUREMENT_AND_PAINTING.md).
