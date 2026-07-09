# Encounters

Audience: contributors changing the encounter prompt flow or combat encounter
persistence.

Status: current but partial. The choice encounter overlay and the combat-command
encounter model are separate paths.

Last source audit: 2026-07-09

## What This Covers

The app has two encounter-shaped systems:

- Choice encounters are lightweight prompts started by a DM over WebSocket.
  They live in `apps/server/service/encounter_engine.py` and
  `apps/server/service/protocol/encounter.py`.
- Combat encounters are the durable, server-authoritative combat state used by
  the battle flow. Read [Battle flow](../BATTLE_FLOW.md) and
  [Combat commands](../reference/COMBAT_COMMANDS.md) before changing that path.

## Choice Encounter Flow

`_EncounterMixin` registers handlers through the protocol base and accepts four
message types:

- `encounter_start`: DM-only. Requires `choices`, accepts title, description,
  participants, and DM notes, creates an in-memory encounter for the session,
  broadcasts a player view, and returns a DM view.
- `encounter_choice`: records the current user or client id against a choice.
- `encounter_roll`: rolls `1d20 + bonus` through `core_table.dice.DiceEngine`
  when the active encounter is waiting for a roll.
- `encounter_end`: DM-only. Removes the active encounter from memory and returns
  an `encounter_result`.

The engine stores active choice encounters in
`EncounterEngine._active: dict[str, EncounterState]`, keyed by session id. This
state is not written to the database.

## Browser Flow

The client protocol registers `encounter_state` and `encounter_end` handlers in
`apps/web-ui/src/lib/websocket/clientProtocol.ts`. They update
`useEncounterStore` in `apps/web-ui/src/features/combat/stores/encounterStore.ts`.

The visible UI is in the combat feature:

- `components/EncounterBuilder.tsx` builds a DM-created prompt and sends
  `encounter_start`.
- `components/EncounterView.tsx` renders the active prompt, sends
  `encounter_choice`, sends `encounter_roll`, and can send `encounter_end` for a
  completed encounter.
- `stores/encounterStore.ts` only holds the current browser encounter object or
  `null`.

## Combat Encounter Persistence

Combat encounters use different models. `CombatEncounter` stores the combat
state snapshot, round, current turn, settings JSON, combatants JSON, action log
JSON, and version. `CombatActionJournal` stores accepted combat commands with a
requester key and sequence id. Both models are in
`apps/server/database/models.py`.

Do not use the choice encounter engine as the persistence source for combat.
Combat command behavior belongs in the combat service and docs linked above.

## Tests

Source-backed coverage exists in:

- `apps/server/tests/unit/test_encounter_engine.py`
- `apps/server/tests/unit/test_encounter_protocol.py`
- `apps/web-ui/src/features/combat/components/__tests__/EncounterBuilder.test.tsx`
- `apps/web-ui/src/features/combat/components/__tests__/EncounterView.test.tsx`
- `apps/web-ui/src/features/combat/stores/__tests__/utilityStores.test.ts`

## Current Edges

- The choice encounter engine is in-memory only, so active prompts do not
  survive server restart.
- The browser choice shape uses `id`, `skill`, and `dc`; the server engine reads
  `choice_id`, `roll_skill`, and `roll_dc`. Treat that as an integration edge
  when changing either side.
- The server returns `encounter_result` for choices and rolls, while the current
  browser protocol store update path listens to `encounter_state` and
  `encounter_end`.
