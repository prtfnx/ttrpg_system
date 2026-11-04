# Architecture plan: remaining release work

Reviewed November 2, 2026, Europe/Kyiv, against the latest local code and the
[functional release plan](FUNCTIONAL_RELEASE_ARCHITECTURE_PLAN_2026-10-26.md).
This is a remaining-work report, not a release acceptance declaration.

## History and publication

All 37 previously unpublished commits were redated for both author and committer
to November 2, retaining raw identities/messages, every tree, parent order and
local times of day. Previous tip `673523d8` becomes `b9a673d8`; the old history is
retained on `backup/unpublished-before-redate-2026-11-02-673523d8`.
The [commit map](audit/release-2026-11-02/commit-map.json) records every old/new ID.

A normal fast-forward push published exactly the oldest 12 through `6d344d97`:
XP PostgreSQL contracts, table creation/copy/import acceptance/recovery, durable
table deletion and browser/runtime retirement. The remote tip was verified with
`git ls-remote`. There were 25 rewritten commits left local, including later
settings, browser journal and character-outcome work. The separate three-file
report/map/plan commit adds one further local commit; it is not part of that push.
Local implementation below must not be mistaken for the state of `origin/main`
or an independently verified deployment.

## Implemented locally; retain and qualify

- R1: combat effects, accepted snapshot/journal and lifecycle settlement have
  transaction/cancellation boundaries. Do not redo the original compensation
  refactor merely because an older source-evidence paragraph describes it.
- R2: shared character/token stat acceptance, token-panel routing, canonical NPC
  creation and guarded dry-run/apply reconciliation are implemented. Ambiguous
  legacy values require an explicit decision; no automatic encounter-end sheet
  write-back guarantee is introduced.
- R3: the named choice storage, join/hydration, unloaded-token permissions and
  compendium lookup paths use worker-owned sessions. Production-provider latency
  and served ordering still need qualification.
- R4: table create/copy/import/delete/settings and XP have atomic receipts;
  their originals survive same-tab reload through the negotiated scoped journal.
  General character updates and stat repair have durable server receipts and
  current-state replay, with snapshot fencing until live installation. Character
  originals still live only in page memory.

Prior October 30 tests/build/type evidence is recorded in the dated audit files.
This history/report task did not rerun those application suites. Commit-tree
equality proves the rewrite did not change application content; it does not
qualify PostgreSQL locks, object storage, a served deployment or a release load.

## Remaining work, checked against code

| Workstream | Remaining implementation or qualification | Completion evidence |
| --- | --- | --- |
| R4: choice outcomes | Add original actor/session/request/payload identity, atomic transition/event/receipt acceptance, and fresh settlement lookup. Keep recovery possible after encounter completion. Worker ownership alone does not resolve commit-response loss. | Duplicate original after restart accepts once; changed input rejects; commit/rollback ambiguity and cancellation retain ownership until verified installation. Exercise concurrent PostgreSQL duplicates and lock waits. |
| R4: multiclass outcomes | Route multiclass advancement through its own atomic original-intent acceptance and current-authority replay. The current handler loads/validates and calls the standalone manager with `allow_advancement_updates=True`, outside general character protocol receipts. | An uncertain repeated request cannot add a second class level; distinct deliberate advances remain distinct. Cover stale versions, authority changes and lost responses. |
| R4: character reload ownership | Persist original character intents under authenticated actor/session/instance scope and retain unknown/denied evidence. Negotiate compatibility explicitly: the closed v1 journal supports only table create/delete/settings and XP. | Reload/owner replacement preserves the exact original identity/body, cross-account/session replay is impossible, and hydration or denied lookup does not falsely settle acceptance. |
| R4: remaining generic mutations | Review remaining table/sprite commit-uncertainty paths operation by operation. Existing sprite/canvas receipts do not automatically resolve every lost commit response or dirty retry. Reuse existing domain identities. | Failure/restart/duplicate cases for each supported release command prove settlement and current cache state; unsupported guarantees are explicit. |
| R2: active combat and legacy state | Finish/enforce the field authority contract for sheet/token edits while encounter HP/resources are active, and verify reconnect/completion consistency. Preserve the no-automatic-write-back policy unless deliberately changed. Apply guarded repairs only to unambiguous legacy data; resolve conflicts explicitly. | Test active combat edits, delayed projections, completion, reconnect/restart, hidden/unloaded tokens, explicit null/zero and conflicting legacy rows under the documented authority rule. |
| R5: authentication and private producers | Finish the explicit expired-login/sign-in/resume flow while retaining pending intent ownership. Audit sensitive producers with current role/layer checks, including revocation and reconstructed/reconnected state. Existing expiry enforcement and filtered character-stat events are partial evidence. | Served DM/two-player/spectator matrix, expiry during queued/in-flight work and idle socket, demotion/removal, private-layer events and reconnect. No reconnect loop or stale authority. |
| R6: paired recovery | Implement a writer-aware maintenance/capture flow and a matching PostgreSQL/object-byte manifest. Include upload intents and deletion jobs, checksums, receipt/journal invalidation after rollback restore, and isolated restore rehearsal. | Restore into a separate database/bucket, verify all linked data/assets, claim a fresh writer and play the restored session. Record recovery point/time objectives and duration. Scheduled encrypted independent backups/alerts are additional public-production work. |
| R0/R7: candidate qualification | Identify the exact final SHA, resolve generated-WASM provenance, run required PostgreSQL gates without skips, package/serve that browser artifact, and qualify provider/auth/storage workflows and session load. Reconcile stale current-doc claims against completed fixes. | Green exact-candidate CI/JUnit, reproducible optimized WASM/fingerprint, packaged FastAPI browser with real disposable PostgreSQL/R2, ack loss/restart/writer handover, bounded queues and measured DM/two-player/spectator convergence. |

Source checks supporting these gaps:

- [Choice persistence](../server/service/choice_encounter_persistence_service.py)
  commits snapshot/events but has no original-operation receipt/settlement API;
  [choice protocol](../server/service/protocol/encounter.py) supplies worker ownership.
- [Multiclass handler](../server/service/protocol/characters.py:866) uses the
  separate advancement path. General character receipt support does not cover it.
- [Persisted recovery domain map](src/lib/websocket/operationRecovery.ts:3) has
  four domains and excludes generic character edits.
- [Character field boundaries](../../docs/current/features/CHARACTERS_AND_COMPENDIUMS.md:103)
  still distinguish encounter state. Ordinary
  [linked-stat projection](../server/service/character_protocol_persistence_service.py)
  updates entity rows; the encounter owns a separate snapshot. Guarded repair
  blocks active combat; this alone does not establish every ordinary edit rule.
- [Socket close handling](src/lib/websocket/clientProtocol.ts:852) stops policy
  reconnects but still collapses ordinary account-policy closures into a generic
  auth error. Full deliberate sign-in/resume acceptance remains to establish.
- [Backup/restore](../../docs/current/operations/BACKUP_AND_RESTORE.md) explicitly
  remains development recovery; independent paired production backup is absent.
- [Latest validation](audit/release-2026-10-30/character-outcome-validation.md)
  records 51 skipped PostgreSQL contract cases and unqualified served acceptance.

## Suggested next sequence

1. Implement choice original-intent acceptance and settlement, then multiclass,
   in narrow commits with corresponding protocol/domain tests and current docs.
2. Extend persisted character recovery through a compatible negotiated contract;
   keep scoped original ownership and bounded storage.
3. Close active-combat authority and auth/private-producer gaps for the functional
   workflow. Avoid expanding encounter-end write-back or terrain scope implicitly.
4. Build and rehearse the paired restore baseline before retaining important data.
5. Run disposable PostgreSQL gates early during the above work, then qualify the
   final candidate with real provider/served workflows and measured session load.

R1 and R3 mostly need validation, not another wholesale rewrite. Defer general
core-table extraction, wholesale dependency-cycle removal, multiple active app
workers and confidential-fog redesign for this trusted-session release. The
original plan's engineering-day estimates are historical; they are not a fresh
remaining-effort estimate after the subsequent implementation batches.
