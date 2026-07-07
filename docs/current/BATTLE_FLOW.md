# Battle flow

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

## Movement and opportunity attacks

Combat movement has one write path:

```text
canvas drag or planned move -> combat_command move -> CombatCommandService
```

The server requires source and destination coordinates. Client movement cost is
diagnostic only. The server computes or validates the final movement cost using
the active combatant, session rules, difficult terrain, and movement validator.

Raw `SPRITE_MOVE` is kept for non-combat table movement. It is blocked for
encounter actors unless the DM is doing an explicit table-edit override.

If movement would trigger an opportunity attack, the server rejects the move
with warning details before moving the token. The client stores the pending
command batch and can resend it with confirmation.

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

Accepted command responses are broadcast as `ACTION_RESULT` with a filtered
combat view per recipient. Rejections are sent to the requester.

## Persistence and recovery

Accepted combat commands are persisted through `CombatPersistenceService`.

The server records:

- command payload;
- result payload;
- requester;
- before/after snapshot data;
- monotonic `state_version`;
- a journal row in `combat_actions`.

The current encounter snapshot is updated after each accepted command. This
allows mid-round restore and durable DM revert. Persistence failure rolls the
in-memory combat state and token movement back before any success broadcast.

## Table environment

Terrain and cover edits affect combat validation and visibility decisions, so
they use the command path too:

- `set_terrain`;
- `add_cover_zone`;
- `remove_cover_zone`.

These commands are DM-only. They can run without an active combat encounter
because the table environment can be prepared before initiative starts. They
persist table state and roll back in memory if persistence fails.

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

