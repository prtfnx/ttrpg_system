# Add a combat command

Audience: contributors adding or changing accepted combat mutations.

Status: usable.

Last source audit: 2026-07-08

## Before you start

Read:

- [Combat commands](../reference/COMBAT_COMMANDS.md)
- [Battle flow](../BATTLE_FLOW.md)
- [State ownership](../STATE_OWNERSHIP.md)

Combat mutations are server-authoritative. React may compose intent and
Rust/WASM may preview movement or targeting, but accepted combat state changes
go through `CombatCommandService`.

## Steps

1. Add or update the command value in `CombatCommandType` in
   `apps/server/service/combat_command_service.py`.
2. Add payload fields to `CombatCommand` if the command needs new data.
3. Keep `extra="forbid"` intact unless there is a deliberate schema reason to
   change it.
4. Add validation and mutation logic in `CombatCommandService`.
5. Decide the authority rule in `_assert_turn_and_control`.
6. Decide whether the command needs an existing combatant in
   `_requires_existing_combatant`.
7. Add rollback behavior for any side effect outside the in-memory combat
   state.
8. Preserve persistence through `CombatPersistenceService`.
9. Add or update browser send code.
10. Add tests.
11. Update [Combat commands](../reference/COMBAT_COMMANDS.md) and
    [Battle flow](../BATTLE_FLOW.md) if the command model changed.

## Where command logic lives

Use these server locations:

- command enum and schema: `apps/server/service/combat_command_service.py`;
- mutation service: `CombatCommandService`;
- protocol boundary: `apps/server/service/protocol/combat.py`;
- persistence: `apps/server/service/combat_persistence_service.py`;
- role-filtered output: `apps/server/service/combat_state_presenter.py`;
- combatant derivation: `apps/server/service/combatant_factory.py`.

The protocol handler should stay thin: parse payload, build
`CombatCommandContext`, call the service, and send `action_result` or
`action_rejected`.

## Browser send path

Use `apps/web-ui/src/features/combat/hooks/useCombatCommands.ts` for common
UI-initiated commands.

If the command belongs to a focused workflow, use a focused combat service and
still send `MessageType.COMBAT_COMMAND`. Current examples include movement and
planned-command services under `apps/web-ui/src/features/combat/services/`.

Do not send direct old-style combat mutation messages from components.

## Tests

Server behavior:

```powershell
cd apps/server
python -m pytest tests\unit\test_combat_command_service.py tests\unit\test_combat_protocol.py
```

Add persistence coverage when the command is accepted and durable:

```powershell
python -m pytest tests\unit\test_combat_persistence.py
```

Browser send path:

```powershell
cd apps/web-ui
pnpm.cmd exec vitest run --project jsdom src/features/combat/hooks/__tests__/useCombatCommands.test.ts
```

If the command is triggered by a component or planning service, run the focused
component or service test too.

## Checklist

- Payload is accepted by `CombatCommand`.
- Invalid payload returns `action_rejected`.
- Non-DM and non-owner paths are tested.
- Turn ownership is tested when relevant.
- Batch rollback is preserved.
- Persistence and idempotency are preserved for accepted commands.
- Client cleanup happens from server `action_result` or `action_rejected`, not
  optimistic UI assumptions.
