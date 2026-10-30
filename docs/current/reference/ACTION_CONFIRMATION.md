# Action confirmation and continuous editing

Audience: contributors changing optimistic table edits, command transport, or recovery.

Status: usable.

Last source audit: 2026-10-21

## Durable outcome inventory (October 29)

| Operation | Current acceptance and recovery boundary |
| --- | --- |
| Canvas/sprite/compendium placement | Existing actor/table receipts; NPC source, token and receipt share acceptance. Generic sprite commit-response uncertainty still needs reconciliation. |
| Paint and chat | Existing domain operation identities and durable results; retain those contracts. |
| Combat commands/start/end | Encounter journal and stable session barrier resolve uncertain commits; full lifecycle/browser acceptance remains a release gate. |
| Character update/repair | Source/version/audit/linked projections share a transaction; exact in-process CAS recovery is not a durable request ledger across restart. |
| XP award | Actor/session/domain-scoped original message identity; XP/version/audit/outcome share acceptance. See [Characters](../features/CHARACTERS_AND_COMPENDIUMS.md). |
| Table create/copy/delete and settings | No general durable original-intent lookup; reload and reconcile before repeating an uncertain operation. R4 remains open here. |
| Choice encounter transitions | Ordered snapshot/events with cancellation-safe publication; no durable retry receipt or general commit-uncertainty verifier yet. |

The new `session_operation_receipts` adapter borrows the caller's transaction:
it flushes without committing. Domain callers must authorize before lookup and
own serialization through effect, receipt acceptance and publication. Reusing
the same scoped identity with a different normalized payload rejects. Uniqueness
is enforced in SQL. Results are bounded to 32 KiB and omit full source documents.
Receipts currently remain for the retained session lifetime; no cleanup expires
an accepted intent into a new operation. This adapter alone adds no guarantees
to an operation until that operation's effect uses the same transaction.

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

Canvas edits preview immediately and permit at most eight in-flight commands.
On servers advertising welcome envelope version `0.2`, transform, sprite property
and paint restyle commands can pipeline on the same objects. Each affected member
links to its latest unconfirmed local predecessor. The server checks that
predecessor's paint version or sprite transform, layer and obstacle geometry.
An intervening change to those fields conflicts; unrelated current sprite stats
and metadata survive the edit. Legacy or unknown servers retain sequential
overlapping edits. Clipboard,
destructive and history operations keep their ordering barriers. Standalone paint
lifecycle/versioned writes and outstanding raw sprite commands also remain
barriers for shared edits on that object. Actor/table replacement clears the
shared editor scope. Combat retains its separate command/sequence authority.

`dependency_failed` guarantees the attempted child command did not execute. The
browser keeps its optimistic intent and queue position, assigns a fresh operation
identity, and rebases before sending again. Later descendants follow the new
identity. A recovery watermark resolves the old attempt without discarding its
reissued intent. Actual conflicts and uncertain persistence outcomes pause
transmission until validated snapshots hydrate the baseline. Retries of an
unresolved attempt retain its original identity, dependency fields and body.

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
| Compatible sprite run | Merge already-queued, adjacent compatible sprite frames into at most 50 transport members, processed as durable sub-runs of at most ten commands. Stream outcomes after each sub-run commits. Do not add a debounce delay or cross query/other-domain barriers. `sprite_command_batch.py` privately stages the run. |
| Database | Commit final affected sprite rows, individual journal entries and receipts together. Coalesce repeated writes to the same sprite within the run while preserving every gesture's history boundary. Other domains retain their own transactions. |

`service/sprite_delta_persistence.py` writes affected sprites and the table
timestamp without rewriting unrelated sprites, walls or settings. Raw commands
copy target entities and index containers; canvas commands fork a locked table
in their worker and replace affected entities. Unrelated entity metadata is not
serialized to stage these edits. External snapshot-based service callers retain
their full-snapshot fallback. Index-container copying still scales with table size.

Batch replay preflight groups lookups by actor/table. Within each write run,
duplicate, active-combat and movement-policy facts are read once per scope.
Journal rows use a bulk insert and retention runs once per actor/table. Each
gesture still checks database authorization inside the transaction. Receipts
report final committed history availability while retaining separate undo steps. Validation denials are independent within
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

Unsent command residence is bounded to thirty seconds. First successful local
transmission starts a fresh five-second raw-sprite or ten-second common-ledger
idle acknowledgement watchdog. Correlated table outcomes restart only transmitted
commands' idle watchdogs, bounded by sixty seconds from their first send. The
`command-transmitted` event binds the raw bridge timer to actual transmission. This
does not turn a timeout into denial. Paint/canvas acknowledgement retries use
ten seconds and retain operation/envelope identity, body and intent timestamp.
Other non-idempotent writes are not blindly replayed on reconnect.

Recovery requests the complete active table plus a separate revisioned paint
snapshot. Only validated store/renderer hydration resolves commands in the
request watermark; newer pending intent is replayed over the new baseline.
Canvas transmission and retry pause during recovery, including a version
conflict, until the validated snapshot rebases queued intent. Table and paint recovery use a ten-second idle deadline and a sixty-second
hard lifetime. New validated paint chunks and correlated table command outcomes
can advance table recovery; duplicate chunks and unrelated pongs cannot. Paint
chunk progress advances its own idle deadline. The table request is sent before
resync listeners request paint, so the client does not put a large paint stream
ahead of its own table response. Expired table recovery replaces the socket. Old recovery timers and
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
trailing timers. New clients attach a bounded `preview_id`, sequence and relative
`ttl_ms`. The server normalizes the lifetime and supplies source identity. A
canonical move/resize/rotation echoes the completed preview identity. Receivers
reject that gesture thereafter and can immediately display the next gesture;
leases use receiver-relative time rather than synchronized clocks. Legacy peers
without an identity retain the absolute-expiry/two-second-grace compatibility
path. Disposable samples waiting in the server outbox expire after two seconds.
Neither path delays durable commands.

The client drops previews above 64 KiB socket buffering. The common ledger caps
outstanding mutations at 256; shared canvas intent is capped at 100. Existing
server rate accounting applies per member: mutation refill defaults to 600
per minute with a sixty-command burst; queries use 120 per minute with a thirty-
query burst; pings use sixty per minute with a ten-ping burst. Previews retain
their separate budget and all frames retain a global cap. Explicit mutation
rate configuration overrides the default.

## Verification and limits

Browser regression owners include `clientProtocol.test.ts`,
`commandTracking.test.ts`, `wallCommandSync.test.ts`, `tableSync.service.test.ts`,
`wasmBridge.test.ts`, `CanvasPipeline.test.ts` and painting controller tests. Server owners include
`test_websocket_inbox.py`, `test_sprite_editor_protocol.py`,
`test_sprite_command_persistence.py`, `test_canvas_protocol.py`,
`test_websocket_rate_limit.py`, `test_connection_shutdown.py` and
`test_game_session_protocol.py`. `test_sprite_run_latency.py` covers bounded
committed progress under injected SQL delay, partial run failure and ordered undo.
`test_command_policy.py` compares client/server
mutation sets. SQL probes measure isolated SQLite work, not deployed PostgreSQL.

One session mutation lock remains. Authorization and history reads remain per
command. Canvas pipelining removes per-edit network confirmation waits for its
supported modes; it does not parallelize database transactions or bypass barriers.
A large ordered snapshot can delay later frames on its own socket;
the server send timeout applies per frame, while browser recovery has idle
and total bounds. The opt-in `tests/integration/test_sprite_runs_postgresql.py`
checks bulk journal inserts, retry, undo after reload and commit rollback against
a disposable PostgreSQL database. Local SQLite tests do not establish a
production latency bound.
Use the timings in [Observability and logging](../operations/OBSERVABILITY_AND_LOGGING.md)
to separate queue, lock, worker, SQL and delivery delays.

See [Canvas commands and history](COMMAND_AND_HISTORY.md),
[Protocol boundary](../PROTOCOL_BOUNDARY.md), and
[Measurement and painting](../features/MEASUREMENT_AND_PAINTING.md).
