# Table metadata and transform settlement evidence

Date: November 4, 2026, Europe/Kiev.

Production move, scale and metadata table updates now accept affected SQL fields
and bounded original-intent receipts in one owned transaction. Current database
DM authority and stable session/table barriers govern acceptance. Complete
message kind/data and authenticated actor/session/original message ID bind the
receipt. Legacy grid fields keep the existing settings revision semantics.
Effects no longer mutate live state before full-scene save, enter dirty retries
or invoke the old redundant autosave after receipt acceptance.

Pending ownership begins before worker submission and ends after verified
settlement/current affected-field installation. Commit/lookup/cache failures
quarantine serialized reads/writes, snapshots, empty cleanup and join. Repeated
cancellation retains ownership through publication. Recovery preserves unrelated
retained fields/entities/walls, repairs table aliases and retires later-deleted
tables. Missing known-accepted receipts remain unknown. Current authority gates
private receipts; internal repair may complete after revocation.

Both packaged wire schemas require bounded nonblank original IDs for these
metadata/transform commands. Older clients omitting IDs must upgrade. Fresh and
replayed success receipts request list/current-scene reconciliation and contain
no historical metadata. Peer hints also ask for current reconciliation. Nested
metadata commands are tracked against their own table ID. Inactive uncertain
edits use a bounded list read without changing the active scene. Public helpers
return/accept original IDs for deliberate same-input retries. No migration or
persisted v1/v2 browser recovery domain is introduced.

## Verification

- Broad server selection: **1,337 passed, 87 skipped**, 1,424 collected. Selected
  units cover table/wall/sprite/canvas/combat/choice/encounter/character/
  persistence/action-batch/session-operation/XP boundaries, plus trusted-session
  reconstruction, PostgreSQL contracts and Alembic baseline.
- New table service/recovery suites: **25 + 23 cases**, included in that server
  total. Real SQL cases cover before/after commit failures, unavailable lookup,
  failed install, current replay/deletion, revision behavior, preserved unrelated
  state, revoked actors, cancellation, join/empty cleanup, missing known receipts,
  unadmitted batched followers and SQL off the event loop. Proven field receipts
  must not trigger a full-scene autosave. The trusted workflow reconstructs a
  renamed/resized table alongside existing gameplay state.
- Full core protocol schema suite: **249 passed**, including 12 new original-ID
  cases. Invalid-payload tests retain valid original IDs to exercise their actual
  field validation. Packaged schemas regenerate together and remain current.
- Broad jsdom selection: **2,005 passed**, 121 files across websocket, shared
  protocol, character, combat, canvas and painting. Includes metadata ownership,
  active/inactive unknown probes, current reload, peer hints, exact identity reuse
  and later table retirement. No repeat runs are added to the distinct count.
- Native browser CSP/storage suite: **5 passed**. The table identity condition
  validates under server CSP without unsafe evaluation.
- Combined distinct cases: **3,596** (1,337 + 249 + 2,005 + 5).
- PostgreSQL-dependent skips: **86 contracts + one Alembic case**. Six new cases
  cover field/grid-revision/receipt atomicity and observed pg_blocking_pids waits
  behind the original session barrier through move/metadata commit and rollback.
  No configured disposable target was available; skips do not qualify locks.
- Pinned Pyright 1.1.411: **zero errors/warnings**. Targeted Ruff/ESLint,
  TypeScript, generated binding, docs and diff checks pass.
- Production build: **2,153 modules**. Main approximately 562 kB, core approximately
  806 kB, existing WASM approximately 3,315 kB. The existing large-chunk warning
  remains; modified WASM was preserved and not rebuilt/committed. This does not
  qualify reproducible optimized WASM.

An intermittent sandbox denial prevented esbuild from reading the configuration
path. The same browser test command reran successfully with escalation. The
strict schema warning found during initial validation was corrected with an
explicit object type; final generated/browser checks are clean.

## Remaining work

Fog replacement changes entities as well as its table representation and still
needs separate settlement. Remaining layer/session mutation acceptance needs
review. Active-combat field authority and legacy conflicts (R2), auth/resume and
private producer acceptance (R5), paired DB/R2 restore and timeline invalidation
(R6), and real PostgreSQL, optimized WASM, served-provider, exact-candidate CI and
load qualification (R0/R7) remain open. This slice does not imply universal
session atomicity, offline replay or browser-restart recovery.

Six focused local commits, each at most seven files, separate the transaction,
protocol ownership, browser/workflow wiring, shared wire schema, current docs and
plan/evidence. No history redating or push is included. Preexisting audit files
and modified WASM remain outside these commits.
