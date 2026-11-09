# Persistence and application ownership

Audience: contributors changing durable mutations or live session state.

Status: usable.

Last source audit: 2026-10-26

## Three different ordering boundaries

| Boundary | Owner | Guarantee |
| --- | --- | --- |
| Live session mutation | `ServerProtocol` in `apps/server/service/protocol/base.py` | One session lock orders classified mutations and shared-state reads. Separate session locks do not prevent event-loop stalls from remaining synchronous handlers. |
| Async full-table snapshot | `TableManager` in `packages/core-table/core_table/server.py`, with `database/crud.py` | A detached snapshot is saved in one database transaction; saves for a table cannot overtake one another. |
| Application process | `apps/server/database/writer.py` and migration `0008_application_writer` | One PostgreSQL application owner may write; a replaced process cannot overwrite its successor's committed state. |

A session lock alone does not coordinate processes. A successful SQL commit
alone does not synchronize browser state. Keep the guarantees separate when
reviewing a change.

## Table snapshots and failure recovery

The async save path captures detached table data before submitting database
work through the configured blocking runner. The server supplies
`utils.blocking.run_blocking`, which bounds executor admission. Each worker
creates and closes its own ORM session; live tables and ORM rows are not shared
between the event loop and worker. A per-table save lock remains held until an
already-submitted worker finishes, including cancellation of its caller.

`save_table_to_db` owns the transaction for table fields, entities, and walls.
Its nested CRUD calls flush without committing. An error rolls back the whole
snapshot. This is not a transaction across every session resource: chat,
characters, combat journals, paint, and assets have their own service boundaries.

For remaining generic table mutations, `ActionsCore` marks the table dirty and awaits
confirmed persistence before returning success. A failed save remains dirty;
retries use capped backoff. Production table creation instead commits its
detached draft, initial paint state and actor/session/domain request receipt
together before installing live indexes/history. A rejected create is not
registered or queued for dirty-table retries. An unknown commit quarantines
serialized state work and snapshots until a fresh session-row barrier resolves
the receipt and installs the current table or proves rollback. Repeated caller
cancellation cannot release session/table ownership early. Standalone core-table
callers retain their explicit detached-snapshot contract without automatic receipts.
Production table deletion retains live state and dirty retry bookkeeping until
its durable outcome is confirmed. On an
ordinary final disconnect, the manager drains mutations and retains a session
whose final save failed so it can retry.

The retained state is memory-resident. A failed command may later be saved by a
retry; failure does not universally mean the in-memory mutation was reversed.
Do not promise generic command idempotency. A supported table-create retry
retains its original scoped identity/body; older unconfirmed creates and other
unsupported domains require reconciliation before resubmission.
Canvas commands, sprite actions, and paint operations have domain-specific
durable journals/receipts; see [Command and history](../reference/COMMAND_AND_HISTORY.md).
These do not cover every table/settings mutation. A retained dirty snapshot
is not itself a crash-durable record of an unconfirmed edit.

## Table deletion storage contract

`TableDeletionService` stages the table and dependent-resource deletion, clears
matching session-member active-table pointers, and writes the original
actor/session/domain request receipt and `TableDeletionTombstone` in one commit.
Linked character sources and completed encounter histories remain. An active
combat or choice encounter prevents deletion until it ends. A missing table is
accepted only when this session already retains its tombstone; a foreign or
unknown identity is rejected. Reusing a request identity with changed input fails.

A commit-response failure is resolved from a fresh session under the shared
session-row settlement barrier. An unavailable lookup reports an unknown outcome.
Internal recovery can use a retained tombstone after actor/receipt removal to
repair live state, without exposing an original receipt to a revoked actor.
Snapshot staging and explicit table creation reject retired UUIDs. Tombstones
survive actor/receipt removal and process restart for the retained session's
lifetime; they are not age-pruned. Historical deletions before migration 0014
cannot be reconstructed automatically. Regression owner:
`apps/server/tests/unit/test_table_deletion_service.py`.

Deletion dispatch holds session and table ownership through acceptance, live
cache removal, dirty-save task cancellation and publication, including repeated
caller cancellation. An unknown commit or failed post-commit cache removal
quarantines serialized reads/writes and snapshots. The next serialized request
first resolves the outcome under the stable session-row barrier, discards a
confirmed retired table or preserves the original live/dirty state on rollback,
then resumes. Recovery still clears retired state after actor removal but denies
that actor the original result. Successful replies carry `operation: delete`,
`operation_id`, `table_id`, `replayed` and `resync_required`; peers receive a
table-update deletion event. Duplicate requests never delete another table.
Regression owners: `test_table_deletion_service.py`, `test_tables_protocol.py`
and `test_async_table_persistence.py` under `apps/server/tests/unit/`.

## Snapshot admission guard

`TableManager.persistence_guard` is an optional application callback. When it
denies persistence, table snapshots and deletion return failure without writing.
Async operations recheck admission after acquiring table ownership, so a queued
save cannot bypass a newly quarantined cache. With no callback, the existing
behavior is preserved. This is an adapter for application outcome recovery;
it does not itself classify failed commits or replace database writer fencing.
Regression owner: `apps/server/tests/unit/test_async_table_persistence.py`.

## Choice encounters and join hydration

Choice snapshot/event transactions, join metadata reads and encounter restoration
use the bounded blocking adapter. Workers create/close their own sessions and
return detached values. The existing session mutation lock covers choice
settlement, installation/rollback and publication, including repeated caller
cancellation. Rollback snapshots are copied before mutating engine state.

The external join entry point acquires that same lock through metadata/choice
hydration, registration and welcome enqueueing, then drains the socket outside
the lock. A cancelled read cannot install its eventual worker result. This
prevents a delayed join from restoring a completed prompt. Connection-manager
admission rolls back provisional socket/user/client indexes on failure or
cancellation while retaining lifecycle ownership through cleanup. It does not give
choice commands durable receipts by itself. The operation service and protocol
now add atomic choice receipts and fresh settlement, as described below.

## Deferred consistency work

TODO: finish outcome reconciliation for generic table mutations and wall acceptance. Direct canvas commands/history now retain acceptance and installation ownership as described below. Raw sprite/compendium dispatch and bounded sprite runs now retain settlement ownership as described below. Multiclass, choice transitions, general
character protocol/repair, table creation/deletion/settings and XP now commit
effects and receipts together.
Supported table/XP browser originals use the unchanged v1 recovery contract.
Negotiated v2 additionally retains character/repair, choice and multiclass
original envelopes in the same tab-scoped journal. Unsupported domains remain
dormant under v1 fallback; in-process server recovery retains admitted identities
until settlement. These
boundaries do not add universal retry safety. Complete remaining legacy character/token
repairs and qualify worker ownership on the release candidate. Combat lifecycle transitions
are calculated without implicit engine commits; accepted snapshot and journal
share one transaction. Combat command cancellation retains ownership through
settlement, cache installation, and protocol publication. Authenticated combat
movement now stages against a private table under session/table ownership and
commits affected positions and geometry with the snapshot/journal. The worker
rechecks persisted source positions and updates only movement-owned fields.
Acceptance locks the session/encounter rows and checks encounter session/table
identity and the expected combat revision before advancing the journal.
Combat commit-response errors resolve receipts in a fresh READ COMMITTED
transaction after locking the same session row. If lookup is unavailable, the
protocol quarantines authoritative reads/writes and snapshots until recovery
installs the verified outcome. Empty dirty queues cannot discard this cache.
See [Battle flow](../BATTLE_FLOW.md) for retry and cancellation rules. This does
not make character-sheet/token/encounter stats one transaction or add universal
operation receipts for every table or gameplay command.
Pre-combat environment saves use the async detached-snapshot path and retain
table ordering through cancellation. The TODO guarantees above remain incomplete.
Environment commands are limited to a single
pre-combat edit to contain known partial-write cases.

## PostgreSQL process handover

Before loading sessions, startup checks release readiness and claims a unique
owner token and increasing generation in `application_writer_state`. A process
may claim once. Its application transactions lock the singleton row with
`FOR SHARE` and set the transaction-local `ttrpg.writer_token`.

A replacement claims through a separate control engine using an exclusive row
update. It waits for older transactions to finish before loading committed
state. PostgreSQL statement triggers reject missing or stale tokens on every
application table's insert, update, delete, and truncate, including writes by
older uninstrumented releases. The owner record itself is the coordination
table, not a guarded game-data table.

The replaced process never reacquires ownership. Admission stops with HTTP 503
and retryable WebSocket close 1012. Its monitor drains connections using the
same manager as the endpoints, stops persistence retries, and discards obsolete
caches. Shutdown never resets the persisted token to NULL: that would enable
legacy writers again. A new process can claim after a crash without a lease
expiry timer.

This is a single-active-process design. It prevents stale writes during
deployment overlap; it does not implement horizontal scaling, distributed
broadcasting, or uninterrupted transport. SQLite development does not enable
the production PostgreSQL trigger mechanism. The token is coordination between
trusted application processes, not protection against a database administrator.

See [Writer handover](../operations/WRITER_HANDOVER.md) for startup, maintenance,
and rollback rules.

## Verification owners

- `apps/server/tests/unit/test_atomic_table_snapshot.py`: rollback of incomplete snapshots.
- `apps/server/tests/unit/test_async_table_persistence.py`: worker ownership, responsiveness, ordering, and cancellation.
- `apps/server/tests/unit/test_persistence_recovery.py`: failed save, retry, and final-disconnect recovery.
- `apps/server/tests/unit/test_application_writer.py`: admission, lifecycle wiring, and cache retirement.
- `apps/server/tests/integration/test_writer_fencing_postgresql.py`: every table's trigger, stale snapshots, migration writes, two-process lock ordering, and authenticated WebSockets between two running servers.

- `apps/server/tests/unit/test_combat_movement_transaction.py`: atomic movement acceptance, restart, stale positions, and cancellation.
- `apps/server/tests/unit/test_combat_persistence.py`: borrowed transactions, scope, and revision conflicts.
- `apps/server/tests/integration/test_postgresql_contract.py`: movement/journal atomicity and duplicate replay on PostgreSQL.

## Settings acceptance storage

`TableSettingsService` authorizes current database DM ownership and locks the
trusted numeric session before reading or accepting a table-scoped settings
patch. The patch, revision and original actor/session/domain request receipt
share one commit. Foreign or retired targets reject new intents. An identical
patch still receives a durable receipt without incrementing the revision.
Unresolved dirty targets reject new patches until their persistence settles.

Receipt replay reads current SQL settings and revision, rather than reinstalling
an old accepted patch. A deleted-target replay returns retirement evidence.
Commit-response loss uses a fresh session-row barrier; unavailable evidence is
explicitly unknown. Actor removal can remove a receipt while internal recovery
still reads canonical state to repair the cache without disclosing an original
outcome. `update_virtual_table` increments settings revision for actual settings
changes, including generic CRUD/snapshot paths; the counter survives receipt
cleanup. Regression owner: `apps/server/tests/unit/test_table_settings_service.py`.

Production settings dispatch holds session/table ownership through the worker,
canonical live installation and notification. Unknown outcomes or failed
installation quarantine state reads/writes and snapshots until fresh session-row
recovery proves the outcome. Rollback keeps prior live settings; accepted replay
reads current SQL values. Recovery after actor removal repairs canonical state
without exposing an original receipt. Nullable legacy unit/mode/color fields use
the established effective defaults in response DTOs. Migration 0015 retains the
counter; browser owners reject older revisions and retain unknown original
messages through hydration rather than treating a snapshot as an operation receipt.
The supported settings probe retains its original in the tab-scoped journal,
including across reloads, and automatic recovery is bounded per connection.

Welcome recovery capability is loaded with join metadata in the blocking worker.
It binds the supported receipt contract to the numeric session identity and its
stored creation timestamp. Reconstructing a live session retains that instance;
replacing a session changes it. Legacy rows without a creation identity advertise
no recovery capability. This is not a backup/restore generation: restoring a
matching historical database may remove newer receipts and requires explicit
recovery invalidation under the restore procedure before clients resume.

Persisted browser recovery covers advertised table create/copy/import/delete,
settings and XP requests under v1, plus character/repair, choice transitions and
multiclass originals under explicitly negotiated v2. The synchronous journal writes/validates the original
before transmission, with 64-record/512-KiB scope limits and no silent eviction.
Actor, session code and retained database instance isolate ownership. Correlated
domain acceptance clears a record; a snapshot, timeout, or revoked lookup cannot
prove the original outcome. Browser records are not server effect storage, and
tab closure/storage clearing can remove them. Existing server receipts remain
the acceptance authority. Full restore and served-candidate qualification remain
open release gates.

## Borrowed character acceptance stage

`ServerCharacterManager.stage_character_update` reuses the existing character
validation, version check, sharing policy, audit and linked-token projection
rules inside a caller-owned SQLAlchemy transaction. It flushes without committing
or rolling back that transaction. A failed stage raises
`StagedCharacterUpdateRejected`; the owner must roll back the whole acceptance.
This prevents a late sharing-policy failure from leaving a provisional source
version available for accidental commit. Standalone `update_character` keeps its
existing transaction and in-process recovery behavior. Regression owner:
`test_character_stat_transaction.py` verifies the stage and an outer receipt
commit/rollback together with no nested commit.


## Durable character acceptance storage

`CharacterUpdateService` owns the borrowed character stage and its
`character_update` operation receipt in one transaction. The original actor,
numeric session, message identity, character, patch, expected version and optional
reconciliation digest bind acceptance. The bounded canonical patch is hashed for
receipt identity; receipts retain the accepted version, not private source copies.
Current database membership and edit authority are required before acceptance or
receipt disclosure, including when the connection still caches an old DM role.

A duplicate reads the current source and each current persisted linked-token
projection in the same session. It neither reapplies its old patch nor repairs a
later projection mismatch. Commit-response loss resolves under the stable session
row lock against a fresh receipt lookup; cache ownership remains pending until
current projections are installed. Legacy standalone calls without protocol
identity retain exact before/after recovery. The receipt table and migration head
remain unchanged (`0015_table_settings_revision`). Regression owners:
`test_character_update_receipts.py` and `test_character_update_recovery.py`.


Post-commit character cache repair retains the actor/session captured at command
admission. Removing a socket during worker settlement cannot erase that recovery
identity or release the pending snapshot fence. Current database authority still
gates public outcome disclosure during the later lookup.


## Choice operation acceptance service

`ChoiceOperationService` stages a detached prompt transition, its ordered event
and an actor/session/original-intent receipt in one transaction. Current database
membership/interactive role is required; start/end require current DM authority.
The stable session-row lock serializes competing acceptance and fresh lookup.
After receipt lookup, the original explicit encounter target and participant
rules are checked before evaluating a new transition or rolling dice.

Receipts retain accepted version and small outcome (including actual rolled
dice), not full private snapshots. Replay reads the current active SQL snapshot,
including a newer prompt or no active prompt after completion; it cannot reroll,
recreate an old prompt or clear a newer one. Lost commit responses remain unknown
until a fresh receipt lookup behind the same barrier proves acceptance/rollback.
Internal lookup can repair state after authority loss without disclosing private
outcomes. The protocol must hold its pending ownership until current installation.
No new migration is required. Regression owner:
`test_choice_operation_service.py` covers all four transitions, rollback, restart,
later prompts, preserved dice, authority loss and payload conflicts.


## Multiclass acceptance service

`MulticlassService` reuses character acceptance, current edit authority, borrowed
source/projection staging and fresh settlement. Its narrow preparation/receipt
hooks bind `character_multiclass` identity to character, normalized target class
and optional expected version. Validation reads the locked source before
building a detached minimal patch. Classes/total level, normal audit plus a
multiclass audit row, projections and the small receipt commit together.

Existing pinned prerequisites and the total-level cap remain in force. Legacy
single-primary levels are preserved; flat advancement fields normalize into
canonical `data`. Ambiguous class splits, duplicates or disagreeing total levels
reject rather than dropping levels. Preparation does not resolve pending XP
advancement or apply additional class-feature/resource effects. Unrelated data
and existing token stats are preserved.

Receipt replay precedes class/prerequisite/version revalidation, with current
authority still checked first. Original accepted class/level/version metadata is
separate from current source/projections; replay cannot add another class or
restore historical stats. Unknown outcomes retain the shared character recovery
owner until current installation. No new table or migration is required.
Regression owner: `test_multiclass_service.py`, including real SQL, restart,
late rollback, current grants, legacy normalization and commit-response loss.


Production multiclass dispatch uses the service above through the bounded worker
and shared character recovery owner. All loaded-table locks and session ownership
span settlement, current projection installation and publication. Its typed small
response triggers deferred canonical browser reads; diagnostic tracking/read probes
persist originals only with the negotiated v2 journal. The v1 journal remains
limited to supported table and XP domains. Character/choice/multiclass same-tab
reload ownership is implemented; database-restore timeline invalidation remains
separate work.


## Raw sprite journal settlement (November 4)

Production sprite and compendium commands retain an admitted `PendingSpriteWrite`
through the existing sprite journal transaction and live installation. Bounded
sprite transport runs hold every affected table lock in sorted order through
staging, acceptance and installation. SQL acceptance additionally locks the
stable game-session row before table rows. Fresh settlement uses that same
READ COMMITTED barrier and five-second PostgreSQL lock timeout.

Commit-response loss is not rollback. `resolve_sprite_write` checks every original
actor/table/operation/hash in the existing canvas journal without rerunning the
command. A complete matching run proves acceptance. Missing entries prove
nonacceptance only while the original actor/table/session and admission timeline
remain available; partial, mismatched, corrupt, or missing known-accepted history
keeps the outcome unknown. Expiring an undo delta does not erase its receipt.
This adds no schema migration or separate sprite receipt table.

Recovery loads current affected sprites, including explicit absence, instead of
installing the staged command's old after-state. It preserves unrelated live
sprites and table settings, repairs all entity indexes, and rejects colliding or
lossy legacy identities. Every replacement is prepared before installation.
Lookup or installation failure keeps session state work and table snapshots
quarantined. Empty dirty queues and socket removal cannot discard that owner;
join settles it before publishing welcome. Repeated cancellation retains ownership
through SQL settlement, installation and publication.

Current database membership/interactive authority gates receipt disclosure even
when internal cache repair must finish after revocation. Peers receive only
table resync hints, through their normal filtered reads. The original actor gets
small correlated acceptance or explicit nonacceptance, never a historical sprite
delta. Provisional batch events are discarded during recovery. Publication failure
after verified installation does not change the committed outcome.

This covers production raw sprite/compendium dispatch and bounded sprite runs.
Identity-free standalone core callers, generic table snapshots and wall
acceptance still require their separate uncertainty review. Direct canvas/history
settlement is now implemented below. Sprite originals are not added to closed v1/v2 tab journals. Process
restart uses existing retained journal replay/current database load, not this
memory-resident pending owner; restore-timeline invalidation remains an R6 gate.
Regression owners: `test_sprite_write_settlement.py`, `test_sprite_write_recovery.py`
and the existing sprite protocol/command suites.


## Direct canvas command/history settlement

Transform, absolute sprite edit, restyle, delete, copy, cut, paste, undo and redo
now share the existing journal acceptance transaction with a stable game-session
row lock before table/paint locks. `CanvasWriteIntent` binds authenticated actor,
session, canonical table/operation UUIDs and the complete original command hash,
including its original timestamp. Intent validation precedes admission. Ordinary
domain rejection rolls back the isolated stage; an unavailable commit response
retains `PendingCanvasWrite` until fresh READ COMMITTED settlement/current
installation. State reads/writes, snapshots, cleanup and join cannot bypass it.

The service captures the sprite identities actually affected by this transaction,
including the root chosen for undo/redo, and retains a bounded list of IDs beside
the existing small receipt. It stores no extra scene events or historical bodies.
Undo-body expiry does not erase those identities. Legacy receipt-only replays
remain compatible without executing another edit or requiring backfill.

Recovery verifies the original journal hash/kind and loads current affected
sprites or explicit absence. It preserves unrelated retained sprites/settings,
repairs table aliases, and does not reinstall old after-state. Paint state stays
in SQL and normal table/paint snapshot reconciliation reloads it. Recovered
selection references are filtered for current existence/visible layers. Current
membership/interactive authority gates receipt disclosure; revocation can still
allow internal cache repair without exposing private history or clipboard results.

Unknown lookup or installation retains quarantine. Known-accepted missing history,
changed identity, lost tables or an expired unrecorded outcome cannot prove
rollback. Repeated cancellation retains session ownership through settlement,
installation and publication. Peers get only current-state resync hints, and
accepted historical paint/sprite events are never replayed. No new database table,
migration or persisted v1/v2 browser domain is introduced. Generic table/wall
uncertainty, restore-timeline invalidation and served/PostgreSQL qualification
remain separate work.
