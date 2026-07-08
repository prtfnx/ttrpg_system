# Add a WebSocket message

Audience: contributors changing browser/server protocol behavior.

Status: usable.

Last source audit: 2026-07-08

## Before you start

Read:

- [Protocol boundary](../PROTOCOL_BOUNDARY.md)
- [WebSocket messages](../reference/WEBSOCKET_MESSAGES.md)

For combat writes, stop here and read
[Add a combat command](ADD_COMBAT_COMMAND.md). Do not add a direct combat
mutation message unless the boundary really is not a combat command.

## Steps

1. Pick the owner module under `apps/server/service/protocol/`.
2. Add the message value to `packages/core-table/core_table/protocol.py`.
3. Add the message value to `apps/web-ui/src/lib/websocket/message.ts` if the
   browser sends or handles it.
4. Add a server handler method on the matching protocol mixin.
5. Register the handler in `ServerProtocol.init_handlers` in
   `apps/server/service/protocol/base.py`.
6. Add a browser helper or handler in
   `apps/web-ui/src/lib/websocket/clientProtocol.ts`.
7. Keep UI code behind a helper, hook, or service. Avoid raw `sendMessage`
   calls scattered through components.
8. Add tests at both changed boundaries.
9. Update [WebSocket messages](../reference/WEBSOCKET_MESSAGES.md) if the
   message family or owner changed.

## Server handler shape

Handlers receive the parsed `Message` and `client_id`.

```python
async def handle_example_request(self, msg: Message, client_id: str) -> Message:
    data = msg.data or {}
    if "table_id" not in data:
        return Message(MessageType.ERROR, {"error": "table_id required"})

    return Message(MessageType.EXAMPLE_RESPONSE, {"ok": True})
```

Use helpers from `protocol/helpers.py` or the existing mixin when the message
needs session metadata, broadcasts, table lookup, or per-client sends.

## Browser shape

Use `createMessage` from `apps/web-ui/src/lib/websocket/message.ts`.

Prefer a typed method on `WebClientProtocol` when more than one component or
service will use the message.

For a feature-specific one-off, put the send in the feature hook or service
that owns the workflow.

## Verification

Server protocol test:

```powershell
cd apps/server
python -m pytest tests\unit -q
```

Browser protocol test:

```powershell
cd apps/web-ui
pnpm.cmd exec vitest run --project jsdom src/lib/websocket/__tests__/clientProtocol.test.ts
```

Add a focused feature test if the message is triggered by UI.

## Checklist

- Message exists in the Python enum.
- Message exists in the TypeScript enum when the browser uses it.
- Server handler is registered.
- Handler validates required ids and role rules.
- Client handler updates the correct owner: store, runtime, or feature state.
- Tests cover success and at least one failure or permission path.
