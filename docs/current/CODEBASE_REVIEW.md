# Codebase review and remediation

Audience: contributors reviewing server, React and Rust/WASM correctness.

Status: current.

Last source audit: 2026-11-24

The 17 November review found 20 concrete defects across command authority,
state restoration, movement, public state projection and rendering. The table
records the resulting behavior after the approved repairs. IDs preserve the
original review ordering. Findings came from source tracing and targeted
reproductions; they are not a claim that every possible defect has been found.

## Python / FastAPI and shared Python engine

| ID | Original defect | Implemented correction and verification |
| --- | --- | --- |
| S1 | Unbounded client dice expressions could monopolize command handling. | Shared bounded parser validates before RNG/mutation; dice and input-budget regressions. |
| S2 | Client mechanics were trusted and omitted tables bypassed geometry checks. | Content-derived action references resolve saved structured mechanics; encounter table, targets, range, walls and shared obstacles are validated before spending. Authority tests verify unchanged state on rejection. |
| S3 | Application exceptions left partial live mutations. | Restore command snapshots for pre-commit exceptions and cancellation. Uncertain database commits require reconciliation and are never blindly rolled back. Fault-injection tests cover both boundaries. |
| S4 | Ordinary critical-hit damage was not increased. | Attack critical results drive bounded damage rolls under encounter critical settings; dice/resolver assertions check totals. |
| S5 | Spell resolution lost save modifiers and damage types. | Canonical actor statistics and explicit attack/save/automatic effects drive typed damage, saves and concentration. |
| S6 | Movement assumed five feet per cell. | Both validator entry points use table units converted to feet, shared route costs and crossed-cell terrain sampling. Core and server tests cover units and waypoint splitting. |
| S7 | Collision used simplified rectangles inconsistent with rendered obstacles. | Shared bounded world-space boundaries cover transformed rectangles, ellipses, polygons and lines; spatial indexes use their actual bounds. |
| S8 | Filtering hidden NPCs changed the meaning of the turn index. | Remap to the visible active roster; publish -1 when the real actor is hidden. Presenter tests cover hidden and defeated actors. |
| S9 | Arbitrary chat metadata entered authoritative history. | Server-owned identity plus an explicit public-field allowlist for new chat entries; serialization tests. |
| S10 | Retention database cleanup blocked the event loop. | Bounded workers own database sessions and publication returns to the event loop; worker-thread tests. |

## React frontend

| ID | Original defect | Implemented correction and verification |
| --- | --- | --- |
| F1 | Legitimate role-filtered combat state crashed actor controls. | Normalize public actor fields before store/UI use; browser state tests. |
| F2 | Planned command identities repeated across reloads/tabs. | Cryptographically random JavaScript-safe numeric identities across combat send paths; database integer compatibility checked. |
| F3 | Peer acknowledgements deleted local unsent plans. | Match the local pending submission and remove only its captured action IDs. Peer results, late responses and later edits preserve the queue. |
| F4 | Cast Spell could spend resources without applying the advertised effect. | Select only executable structured actions; serialize references in immediate/planned flows. Unsupported effects use explicit DM manual resolution. |
| F5 | Planning ignored live units/blockers and submitted a different destination. | Configure the runtime-owned planner from current table/rules/read-only geometry. Queue its snapped/free endpoint and actual path, with actor/table-specific prior movement. Unavailable/blocked scenes cannot be confirmed. |

## Rust / WASM renderer and engine

| ID | Original defect | Implemented correction and verification |
| --- | --- | --- |
| R1 | A-star path reconstruction swapped coordinate pairs. | Reconstruct complete coordinate pairs; detour/endpoints regressions. |
| R2 | Collision missed collinear overlap and closed-shape containment. | Shared contact/containment rules, including zero-length and same-cell paths; native regressions. |
| R3 | Renderer silently clamped valid grids above 200 pixels. | Align accepted renderer grid sizes through 500; real-browser rendering checks. |
| R4 | Lighting-layer visibility did not control rendered lights. | Gate the light pass by visibility; browser pixel checks. Remove ineffective generic light-opacity and fog layer controls; use the actual lighting/fog tools. |
| X1 | Players lacked obstacle geometry needed by local vision. | Versioned read-only boundaries outside editable sprite state. Privacy, revision/hydration, empty/invalid replacement and real-browser sight/shadow tests. |

## Documentation corrections

Current combat, chat, lighting/vision, movement and engine guides describe the
implemented contracts. Architecture guidance now reflects migrated workers.
Leaf READMEs link to current setup, compendium, test and text-sprite guides;
retired server_host paths and TextSpriteCreator examples were removed.
Read [Battle flow](BATTLE_FLOW.md), [Combat commands](reference/COMBAT_COMMANDS.md),
[Vision](features/WALLS_LIGHTING_FOG_AND_VISION.md) and
[Engine](RUST_WASM_ENGINE.md) for the maintained behavior contracts.

## Remaining scope and limits

- Automated combat supports bounded explicit damage definitions. Areas,
  upcasting, healing, conditions, summons and prose-only effects require DM
  manual resolution; a curated rules catalogue remains separate work.
- Opportunity attacks now have durable server-owned windows and private controller
  prompts. Automation uses structured melee actions and NPC-versus-party hostility.
  Explicit factions, non-damage reactions and stepwise partial movement spending
  remain separate rules work; the current move completes atomically.
- Movement previews are estimates checked again by the server. Search is
  bounded and does not optimize terrain cost. The movement control shows cost
  and destination; it has no range heatmap or automatic Dash purchase.
- Read-only geometry protects editing authority and sprite metadata. Boundaries
  delivered to a player's browser are inspectable by that player.
- Plans now recover from tab-local session storage after reload. Recovery is
  scoped to user/session/encounter and pauses for review; it does not provide
  cross-device storage. Unresolved submissions retain their exact identity until
  acceptance or an encounter/version fence. Unavailable storage blocks planning.
- Legacy chat rows are not rewritten, but read projection now ignores their
  client-controlled authority fields. New typed roll events use a separate
  server-owned column; old unverified rolls preserve their plain text.
- PostgreSQL concurrency/fencing checks require an isolated PostgreSQL database.
  The local environment has no configured test URL or runnable local server.
  CI now also requires the existing sprite-batch durability suite to execute;
  local SQLite passes do not establish PostgreSQL properties.

## Validation

The final remediation batch passed 2808 server unit/integration tests (122
skipped), 3500 frontend tests, 663 shared-core tests and 304 native Rust tests.
The real-browser suite passed 44 tests (one skipped), covering rendering and
the shipped planner exports. Later focused frontend checks cover the final
actor/table queue and disabled-speed-rule refinements.
TypeScript compilation, changed-file ESLint/Ruff, generated WASM fingerprint,
protocol binding consistency and current-documentation checks also pass.
See [Testing strategy](TESTING_STRATEGY.md) for commands and environment limits.


## Follow-up implementation, 24 November 2026

The approved reaction phase adds persisted windows, route-derived canonical
triggers, controller-only prompts, server-owned deadlines, cancellation, restart
recovery and replay-safe resolution. Membership, control, position and movement
legality are revalidated before completion. Planning pauses between ordered
chunks and retains acknowledgement ownership when its UI closes. Canonical
movement updates also reach detached browser state.

Migration `0016_chat_system_events` removes legacy JSON authority from history
and separates trusted roll events. Migration `0017_pending_combat_movement`
retains pending movement through encounter saves and restore. Deployment must
apply both migrations before starting the updated server.

The follow-up passed the full server unit/integration run (2838 passed, 122
skipped), with additional focused reaction/precision/lifecycle checks. Shared-core
verification passed 663 tests. The full frontend run passed 3508 tests, and
85 focused store/UI checks cover final acknowledgement and cancellation changes.
Ruff, TypeScript, changed-source ESLint, focused backend Mypy, protocol-binding
consistency and current-documentation checks pass. PostgreSQL execution remains pending an
isolated test database; its CI no-skip gate now includes sprite durability.


## Plan recovery follow-up, 24 November 2026

The approved reload-recovery phase adds a bounded versioned plan journal,
authenticated receipt lookup and encounter/version preconditions. Pending batches
save their exact payload before transmission. Restored drafts remain paused, and
an explicit retry preserves the original command identity. The server checks
accepted duplicates before version conflicts and returns a current role-filtered
view on conflict. A point-in-time absent receipt never permits blindly replacing
a still-current pending submission.

New isolated PostgreSQL regressions verify that probes wait for acceptance commit
or rollback and reject repeatable-read isolation. They require the existing
isolated PostgreSQL test URL and were not executed locally; the mandatory CI gate
includes their test module. No database migration is needed for this phase.

Recovery validation passed 3532 frontend tests, with 22 focused journal/controller
and UI tests repeated after formatting. The phase's full server run passed 2856
tests (122 skipped); the final receipt/version refinements passed 102 focused
backend tests. TypeScript compilation, changed-source ESLint/Ruff, focused backend
Mypy, protocol bindings and documentation checks pass. PostgreSQL-specific cases
remain unverified locally as described above.
