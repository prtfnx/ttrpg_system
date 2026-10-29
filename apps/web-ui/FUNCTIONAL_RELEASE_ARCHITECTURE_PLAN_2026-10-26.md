# Functional release architecture implementation plan

Date: 2026-10-26, Europe/Kiev.

Status: proposed implementation backlog; this document does not declare the remaining work complete.

Continuation: 2026-10-27. Redated all 22 unpublished commits for both author
and committer in Europe/Kyiv, preserving trees, identities, messages, and
working files. Saved original history on
`backup/unpublished-before-redate-2026-10-27-db7fbc7e`. A normal fast-forward
push published exactly the oldest 11 through `8820d458`; 11 remained local
before new work. See the [commit map](audit/release-2026-10-27/commit-map.json)
for old/new identifiers. Short references below use the redated history.
Next implementation target: uncertain character commit outcomes, followed by
token-originated consistency and remaining R2/R3 work.

October 27 implementation: generic character updates now wait on a stable
session-row lock and verify commit-response errors against the exact before/after
CAS version/document on a fresh connection. Unavailable or superseded outcomes
stay unknown and share the session/snapshot admission fence with combat. Later
serialized requests install verified projections before work resumes; recovered
receipts retain the original actor/message identity. Replaying that original
request during recovery returns its outcome without incrementing the source
again; changing its payload rejects. This is in-process reconciliation, not a
durable retry ledger across restart. Token-originated transactions, encounter
authority, general durable identities, and real PostgreSQL acceptance remain open.

Execution started: 2026-10-26. R0 documentation reconciliation is implemented.
The isolated optimized WASM build matches the baseline `HEAD` binary byte for
byte (SHA-256 `33ba71838d57fbf860d9d51933a17bbfacd64ff92cfbc8c035bd016775bfcace`,
source fingerprint `fnv1a64:af8a690ecdce1683`). Existing modified generated files
are preserved. Browser production build and the 11 PostgreSQL gate-checker
regressions pass. No `TEST_POSTGRESQL_DATABASE_URL` is configured: real
PostgreSQL gates, packaged served acceptance, and provider recovery remain open.

R1 is in progress: `dfa29c4b` adds borrowed-transaction staging and `aa811e55`
commits authenticated combat movement with snapshot/journal acceptance. SQLite
regressions cover failure after flush, mixed batches, duplicate replay, restart,
stale durable positions, translated geometry, and cancellation ownership. The
follow-up endpoint correction saves the validator's snapped destination and
authoritative route start. Pre-combat environment persistence now uses the
existing async table snapshot path, with detached worker inputs and retained
session/table ownership through cancellation. Backend combat commit recovery now
resolves the durable receipt behind a session-row barrier. Unavailable outcomes
quarantine serialized work and snapshot retries until a later request installs
the verified result; empty-session cleanup retains the cache. Actual PostgreSQL
execution and complete browser recovery acceptance remain open; R1 is not yet
release-qualified.
Acceptance also rechecks the encounter's session/table identity and source
revision under database row locks. The existing mandatory PostgreSQL contract
module now includes movement/snapshot/journal success, rollback after flush,
and duplicate replay cases; these require execution against PostgreSQL in CI.

Validation for this first implementation batch: 229 focused server regressions
pass, the full pinned Pyright check reports zero errors/warnings, targeted Ruff
checks pass, and `docs:check` passes. The PostgreSQL contract module collects
15 cases but skips them locally without a configured test database. New cases
observe PostgreSQL row-lock blocking through original transaction commit/rollback
and reject repeatable-read recovery snapshots. No served
provider playthrough, restore rehearsal, or final release qualification is
claimed. Continuation validation: 177 focused server regressions pass, including
lost commit responses, lookup outages, cancellation, ended encounters, and
current-role notification filtering. Next: implement the R2 field-authority and
linked-stat boundary; retain browser reconciliation and PostgreSQL evidence gates.

R2 now uses its borrowed-transaction adapter in generic character updates:
source document, version, audit records, and linked HP/max-HP/AC projections
share one commit. Loaded-table locks prevent background snapshots from racing
post-commit installation. Publication consumes detached committed identities
without a second write, installs all live projections before transport awaits,
and reports notification failures as successful acceptance requiring resync.
Regressions include failed staging, zero/null stats, private/unloaded tokens,
stale versions, cancellation, and a queued background snapshot. Token-originated
sheet edits, active encounter write-back/authority, old-data reconciliation, and
durable character request identity across restart still require follow-up; R2 remains partial.

The continuation batch passes 300 focused server regressions, full pinned
Pyright with zero errors/warnings, targeted Ruff, and current-doc link checks.
The 15 PostgreSQL contract cases still skip locally without a configured test
database. The character/source transaction path is covered with real SQLite
and production dispatch; it has not yet been qualified on PostgreSQL or through
the served browser. That validation run preceded the October 27 partial push recorded above.

Source baseline: local `main` at `62c3e9e4`. This reassesses [the October 23 architecture research](ARCHITECTURE_RESEARCH_2026-10-23.md) against current code and subsequent fixes. The old report's commit identifiers, branch counts, and descriptions of unfixed defects are historical. At plan creation the tracking state was ten local commits ahead of `origin/main`; deployment of subsequent local changes is not established here.

The release priorities are durable game actions, responsive multiplayer play, recoverable reconnects, and a tested way to restore retained data. Broad package extraction, elimination of every import cycle, and horizontal scaling are outside this release's critical path.

## 1. Release scope and acceptance

Target the documented [one trusted session scope](../../docs/current/explanation/TRUSTED_SESSION_SCOPE.md): one active application process, a trusted DM, and trusted players. Use one DM, two players, and a spectator as the initial acceptance scenario; this is a test target, not a measured capacity promise.

A functional release must support this complete workflow through the served application:

1. Sign in, create/join a session, assign roles, and reconnect to the same session.
2. Upload and use an asset; create/copy/switch tables; edit tokens, text, paint, walls, lighting, and settings using supported commands.
3. Create/bind/update characters, award XP, and run a choice encounter and a combat encounter, including move/attack, turn progression, and encounter completion.
4. Keep DM/player/spectator views consistent with permissions. Private-layer updates must not escape through secondary event producers.
5. Recover from a lost acknowledgement, expired login, slow/disconnected peer, database failure, and server replacement without duplicating an irreversible action or losing an acknowledged change.
6. Restart against PostgreSQL, restore a paired database/object recovery point in an isolated environment, and verify that the same session and assets remain usable.

Keep the current restriction on terrain/cover edits during active combat. Keep one application worker and the existing writer fencing. Unsupported behavior must be explicit in current feature guides and the UI where the user encounters the restriction.

For a public production service, also require automated independent backups, restore monitoring, a capacity-tested hosting configuration, and a separate review of untrusted-client confidentiality. Trusted-group acceptance alone does not qualify those guarantees.

## 2. What remains from the research

| Finding | Current assessment | Release action |
| --- | --- | --- |
| A1: combat lifecycle writes before acceptance | Fixed locally in `badecc9f`: engine transitions no longer commit implicitly; accepted snapshot/journal owns the lifecycle save. | Retain failure/restart regressions. Do not reopen this as a separate refactor. |
| A2: independent table/token/character/combat commits | Partial: combat movement/snapshot/journal share acceptance, as do generic character updates and linked stat projections. Token-originated edits and encounter/sheet reconciliation remain separate. | Finish R1 evidence and remaining R2 boundaries before qualifying retained game state. |
| A3: cancellation releases combat ownership early | Fixed for command settlement/publication, detached environment snapshots, and pending outcome recovery. Other migrated paths still need review. | Preserve existing coverage; finish remaining input/ordering work in R3. |
| A4: synchronous database work in async paths | Open for choice encounters, join hydration, permission fallbacks, and compendium lookups. Wall command persistence already uses workers. | R3; migrate identified paths rather than rewriting all persistence. |
| A5: private token stat broadcasts | Known character-stat producer fixed in `dce37e22`, including loaded/unloaded layer filtering. Other sensitive producers still need a bounded audit. | R5; retain a documented distinction between rendering fog and confidential world data. |
| A6: WebSocket account authority beyond JWT expiry | Server deadline and signed-token integration coverage added in `531e9d09`. Browser close handling still reports generic authentication failure. | Finish and verify the browser reauthentication workflow in R5. |
| A7: independent database plus R2 recovery | Open; existing operations guide explicitly describes development-level recovery. | R6: paired restore baseline before retaining important data; automation before public production. |
| A8: inconsistent durable operation identity/outcomes | Open for important operations such as table creation and XP awards. Canvas/sprite/paint/chat/combat already have domain-specific mechanisms. | R4: extend existing patterns selectively and resolve unknown commit outcomes. |
| A9: core-table imports server infrastructure | Still present. | Defer extraction; introduce only the transaction/worker adapters needed by R1-R3. |
| A10: browser dependency cycles | Research recorded 39 cycles; the count was not rerun for this plan. | Defer wholesale cleanup. Fix a cycle only when a reproducible release workflow requires it. |
| A11: missing PostgreSQL CI gates | Workflow and no-skip result checker added in `efe187ac`. A real successful PostgreSQL run is not established by local skipped tests. | R0 and R7 must record successful execution on the candidate revision. |
| A12: singleton application writer | Intentional supported deployment boundary. | Measure the target session in R7; defer partitioning and multiple active workers. |

Existing focused server regressions and static checks are useful evidence for the completed fixes. They do not replace real PostgreSQL execution, a served browser playthrough, real object-storage checks, or a restore rehearsal. The modified generated WASM files in the working tree also require provenance/build validation; their presence is not release evidence.

## 3. Implementation workstreams

### R0. Establish a reproducible candidate and reconcile current documentation

Priority: first. Estimate: 1-2 engineer-days.

Implementation:

- Record the exact candidate commit, dependency locks, migration head, and generated WASM source fingerprint. Preserve unrelated working-tree changes; review/rebuild generated artifacts from their intended Rust sources before including them.
- Run the existing PostgreSQL gate against a disposable database. Require the checker to accept the report, including the PostgreSQL live-sync case. A skipped module is an unmet gate.
- Run the documented optimized WASM build/fingerprint comparison and package the browser with `apps/server/scripts/package_web_ui.py`. Verify that the server serves that candidate's assets.
- Reconcile stale current documentation against already completed fixes: combat cancellation, worker-owned wall writes, and existing canvas command/history receipts. Describe missing guarantees by operation rather than claiming every canvas action lacks a journal.

Tests/evidence: existing `test_postgresql_gate.py`; the workflow's five PostgreSQL gate modules; existing WASM browser suite and fingerprint verifier. Preserve the JUnit report, build provenance, and candidate SHA. No new test that merely checks documentation wording is needed.

Docs owners: [Trusted session scope](../../docs/current/explanation/TRUSTED_SESSION_SCOPE.md), [Persistence ownership](../../docs/current/explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md), [State ownership](../../docs/current/STATE_OWNERSHIP.md), [System contracts](../../docs/current/reference/SYSTEM_CONTRACTS.md), and [Deployment](../../docs/current/operations/DEPLOYMENT.md). Split this reconciliation into small coherent commits if needed.

Done when: current docs distinguish implemented guarantees from limitations, and actual PostgreSQL/build evidence is available for an identified revision. New work still requires final candidate verification in R7.

### R1. Commit combat effects and acceptance together

Priority: release blocker. Dependencies: R0; coordinate the receipt contract with R4. Estimate: 4-7 days.

Source evidence: [combat movement adapter](../server/service/protocol/combat.py) calls `actions.move_sprite` before [combat command persistence](../server/service/combat_command_service.py). `_restore_async` attempts inverse movement and ignores compensation exceptions. `_save_table_async` submits a callback that still reads a live table.

Implementation:

1. Introduce a detached combat effect draft containing expected revisions, token changes, encounter snapshot, and canonical result. Validate the whole command/batch before durable effects. Keep live authoritative state under session ownership until settlement.
2. Add persistence methods that accept one worker-owned SQLAlchemy session and flush without committing. Retain explicit compatibility wrappers for independent callers; calling two existing committing helpers inside another function is not a transaction.
3. Persist movement, combat resource/stat changes, snapshot, journal, and the supported command identity/result in one database transaction. Preserve application writer fencing and optimistic revision checks. Publish/install only the committed result.
4. Replace compensating movement as the ordinary correctness mechanism. For an uncertain commit acknowledgement, resolve the durable command outcome before declaring rejection or restoring stale live state. Keep admission blocked or require authoritative reload while the outcome is unresolved.
5. Capture environment-save input on the event-loop side before worker submission. Preserve current pre-combat edit restrictions rather than expanding gameplay scope in this change.

Tests: extend `test_combat_lifecycle_persistence.py`, `test_combat_command_service.py`, `test_combat_persistence.py`, and `test_combat_cancellation.py`. Inject failure before each staged write, before commit, after commit/before response, and during publication. Cover a mixed move/attack batch, rejection of a later action, duplicate retry, writer replacement, and process reconstruction. Add real PostgreSQL transaction coverage for the new boundary; SQLite alone cannot establish writer/locking behavior.

Docs owners: [Battle flow](../../docs/current/BATTLE_FLOW.md), [Combat commands](../../docs/current/reference/COMBAT_COMMANDS.md), [Persistence ownership](../../docs/current/explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md), and [System contracts](../../docs/current/reference/SYSTEM_CONTRACTS.md).

Done when: rejected actions leave no durable movement/resource changes; accepted actions reconstruct identically after restart; a lost commit response cannot cause a second action or a false rollback.

### R2. Define character, token, and encounter stat authority

Priority: release blocker. Dependencies: reuse R1's transaction conventions. Estimate: 4-7 days.

Source evidence: [character protocol](../server/service/protocol/characters.py) saves a character before `_sync_character_stats_to_tokens`; failures in that synchronization are logged and swallowed. [Character manager](../server/managers/character_manager.py) and [token persistence service](../server/service/character_protocol_persistence_service.py) own separate transactions. Active combat also keeps stat state.

Implementation:

1. Write a field-level authority table before changing behavior: persistent base attributes/XP, encounter HP/resources, token display fields, and the behavior of editing a character during active combat. Explicitly decide whether encounter HP is written back at encounter completion. Preserve intended gameplay rules rather than choosing whichever row was updated last.
2. For authoritative fields in the same database that must change together, use one transaction for the source and affected persisted representations. Refactor internal commit ownership using narrow staging methods.
3. If some token displays can lag, store a versioned repair/outbox record in the source transaction and process it idempotently. Persist source version on the projection, reject stale repair, and resume after restart. Use this only for declared projections, not to excuse partial authoritative saves.
4. Return/publish a result consistent with the chosen contract. Keep role/layer filtering for loaded and unloaded tokens. Remove silent permanent divergence after a successful character update.
5. Provide an idempotent reconciliation operation for existing inconsistent rows. Define conflict handling and offer a dry-run report; do not blindly overwrite active encounter values from character sheets.

Tests: extend `test_character_protocol.py`, `test_character_protocol_persistence_service.py`, and relevant combat tests; add PostgreSQL atomicity/restart cases. Cover multiple linked tokens across tables, hidden and unloaded tokens, active combat, stale versions, failed projection writes, repeated repair, and crash after source commit. Extend browser `TokenCharacterBinding.test.tsx` and character update command tests when their observable contract changes.

Docs owners: [Characters](../../docs/current/features/CHARACTERS_AND_COMPENDIUMS.md), [Tokens](../../docs/current/features/SPRITES_TOKENS_AND_ENTITIES.md), [Battle flow](../../docs/current/BATTLE_FLOW.md), [State ownership](../../docs/current/STATE_OWNERSHIP.md), and [Database schema](../../docs/current/reference/DATABASE_SCHEMA.md) if storage changes.

Done when: character/token/encounter values follow one documented authority rule after success, failure, reconnect, and restart; any allowed projection lag has durable repair and a tested convergence condition.

### R3. Finish worker ownership on gameplay-critical paths

Priority: release blocker for responsive multiplayer. Dependencies: R0. Estimate: 3-5 days.

Source evidence: [choice encounter helpers](../server/service/protocol/encounter.py) synchronously load/save snapshots from async handlers; [session join](../server/service/game_session_protocol.py) performs synchronous database reads and choice hydration. Permission fallback queries in `service/protocol/helpers.py` and database-backed compendium resolution also require call-site review.

Implementation:

- Route confirmed database work through the existing bounded `run_blocking` adapter. Each worker owns and closes its session; send detached values in and return detached results. Keep pure in-memory lookups on their existing path.
- Convert choice persistence and join hydration together with their ordering contract. A delayed worker read must not restore an older encounter after a newer start/end. Recheck revision/live state under session ownership or hold the appropriate mutation scope through installation.
- Avoid recursive acquisition where a handler already holds the session lock. Keep permission queries scoped to the authenticated numeric session ID and current actor authority.
- Give admitted mutations the same lifetime through SQL settlement, live installation, and publication, including repeated cancellation. Read-only cancellation may discard results but cannot install stale state later.

Tests: extend `test_encounter_protocol.py`, `test_choice_encounter_persistence_service.py`, `test_protocol_serialization.py`, and join/permission tests. Block database workers with deterministic barriers and prove that heartbeats/unrelated session work remain responsive. Cover concurrent join versus encounter completion, cancelled hydration, denied control, worker failure, and restart. Extend `test_multiclient_sync.py` for a real-socket slow-storage scenario where useful.

Docs owners: [Server architecture](../../docs/current/SERVER_ARCHITECTURE.md), [Encounters](../../docs/current/features/ENCOUNTERS.md), [Sessions](../../docs/current/features/SESSIONS_AND_INVITATIONS.md), [Persistence ownership](../../docs/current/explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md), and [Trusted session scope](../../docs/current/explanation/TRUSTED_SESSION_SCOPE.md).

Done when: the named gameplay paths perform no blocking SQL on the server loop, and worker completion cannot reorder accepted session state. Existing wall worker migration remains intact.

### R4. Make high-risk retries resolve to one durable outcome

Priority: release blocker for supported retry flows. Dependencies: R1/R2 transaction boundaries; contract design can start alongside R1. Estimate: 4-7 days.

Source evidence: XP handling in [character protocol](../server/service/protocol/characters.py) computes and commits the increment before separately recording the award; it has no durable award identity. Table creation and settings do not share a complete durable outcome lookup contract. Existing canvas history and combat sequence handling should be reused and reviewed, not replaced wholesale.

Implementation:

1. Inventory operation identities and uncertainty behavior for table create/copy/delete, XP award, character updates, settings, and combat start/end. Prioritize creates, XP, and destructive actions; document safe reload/reconciliation behavior for remaining low-risk edits.
2. Define stable request IDs scoped to actor, session, and operation domain, with payload digest and a canonical result. Reusing an ID with different input must fail. A browser retry of the same intent retains its ID; a new deliberate action gets a new ID.
3. Commit the effect and receipt together. XP value, award audit, and receipt must share acceptance. Use database uniqueness to prevent competing duplicate execution, and apply current authorization before exposing results.
4. Resolve pending/unknown outcomes after reconnect or SQL commit-response loss. Distinguish rejected, committed, and unresolved outcomes in the client; never treat every timeout as rejection. Do not blindly replay an operation after its receipt retention window expires.
5. Verify encounter lifecycle lookup after end/restart; an identity that exists only on the active encounter is insufficient if completion removes the retry lookup context. Define retention and cleanup with the supported reconnect window.
6. Any new tables require migration, writer-trigger coverage, indexes, and old-data compatibility. Expand storage before depending on it in clients.

Tests: duplicate retries across disconnect/restart, concurrent duplicates on PostgreSQL, payload mismatch, unauthorized lookup, crash after commit before acknowledgement, receipt expiry, and end-combat retry. Extend existing domain tests and browser command reconciliation tests. Demonstrate one created table and one XP increment from two transmissions of one intent, and two results from two distinct deliberate intents.

Docs owners: [Action confirmation](../../docs/current/reference/ACTION_CONFIRMATION.md), [Command/history](../../docs/current/reference/COMMAND_AND_HISTORY.md), [WebSocket messages](../../docs/current/reference/WEBSOCKET_MESSAGES.md), [Tables](../../docs/current/features/TABLES_AND_CANVAS.md), [Characters](../../docs/current/features/CHARACTERS_AND_COMPENDIUMS.md), and migration/schema references when changed.

Done when: supported high-risk retries are safe across process restart, and unresolved low-risk operations have a clear recovery path without claiming universal exactly-once delivery.

### R5. Complete authentication recovery and private-event acceptance

Priority: release gate; implementation is narrower than the original A5/A6 findings. Dependencies: R4 for pending mutation reconciliation. Estimate: 1-3 days.

Source evidence: [browser close handling](src/lib/websocket/clientProtocol.ts) stops reconnecting on policy/authentication closes but handles account expiry through a generic failure. The existing [authentication failure hook](src/features/canvas/hooks/useAuthenticationFailure.ts) deduplicates notification; it does not implement the complete reauthentication workflow.

Implementation:

- Provide a clear expired-login state, one reauthentication transition, and a return to the original session with fresh authority and hydration. Preserve distinctions among expiry, kick, guest expiry, and transient server replacement. Reuse existing auth flows and retain the terminal-close reconnect stop.
- Reconcile pending commands after sign-in using their original identities or authoritative outcomes. Do not replay XP/create actions simply because authentication succeeded.
- Trace sensitive outbound producers used in the acceptance workflow: hydration, character-stat sync, table announcements, token updates, encounter/combat payloads, reconnect snapshots, and role changes. Use the existing role/layer policy; fix confirmed bypasses rather than adding duplicate authorization rules.
- Retain the explicit trusted-client/fog limitation. If public untrusted play is included, separately audit geometry, assets, identifiers, and other delivered world data; event filtering alone does not establish confidentiality.

Tests: extend `clientProtocol.test.ts`, `useAuthenticationFailure.test.tsx`, and authenticated WebSocket hook tests. Retain signed-token `test_websocket_auth_expiry.py`; exercise expiry during an in-flight action, queued action, idle socket, and browser return-to-session. Apply a DM/player/spectator plus loaded/unloaded/private-layer matrix to sensitive producers, including role changes and denied access after reconnect.

Docs owners: [Auth and roles](../../docs/current/features/AUTH_AND_ROLES.md), [Security](../../docs/current/operations/SECURITY.md), [Protocol boundary](../../docs/current/PROTOCOL_BOUNDARY.md), [Walls/fog](../../docs/current/features/WALLS_LIGHTING_FOG_AND_VISION.md), and [Debugging](../../docs/current/how-to/DEBUG_COMMON_FAILURES.md).

Done when: expiry cannot extend authority or create a reconnect loop; the user can deliberately sign in and resume; tested private producers obey current role/layer policy.

### R6. Make retained sessions recoverable

Priority: paired restore baseline before important retained user data; automation before public production. Dependencies: stable candidate schema; can develop alongside R1-R5. Estimate: 3-5 days for baseline, plus 5-10 days for public automation.

Source evidence: [Backup and restore](../../docs/current/operations/BACKUP_AND_RESTORE.md) documents the lack of independent paired recovery. `scripts/r2_storage_admin.py` uses ordinary database audit writes that need an explicit writer-aware maintenance path once application ownership is claimed. Metadata-only recovery cannot restore missing asset bytes.

Baseline implementation:

1. Build a maintenance flow that pauses mutations, uploads, and deletion processing; drains admitted work; and captures a consistent PostgreSQL dump with its matching R2 inventory/object copies. Include checksums, migration head, application version, and a recovery-point identifier. Enforce deletion safety while the point is captured.
2. Restore into a separate database and bucket, validate all referenced object bytes/checksums and session ownership, and resume workers only after validation. Restore upload intents and deletion jobs with their metadata; replay them idempotently under the documented restore policy.
3. Keep writer fencing enabled. Maintenance tooling must use the documented ownership/control flow, and a fresh app process must claim a new generation. Do not clear the singleton token or silently seize ownership from a running app.
4. Record a tested retention policy, recovery-point objective, recovery-time objective, restore duration, and operator steps before retaining important sessions. Keep secrets out of manifests and logs.

Public automation: schedule encrypted off-provider copies, bounded retention and inventory checks, stale-backup alerts, and periodic clean-environment restores. Provider snapshots alone are insufficient evidence of independently recoverable database-plus-asset state.

Tests: fixture backup/restore with linked character/token/combat data, missing/corrupt asset detection, uploads/deletions at the capture boundary, writer-owned admin audit, and restart after restore. Follow with a rehearsal using real disposable PostgreSQL and R2 resources, and play the restored session through the served UI.

Conditional migration task: repair the legacy SQLite importer's seeded-singleton/empty-target check only if legacy data must migrate for this release. Preserve migration-created seed records and use writer-aware import transactions; do not include this as mandatory work for fresh installations.

Docs owners: [Backup and restore](../../docs/current/operations/BACKUP_AND_RESTORE.md), [Writer handover](../../docs/current/operations/WRITER_HANDOVER.md), [Assets](../../docs/current/features/ASSETS_AND_STORAGE.md), [Database migrations](../../docs/current/operations/DATABASE_MIGRATIONS.md), and [Release checklist](../../docs/current/operations/RELEASE_CHECKLIST.md).

Done when: an operator has successfully restored a matched recovery point and verified the application, not merely produced a dump or enumerated a bucket. Public acceptance additionally requires running automation and restore evidence.

### R7. Qualify the complete served release

Priority: final release gate. Dependencies: R0-R6 baseline. Estimate: 2-4 days, excluding repair of newly discovered defects.

- Execute section 1 against the packaged FastAPI-served browser, real PostgreSQL, and a disposable real R2 setup using the intended authentication/storage configuration. Existing recorded-transport and ASGI tests remain valuable but do not cover this entire environment.
- Run the existing trusted-session workflow, live multi-client convergence suite, PostgreSQL contract/history/writer suites, browser command tests, and real WebGL/WASM lifecycle suite on the final revision. Include build, type/lint checks, Rust checks, and `docs:check` required by CI for changed areas; obtain a green full candidate CI run.
- Inject acknowledgement loss, slow storage/peer behavior, account expiry, process restart, and writer handover with retryable close 1012. Verify accepted data and command outcomes after reconnect. Test upload/read/delete and same-origin/CSP/WASM behavior through the served application.
- Exercise the initial DM/two-player/spectator workload with representative scene sizes. Record scene dimensions, sprite/light counts, browser/device, measured input-to-peer convergence, heartbeat responsiveness, memory, and bounded queues. Select and document acceptance budgets before measuring; loopback timing is not an internet latency promise.
- Keep one active application worker. If the workload fails, address the measured bottleneck or reduce documented supported limits before considering distributed deployment.
- Record the candidate SHA, gate reports, manual workflow results, restore evidence, known limitations, and separate code/schema rollback steps. Redact credentials and user data from evidence.

Docs owners: [Release checklist](../../docs/current/operations/RELEASE_CHECKLIST.md), [Testing strategy](../../docs/current/TESTING_STRATEGY.md), [Deployment](../../docs/current/operations/DEPLOYMENT.md), [Observability](../../docs/current/operations/OBSERVABILITY_AND_LOGGING.md), and [Trusted session scope](../../docs/current/explanation/TRUSTED_SESSION_SCOPE.md).

Done when: each acceptance item has evidence on the exact candidate revision, with no skipped required PostgreSQL gates or unexplained failed workflows. Passing unit tests alone cannot close this workstream.

## 4. Delivery order and commit boundaries

Recommended sequence: R0 -> R1 -> R2 -> R4 -> R5 -> R7. R3 can proceed after R0; R6 can develop in parallel with persistence work but must be rehearsed on the final schema. Design R1/R4 identities together to avoid two incompatible receipt implementations. No additional agents or parallel branches are required by this plan.

Keep each commit focused and normally within 5-8 changed files, counting tests and docs. Smaller commits are welcome. Suggested slices:

| Slice | Intended boundary | Included validation/documentation |
| --- | --- | --- |
| Candidate baseline | Reconcile stale guarantees, then separately qualify generated artifacts | Current scope/persistence pages; existing build and PostgreSQL evidence |
| Combat persistence seam | Session-injected staging adapter with compatibility wrappers | Focused persistence regression and ownership guide |
| Atomic combat command | Wire detached effects to one commit | Failure/restart tests and battle-flow contract |
| Character authority | Define fields and implement one authoritative update path | Linked-stat tests and character/token guide |
| Projection repair, if needed | Migration/storage first, then processor/reconciliation separately | PostgreSQL migration/writer tests; schema and recovery contract |
| Worker migration | Choice persistence, then join/permission/compendium call sites in separate commits | Ordering/responsiveness tests and corresponding current guide |
| Durable operation outcomes | Receipt storage, then one operation domain per commit | Duplicate/unknown-outcome tests and protocol/domain contract |
| Browser recovery | Authentication transition and pending-command resolution | Browser auth/reconciliation tests and auth guide |
| Restore baseline | Capture, restore/maintenance, and rehearsal in separate commits | Integrity tests and operational runbook |
| Candidate acceptance | Fix only discovered release defects; record final evidence separately | Release checklist/testing strategy |

Each intermediate commit must leave existing supported flows working. Land schema additions before code that requires them, preserve writer guards on new tables, and avoid switching a client to an unfinished protocol. If one semantic change exceeds eight files, split compatible adapters/storage from integration; do not omit required tests or documentation just to meet the file count. Use conventional intent-based commit messages such as `fix(combat): persist movement with command acceptance` and `fix(characters): reconcile linked token stat projections`.

For every implementation slice:

1. Add or extend the regression at the actual failure boundary; include real database tests for transaction behavior and browser tests for visible recovery behavior.
2. Implement the smallest complete fix and run relevant existing suites plus required checks. Broaden testing when a shared contract changes; avoid tests that just mirror implementation internals.
3. Update the owning `docs/current` pages in the same slice when behavior changes. Include authority, acceptance timing, failure/retry rules, limitations, and test owners. Update schema/protocol inventories and source-audit dates only after verifying them.
4. Run `python scripts/check_docs.py` from the repository root and manually compare the changed claims with source/tests. Add new current pages to the existing README/map if new pages are truly needed.

Keep this dated plan outside `docs/current`. Current docs must describe shipped implementation; planned guarantees remain here until their acceptance tests pass.

## 5. Effort and deferrals

Estimates assume a repository-familiar engineer, about six focused hours per engineer-day, and available review. They include implementation, relevant tests, migrations, and docs; provider setup delays and newly discovered unrelated defects are excluded.

| Workstream | Remaining effort |
| --- | --- |
| R0: candidate and docs reconciliation | 1-2 days |
| R1: atomic combat effects | 4-7 days |
| R2: stat authority and linked-state consistency | 4-7 days |
| R3: remaining gameplay worker paths | 3-5 days |
| R4: high-risk operation outcome recovery | 4-7 days |
| R5: auth recovery and sensitive-producer acceptance | 1-3 days |
| R6: paired recovery baseline | 3-5 days |
| R7: final served acceptance | 2-4 days |
| Trusted-group functional release total | **22-40 engineer-days** |
| With approximately 20% integration contingency | **27-48 engineer-days** |
| Additional public backup automation | **5-10 days**, before contingency |

The public automation estimate does not include a full untrusted-client confidentiality redesign or horizontal scaling. Re-estimate those only if public product scope requires them. R1/R2/R4 share infrastructure, so re-estimate after R1 rather than adding a second generic transaction-framework project.

Deferred work: complete core-table infrastructure extraction; repository-wide import-cycle cleanup; multiple active app workers; unrestricted combat terrain editing; universal offline mutation replay; and confidential fog/geometry guarantees beyond the declared trusted-client model. Keep any reproducible defect that blocks the acceptance workflow in scope even if it appears inside a deferred subsystem.

## 6. Design references

These sources support the design choices; the project-specific work above follows the inspected code and supported release scope.

- One explicit application transaction and a session owned by its execution context: [SQLAlchemy session basics](https://docs.sqlalchemy.org/en/20/orm/session_basics.html).
- Durable source-plus-event storage, ordered processing, and idempotent consumers for declared projections: [AWS transactional outbox guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html). An outbox is not a substitute for a same-database atomic authoritative update.
- Database backup techniques and their recovery assumptions: [PostgreSQL backup and restore](https://www.postgresql.org/docs/current/backup.html). The project's paired PostgreSQL/R2 restore protocol is additional application work; a PostgreSQL backup alone contains no object bytes.
