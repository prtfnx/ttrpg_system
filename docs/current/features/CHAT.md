# Chat

Audience: contributors changing chat delivery, history, privacy, or chat UI.

Status: current but partial. Delivery, retention, moderation and DM whisper
visibility are implemented. Export and attachment support remain product work.

Last source audit: 2026-11-24

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
6. Public messages broadcast to the session. Whispers go to the sender,
   recipient and connected DMs; history applies the same DM visibility policy.
7. Confirmation or error moves the pending row to sent or failed. Retrying uses
   the same operation id and does not rebroadcast a committed duplicate.

A malformed whisper never falls through to public delivery. Attachment metadata
is rejected until it can reference an authorized asset.

Chat write/idempotency checks run in one synchronous worker function that
creates and closes its own SQLAlchemy session. History and moderation use the
same worker-owned session pattern. Validation and WebSocket delivery stay on
the event-loop thread, so database latency does not pause unrelated sockets.

## History and roll messages

History defaults to 30 rows and caps each request at 100. It uses opaque server
cursors and filters whisper visibility before serialization. There is no
unbounded `all` request.

Successful character rolls persist as typed public `kind: system` chat rows
with `system_event.type: character_roll`. Migration `0016_chat_system_events`
adds a separate server-owned event column. Reconnect and history therefore show
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

## Retention and moderation

`CHAT_RETENTION_DAYS` defaults to 365 and accepts 30-3650 days. The daily worker
removes expired rows using its own ORM transaction, without blocking sockets.
Moderation supports delete and redact, preserves a tombstone in history, and
records an audit event. Moderating another user's message requires a reason.
Only an authorized moderator or the message owner may moderate a message.
DM whisper visibility applies to live delivery and history; whispers are not
private from session DMs.

User chat is constructed from validated fields. Client-supplied `kind`,
`system_event`, history cursors, moderation flags, creation times and arbitrary
metadata cannot become persisted or delivered system messages. Legitimate
character-roll system rows still originate from the server roll path.

History, retries and moderation serialize identity, text, cursors and tombstones
from canonical database columns, never legacy `message_json`. Malformed legacy
JSON cannot break history. Existing unverified roll JSON remains available as
plain saved text; it is not promoted to a trusted system event. New character
rolls persist their typed event separately. No historical rows are rewritten.

Remaining product work includes deletion/export policy, abuse response,
authorized asset attachments, privacy notices and message quotas.

## Verification

Run `tests/unit/test_chat_projection.py`, `tests/unit/test_chat_protocol.py`,
`tests/unit/test_game_ws_security.py`,
`tests/unit/test_game_session_protocol.py`, the chat Vitest suites, and the
browser protocol suite.

The server test asserts that chat write, history, and moderation database work
execute off the event-loop thread.
