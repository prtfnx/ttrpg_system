# Encounters

Audience: contributors changing choice prompts or combat encounters.

Status: current. Choice prompts and combat encounters are separate durable
flows.

Last source audit: 2026-07-21

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
4. A permitted player submits one choice. Duplicate and stale submissions fail.
5. When required, the server resolves the configured roll and records
   `RollResolved`.
6. A DM ends the prompt and records `EncounterEnded`.

Start and end are DM-only. Invalid transitions and invalid bonuses fail closed.
A failed persistence operation restores the prior in-memory engine state and is
not broadcast as success.

Player broadcasts are built from a player-safe snapshot. Private DM notes are
stored but appear only in the DM response.

## Restart and reconnect

`choice_encounters` stores the active snapshot and
`choice_encounter_events` stores ordered events. Session initialization loads
the active prompt from the database. The WebSocket welcome payload contains a
role-filtered snapshot or an explicit empty value, so reconnect clears stale
browser state.

The builder and overlay are mounted in the normal game client. Players who
already chose see a waiting state. Completed prompts close locally.

## Verification

Run:

- `tests/unit/test_encounter_engine.py`;
- `tests/unit/test_encounter_protocol.py`;
- `tests/unit/test_choice_encounter_persistence_service.py`;
- `tests/unit/test_game_session_protocol.py`;
- EncounterBuilder, EncounterView, encounter-store, and browser protocol tests.

A deployed multi-client smoke test remains part of release acceptance because
repository tests cannot prove platform restart behavior or production payload
privacy.
