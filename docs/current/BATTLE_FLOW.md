# Battle flow

Last source audit: 2026-11-24

Battle flow is command-oriented now. React can help the user plan a turn, and
Rust/WASM can draw previews, but the server is the only place that accepts
combat mutations.

## One sentence version

UI builds `combat_command` messages, the server applies them through
`CombatCommandService`, persistence records the accepted result, and clients
receive role-filtered combat views.

## Main path

```text
CombatDock / DM panel / canvas
        |
        | useCombatCommands
        v
WebClientProtocol: combat_command
        |
        v
ServerProtocol.handle_combat_command
        |
        v
CombatCommandService
        |
        | domain mutation + persistence
        v
CombatStatePresenter
        |
        v
ACTION_RESULT or ACTION_REJECTED
        |
        v
React stores + UI
```

The command path replaces the older direct combat mutation messages. Messages
such as `COMBAT_START`, `COMBAT_ATTACK`, `COMBAT_SPELL`, `TURN_END`,
`ACTION_COMMIT`, death-save requests, direct DM HP/resource/status edits,
opportunity-attack resolve, and direct cover/terrain mutations are no longer
the live mutation surface.

## Persistence transaction ownership

`CombatPersistenceService.persist_accepted` owns the standalone snapshot/journal
transaction. `stage_accepted(db, ...)` flushes the same records inside a trusted
caller's existing transaction and never commits or rolls it back. That caller
owns duplicate-race recovery, rollback of every staged resource, and publication
only after a successful outer commit. A returned staged result is provisional.
Regression owner: `apps/server/tests/unit/test_combat_persistence.py` covers
outer commit, outer rollback, and duplicate staging with unrelated pending work.

The authenticated combat protocol stages movement against a private table while
holding the session mutation lock and that table's write lock. Subsequent moves
and attack range checks read the staged positions. Acceptance commits only the
affected token positions/translated obstacle geometry with the combat snapshot
and journal. It never saves a separate move or rewrites unrelated token stats.
Live table/entity references receive the committed moves before publication.

A later invalid action or failed transaction discards the draft; no reverse
database move is needed. Persisted source positions and encounter table identity
are rechecked before saving. Regression owner:
`apps/server/tests/unit/test_combat_movement_transaction.py` covers staged-write
failure, repeated movement, restart, duplicate replay, occupied/foreign targets,
stale durable positions, stat preservation, and cancellation ownership.

If `commit()` raises, acceptance resolves its receipt using a fresh ORM session
after locking the same stable game-session row. PostgreSQL recovery requires
READ COMMITTED and bounds that row-lock wait to five seconds. A plain receipt
SELECT miss cannot establish rollback while the original commit may still run.
A recovered receipt returns success; a confirmed miss permits rejection.

If lookup is unavailable, the protocol returns `ERROR` with
`code=combat_outcome_unknown`, `outcome=unknown`, and `resync_required=true`.
It does not send `ACTION_REJECTED` or restore a possibly committed cache. The
session is quarantined: later authoritative reads/mutations and table snapshot
saves/deletion cannot proceed. Heartbeats remain available. An empty dirty-save
queue does not allow final-disconnect cleanup to discard the retained session.

The next serialized state request or command attempts recovery before execution.
The server installs the verified movement/combat outcome, clears quarantine,
and sends current-role-filtered results. Lookup cancellation waits through
installation; a notification failure cannot change durable success to rejection.
Reload to check an uncertain outcome before retrying; the server does not invent
a replacement operation ID or replay a new action automatically. Restart instead
hydrates committed database state; general lifecycle retry lookup after an ended
encounter and browser-wide operation reconciliation remain separate work.

This transaction does not unify character-sheet edits with combat stats or add
durable identity for table creation/XP. Pre-combat environment snapshots retain
their separate failure/outcome contract.
Legacy direct service callers supplying their own movement callback retain
responsibility for that callback's persistence; the authenticated protocol uses
the detached draft path.

## Command envelope

The browser sends one message type for combat mutations:

```json
{
  "type": "combat_command",
  "data": {
    "sequence_id": 123,
    "commands": [
      { "type": "move", "actor_id": "c1", "table_id": "t1" }
    ]
  }
}
```

`sequence_id` is used for idempotency. If the same accepted command is received
again for the same requester, the server returns the stored result instead of
applying it twice.

The per-session protocol mutation lock serializes `combat_command` with table,
sprite, wall, paint, session, and other authoritative writes. One session's
commands run in waiter order; another session uses a different lock. The lock
also covers validation, in-memory mutation, persistence, rollback, and
handler-owned broadcasts, so a second command cannot observe half-applied or
half-rolled-back combat state.

Command batches are all-or-nothing. If command 2 fails, command 1 is rolled
back and the client receives `ACTION_REJECTED` with `failed_index` and a
reason.

## Supported command families

`CombatCommandService` currently accepts:

- lifecycle: `start_combat`, `add_combatant`, `end_combat`;
- movement: `move`;
- action resolution: `attack`, `cast_spell`;
- utility actions: `dash`, `dodge`, `disengage`, `help`, `hide`, `end_turn`;
- initiative and turns: `roll_initiative`, `set_initiative`,
  `remove_combatant`, `skip_turn`;
- death saves: `roll_death_save`;
- opportunity attacks: `resolve_opportunity_attack`;
- DM overrides: HP, temp HP, damage, healing, resource grants, conditions,
  damage traits, surprise, AI config, and spell-slot restore;
- table environment: `set_terrain`, `add_cover_zone`, `remove_cover_zone`;
- audit recovery: `revert_action`.

`AI_ACTION` remains a DM-only suggestion request. It does not mutate combat
state and is intentionally outside `combat_command`.

`COVER_ZONES_SYNC` remains a read/sync message. Cover-zone writes use
`combat_command`.

## Server authority

`apps/server/service/combat_command_service.py` is the combat write model.

It owns:

- Pydantic parsing of command payloads.
- Role and ownership checks.
- Turn rules and DM bypass rules.
- Movement validation and final movement cost.
- Opportunity-attack warnings and confirmed movement.
- Action economy and resources.
- Attack, spell, utility, condition, death-save, and override mutation.
- Table environment mutation for terrain and cover.
- Rollback when validation or persistence fails.

The protocol handler in `apps/server/service/protocol/combat.py` is a thin
boundary. It parses the envelope, builds a `CombatCommandContext`, calls the
service, and broadcasts the result.

## Combatant creation

Combat start and actor add use `CombatantFactory`.

React sends actor references:

- table token id;
- optional character id;
- optional display fallback name.

The server derives authoritative stats from the table token, linked character,
or compendium/NPC data. Explicit DM overrides are limited to safe display/core
stat fields. Ownership, spell slots, save modifiers, action definitions, damage
traits, and other rules metadata are server-derived.

Spell saving throws resolve their bonus from the target combatant's stored
`save_modifiers`, accepting short and full ability names. An explicit resolver
bonus still overrides that lookup, including zero. Spell damage carries its
damage type into HP application so resistance, immunity and vulnerability
apply to both attack-roll and saving-throw spells. `test_spell_defenses.py`
checks the resulting HP and resource use.

## Movement and opportunity attacks

Combat movement has one write path:

```text
canvas drag or planned move -> combat_command move -> CombatCommandService
```

The server requires source and destination coordinates. Client movement cost is
diagnostic only. The server computes or validates the final movement cost using
the active combatant, session rules, difficult terrain, and movement validator.
Table dimensions, entity positions, wall geometry, and movement endpoints are
all pixel-space values. Cell-mode movement snaps endpoints to grid-cell centers;
pathfinding divides pixel dimensions by `grid_cell_px` when deriving its
inclusive cell bounds. It must not scale table dimensions by the grid size.
The stored token position is the authoritative route start. A client may
propose at most 1,000 pixel-coordinate waypoints, but the server requires a
finite, in-bounds coordinate pair at every point and exact route endpoints
before checking every segment and computing cost. There is no collision-bypass
or `trust_client` validation tier; persisted legacy values load as
`lightweight`.

Raw `SPRITE_MOVE` is kept for non-combat table movement. It is blocked for
encounter actors unless the DM is doing an explicit table-edit override.

If movement would trigger an opportunity attack, the server rejects the move
with warning details before moving the token. The client stores the pending
command batch and can resend it with confirmation.

Combat movement stages only the validated route's final position and translated
geometry, then commits them with acceptance in the authenticated session.
The saved position and published route use the validator's canonical start and
snapped endpoint, not unchecked requested coordinates. The public session code
identifies combat state and journal lookup; it is not a table-persistence
foreign key. Weapon-range checks convert pixel positions using the saved
`grid_cell_px` and `cell_distance`, converting meters to feet when needed.
Grid visibility does not change physical range.

`test_combat_range_units.py` checks adjacent and distant targets for feet,
meters, custom cell scales, and hidden grids.
`tests/integration/test_trusted_session_workflow.py` exercises production
session dispatch, a move/attack envelope, discarding staged movement after a
later command fails, duplicate replay, end turn, reconnect, and combat/table
reconstruction from SQLite. Its exact pixel route explicitly uses free movement.
Cell-mode snapped endpoints and stale client route starts are covered by
`tests/unit/test_combat_movement_transaction.py`. Character/token stat writes
remain a separate consistency boundary.

## Planned turns

The player or DM can plan a sequence in React:

```text
move -> attack -> end_turn
```

`plannedCommand.service.ts` builds schema-complete command intent. `CommitButton`
sends the whole sequence as one `combat_command` batch. Accepted commands clear
planning state through the `ACTION_RESULT` handler. Rejected commands keep the
plan visible so the user can fix it.

## UI surface

`CombatDock` is mounted on the main canvas play surface.

When no encounter is active, a DM sees a compact **Set up combat** launcher;
the full setup panel does not open merely because the dock mounted. The setup
state closes when the session changes. Non-DM users do not receive an empty
combat dock.

Pre-combat setup offers either the linked tokens on the active table or an
empty encounter. A linked-token candidate must belong to that table, be on the
tokens layer, and reference a character already loaded in the browser store.
Starting remains disabled until the active table is server-confirmed (not
`local`, `syncing`, or `error`) and has a valid UUID. Both start paths send that
authoritative table ID; an optimistic local table ID is never used to start
combat.

It brings together:

- current actor summary;
- initiative and turn state;
- selected actor inspection through `useCombatSelection`;
- player/DM action controls;
- movement planning;
- planned queue commit/cancel;
- DM controls through `DMCombatPanel` and small sub-panels.

Combat UI sends through `useCombatCommands`. It should not call
`ProtocolService.getProtocol()?.sendMessage(...)` directly for combat
mutations.

## Privacy and broadcasts

The server uses `CombatStatePresenter` to build role-aware views.

- DMs receive full combat details.
- Players receive only the information their role should see.
- Spectators receive spectator-safe state.

NPC private fields, hidden combatants, rollback snapshots, and rich rules
metadata are filtered from player-facing messages.

`available_actions` contains validated executable definitions only for DMs and
the controlling player's own non-NPC actor. Other players and spectators receive
neither that catalogue nor the actor's raw action definitions. Action references
are derived from the encounter actor, not browser-provided mechanics. Recipient
coverage lives in `test_combat_action_presentation.py`.

The browser accepts these filtered views through `useCombatStore.setCombat`.
Missing controller grants become an empty local grant list; omitted NPC HP and
max HP become null, and hidden AC/AI metadata stays absent. Components never
infer control or private stats from omitted fields. Real presenter fixtures in
`combatPrivacy.test.tsx` cover player, spectator and controller views across NPC
and player turns.

Accepted command responses are broadcast as `ACTION_RESULT` with a filtered
combat view per recipient. Rejections are sent to the requester.

## Persistence and recovery

Accepted combat commands are persisted through `CombatPersistenceService`.

Combat start, end, and round transitions calculate live state without issuing
SQL. The command service is the persistence owner: it commits the encounter
snapshot (including the ended marker) and accepted journal result together.
A rejected lifecycle transition therefore cannot reappear or disappear when
the encounter is reconstructed from committed rows. `CombatEngine.persist`
remains an explicit compatibility helper, not a lifecycle side effect.

The server records:

- command payload;
- result payload;
- requester;
- before/after snapshot data;
- monotonic `state_version`;
- a journal row in `combat_actions`.

The current encounter snapshot is updated after each accepted command. This
allows mid-round restore and durable DM revert. Persistence failure restores
the in-memory combat snapshot and attempts compensating token moves before
returning rejection. Token/table saves and the encounter journal are separate
transactions; a failed compensation is not an atomic durable rollback.

TODO: a shared table/combat transaction and durable outcome reconciliation for
required mixed effects. Until then, do not promise complete rollback of every
accepted/rejected batch across all persisted resources.

Synchronous combat database work runs in worker threads while the per-session
mutation lock remains held. This includes duplicate-command lookup, accepted
journal/snapshot persistence, restart restore, linked-character lookup during
combatant construction, session-rule loading during movement validation, and
pre-combat terrain/cover table saves. Combat journal workers use their own
ORM sessions. The environment save callback still reads a live table through
`TableManager.save_table`; it is not the detached async snapshot path.
State-version application, restoration, and broadcasts remain on the
serialized event-loop task.



Unexpected exceptions while applying commands restore the pre-envelope combat
snapshot before returning a generic rejection, including earlier mutations in
the same batch. Cancellation raised during application also finishes restoration
before propagating. This application guard ends before durable persistence;
uncertain commits retain their existing quarantine/recovery path.
`test_combat_application_rollback.py` verifies resources, concentration, prior
commands and cancellation alongside the persistence/cancellation regressions.

Combat command cancellation waits for the submitted operation to settle,
including cache installation or rollback. Protocol dispatch also retains the
session mutation lock through recipient-filtered peer publication, even after
repeated cancellation. A command cancelled before acquiring session ownership
does not execute. Transport cancellation may still lose its requester receipt;
reconciliation must inspect the durable outcome instead of assuming rejection.

TODO: detached environment-save inputs and a shared table/combat transaction.
Synchronous join/choice-encounter and permission lookup paths can still block
the event loop; worker coverage is not universal. Wall writes already use
worker-owned transactions before publication.

## Table environment

Terrain and cover edits affect combat validation and visibility decisions, so
they use the command path too:

- `set_terrain`;
- `add_cover_zone`;
- `remove_cover_zone`.

These commands are DM-only and currently require **one command per envelope
and no active combat**. Unsupported combinations are rejected before table
lookup, mutation, save, or journal access. Ordinary move/attack batches remain
supported. Prepare terrain/cover before starting initiative; the DM panel
explains the limitation and disables its Clear All control during combat.
A pre-combat edit saves the table without a combat journal and restores its
previous live environment values on a reported save failure.

TODO: transactional live terrain/cover editing and environment batches. This
restriction prevents the known partial-write cases; it does not establish
atomicity for all other combat/table effects. `test_combat_command_service.py`
and `DMCombatPanel.test.tsx` cover the restriction.

## Rust/WASM role

Rust/WASM is preview-only for combat.

It may calculate:

- ghost movement;
- movement range overlays;
- local distance estimates;
- LOS previews;
- AoE candidate targets;
- canvas rendering and interaction feedback.

It does not commit combat state. The server validates and applies the final
movement, resources, attacks, spells, cover, terrain, and turn state.

## Adding a combat mutation

1. Add the command type and payload fields in `CombatCommandService`.
2. Implement validation, mutation, rollback, and result data in the service.
3. Add persistence coverage when the command is accepted.
4. Add a helper in `useCombatCommands` if UI sends it directly.
5. Update the relevant UI component to use the helper.
6. Add server behavior tests and a UI/protocol test at the user boundary.
7. Do not add a new direct websocket mutation message unless it is explicitly
   non-combat or temporary migration work.

## Messages that are still allowed outside commands

These are query, view, suggestion, or infrastructure messages rather than
combat mutations:

- `COMBAT_STATE_REQUEST`;
- `COMBAT_STATE`;
- `ACTION_RESULT`;
- `ACTION_REJECTED`;
- `TURN_START`;
- `INITIATIVE_ORDER`;
- `COVER_ZONES_SYNC`;
- `ATTACK_PREVIEW`;
- `AI_ACTION`;
- encounter view/progress messages that do not directly mutate combat state.

## Persistent stats and active encounter resources

Combat setup reads canonical linked character HP/maxHp/AC before token projection
hints. Saved token identity/controllers remain authoritative; an unlinked token
cannot attach a client-supplied character during setup. Source lookup failures
reject entry without accepting a snapshot or journal. Explicit supported DM setup
overrides affect the encounter only, and new combatants must use its current table.

Character edits during combat update persistent source/token projections, including
their receipt recovery path. They do not heal, damage, change AC or replenish
resources in the active encounter. Combat commands own those values until removal
or completion. Raw sprite writes cannot change active token links/controllers/
saved HP/max-HP/AC or delete the token, even after restart. Cosmetics and the
existing DM movement override keep their rules. Completion performs no implicit
HP write-back; a later encounter starts from the then-current persistent source.

## Critical damage resolution

The attack roll determines whether damage is critical. Ordinary damage dice
do not need their own natural-critical flag. `double_dice` rolls another copy
of each damage die and adds the modifier once; `max_dice` maximizes the original
damage dice; `double_total` doubles dice plus modifier. Bounded formula parsing
applies before any extra roll. Dice and attack-resolver tests assert actual
damage totals rather than only the critical flag.

Structured spell execution distinguishes attack rolls, saving throws, and automatic damage. Save effects explicitly choose half or zero damage on success. Casting a spell without concentration preserves the caster's existing concentration; replacement occurs only for a concentration spell. Attack and spell critical rules use the encounter settings.

## Executable action references

Attack and spell controls select from `available_actions` on the current actor.
Both immediate and planned commands submit the selected `action_id` and targets;
only the server resolves damage, range, bonuses, saves, concentration and slots.
Unsupported descriptive actions require DM manual resolution. Supported cantrips
remain available without spell slots. The DM can opt into explicit manual damage
or use typed DM Overrides for other effects. Immediate and planned actions use the encounter
table even when the user is viewing another table. Planned commands without an
explicit table inherit the encounter table before the currently viewed table.

See [Combat commands](reference/COMBAT_COMMANDS.md#structured-action-definitions)
for the metadata contract, accepted effects, authority checks and limitations.

## Visible turn positions

Public views remap `current_turn_index` into the active, visible combatant list.
If the real current actor is hidden, the public index is `-1`: the browser shows
no current actor or turn controls. Filtering never grants another actor that
turn. Defeated actors do not count toward either active turn index.

Planning submissions use cryptographically random JavaScript-safe numeric
identities across tabs and reloads. An acknowledgement clears only the action
IDs captured by the matching local submission. Peer broadcasts, stale results,
and later local edits preserve the unsent queue. Rejection leaves the submitted
actions available for correction.

Canvas movement and WASM sprite-action tracking use the same cryptographic
numeric identity allocator. Supplied numeric action IDs must be canonical positive
JavaScript-safe integers, so acknowledgement strings still match their local
tracking keys. If dispatch fails before acceptance, restore the previous pending
movement rather than keeping an unsent command or losing its predecessor.

## Movement preview and submission

The combat movement control uses the active encounter table's grid size and
cell distance, converting metres to feet. It configures the runtime-owned WASM
planner with current movement-blocking walls and doors, read-only obstacle
boundaries, difficult terrain, bounds and session diagonal/movement rules.
An unavailable scene or blocked route cannot produce a confirmable move.

The control displays the computed cost and destination. Confirmation queues the
same snapped (or free-mode) endpoint and path; it does not resubmit the raw click.
Exact source/destination coordinates survive the float32 WASM boundary. Further
queued movement starts from that actor's previous queued endpoint and deducts
its estimated cost. Scene/rule changes discard the displayed preview. There is
no automatic Dash purchase and no movement-range heatmap in this control.

Python and Rust measure each crossed terrain cell and carry alternating diagonal
costs across waypoints. Terrain sampling and path search each have an 8192-step
budget; exceeding a budget rejects the preview or command. The server recomputes
cost and legality at submission and clamps only sub-microfoot rounding residue.
Search provides a collision-free route when found within its budget; it does
not optimize route cost for terrain. Client previews remain estimates and may
be rejected if state changes before submission.


## Reaction windows during a plan

Planning commits ordered steps, submitting each movement separately. When the
server opens a reaction window, later steps wait; an accepted window represents
a held movement intent. Only the eligible reactor's controller and DMs receive
its prompt. Pass, expiry and used reactions advance the durable window sequence.
The mover or a DM can cancel the pending intent. A rejected step preserves the
remaining queue, and edits added after Commit stay unsent.

Movement completes atomically after the windows settle and revalidation passes.
Its original position and budget remain while pending. Incapacitation or
cancellation prevents completion. See [Opportunity attacks](reference/COMBAT_COMMANDS.md#opportunity-attack-workflow)
for authority, deadlines, restart recovery and current rules limits.


## Restoring a plan after reload

Combat drafts are saved in the current tab's session storage, scoped to the
signed-in user, game session and server session instance. Their encounter, table,
actor and round binding prevents a restored draft from silently applying to
another turn. An encounter-end broadcast immediately marks its unsent draft
stale while retaining its queued actions for explicit discard. Events from a
retired protocol cannot clear the current session's combat view. A valid draft
restores paused: choose **Review saved plan** before committing, or discard it. Closing the tab is not cross-device or long-term plan
storage.

Before sending each planned batch, the client saves its exact command body,
sequence ID and expected encounter version. Reload or reconnect first checks the
server's receipt for that submission. Acceptance removes only its captured action
IDs; later edits remain paused. An absent receipt keeps the original identity:
**Retry original saved step** sends the same body and ID, while **Check saved
submission** only queries the server. If the encounter ended or its version makes
the old command obsolete, the remaining draft can be reviewed or discarded.

The browser never resumes a whole restored plan automatically. Missing/invalid
storage, unknown outcomes and receipt timeouts pause planning and keep available
submission evidence. An unresolved submission cannot be discarded or replaced by
a newly numbered command. See [Combat commands](reference/COMBAT_COMMANDS.md#saved-plan-receipt-lookup)
for receipt and version-fencing details.
