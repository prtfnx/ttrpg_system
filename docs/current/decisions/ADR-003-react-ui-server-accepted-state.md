# ADR-003: React Owns UI Workflow, Server Owns Accepted State

Status: accepted
Date: 2026-07-09

## Context

The browser needs fast local interaction: selected actors, open panels, planned
actions, movement previews, opportunity-attack prompts, and form state. At the
same time, shared game state must stay consistent across clients.

Current combat code shows the split:

- `apps/web-ui/src/features/combat/stores/planningStore.ts` stores local planned
  actions before commit.
- `apps/web-ui/src/features/combat/components/CommitButton.tsx` sends the
  planned batch and leaves clearing to protocol results.
- `apps/web-ui/src/lib/websocket/clientProtocol.ts` clears or updates stores
  from `ACTION_RESULT` and shows rejection feedback from `ACTION_REJECTED`.
- `apps/web-ui/src/features/combat/stores/combatStore.ts` mirrors the server's
  filtered combat view.

## Decision

React owns UI workflow state. The server owns accepted state.

React components and stores can build intent, preview choices, and keep pending
workflow state. Shared state changes become accepted only after a server route
or protocol handler validates them and returns a response.

## Consequences

- UI code should not treat local queues, previews, or optimistic changes as
  durable shared state.
- Successful server responses should update or clear workflow stores at the
  protocol boundary.
- Rejections should leave enough local context for the user to correct the
  action.
- Feature stores are good places for UI workflow, but persistence and
  multiplayer authority stay in server code.

## Links

- [State ownership](../STATE_OWNERSHIP.md)
- [Web UI architecture](../WEB_UI_ARCHITECTURE.md)
- [Protocol boundary](../PROTOCOL_BOUNDARY.md)
- [Battle flow](../BATTLE_FLOW.md)
