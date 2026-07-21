# Chat

Audience: contributors changing chat delivery, history, privacy, or chat UI.

Status: current but partial. Code-level delivery boundaries are implemented.
Retention, moderation, export, and DM-whisper policy remain product decisions.

Last source audit: 2026-07-21

## Ownership

- `service/protocol/chat.py` validates, persists, and delivers chat.
- `database/models.py` defines `ChatMessage`.
- `apps/web-ui/src/features/chat/` owns session-keyed UI state and delivery
  status.
- `apps/web-ui/src/lib/websocket/clientProtocol.ts` owns shared transport
  subscriptions.

## Send flow

1. The browser creates a bounded client operation id and a pending row in the
   active session's chat store.
2. `chat` reaches the authenticated game WebSocket.
3. The server derives sender identity and session membership from the
   connection. Client identity fields are not trusted.
4. Text, channel, recipient, and attachment policy are validated.
5. The server persists a server UUID plus the sender-scoped operation id.
6. Public messages broadcast to the session. Whispers go only to the sender
   and a distinct active session member.
7. Confirmation or error moves the pending row to sent or failed. Retrying uses
   the same operation id and does not rebroadcast a committed duplicate.

A malformed whisper never falls through to public delivery. Attachment metadata
is rejected until it can reference an authorized asset.

## History and roll messages

History defaults to 30 rows and caps each request at 100. It uses opaque server
cursors and filters whisper visibility before serialization. There is no
unbounded `all` request.

Successful character rolls persist as typed public `kind: system` chat rows
with `system_event.type: character_roll`. Reconnect and history therefore show
the same roll as live delivery; the browser no longer synthesizes transient
roll-chat rows.

## Browser state

Chat state, cursors, pending operations, and cleanup are keyed by game session.
The overlay and panel share one ref-counted protocol binding. Protocol message
subscriptions support multiple independent consumers.

## Transport controls

The WebSocket requires the HTTP-only auth cookie, active membership, and an
allowed Origin. Incoming frames and per-connection message rates are bounded.
Logs omit cookies, tokens, payloads, and private content. Outbound protocol
sends have a configurable deadline; a slow peer is disconnected through the
normal cleanup path instead of stalling fan-out indefinitely.

Production-shaped load tests still need to set the final timeout and capacity
limits for the deployed Render tier.

## Remaining product policy

Before public release, decide and document:

- retention and deletion/export behavior;
- moderation and abuse response;
- whether a DM may inspect whispers;
- whether authorized asset attachments are supported;
- legal/privacy notice and message quotas.

## Verification

Run `tests/unit/test_chat_protocol.py`,
`tests/unit/test_game_ws_security.py`,
`tests/unit/test_game_session_protocol.py`, the chat Vitest suites, and the
browser protocol suite.
