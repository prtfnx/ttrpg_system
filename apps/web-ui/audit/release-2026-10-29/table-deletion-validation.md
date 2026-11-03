# Table deletion validation, October 29, 2026

R4 continuation; local evidence, not release qualification. Migration head:
`0014_table_deletion_tombstones`. Work remains local. Commits in this batch change
at most seven files each. Generated WASM artifacts and unrelated audit files were
already dirty/untracked and were preserved.

Environment: Windows, PowerShell, Python 3.11.14, pytest 9.1.1, Node v24.11.0,
pnpm 9.15.0, Vitest 4.1.3, Pyright 1.1.411. Client timezone Europe/Kiev.
Server commands below use `.venv311/Scripts/python.exe` from the repository root,
with `DATABASE_URL=sqlite:///:memory:` and empty `DATABASE_MIGRATION_URL`.

## Executed evidence

From `apps/server`, pytest selected the union of
`tests/unit/test_*protocol*.py`, `test_*persistence*.py`, `test_*recovery*.py`, plus
`test_table_creation_service.py`, `test_table_deletion_service.py`,
`test_session_operation_receipts.py`, `test_xp_award_service.py`,
`test_schema_lifecycle.py`, `test_model_metadata.py`, `test_command_policy.py`,
`tests/integration/test_alembic_baseline.py` and `test_postgresql_contract.py`.
Options: `-q --no-cov --tb=short --show-capture=no`.
Result: **652 passed, 42 skipped**. Skips: 41 PostgreSQL contract cases and one
PostgreSQL Alembic case; no disposable PostgreSQL URL is configured.

Additional pytest selection with the same options:
`tests/integration/test_trusted_session_workflow.py`, `test_multiclient_sync.py`,
`tests/unit/test_character_stat_transaction.py`, `test_character_stat_reconciliation.py`
and `test_character_token_binding.py`: **52 passed, four PostgreSQL skips**.
`tests/unit/test_application_writer.py`: **eight passed**.
Distinct server total: **712 passed, 46 skipped**.

From `packages/core-table`:
`python -m pytest tests/test_protocol_schema.py -q --tb=short`: **183 passed**.

From `apps/web-ui`:
`pnpm.cmd exec vitest run --project jsdom src/lib/websocket src/lib/wasm/__tests__ src/lib/wasm/runtime/__tests__ src/features/table src/__tests__/gameStore.test.ts`:
**670 passed** across 33 files.

`pnpm.cmd run test:wasm`: **40 passed, one skipped** across four files.
The skip is the opt-in renderer reference measurement. The real deletion test
renders a token/wall, applies retirement, verifies their removal, rejects a late
snapshot after renderer reattachment, then frames a different table. This run
uses the pre-existing locally modified generated WASM binary/bindings, preserved
without rebuild or commit. It does not establish committed-artifact reproducibility.
The initial sandboxed browser launch failed on directory access; the permitted
unsandboxed rerun passed.

Static gates: `pnpm.cmd dlx pyright@1.1.411` reports zero errors/warnings;
`pnpm.cmd exec tsc -b`, targeted Ruff and ESLint, generated protocol check,
`git diff --check` and `python scripts/check_docs.py` pass.

## Boundary coverage and limits

- SQLite foreign-key-enabled service tests verify resource/pointer/tombstone/
  receipt acceptance, rollback after flush, current authority and request reuse,
  encounter guards, retained character/history data and commit-response outages.
- Real dispatch tests verify repeated cancellation through publication,
  read/snapshot quarantine, retained dirty state on rollback, cancellation of
  queued retries after acceptance and cache repair after actor removal.
- Migration/metadata tests cover head 0014, the table inventory and offline
  PostgreSQL writer-guard SQL. Added PostgreSQL cases cover independent concurrent
  duplicates, transactional resource/pointer/receipt/retirement rollback and
  observed session lock waits. They collect but skip locally.
- Browser/runtime tests cover actor/peer reconciliation, stale responses,
  retry identity, pending settings cleanup and frame/texture/preview retirement.

Real PostgreSQL migration/locking/writer qualification, paired restore rehearsal,
final candidate CI and served real-provider workflows remain open. Settings and
general character/choice durable outcomes and a persisted browser high-risk retry
queue remain plan work. Deletions predating retirement storage are not backfilled.
