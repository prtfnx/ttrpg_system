# Choice outcome validation, November 2, 2026

Local R4 continuation after `e71000df`. Nine focused commits, each with at most
seven files, include implementation, tests and current docs. No push/history
rewrite in this implementation batch. Existing dirty generated WASM and unrelated
audit files remain preserved. Migration head remains
`0015_table_settings_revision`; existing receipt/source/event tables are reused.

## Executed validation

Environment: Windows PowerShell, Python 3.11.14, pytest 9.1.1, Node v24.11.0,
Vitest 4.1.3, pinned Pyright 1.1.411. Server tests use
`DATABASE_URL=sqlite:///:memory:` and empty `DATABASE_MIGRATION_URL`, with
`-q --no-cov --tb=short --show-capture=no`.

- Server: unit `test_choice*`, `test_encounter*`, `test_character*`, `test_combat*`,
  game/session protocols, protocol serialization, session receipts, XP and settings;
  integration trusted-session workflow, PostgreSQL contracts and Alembic baseline:
  **596 passed, 60 skipped** from 656 collected. Skips are 59 PostgreSQL contract
  cases plus one PostgreSQL Alembic baseline. No disposable PostgreSQL URL is set;
  Docker/psql were unavailable locally. No production database was used.
- Shared Python schemas: `test_protocol_schema.py`, `test_choice_protocol_schema.py`
  and `test_canvas_protocol_schema.py`: **304 passed**. Generated binding drift
  check passes.
- Browser:
  `pnpm.cmd exec vitest run --project jsdom src/lib/websocket/__tests__ src/shared/protocol/__tests__ src/features/combat`:
  **683 passed across 37 files**. Focused protocol/store tests also pass; they are
  included in the broad count. Stale raw end messages uncovered during testing
  now cannot be normalized into phantom prompts or replace a newer prompt.
- Native Chromium:
  `pnpm.cmd exec vitest run --project browser-components src/lib/websocket/message.browser-test.ts`:
  **two passed**, covering generated-validator CSP import and actual tab-storage
  identity reconstruction. This does not exercise a complete served choice flow.
- Pinned Pyright: **zero errors/warnings**. TypeScript production build and
  targeted ESLint/Ruff pass. Current-doc checker and whitespace checks pass.
- Production browser build passes (2,153 transformed modules). Existing >550-KiB
  main/core chunk warnings remain. The build uses existing modified WASM and does
  not establish clean optimized artifact reproducibility. A sandbox esbuild
  directory restriction was resolved by approved test/build escalation.

Distinct executed tests: **1,585 passed**, excluding repeated focused checks.
PostgreSQL contracts are collected/skipped, never counted as passing evidence.

## Actual failure boundaries covered

`test_choice_encounter_persistence_service.py` and `test_encounter_engine.py`
verify borrowed source/event staging plus an outer receipt commit or roll back
together without a nested commit. Detached transition engines deep-copy inputs
and never mutate the live registry while preparing a provisional result.

`test_choice_operation_service.py` covers all four transitions on real SQLite:
reconstructed-service duplicate replay, exact accepted dice after completion,
changed payload/kind conflicts, current role and participant gates, late receipt
flush rollback, and fresh lookup after committed/rolled-back response loss.
Old start/end receipts read current state after a newer prompt starts and do not
recreate/clear historical state. Receipt payloads omit full snapshots/private notes.

`test_encounter_protocol.py` now tests the actual manager-free choice service,
dispatcher, SQL and validated outgoing envelopes instead of mocked engine calls.
It covers lookup outages, snapshot fences, heartbeats, exact pending replay,
changed-input rejection, actor revocation, cache failure after socket removal,
join recovery, repeated cancellation during lookup and accepted notification
failure. Existing choice worker tests retain repeated-cancellation, blocking
worker/session, join/completion and failed admission barriers.

Browser protocol tests use a tracked table-scoped start to prove that an unknown
outcome retains tracking and schedules one read probe rather than false rejection,
extra table recovery or another mutation. Current state/receipt can settle it.
Store tests verify authoritative null, newer prompt state on old end receipts,
legacy unrelated end rejection and older same-prompt version rejection. Generated
validators require original metadata and closed explicit-target payloads.

Eight new PostgreSQL contracts cover start/roll atomic acceptance/rollback,
independent competing duplicate services and observed `pg_blocking_pids` waits
through original commit/rollback. They must execute against a disposable real
database before these locks or production writer behavior are qualified.

## Remaining work

Choice server receipt/settlement implementation is complete for this slice;
choice originals are not persisted by the four-domain v1 journal. Multiclass,
compatible persisted character/choice originals and remaining generic mutation
uncertainty are still R4 work. R2 active-combat authority, R5 expiry/private
producer acceptance, R6 paired database/object restore and R0/R7 exact candidate,
provider/served workflow, reproducible WASM and measured load gates remain open.
No receipt-aware UI or local unit result qualifies an unrecorded request across
page/database rollback replacement. Restore invalidation needs its own contract.
