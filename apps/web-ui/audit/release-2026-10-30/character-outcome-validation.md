# Character outcome validation, October 30, 2026

Local R4 implementation continuation. No history rewrite or push in this batch.
Eight focused commits, each with at most seven files, include tests/current docs.
Existing dirty generated WASM and unrelated audit files remain uncommitted.
Database migration head remains `0015_table_settings_revision`.

## Executed checks

Server Python 3.11.14 / pytest 9.1.1 with `DATABASE_URL=sqlite:///:memory:` and
empty `DATABASE_MIGRATION_URL`, using `-q --no-cov --tb=short --show-capture=no`:
all `tests/unit/test_character*.py`, core/protocol serialization, game/session
protocol, session operation receipts, XP, settings and encounter protocol suites,
plus `tests/integration/test_postgresql_contract.py`: **340 passed, 51 skipped**.
The skipped cases are PostgreSQL contracts: `TEST_POSTGRESQL_DATABASE_URL` is
unset. The five added receipt contracts collect but have not executed locally.

`python -m pytest packages/core-table/tests/test_protocol_schema.py`:
**215 passed**. Generated schema drift check passes.

Browser affected suite:
`pnpm.cmd exec vitest run --project jsdom src/lib/websocket/__tests__ src/shared/protocol/__tests__ src/features/character`:
**939 passed** across 49 files in the final run. Its expanded run exposed an existing stale table
command fixture missing original metadata; valid/invalid fixtures now use real
envelopes and settings UUIDs so payload checks test the intended boundary. The
corrected targeted protocol run passes all **261** cases (included in 939).

`pnpm.cmd exec vitest run --project browser-components src/lib/websocket/message.browser-test.ts`:
**two passed** in Chromium, verifying generated-validator CSP import and native
tab-storage identity reconstruction. These do not qualify complete served play.

Pinned Pyright **1.1.411**: zero errors/warnings. TypeScript build and targeted
Ruff/ESLint pass. `scripts/check_docs.py`, generated bindings and diff whitespace
checks pass. Production UI build passes, retaining the existing >550-KiB main/
core chunk warning. It uses existing modified WASM and does not establish artifact
reproducibility. Windows sandbox directory restrictions required rerunning Vite/
esbuild test/build commands with approved escalation; those runs completed.

## Acceptance boundaries exercised

- Borrowed character staging does not commit; late sharing/projection/receipt
  failures roll back source, version, normalized grants, audit and projections.
- Original actor/session/character/patch/version/digest accepts once across
  reconstructed managers. Changed input conflicts; current permissions precede
  receipt disclosure. Foreign-session token links remain untouched.
- Old acceptance after a later edit reads the current source and each actual SQL
  token projection without repairing a later mismatch or publishing an old patch.
- Lost commit responses and unavailable lookup retain quarantine; proven rollback
  and retained receipts settle only after current cache installation. Cancellation,
  cache failure, socket removal during settlement and background snapshots
  exercise the real protocol path. Recovery retains the originally admitted actor.
- Revoked actors receive forbidden outcomes without receipt/version details while
  internal repair clears cache quarantine. Broader private-producer R5 acceptance
  remains open.
- Browser recovery hints defer reads until pending edits settle; exact original
  ownership, denied/unknown evidence, archival and older deltas are covered.
  Original identities remain in memory through live-page reconnect, not reload.
- Wire validators reject missing/unbounded character identity/time. Reconciliation
  retains its closed dry-run/apply shape and original plan digest.

## Remaining release work

Choice/multiclass receipts, compatible persisted character originals, remaining
generic table/sprite uncertainty, real PostgreSQL concurrency/lock qualification,
served role/layer workflows, paired database/object restore rehearsal and the
exact candidate load/artifact checks remain open. Existing four-domain v1 journal
capability is unchanged. Passing these local suites does not close R4-R7.
