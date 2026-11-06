# Sprite settlement and shutdown recovery validation

Date: 2026-11-04, Europe/Kiev.

Completed the raw sprite/compendium uncertainty work left uncommitted by the
shutdown. This closes that specific R4 gap without declaring the release plan
or remaining canvas/table/wall paths complete.

## Publication boundary

All 27 unpublished linear commits were redated to November 4, preserving raw
identities, messages, trees, order, index and unfinished tracked changes. Backup:
`backup/unpublished-before-redate-2026-11-04-2031a939`.

Exactly the oldest 12 were fast-forward pushed to `origin/main` through
`6a05b2479ecf2d66b0de2f8d23e87c4242ed74f2`, confirmed by `git ls-remote`.
The rewritten tip was `ec6677e4926bfcc1175a5a07e0974683a958bd0b`; 15 rewritten
commits remained local. See [the verified mapping](commit-map.json).

Four subsequent implementation/documentation commits remain local, each at most
seven files. No further push or history rewrite is part of this continuation.

## Implemented boundary

- Sprite acceptance locks the stable game-session row before table rows. Fresh
  settlement waits on the same READ COMMITTED barrier with a five-second
  PostgreSQL lock timeout.
- Complete original actor/table/operation/hash journal entries prove acceptance.
  Missing entries prove nonacceptance only while the original actor/table/session
  and admission timeline remain available. Partial, changed, invalid or missing
  known-accepted history remains unknown. An expired undo body retains its receipt.
- The protocol owns admitted single and buffered writes through SQL settlement
  and current installation. Unknown lookup or installation quarantines serialized
  state reads/writes and snapshots. Empty dirty queues, socket removal, join and
  repeated cancellation cannot discard unresolved ownership.
- Recovery loads current affected sprites or explicit absence, preserving
  unrelated live sprites/settings and indexes. It never reapplies an old after
  image or resurrects a later-deleted sprite. Colliding/lossy legacy entity IDs
  leave the session quarantined for explicit repair.
- Current database authority gates receipt disclosure after revocation. Peers
  receive only table resync hints and normal filtered reads, not actor history
  or historical sprite data. Buffered provisional events are discarded.
- The browser keeps unknown optimistic actions and bounds read probes per
  original/connection. Shared confirmed sprite/text/shape sends retain their
  subscriptions until a causal result, cancellation or the existing deadline.
  No replacement mutation is sent automatically.
- Missing or whitespace table identities stay outside optimized runs. This
  preserves independent validation and prevents a whitespace alias from selecting
  the live table instead of its private fork before acceptance.
- The older settings roundtrip fixture now supplies authenticated scope and
  injects failure into `TableSettingsService`; its obsolete canvas-persistence
  injection no longer exercised the actual settings path.

The existing canvas journal is reused; no database migration or new v1/v2
persisted recovery domain is introduced. The pending owner is memory-resident;
restart relies on retained journal replay and current database load. Closing a
tab/storage loss and database rollback/restore remain separate limits.

## Verification after shutdown

| Check | Result |
| --- | --- |
| Selected server domain suites, trusted workflow and migration/schema contracts | 1,166 passed; 69 PostgreSQL-dependent skips |
| Browser protocol, shared protocol, character, combat and canvas suites | 1,710 passed in 106 files |
| Pinned Pyright 1.1.411 | Zero errors and warnings |
| Targeted Ruff and ESLint | Passed |
| TypeScript and production browser build | Passed; 2,153 modules |
| Generated protocol bindings | Current |
| Current documentation and whitespace checks | Passed |

Total: 2,876 distinct passing cases. The 69 skips are 68 PostgreSQL contracts and
one PostgreSQL Alembic case. Four new PostgreSQL cases collect but do not qualify
real locking without a disposable configured `TEST_POSTGRESQL_DATABASE_URL`.

The 29 new protocol recovery cases use actual SQLite commits/rollback and inject
lost responses, lookup outages, cache failure, revocation, changed originals,
socket removal/join, cancellation, later stats/layers/deletion and buffered runs.
Seven service cases separately exercise detached outcomes, partial/missing/hash
conflicts, expired undo bodies and missing tables. Existing protocol/latency
regressions verify ordinary successful runs. New browser cases cover unknown then
accepted/rejected outcomes, bounded reads and causal confirmation subscriptions.

Representative server command, from `apps/server`:

```powershell
$env:DATABASE_URL='sqlite:///:memory:'
$env:DATABASE_MIGRATION_URL=''
$releaseTests = @(rg --files tests/unit | Where-Object {$_ -match 'test_.*(sprite|canvas|combat|choice|encounter|character|persistence|table|action_batch|game_session_protocol|protocol_serialization|session_operation|xp_award).*\.py$'})
& ../../.venv311/Scripts/python.exe -m pytest @releaseTests tests/integration/test_trusted_session_workflow.py tests/integration/test_postgresql_contract.py tests/integration/test_alembic_baseline.py -q --no-cov --tb=short --show-capture=no --maxfail=3
pnpm.cmd dlx pyright@1.1.411
```

Browser validation, from `apps/web-ui`:

```powershell
pnpm.cmd exec vitest run --project jsdom src/lib/websocket/__tests__ src/shared/protocol/__tests__ src/features/character src/features/combat src/features/canvas
pnpm.cmd run build
../../.venv311/Scripts/python.exe ../../packages/core-table/scripts/generate_protocol_types.py --check
../../.venv311/Scripts/python.exe ../../scripts/check_docs.py
```

The build reuses the existing modified 3,314.89-kB WASM artifact. Main/core chunks
are 561.24 and 798.93 kB; the known 550-kB chunk warning remains. The WASM source
artifact and historical untracked audits were preserved. This is build validation,
not reproducible optimized-WASM or packaged served-provider qualification.

## Remaining implementation and acceptance

Next: direct canvas command/history uncertainty, followed by generic table and
wall acceptance. In `service/protocol/canvas.py`, a commit-response exception from
`CanvasCommandService.execute` still reaches the generic failure path before live
result installation; that route needs its own receipt/current-state settlement.
Raw sprite bridge settlement does not cover paint state or canvas undo/redo.

R2 active-combat field authority and explicit legacy conflict handling, R5
auth/resume/private-producer acceptance, R6 paired DB/R2 capture/restore/timeline
invalidation and R0/R7 PostgreSQL, WASM provenance, served-provider, candidate CI
and multi-role load qualification remain open.
