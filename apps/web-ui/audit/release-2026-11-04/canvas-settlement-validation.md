# Direct canvas and history settlement validation

Date: 2026-11-04, Europe/Kiev.

This continuation closes direct canvas command/history commit uncertainty in
the functional-release plan. Generic table/wall settlement and external release
qualification remain open. Four local commits contain at most six files each;
there is no history rewrite, push, schema migration or new browser recovery domain.

## Resulting behavior

- The original actor/session/table/operation and complete finite command hash,
  including timestamp, are validated before admission. Acceptance locks the same
  stable game-session row used by fresh READ COMMITTED outcome lookup before
  table/paint locks; PostgreSQL lookup has the existing five-second lock timeout.
- All nine modes retain pending ownership through commit/current installation.
  Undo/redo captures the actual affected root targets inside acceptance. The
  existing journal adds bounded sprite IDs beside its small receipt, not scene
  events or another historical payload. Undo-body trimming does not remove them.
  Legacy receipt-only replays remain compatible without backfill/new edits.
- Commit/lookup/cache uncertainty quarantines serialized state work, snapshots,
  cleanup and join. Repeated cancellation retains session ownership through
  settlement, installation and publication; socket removal cannot discard it.
- Recovery installs current affected sprites or explicit absence, preserving
  unrelated live edits and repairing table aliases. Paint is read from SQL through
  normal snapshot reconciliation. Recovered selection excludes deleted or
  currently invisible objects. Old scene deltas are not replayed.
- Current database authority gates receipt/history/clipboard disclosure after
  revocation, even while internal cache repair finishes. Peers receive only a
  current-table resync hint and use ordinary filtered reads.
- A blocked pipeline follower receives its own original operation identity in
  an unknown result. It is not silently discarded by hydration while an earlier
  command settles. Exact retry later accepts once or receives definite dependency
  failure; only that proof permits the existing new-ID rebase path.
- The browser tracker/controller retains unknown and denied receipts without
  false optimistic rejection. Hydration is not a receipt. Exact original retries
  retain operation, command and timestamp. Explicit unknown expiry stops retries
  and new dispatch while retaining evidence for review; late copy acknowledgements
  do not extend the original clipboard horizon. These owners remain in page
  memory and are not added to closed v1/v2 tab journals.

## Verification

| Check | Result |
| --- | --- |
| Selected server domains, trusted workflow and migration/schema contracts | 1,219 passed; 75 PostgreSQL-dependent skips |
| Browser protocol, shared protocol, character, combat, canvas and painting | 1,986 passed in 121 files |
| Pinned Pyright 1.1.411 | Zero errors/warnings |
| Targeted Ruff/ESLint | Passed |
| TypeScript and production build | Passed; 2,153 modules |
| Protocol generator drift | Current; no wire schema changes |
| Current docs and whitespace checks | Passed |

There are 3,205 distinct passing cases. The 75 skipped cases are 74 PostgreSQL
contracts and one PostgreSQL Alembic case. Six new contracts collect for mixed
paint/sprite/journal atomicity and observed `pg_blocking_pids` waits behind original
transform/undo commit or rollback. A disposable configured
`TEST_POSTGRESQL_DATABASE_URL` is still required to qualify those contracts.

Forty-eight new real SQL/protocol cases exercise all nine modes through
before/after-commit failure with/without lookup outage, plus current stats/layers,
deletion/selection, unrelated retained edits, partial cache installation, private
outcome revocation, changed input, repeated cancellation, lost sockets/join and
unadmitted pipeline followers. Five service cases cover trimmed undo bodies,
legacy receipt-only metadata, hash mismatch and private-layer filtering.

Browser cases verify causal tracking, unknown/denied ownership, exact receipt
retry after hydration, expired unknown outcomes, clipboard horizon and resetting
uncertainty only after a proved dependency failure. Existing pipeline, optimistic
state, sprite recovery and gameplay tests remain in the selected regression set.

Server command, from `apps/server`:

```powershell
$env:DATABASE_URL='sqlite:///:memory:'
$env:DATABASE_MIGRATION_URL=''
$releaseTests = @(rg --files tests/unit | Where-Object {$_ -match 'test_.*(sprite|canvas|combat|choice|encounter|character|persistence|table|action_batch|game_session_protocol|protocol_serialization|session_operation|xp_award).*\.py$'})
& ../../.venv311/Scripts/python.exe -m pytest @releaseTests tests/integration/test_trusted_session_workflow.py tests/integration/test_postgresql_contract.py tests/integration/test_alembic_baseline.py -q --no-cov --tb=short --show-capture=no --maxfail=3
pnpm.cmd dlx pyright@1.1.411
```

Browser/build checks, from `apps/web-ui`:

```powershell
pnpm.cmd exec vitest run --project jsdom src/lib/websocket/__tests__ src/shared/protocol/__tests__ src/features/character src/features/combat src/features/canvas src/features/painting
pnpm.cmd run build
../../.venv311/Scripts/python.exe ../../packages/core-table/scripts/generate_protocol_types.py --check
../../.venv311/Scripts/python.exe ../../scripts/check_docs.py
```

The build reuses the existing modified 3,314.89-kB WASM artifact. Main/core chunks
are 562.00 and 799.07 kB, and the known 550-kB warning remains. Existing WASM files
and unrelated historical audits are preserved. This validates a build, not a
reproducible optimized-WASM or packaged served-provider candidate.

## Remaining work

Next: generic table and wall commit uncertainty. R2 active-combat field authority
and explicit legacy conflict handling, R5 expiry/sign-in/resume/private-producer
acceptance, R6 paired DB/R2 capture/restore with receipt/browser timeline
invalidation and R0/R7 disposable PostgreSQL, WASM provenance, served-provider,
candidate CI and multi-role load qualification remain open.

The pending owner is memory-resident. Process restart loads current SQL state and
retained journal replay; database rollback/restore still needs explicit timeline
invalidation. Expired/missing known-accepted history cannot prove rejection, and
there is no new universal exactly-once or browser-restart/offline guarantee.
