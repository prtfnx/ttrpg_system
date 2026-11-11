# Layer patch acceptance and table hydration evidence

Date: November 9, 2026, Europe/Kiev.

Continuation after e5364f75. No history rewrite or push is included. Seven focused
local commits, each with at most seven files, separate transaction, protocol
ownership, browser/workflow, hydration, wire, current docs and plan/evidence.

## Implementation

LayerEditService merges only supplied properties into one layer and stages a
bounded original actor/session/message/kind/complete-body receipt in the same
worker transaction. Stable session/table row locks and current database DM
authority govern acceptance. Other values/layers and unknown legacy metadata
survive; full-scene saves do not write this separately persisted SQL column.

Existing table-edit pending ownership retains quarantine through fresh settlement
and current-layer installation, including reads, mutations, snapshots, cleanup
and join. Repeated cancellation cannot release ownership early. Missing known
accepted receipts remain unknown. Current authority gates private results after
internal repair; replay never restores historical settings. Publication failure
does not undo proven acceptance. Production bypasses the old standalone helper.

Closed wire requests require a bounded nonblank original ID, canonical layer and
nonempty typed patch. Supported properties are visibility, finite opacity in 0..1,
RGB tint_color or legacy color (RGB/RGBA), and the four engine blend modes.
Original input is hashed before aliases normalize; opacity controls alpha. New
dual-alias or unsupported inactive-opacity patches reject. Legacy dual aliases
prefer tint_color and stored unknown metadata remains intact.

Small layer_edit receipts and peer hints request current table reconciliation,
including explicit later retirement. Unknown active/inactive originals retain
their ownership through existing bounded probes. No migration, canvas undo root,
automatic replay or persisted v1/v2 recovery domain is introduced.

Snapshot normalization validates all layer styles before mutation and fills every
renderer layer on table switches. Engine defaults are opacity 1, white RGB, alpha
blend except additive light and multiply fog, and saved/legacy visibility or true.
This fixes styles carrying over from the prior scene. Both color spellings and
blend modes work on snapshot and live runtime paths.

## Verification

- Broad server selection: **1,470 passed, 95 skipped**, 1,565 collected. Selected
  sprite/canvas/combat/choice/encounter/character/persistence/table/wall/fog/layer/
  action-batch/session protocol/receipt/XP units plus trusted reconstruction,
  PostgreSQL contracts and Alembic baseline. New layer units: **51** (20 service,
  17 recovery, 14 wire), included in the broad count.
- Shared core: **627 passed** across the complete package suite. This includes
  the protocol cases; overlapping focused reruns are not counted again.
- Broad jsdom: **2,096 passed**, 125 files. Websocket/shared protocol, character,
  combat, canvas, painting, fog, table snapshots/synchronization and runtime.
- Native browser CSP/storage suite: **5 passed**. Layer original-ID rejection
  works under the server CSP without unsafe evaluation.
- Combined distinct passes: **4,198** (1,470 + 627 + 2,096 + 5).
- PostgreSQL-dependent skips: **94 contracts plus one Alembic case**. Four new
  layer cases cover merged-property/receipt atomicity and observed pg_blocking_pids
  waits behind the original session barrier through commit and rollback. No
  disposable PostgreSQL target is configured; skips do **not** qualify real locks.
- Fault cases include lost replies before/after commit, lookup/install failure,
  preserved unrelated cache/SQL state, later style/deletion, role revocation,
  missing known receipts, changed original input, repeated cancellation,
  socket removal/join/empty cleanup, worker-owned SQL and publication failure.
  Trusted reconstruction verifies merged saved visibility/opacity/tint. Browser
  cases verify unknown ownership, current receipts, aliases, table-switch
  defaults and validation before renderer/store mutation.
- Pinned Pyright 1.1.411: **zero errors/warnings**. Targeted Ruff/ESLint,
  TypeScript, generated bindings, docs and diff checks pass.
- Production build: **2,153 modules**; main 561.85 kB, core 817.85 kB and existing
  WASM 3,314.89 kB. The existing large-chunk warning remains. Modified WASM was
  preserved and not regenerated/committed; optimized reproducible WASM remains
  unqualified.

## Remaining work

Next: session game mode/rules atomic acceptance and current-cache recovery. R2
active-combat field authority/legacy conflicts, R5 auth/resume/private producers,
R6 paired DB/R2 restore and timeline invalidation, and R0/R7 PostgreSQL, optimized
WASM, served-provider, exact-candidate CI and load gates remain open. These local
checks do not establish universal session atomicity, browser-restart/offline
replay or an untrusted-client confidentiality redesign.

Preexisting modified WASM, unrelated audit files and the previous publication
boundaries are preserved. All seven new commits remain local.
