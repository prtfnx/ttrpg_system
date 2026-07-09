# ADR-002: Command-Oriented Combat Mutations

Status: accepted
Date: 2026-07-09

## Context

Combat has many mutation types: movement, attacks, spells, utility actions,
initiative, death saves, DM overrides, terrain, cover, and combat lifecycle.
Those mutations share the same needs: role checks, turn checks, rollback,
idempotency, persistence, and role-filtered broadcast output.

Current code centralizes those writes through:

- `apps/web-ui/src/features/combat/hooks/useCombatCommands.ts`
- `apps/server/service/protocol/combat.py`
- `apps/server/service/combat_command_service.py`
- `apps/server/service/combat_persistence_service.py`
- `apps/server/service/combat_state_presenter.py`

## Decision

Combat mutations use the `combat_command` envelope instead of separate direct
mutation messages.

The browser may send one command or a batch. The server parses the envelope,
applies commands through `CombatCommandService`, persists accepted results, and
returns `ACTION_RESULT` or `ACTION_REJECTED`.

## Consequences

- New combat writes should usually add a `CombatCommandType`, payload fields,
  service behavior, persistence coverage, and browser command helper.
- Batches are the unit of acceptance. A failed command rejects the batch instead
  of partially accepting earlier commands.
- `sequence_id` and requester identity let the persistence layer return stored
  results for duplicate accepted commands.
- Direct combat WebSocket messages remain for reads, views, suggestions, and
  sync messages, not normal combat writes.

## Links

- [Battle flow](../BATTLE_FLOW.md)
- [Combat commands](../reference/COMBAT_COMMANDS.md)
- [Add a combat command](../how-to/ADD_COMBAT_COMMAND.md)
- [Protocol boundary](../PROTOCOL_BOUNDARY.md)
