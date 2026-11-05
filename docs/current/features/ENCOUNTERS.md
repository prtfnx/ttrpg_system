# Encounters

Audience: contributors changing choice prompts or combat encounters.

Status: current. Choice prompts and combat encounters are separate durable
flows.

Last source audit: 2026-11-02

## Two encounter systems

Choice encounters are lightweight DM prompts owned by
`service/encounter_engine.py`, `service/protocol/encounter.py`, and
`service/choice_encounter_persistence_service.py`.

Combat encounters use the server-authoritative combat command service,
`CombatEncounter`, and `CombatActionJournal`. Read
[Battle flow](../BATTLE_FLOW.md) and
[Combat commands](../reference/COMBAT_COMMANDS.md) before changing combat.

## Choice encounter flow

The browser and server use one shape: `choice_id`, `roll_skill`,
`roll_ability`, and `roll_dc`.

1. A DM sends `encounter_start` with a table, title, description, choices,
   participants, and optional private notes.
2. The server validates the prompt and rejects a second active prompt.
3. One authoritative snapshot and an ordered `EncounterStarted` event commit
   before success is broadcast.
4. A permitted player submits one choice. Same-intent receipt replay succeeds; new duplicate or stale submissions fail.
5. When required, the server resolves the configured roll and records
   `RollResolved`.
6. A DM ends the prompt and records `EncounterEnded`.

Start and end are DM-only. Invalid transitions and invalid bonuses fail closed.
Rules evaluate a detached draft loaded from SQL; rejected transitions leave
live state unchanged and are not broadcast as success. Choice loads and writes
run through the bounded blocking-worker adapter; each worker creates and closes
its own SQLAlchemy session. Write inputs are detached before submission.

Production dispatch holds session mutation ownership through SQL settlement,
live-state installation/rollback and publication, including repeated caller
cancellation. Heartbeats and other sessions remain responsive during storage
waits. All four protocol transitions now commit their snapshot, ordered event and
original actor/session/intent receipt together. Membership and interactive role
come from the current database; start/end require current DM authority. An
explicit encounter target is required after start. Retries retain the original
message identity/body. A new identity denotes a new deliberate action.

Player broadcasts are built from a player-safe snapshot. Private DM notes are
stored but appear only in the DM response.

## Restart and reconnect

`choice_encounters` stores the active snapshot and
`choice_encounter_events` stores ordered events. Session initialization loads
the active prompt from the database. The WebSocket welcome payload contains a
role-filtered snapshot or an explicit empty value, so reconnect clears stale
browser state. Join metadata (bans, game mode and rules) is read in a worker-owned
session. Join holds the same session mutation lock through metadata/encounter
hydration, client registration and welcome enqueueing. Socket draining occurs
after that lock releases. A concurrent start/end therefore cannot overtake a
delayed hydration and be overwritten by its older snapshot. Cancelled reads
discard their detached result; failed hydration registers no client.

The builder and overlay are mounted in the normal game client. Players who
already chose see a waiting state. Completed prompts close locally.

## Verification

Run:

- `tests/unit/test_encounter_engine.py`;
- `tests/unit/test_encounter_protocol.py`;
- `tests/unit/test_choice_encounter_persistence_service.py`;
- `tests/unit/test_game_session_protocol.py`;
- `tests/unit/test_choice_worker_ownership.py` (SQLite worker barriers, repeated
  cancellation, heartbeat responsiveness, join/completion order and restart);
- EncounterBuilder, EncounterView, encounter-store, and browser protocol tests.

A deployed multi-client smoke test remains part of release acceptance because
repository tests cannot prove platform restart behavior or production payload
privacy.


## Borrowed choice transition staging

`ChoiceEncounterPersistenceService.stage_snapshot` flushes the snapshot and
ordered event inside a caller-owned transaction without committing or rolling
it back. The caller must roll back every provisional write on failure.
`save_snapshot` remains the standalone committing wrapper. `EncounterEngine.detached`
prepares transitions with the same rules in an isolated registry and deep-copies
restored inputs; discarded drafts cannot mutate live prompts. These seams support
atomic receipt acceptance without introducing another rule implementation.
Regression owners: `test_choice_encounter_persistence_service.py` and
`test_encounter_engine.py` verify outer commit/rollback and detached isolation.


## Durable choice settlement and live recovery

The `choice_encounter` receipt domain includes transition kind and the complete
bounded normalized payload. Changed input under one identity rejects. Receipts
retain accepted version and original small result/dice, excluding private notes
and full historical snapshots. Reconstructing a service can replay accepted
start/choice/roll/end after completion without creating, selecting or rolling
again. A replay installs the current active SQL prompt (possibly newer or empty),
and does not rebroadcast its old result. End replay cannot clear a newer prompt.

A lost commit response triggers fresh READ COMMITTED lookup under the stable
session-row lock (five-second PostgreSQL lock timeout). Until lookup and current
live installation finish, serialized state work, snapshots and session cleanup
remain fenced. Cache installation failure retains the captured admitted intent,
including when its socket disappears. Join hydration also attempts settlement,
so recovery does not require an earlier socket to remain connected. Repeated
cancellation cannot release admitted mutation ownership before settlement.

Unavailable outcomes return `choice_outcome_unknown` and never claim rollback.
Proven missing acceptance returns `not_accepted: true`; retained acceptance returns
the original receipt with current role-filtered state. Authority revocation permits
internal cache repair while withholding private outcome details. Peer recovery
publishes only a public current snapshot. Notification failure after installation
reports accepted state requiring resync. Receipts follow the existing retained
session/actor lifetime; no new table or migration is introduced.

These server receipts do not add choice commands to the four-domain persisted
v1 browser journal. Cross-page choice intent ownership and complete served
PostgreSQL/provider qualification remain separate work. Source/event staging
wrappers used without the operation service do not gain protocol retry ownership.
Regression owners: `test_choice_operation_service.py`, `test_encounter_protocol.py`
and `test_choice_worker_ownership.py`, covering actual SQL/protocol, unknown commit
outages, current roles, private notes, later prompts, join, fencing and cancellation.


## Browser choice recovery

An unknown choice outcome schedules one serialized read probe per original intent
per connection (bounded to 64 retained probes), without sending another mutation
or inventing a new identity. A repeated unknown/blocked-request response names the
same original operation and does not create a probe loop. Settled state/results
apply the current server snapshot. An explicit authoritative empty snapshot clears
a stale prompt; an incidental missing/null payload does not. Older versions of
the same prompt are ignored, and an old legacy end without a current snapshot
cannot close a different newer prompt. Server replays carry the current prompt,
not an obsolete historical snapshot. Regression owners: `clientProtocol.test.ts`,
`utilityStores.test.ts` and the shared browser message validator tests.

Choice originals are not persisted by the existing v1 journal. A read can ask an
in-process server to settle its retained original; it is not an operation receipt
for an unrecorded request after page/server replacement. Deliberate duplicate
checks must retain the original envelope. Full cross-page choice ownership and
served acceptance remain open.
