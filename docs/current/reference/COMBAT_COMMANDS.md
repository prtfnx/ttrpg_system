# Combat commands

Audience: contributors changing combat mutations or combat UI send paths.

Status: partial. This page catalogs the current command model and command
types. Use source code for exact payload validation.

Last source audit: 2026-07-08

## Source of truth

Combat writes go through one WebSocket message:

```text
combat_command
```

The server parses and applies it in
`apps/server/service/combat_command_service.py`.

The WebSocket boundary handler is
`apps/server/service/protocol/combat.py`.

The main browser send path is
`apps/web-ui/src/features/combat/hooks/useCombatCommands.ts`.

## Envelope

The client sends:

```json
{
  "type": "combat_command",
  "data": {
    "sequence_id": 123,
    "commands": [
      {
        "type": "move",
        "actor_id": "combatant-id"
      }
    ]
  }
}
```

`sequence_id` is used for idempotency. If the same accepted command is received
again for the same requester and encounter, the persisted result is returned
instead of applying the command twice.

Command batches are all-or-nothing. If a command fails, the service rejects the
batch with `action_rejected`, `failed_index`, and `reason`.

## Command model

The Pydantic model is `CombatCommand`. It currently forbids extra fields.

Common fields include:

- identity: `type`, `actor_id`, `entity_id`, `entity_ids`, `combatants`;
- table context: `table_id`, `settings`, `names`;
- movement: `from_x`, `from_y`, `target_x`, `target_y`, `cost_ft`, `path`,
  `confirm_opportunity_attacks`;
- targeting: `target_id`, `target_ids`;
- attack and spell data: `attack_bonus`, `damage_formula`, `damage_type`,
  `attack_type`, `range_ft`, `spell_name`, `spell_level`, `save_ability`,
  `save_dc`, `requires_attack_roll`, `is_concentration`;
- initiative and turn control: `initiative`;
- DM override data: `override_type`, `value`, `resource`, `condition_type`,
  `duration`, `resistances`, `vulnerabilities`, `immunities`, `surprised`,
  `ai_enabled`, `ai_behavior`, `slot_level`;
- opportunity attack resolution: `use_reaction`.

Do not use this list as a schema substitute. Check the model before changing a
payload.

## Command types

Current `CombatCommandType` values:

| Group | Commands |
| --- | --- |
| Lifecycle | `start_combat`, `end_combat`, `add_combatant` |
| Table environment | `set_terrain`, `add_cover_zone`, `remove_cover_zone` |
| Movement | `move` |
| Action resolution | `attack`, `cast_spell` |
| Utility actions | `dash`, `dodge`, `disengage`, `help`, `hide`, `end_turn` |
| DM and turn control | `dm_override`, `roll_initiative`, `set_initiative`, `remove_combatant`, `skip_turn`, `roll_death_save`, `revert_action` |
| Reactions | `resolve_opportunity_attack` |

## DM override types

Current `DMOverrideType` values:

- `set_hp`
- `set_temp_hp`
- `apply_damage`
- `apply_healing`
- `grant_resource`
- `add_condition`
- `remove_condition`
- `set_damage_traits`
- `set_surprised`
- `configure_ai`
- `restore_spell_slot`

Current `DMResourceType` values:

- `action`
- `bonus_action`
- `reaction`
- `movement`

## Authority and role rules

The server applies role and turn checks in `CombatCommandService`.

DM-only command groups:

- combat lifecycle;
- table environment commands;
- `dm_override`;
- `set_initiative`;
- `remove_combatant`;
- `skip_turn`;
- `revert_action`.

Owner-or-DM commands:

- `roll_initiative`;
- `roll_death_save`;
- `resolve_opportunity_attack`.

Normal turn commands:

- `move`;
- `attack`;
- `cast_spell`;
- `dash`;
- `dodge`;
- `disengage`;
- `help`;
- `hide`;
- `end_turn`.

For normal turn commands, the actor must be the current combatant. Non-DM users
must also control that combatant.

## Server result messages

Accepted commands return or broadcast `action_result`.

Rejected commands return `action_rejected`.

Accepted result data includes:

- `accepted`;
- `sequence_id`;
- `applied`;
- optional role-filtered `combat`;
- optional `state_version`;
- optional `duplicate`.

The protocol handler uses `CombatStatePresenter` so each recipient receives the
combat view appropriate for their role.

## Persistence and rollback

Accepted commands are persisted through
`CombatPersistenceService.persist_accepted`.

The persisted record includes the command payload, result payload, requester,
before/after state, and state version. If persistence fails, the service
restores the prior combat state and rejects the command.

Movement commands also use the protocol combat context to move sprites and
validate movement. If a batch fails after movement, the service restores the
combat state and moves affected sprites back when possible.

## Related non-mutation messages

These combat messages exist outside `combat_command` because they are queries,
views, suggestions, or prompts rather than accepted combat writes:

- `combat_state_request`
- `combat_state`
- `cover_zones_sync`
- `attack_preview`
- `attack_preview_result`
- `ai_action`
- `ai_suggestion`
- opportunity-attack warning and prompt messages
- `action_result`
- `action_rejected`

## Change checklist

1. Add or update `CombatCommandType`, `CombatCommand`, or override enums.
2. Add validation and mutation logic in `CombatCommandService`.
3. Preserve rollback behavior for failed batches.
4. Preserve persistence behavior for accepted commands.
5. Update `CombatStatePresenter` only if role-filtered output changes.
6. Update `useCombatCommands` or focused combat UI services for browser sends.
7. Add server tests for validation, authority, mutation, rollback, and
   persistence.
8. Add browser tests for the user-facing send path when UI changes.
9. Update [Battle flow](../BATTLE_FLOW.md) if the command model changes.
