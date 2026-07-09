# Chat

Audience: contributors changing chat messages, chat history, roll-to-chat
display, or chat UI.

Status: current but partial.

Last source audit: 2026-07-09

## Source owners

- `apps/server/service/protocol/chat.py`: chat send, persistence, broadcast,
  whisper delivery, and history request handlers.
- `apps/server/database/models.py`: `ChatMessage`.
- `apps/web-ui/src/features/chat/`: chat store, panel, overlay, and WebSocket
  hook.
- `apps/web-ui/src/lib/websocket/clientProtocol.ts`: protocol handler
  registration and message send path.
- `packages/core-table/core_table/protocol.py`: chat message enum values.

## What the feature does

Chat is session-scoped WebSocket state with database history. The browser keeps
an in-memory chat store for display. The server persists accepted messages and
returns history on request.

The chat UI has two surfaces:

- `ChatPanel`: main chat panel with input, history list, command validation,
  and "Load all messages".
- `ChatOverlay`: floating recent-message view with local overlay settings.

## Protocol messages

Current chat messages:

- `chat`
- `chat_confirmation`
- `chat_request`

Sending a message uses `chat` with a `message` object. Requesting history uses
`chat_request` with a count, `all`, or filters.

## Send flow

1. `useChatWebSocket.sendMessage()` validates non-empty text and a 500
   character limit.
2. The browser adds the message to `useChatStore` optimistically.
3. If the app protocol is connected, the hook sends the message through the
   current protocol. Otherwise it can use a raw WebSocket fallback.
4. `handle_chat()` validates session, payload shape, text, and length.
5. The server writes `ChatMessage` unless the same `message_id` already exists.
6. Public messages broadcast `chat` to the session.
7. The sender receives `chat_confirmation` with the persisted message.

Whispers use `channel: whisper` and `recipient_user_id`. The server sends the
outbound `chat` only to matching connected user ids, excluding the sender
client. The sender still receives confirmation.

## History flow

`chat_request` reads persisted messages for the current session. It supports:

- recent count, defaulting to 30;
- `all: true`;
- `before_id`;
- `after_id`;
- `channel`;
- `user_id`;
- visibility filtering for the requesting user.

The server responds with `chat` containing `messages`, count metadata, and the
session id. The browser merges history by id and sorts by timestamp.

## Roll display

`useChatWebSocket` listens for `character-roll-result` browser events. It adds
a local dice-result message to the chat store with roll total and optional
breakdown. This is display behavior; the server-side roll authority is in the
character protocol.

## Persistence

`ChatMessage` stores:

- message id;
- session id;
- optional user id;
- username;
- text;
- channel;
- optional recipient user id;
- optional table id;
- serialized message JSON;
- optional attachments JSON;
- client timestamp and server creation time.

`to_dict()` reconstructs the stored message JSON and fills in missing
timestamps or attachments when available.

## Tests to run

- chat server tests under `apps/server/tests/`
- `apps/web-ui/src/features/chat/__tests__/chatStore.test.ts`
- `apps/web-ui/src/features/chat/__tests__/useChatWebSocket.test.tsx`
- `apps/web-ui/src/features/chat/components/__tests__/ChatPanel.test.tsx`
- `apps/web-ui/src/features/chat/components/__tests__/ChatOverlay.test.tsx`
- `apps/web-ui/src/lib/websocket/__tests__/clientProtocol.test.ts`

Use server tests for persistence, history, dedupe, and whisper behavior. Use
Vitest for browser validation, optimistic store behavior, history merging, and
roll display.

## Known edges

- The browser validates slash commands in `ChatPanel`, but command execution is
  not a separate server command system.
- Browser optimistic messages can appear before the server confirmation comes
  back.
