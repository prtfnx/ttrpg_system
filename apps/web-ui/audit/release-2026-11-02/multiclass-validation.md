# Multiclass outcome validation, November 2, 2026

Local R4 continuation after `fe655de1`. Six focused commits, each with at most
seven files, include runtime changes, tests and current docs. No push or history
rewrite in this batch. Existing dirty generated WASM and unrelated audits remain
preserved. No new table/migration: schema head stays `0015_table_settings_revision`.

## Executed evidence

Windows PowerShell, Python 3.11.14, pytest 9.1.1, Node v24.11.0, Vitest 4.1.3,
pinned Pyright 1.1.411. Server tests use `DATABASE_URL=sqlite:///:memory:` and an
empty `DATABASE_MIGRATION_URL`, with `-q --no-cov --tb=short --show-capture=no`.

- Server unit patterns: multiclass, choice, encounter, character, combat,
  game/session protocols, serialization, session receipts, XP and settings;
  integration trusted-session workflow, PostgreSQL contracts and Alembic baseline:
  **633 passed, 65 skipped**, 698 collected. Skips are 64 PostgreSQL contract
  cases plus one PostgreSQL Alembic case. No configured disposable PostgreSQL
  target; no production database was used.
- Shared Python schemas: protocol, choice, multiclass and canvas schema suites:
  **326 passed**. Generated protocol bindings are current.
- Browser:
  `pnpm.cmd exec vitest run --project jsdom src/lib/websocket/__tests__ src/shared/protocol/__tests__ src/features/character src/features/combat`:
  **1,263 passed across 74 files**. Focused runs are included, not counted twice.
- Native Chromium:
  `pnpm.cmd exec vitest run --project browser-components src/lib/websocket/message.browser-test.ts`:
  **two passed**, generated-validator CSP import and native tab-storage identity.
- Pinned Pyright: **zero errors/warnings**. TypeScript production build,
  targeted Ruff/ESLint, current docs, binding drift and whitespace checks pass.
- Production browser build passes (2,153 modules). Existing >550-KiB main/core
  chunk warnings remain. Existing modified WASM was used; this does not establish
  optimized artifact reproducibility or complete served release acceptance.

Distinct executed tests: **2,224 passed**. PostgreSQL cases are skipped evidence,
never counted as successful lock/concurrency qualification.

## Verified behavior

`MulticlassService` reuses shared character acceptance and narrow preparation/
receipt hooks. Current DB source/edit authority and stable session locking precede
receipt lookup and new preparation. Original identity includes character, target
class and optional expected version. Receipt and advancement source/audit share
one transaction; audit/receipt failure rolls the entire effect back.

`test_multiclass_service.py` covers reconstructed duplicates, distinct advances,
preserved unrelated inventory/stats, later source/token state, accepted metadata,
current owner/DM/edit-grant authority, revocation, stale/foreign targets, omitted
versions, source archival, legacy canonicalization and invalid splits/totals.
Pinned prerequisites/cap and fighter OR semantics remain; preparation is detached.
Lost commit responses and unavailable lookup retain shared recovery ownership.

`test_character_stat_transaction.py` uses actual manager, dispatcher, SQLite and
validated outgoing envelopes to cover multiclass receipt replay/current projection
installation, committed/rolled-back response loss with and without lookup outage,
snapshot fencing, socket removal, revoked disclosure and repeated cancellation.
Three obsolete mocked load/validate/save expectations in the protocol unit suite
were replaced by real acceptance-boundary coverage; input/context guards remain.

Browser tests verify immediate closed requests and same-ID/class/version retry,
unknown/denied tracking retention, one bounded read probe, later settlement,
hydration after all local edits settle and archived-source removal. Receipt
metadata never installs a historical class list/source over current state.

Five new PostgreSQL contracts cover advancement/audit/receipt acceptance and
rollback, competing independent duplicate services and observed `pg_blocking_pids`
waits through commit/rollback. They collect but require real disposable PostgreSQL
execution before locks/writer behavior are qualified.

## Remaining acceptance limits

Multiclass server receipt/settlement implementation is complete for this slice;
diagnostic timers and read probes are not persisted original ownership. The v1
tab journal still advertises only table create/delete/settings and XP. Compatible
persisted character/choice/multiclass originals, remaining generic mutation
uncertainty, R2 active-combat authority, R5 auth/private producers, R6 paired
database/object restore and R0/R7 provider/served/artifact/load gates remain open.
This task does not add class-feature/HP/resource advancement mechanics or resolve
pending XP/class splits implicitly. Database rollback restore needs explicit
receipt/journal invalidation; source reads alone do not prove an individual intent.
