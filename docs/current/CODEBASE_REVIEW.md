# Codebase review and remediation

Audience: contributors reviewing server, React and Rust/WASM correctness.

Status: current.

Last source audit: 2026-11-18

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
- Opportunity-attack timing has no durable server-owned trigger workflow or
  server-generated prompts. Reaction spending is DM-authorized until that
  workflow exists; players may pass prompts. Expanding this needs a separate
  design covering trigger creation, eligibility, expiry, cancellation and replay.
- Movement previews are estimates checked again by the server. Search is
  bounded and does not optimize terrain cost. The movement control shows cost
  and destination; it has no range heatmap or automatic Dash purchase.
- Read-only geometry protects editing authority and sprite metadata. Boundaries
  delivered to a player's browser are inspectable by that player.
- Random submission identities and acknowledgement correlation do not implement
  durable recovery of an unsent plan after a browser reload.
- Existing stored chat metadata is not rewritten by the new-message allowlist.
  PostgreSQL concurrency/fencing checks require PostgreSQL; skipped tests in a
  local SQLite run are not evidence of those production properties.

## Validation

The final remediation batch passed 2808 server unit/integration tests (122
skipped), 3500 frontend tests, 663 shared-core tests and 304 native Rust tests.
The real-browser suite passed 44 tests (one skipped), covering rendering and
the shipped planner exports. Later focused frontend checks cover the final
actor/table queue and disabled-speed-rule refinements.
TypeScript compilation, changed-file ESLint/Ruff, generated WASM fingerprint,
protocol binding consistency and current-documentation checks also pass.
See [Testing strategy](TESTING_STRATEGY.md) for commands and environment limits.
