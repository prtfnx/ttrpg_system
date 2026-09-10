# Persistence and application ownership

Audience: contributors changing durable mutations or live session state.

Status: usable.

Last source audit: 2026-09-10

## Three different ordering boundaries

| Boundary | Owner | Guarantee |
| --- | --- | --- |
| Live session mutation | `ServerProtocol` in `apps/server/service/protocol/base.py` | One session lock orders classified mutations and shared-state reads. Different sessions can proceed independently. |
| Table snapshot | `TableManager` in `packages/core-table/core_table/server.py`, with `database/crud.py` | A detached snapshot is saved in one database transaction; saves for a table cannot overtake one another. |
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

`ActionsCore` marks a table dirty and awaits confirmed persistence before
returning success for its persistent mutations. A failed save remains dirty;
retries use capped backoff. Failed table deletion retains live state. On an
ordinary final disconnect, the manager drains mutations and retains a session
whose final save failed so it can retry.

The retained state is memory-resident. A failed command may later be saved by a
retry; failure does not universally mean the in-memory mutation was reversed.
Do not promise generic command idempotency or automatically resubmit creates.
The database snapshot is atomic, but there is no durable command log for every
canvas operation. Unconfirmed edits cannot survive abrupt process loss.

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
