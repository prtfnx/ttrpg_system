# Fog replacement and committed hydration evidence

Date: November 9, 2026, Europe/Kiev.

The requested history operations completed sequentially. Twenty-four unpublished
commits were redated to November 6 and the oldest nine pushed through 38381730.
The remaining fifteen were redated to November 9 and the oldest twelve pushed
through bdbe1163. Three prior commits remained local. Verified maps and backup
branches preserve both phases, with names/messages/trees/order, local times,
index and existing dirty files unchanged. New fog work follows these pushes.

## Implementation

Fog replacement/clear and a small complete-original receipt accept together in
an owned SQL transaction behind session/table barriers and current DM authority.
Only fog rows change; unrelated fields, entities, walls and paint are not saved.
A 60 KiB bounded complete-input digest binds actor/session/message/kind/body;
receipts contain no geometry. No migration or persisted v1/v2 domain is added.
Pixel anchors retain the core integer contract, reversed corners normalize,
fractional extents persist and invalid/degenerate shapes reject atomically.

Table-edit pending ownership retains quarantine through fresh settlement and
current indexed fog installation. Reads/writes, snapshots, cleanup and join cannot
bypass it. Missing known-accepted receipts remain unknown; current authority gates
private results after internal repair. A private indexed fork preserves unrelated
retained objects and detects collisions before replacing both aliases. Repeated
cancellation retains ownership through publication. Old replacements do not replay.

SQL reload derives the compatibility rectangle view from canonical marker rows,
including legacy fog. The validated snapshot owner installs renderer/store state
and publishes canonical IDs through fog-hydrated. The panel follows committed
state without clearing/replaying geometry and reads retained store fog if mounted
later. This fixes an event mismatch that could drop saved fog from a later edit.
Receipt reconciliation uses current active/inactive probes, not automatic replay.

## Verification

- Broad server: **1,372 passed, 91 skipped**, 1,463 collected. Selected table/wall/
  fog/sprite/canvas/combat/choice/encounter/character/persistence units plus trusted
  reconstruction, PostgreSQL contracts and Alembic baseline.
- Final fog/schema selection: **289 passed** (18 service + 18 recovery + 253 core
  schema). One added degenerate-shape case extends distinct server passes to
  **1,373**; repeated cases are not added again.
- Broad jsdom: **2,047 passed**, 123 files. Existing websocket/shared protocol,
  character/combat/canvas/painting plus fog UI and table snapshot synchronization.
  Native browser CSP/storage: **5 passed**.
- Combined distinct passes: **3,678** (1,373 + 253 + 2,047 + 5).
- PostgreSQL-dependent skips: **90 contracts + one Alembic case**. Four new fog
  contracts cover replacement/receipt atomicity and observed pg_blocking_pids
  waits through commit/rollback. No disposable target was configured; skips do
  **not** qualify real PostgreSQL locks.
- Fault cases cover commit/lookup/install failure, replay/clear, preserved retained
  state, collisions, revocation, missing receipts, changed originals, cancellation,
  join/empty cleanup, SQL off-loop and accepted outcomes after publication failure.
  Trusted reconstruction verifies saved fog. Browser cases verify canonical IDs,
  late panel mounts, inactive/uncommitted input rejection and no hydration replay.
- Pinned Pyright 1.1.411: zero errors/warnings after explicit optional-state
  assertions. Targeted Ruff/ESLint, TypeScript, generated binding and docs gates
  pass. Native CSP validation requires no unsafe evaluation.
- Production build: **2,153 modules**; main about 562 kB, core 806 kB, existing
  WASM 3,315 kB. Existing large-chunk warning remains. Modified WASM was preserved
  and not rebuilt/committed; optimized reproducible WASM remains unqualified.

## Remaining work

Layer/session acceptance needs review and implementation. R2 active-combat field
authority/legacy conflicts, R5 auth/resume/private producer acceptance, R6 paired
DB/R2 restore/timeline invalidation, and R0/R7 PostgreSQL, optimized WASM,
served-provider, exact-candidate CI and load gates remain. This does not add
universal session atomicity, offline/reload replay or client confidentiality.

Seven new local commits, each at most seven files, separate persistence, protocol,
transport/workflow, committed panel hydration, wire identity, current docs and
plan/evidence. They are outside both limited pushes. Preexisting modified WASM
and unrelated audit files remain untouched.
