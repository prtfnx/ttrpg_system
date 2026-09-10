# Application writer handover

Audience: operators deploying or maintaining the PostgreSQL application.

Status: usable.

Last source audit: 2026-09-10

The server keeps live sessions in process memory. Run **one active application process per database**, using `python scripts/migrate_and_start.py` from `apps/server`. This entry point runs migrations and explicitly starts one Uvicorn worker, including when `WEB_CONCURRENCY` is set. Keep Render `numInstances: 1`.

## Ownership and persistence

Migration `0008_application_writer` creates a singleton writer record and PostgreSQL write guards for all application tables. Each server claims a new generation with a unique token exactly once, after release preflight and before loading live sessions. Its database transactions hold a shared lock on the record and set a transaction-local token. Replacement startup acquires an exclusive lock, so previously started transactions finish before it claims ownership and loads committed state.

Database statement triggers reject writes from replaced or uninstrumented processes, including full snapshots, direct updates, deletes, and truncation. The replaced process cannot reacquire ownership using its old live state. Its ownership monitor closes WebSockets with code 1012 and rejects further HTTP requests with 503 and Retry-After; liveness remains available. Shutdown uses the same connection manager as the endpoints, drains mutations, and retires obsolete session caches without retrying stale snapshots.

SQLite remains an isolated development/test backend. Production fencing is enforced by PostgreSQL. The writer token coordinates trusted application processes; it is not a security boundary against a database administrator.

## Deployment and rollback

- Apply the release through the normal migration/start command. Both runtime and migration URLs must target the same application schema. The runtime database role needs the usual read/write privileges on the new singleton table.
- Preflight checks the release dependencies before claiming ownership. Handover waits up to 15 seconds for conflicting database locks, with a 20-second statement timeout; failure aborts that startup attempt. A fresh process can try again.
- Clients may briefly reconnect or receive retryable errors while the replacement becomes routable. This design protects committed state during overlap; it does not promise uninterrupted transport.
- Never clear the owner token on shutdown or manually set it to NULL. NULL is only the initial migration bootstrap state, before any fenced process has claimed ownership.
- Roll back to a release that understands this fencing migration. Rolling back to older code requires a planned maintenance window with every application process stopped, an explicit schema downgrade, and acceptance that the old release restores the original overlap risk. Do not downgrade a live database to bypass a failed writer check.
- Alembic online migrations automatically hold the exclusive writer lock and use the current token for data changes without transferring ownership. Administrative data changes must use `migration_writer_transaction(connection)` on a separate control/migration engine; ordinary uninstrumented scripts intentionally fail after ownership is claimed.
- New application tables must install `application_writer_guard` in their migration. The PostgreSQL inventory regression rejects tables without a guard.

The architecture still does not support horizontal scaling. Multiple active workers need partitioned ownership, consistent session hydration, and event distribution. Failed, unacknowledged edits during database outages cannot survive abrupt process loss without a durable command log.

## Verification

Set `TEST_POSTGRESQL_DATABASE_URL` to a disposable PostgreSQL database whose name contains `test`, then run:

```sh
pytest tests/integration/test_writer_fencing_postgresql.py --no-cov
```

Tests create unique schemas and remove only those schemas. They check every table's database guard, rejected stale snapshots, migration writes, two-process transaction draining, and handover between two actual Uvicorn servers with authenticated WebSockets. CI runs these alongside the PostgreSQL migration and constraint gates.

The ordering follows [PostgreSQL row-lock semantics](https://www.postgresql.org/docs/current/explicit-locking.html) and uses [statement triggers](https://www.postgresql.org/docs/16/sql-createtrigger.html). Reconnect handling accounts for the overlap described in [Render's deployment documentation](https://render.com/docs/deploys).

For transaction and cache semantics, see [Persistence and application ownership](../explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md).
