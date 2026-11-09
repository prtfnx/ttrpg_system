# Wall acceptance and settlement evidence

Date: November 4, 2026, Europe/Kiev.

Production wall create/update/remove/door-toggle now use an owned SQL worker.
The stable session barrier precedes current database authorization, table/wall
locks, the effect and a bounded original-intent receipt. Complete original
message ID/kind/data are bound to actor/session. Matching retries do not repeat
effects; current projections are separate from historical acceptance.

The protocol owns pending writes before worker submission through fresh outcome
settlement and current cache installation. Unknown commit responses, missing
known-accepted receipts and failed installation retain session quarantine.
Snapshots, serialized followers, empty cleanup saves and join are fenced.
Repeated cancellation retains ownership through publication. Current affected
walls or explicit absence replace only their target; unrelated walls and table
fields survive. Later table retirement clears both resident indexes. Current
database authority gates private receipt disclosure after revocation.

Fresh commands keep the closed wall_data response. Replayed/recovered acceptance
uses generic success with domain=wall_command and resync_required, without old
wall geometry. Peers receive current-state resync hints. A failed broadcast after
proven acceptance remains accepted. Browser receipt handling ends previews,
retires later-deleted tables and discards provisional-create dependents with a
review notice. Helpers return and optionally reuse original request IDs. No wall
domain is added to closed v1/v2 persisted recovery journals or offline replay.

The shared wire schema requires a nonblank original wall message ID, bounded to
128 characters, before decoding can generate a replacement. Older clients
without this field must upgrade. Canonical, packaged Python and browser schemas
are regenerated together. Original intent time is not given a new expiry rule.

## Verification

- Broad server selection: **1,288 passed, 81 skipped**, 1,369 collected.
  Unit selection covers sprite/canvas/combat/choice/encounter/character/
  persistence/table/wall/action-batch/session-operation/XP boundaries, plus
  trusted-session workflow, PostgreSQL contracts and Alembic baseline.
- Final added server regression: later table deletion preserves original wall
  acceptance and retires current resident indexes, **1 passed** separately.
  This makes **1,289 distinct passing server cases**; repeat runs are not added.
- Final broad browser selection: **1,995 passed**, 121 files across websocket,
  shared protocol, character, combat, canvas and painting. This includes the final
  later-table-retirement case and four wall wire identity cases.
- Full core protocol schema suite: **237 passed**, including 16 missing/blank/
  oversized original wall identity cases. Final targeted SQL/schema/workflow run
  after schema tightening: **289 passed** (237 schema + 50 wall + 2 existing
  workflow/publication cases); repeated cases are not added to the distinct count.
- Native browser CSP/storage suite: **5 passed**, including the new wall identity
  rule under the existing server CSP without unsafe evaluation.
- Combined distinct passing cases across these selections: **3,526**
  (1,289 server + 237 core schema + 1,995 jsdom + 5 native). New wall service/protocol
  suites contain 22 + 28 real SQL/protocol cases. Standalone wall tests remain.
- Eighty PostgreSQL contracts and one PostgreSQL Alembic case skip without a
  configured disposable target. Six new wall cases cover atomic receipt/effect
  acceptance and observed pg_blocking_pids waits through create/toggle commit
  and rollback. Collection/skips do **not** qualify PostgreSQL locks.
- Pinned Pyright 1.1.411: **zero errors and warnings**. Targeted Ruff/ESLint,
  TypeScript, generated-protocol, docs and diff checks pass.
- Production build: **2,153 modules**, main approximately 562 kB, core
  approximately 800 kB, existing WASM approximately 3,315 kB. The existing
  large-chunk warning remains. Modified WASM was preserved and not rebuilt or
  committed; this does not qualify reproducible optimized WASM.

The first broad server pass exposed two obsolete fixtures: wall service database
wiring was missing, and a publication-failure test expected uncertainty after a
proven commit. Both were corrected, targeted cases passed, and the broad server
selection reran successfully. No production provider state was used.

## Remaining release work

Generic table mutations still need their uncertainty boundary. Active-combat
field authority and legacy conflicts (R2), browser auth/resume and private
producer acceptance (R5), paired DB/R2 restore and timeline invalidation (R6),
and real PostgreSQL, optimized WASM, served-provider, exact-candidate CI and load
qualification (R0/R7) remain open. Wall receipts alone do not qualify a release
or add universal crash/reload/offline recovery.

Six focused commits, each at most seven files, separate acceptance, protocol
ownership, browser/workflow wiring, shared wire identity, current docs and
plan/evidence. No history
rewrite or push is included in this continuation. Preexisting audit files and
modified WASM artifacts remain outside these commits.
