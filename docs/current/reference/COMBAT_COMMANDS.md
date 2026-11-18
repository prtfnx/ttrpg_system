# Combat commands

Audience: contributors changing combat mutations or combat UI send paths.

Status: partial. This page catalogs the current command model and command
types. Use source code for exact payload validation.

Last source audit: 2026-11-17

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
- action references: `action_id`; DM manual resolution: `manual`, `effect`, `save_half`;
- DM manual attack and spell data: `attack_bonus`, `damage_formula`, `damage_type`,
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

Accepted encounter mutations are persisted through
`CombatPersistenceService.persist_accepted`. Noninteractive roles are rejected
before duplicate lookup or command execution, even if a controller list still
contains the caller.

The persisted record includes the command payload, result payload, requester,
before/after state, and state version. If persistence fails, the service
restores the prior combat state and rejects the command.

Authenticated movement uses a detached table draft. Token movement and the
encounter journal commit in one transaction; rejected application discards the
draft and restores the pre-envelope combat snapshot. Legacy direct callers
supplying their own movement callback own that callback's persistence.
Unexpected application errors also restore the whole batch before rejection.
Cancellation settles restoration before propagation. An uncertain commit is
reconciled through a fresh session and stable row lock; an unavailable outcome
quarantines the session and reports `combat_outcome_unknown` without restoring a
possibly committed cache. See [Battle flow](../BATTLE_FLOW.md) for recovery.

Table environment commands (`set_terrain`, `add_cover_zone`,
`remove_cover_zone`) are restricted to one DM command outside active combat.
They save table state without an encounter journal. Environment batches, mixed
envelopes, and environment edits during combat are rejected before mutation.
Normal move/attack planning is still supported.

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

## Combatant source authority

Database-backed start_combat/add_combatant requires a token in the selected table.
Its saved character link and token controllers override flat client identity hints.
Linked canonical HP/maxHp/AC take priority over stale token projections, including
zero/null clears. Unlinked tokens retain saved independent stats. Supported explicit
DM entry overrides still apply to encounter values without editing the source.

Missing/archived/invalid linked sources, unknown tokens, unresolved legacy stat
locations and character lookup outages produce action_rejected before snapshot/
journal acceptance. No client fallback is installed on that path. add_combatant
also requires the active encounter's table. These checks leave an existing
encounter unchanged. Isolated non-database factory consumers retain compatibility
fallbacks; they are not the production persistence contract.

## Computational input limits

A combat envelope admits at most 50 commands and rejects non-finite numeric
fields before application. Damage formulas use the shared bounded dice parser:
1-200 characters, at most 10 additive terms, 100 total positive dice, die sides
from 1 to 1000 and integer modifiers bounded to 1000000 in magnitude. Constants
and short forms such as `d6` are supported; negative dice groups, trailing junk,
zero-sided dice and zero-count dice are rejected before any RNG or mutation.
Whitespace and letter case are normalized. `test_combat_input_budget.py` and
the shared `test_dice.py` regressions cover both the protocol and engine limits.

## Structured action definitions

`service/combat_actions.py` accepts explicit executable definitions in an
encounter actor's saved `actor_actions` entries. Each entry has a name and a
`combat` object with `schema_version: 1`, `kind` (`attack` or `spell`), `effect`
(`attack_roll`, `saving_throw`, or `automatic`), bounded `damage_formula`,
`damage_type` and positive `range_ft`. Weapon attacks use one target and their
stored `attack_bonus`; spells derive attack bonus and save DC from the encounter
actor. A saving-throw definition also requires a full ability name and may set
`save_half`. Spell level, concentration and a bounded target limit are explicit
metadata. Only ordinary action-cost entries are automated in this version.

Definitions receive a content-derived `action_id` covering their resolved
mechanics. Unsupported/descriptive compendium entries remain for DM manual
resolution; the server does not infer rules from prose. The catalogue is bounded
to the first 64 source entries. `test_combat_action_definitions.py` covers
validation, reference stability and canonical spell statistics.

## Executing a structured action

Controllers and DMs receive `available_actions` in their authorized combat views.
Other players and spectators receive neither this catalogue nor raw actor actions.
An attack command supplies `actor_id`, `target_id`, and `action_id`; a spell uses
`target_ids`. `table_id` is optional, but if provided must match the encounter.
The server always loads the encounter table, including the staged movement draft
inside a batch. Missing token geometry, invalid units, excess/duplicate/hidden
player targets, closed sight-blocking walls and out-of-range targets are rejected
before spending actions, reactions, slots, or concentration. Range uses table
units converted to feet and token positions, with no extra range allowance.
Cover zones continue to affect attack rolls. Obstacle sprite geometry and the
renderer vision protocol are separate limitations; wall checks do not implement
those missing geometry contracts.

References are re-resolved against the current saved encounter actor. A stale or
foreign reference is rejected. Supplying any mechanical field alongside a
reference is rejected, even if the value matches the definition. Clients send
intent and targets, without copying preview mechanics into the command.

```json
{"type":"cast_spell","actor_id":"caster-id","target_ids":["target-id"],"action_id":"action_from_available_actions"}
```

To author an executable entry, store explicit metadata in the saved character or
NPC source's `actions` array before starting the encounter. The factory preserves
that entry in `actor_actions`. For example:

```json
{
  "name": "Arcane bolt",
  "action_cost": "action",
  "combat": {
    "schema_version": 1,
    "kind": "spell",
    "effect": "attack_roll",
    "spell_level": 0,
    "damage_formula": "1d10",
    "damage_type": "force",
    "range_ft": 120,
    "attack_type": "ranged"
  }
}
```

This phase supports damage actions, fixed spell levels, and a bounded list of
explicit targets. It does not infer areas, upcasting, healing, conditions,
summons, or descriptive spell effects. Unsupported automation is unavailable
without spending resources. DMs resolve those effects using the existing typed
DM Overrides. The action panel also offers an explicit **Manual damage (DM)**
mode: manual commands set `manual: true`, supply bounded mechanics, and require
an explicit spell effect. Non-DMs cannot use manual commands. A manual damage
spell rolls automatic damage; it does not implement the named spell's rules.
Opportunity-attack commands use a supported melee reference and reaction budget;
this does not add a durable trigger/timing state machine or generate OA prompts.

`test_combat_action_authority.py` exercises the command boundary and verifies
that rejected authority and geometry checks preserve the full encounter state.
