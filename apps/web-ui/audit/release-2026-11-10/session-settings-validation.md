# Session settings settlement and confirmation evidence

Date: November 10, 2026, Europe/Kiev.

## Publication boundary

Seventeen unpublished commits were redated to November 10. Their contents,
identities, messages, order and local times were preserved, along with the index
and preexisting dirty files. A backup branch and verified commit-map.json retain
the old/new mapping. Exactly the oldest nine were pushed through 67b0d96a; eight
prior commits remained local. New implementation commits follow that boundary.

## Implementation

SessionEditService accepts a game-mode column change or rules replacement and a
bounded original actor/session/message/kind/complete-body receipt in one owned
worker transaction. The stable session-row lock and current SQL DM authority
govern acceptance. Rules preserve their replacement contract: omitted fields
default and session_id binds to the trusted SQL session code. New known fields
are strictly typed and finite; legacy trust_client remains readable as lightweight
but new writes reject it. No migration or new persisted recovery domain is added.

Uncertain commit/lookup/install outcomes retain a pending session owner through
fresh READ COMMITTED settlement and current rules/mode movement-cache installation.
Reads/writes, full-scene snapshots, empty cleanup and join cannot bypass it. Join
settles before loading metadata for its welcome message. Missing known-accepted
receipts or missing session/actor evidence cannot prove rollback. Current authority
gates private receipts after internal repair; changed originals conflict and old
policy never replays. Repeated mutation cancellation retains ownership through
publication. Transport failure does not undo proven acceptance.

Current queries require membership, fail closed on unavailable storage and send
one response. The old production duplicate send/default-policy fallback is bypassed.
Legacy standalone helpers retain their compatibility behavior.

Browser originals remain page-local through timeout/unknown outcomes. A bounded
rules query asks for settlement without replaying mutations, and a blocked query
does not create a read loop. Acceptance requests a fresh read after earlier blocked
probes. Current state broadcasts do not acknowledge unknown originals. The handler
now unwraps the actual nested rules object and applies current mode. The rules
editor sends current rules plus its draft, preserving unrelated choices, retains
drafts while waiting and does not claim success when merely sent. Unsent edits
remain available. Persisted v1/v2 domains and general offline/restart replay are
unchanged.

## Verification

- Broad server selection: **1,644 collected**, with **103 PostgreSQL-dependent
  skips**. The initial run passed 1,514 and failed 27 lifecycle cases because a
  shared MagicMock defaulted the new pending flag to truthy. The only correction
  was an explicit false flag in that test fixture. Its full **53-case** rerun
  passed. Final distinct server passes are **1,541**; 26 overlapping passes are
  not counted again. Production sources were unchanged by that fixture correction.
- New session units: **71 passed** (30 service, 18 recovery, 23 wire), included
  in the server count. Real SQL/fault cases cover before/after commit, unavailable
  lookup, failed installation, later policy, revoked authority, missing known
  receipts, original-input conflicts, repeated cancellation, SQL off-loop,
  publication failure, fail-closed single-response reads, cleanup and fresh join
  metadata. Trusted-session reconstruction verifies saved mode and rules.
- Complete shared-core suite: **627 passed**.
- Broad jsdom: **2,106 passed**, 126 files across websocket/shared protocol,
  character/combat/canvas/painting/fog, snapshot/runtime and the rules editor.
  Focused editor rerun: four passed, already included in that count. Browser
  cases cover timeout retention, bounded probes, no mutation replay, current
  rules/mode unwrapping, complete editor saves and retained drafts.
- Native browser CSP/storage suite: **five passed**. New original-ID rejection
  executes under server CSP without unsafe evaluation.
- Combined distinct passes: **4,279** (1,541 + 627 + 2,106 + 5).
- PostgreSQL skips: **102 contracts plus one Alembic case**. Eight new contracts
  cover mode/rules effect/receipt atomicity and observed pg_blocking_pids waits
  behind the original session barrier through commit/rollback. No disposable
  target is configured; skips do **not** qualify real PostgreSQL locks.
- Pinned Pyright 1.1.411: **zero errors/warnings**. Targeted Ruff/ESLint,
  TypeScript, generated binding, docs and diff checks pass.
- Production build: **2,153 modules**, main 561.85 kB, core 848.85 kB, existing
  WASM 3,314.89 kB. The sandbox denied esbuild configuration-path access; the same
  build passed with escalation. The existing large-chunk warning remains.
  Preexisting modified WASM was preserved and not regenerated/committed; optimized
  reproducible WASM remains unqualified.

## Remaining work

Next implementation review: R2 active-combat field authority and remaining legacy
mutation conflicts. R4 real PostgreSQL/served acceptance, R5 auth/resume/private
producers, R6 paired DB/R2 restore/timeline invalidation, and R0/R7 optimized WASM,
exact-candidate CI, served-provider and load gates remain. These local checks do
not establish universal session atomicity, browser-restart delivery or an
untrusted-client confidentiality redesign.

Seven focused new local commits, each at most seven files, separate transaction,
protocol ownership, browser reconciliation, editor behavior, shared wire contracts,
current docs and plan/evidence. They were not pushed. Existing WASM/audit changes
and the nine-commit publication boundary remain preserved.
