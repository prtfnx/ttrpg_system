# Protocol boundary

The protocol boundary connects browser clients to a game session on the server.
It is message-based and should stay explicit.

## Client side

- `apps/web-ui/src/lib/websocket/message.ts` defines browser message types and
  the `Message` shape.
- `apps/web-ui/src/lib/websocket/clientProtocol.ts` owns the browser WebSocket,
  reconnect behavior, batching, handlers, and send helpers.
- `apps/web-ui/src/lib/api/ProtocolService.ts` stores the active
  `WebClientProtocol` instance for code that is not inside `ProtocolProvider`.
- `ProtocolProvider` creates and cleans up the active protocol instance.

## Server side

- `apps/server/api/game_ws.py` accepts WebSocket connections.
- `ConnectionManager` groups sockets by session and attaches user metadata.
- `GameSessionProtocolService` owns per-session protocol state and client
  registration.
- `apps/server/service/protocol/base.py` registers server message handlers.
- Domain handlers live in `apps/server/service/protocol/`.
- Shared tabletop message types also exist in `packages/core-table/core_table/protocol.py`.

## Message flow

Client sends command:

```text
React/store/runtime -> WebClientProtocol -> WebSocket -> GameSessionProtocolService -> ServerProtocol handler
```

Server broadcasts update:

```text
ServerProtocol helper -> GameSessionProtocolService -> WebSocket -> WebClientProtocol handler -> store/runtime/UI
```

Canvas operation that becomes a protocol message:

```text
Rust callback -> WasmRuntime -> WebClientProtocol -> server
```

Combat mutation:

```text
React combat UI -> useCombatCommands -> combat_command
    -> CombatCommandService -> ACTION_RESULT or ACTION_REJECTED
```

## Adding a message

1. Add the message type on the client in `apps/web-ui/src/lib/websocket/message.ts`.
2. Add or confirm the matching server message type in `core_table.protocol`.
3. Add a client send helper or handler in `WebClientProtocol`.
4. Add a server handler in the matching `apps/server/service/protocol/` mixin.
5. Register the server handler in `apps/server/service/protocol/base.py`.
6. Add tests on both sides of the boundary.

For combat mutations, do not add a new direct mutation message by default. Add
a command type to `combat_command` instead. Direct combat protocol messages are
reserved for query/view/suggestion messages such as combat state request,
attack preview, cover-zone sync, and DM-only AI suggestions.

## Rules

- Keep message names stable and lowercase.
- Keep payloads plain JSON values.
- Validate ids before sending table-specific messages.
- Do not hide protocol sends behind browser globals.
- Prefer typed helper methods over raw `sendMessage` calls in UI code.
- Use batching only for non-critical, repeat-heavy messages.
- Route combat mutations through `useCombatCommands` and `combat_command`.
- Keep `ACTION_RESULT` and `ACTION_REJECTED` as server responses, not client
  commands.

## Current message families

- Core: ping, pong, welcome, error, success, batch.
- Auth: token and status messages.
- Tables: table CRUD, active table, settings, list.
- Sprites: create, update, remove, move, scale, rotate, previews.
- Assets: upload, download, list, delete, hash.
- Characters: save, load, update, delete, rolls, logs.
- Walls and paint: wall CRUD, door toggle, paint stroke sync.
- Session: layer settings, game mode, session rules.
- Combat: one mutation message, `combat_command`, plus query/view/result
  messages such as combat state, action result/rejection, attack preview,
  turn start, initiative order, cover-zone sync, and DM-only AI suggestion.
- Encounters: encounter state and encounter workflow messages.
- Chat: send and request chat history.
