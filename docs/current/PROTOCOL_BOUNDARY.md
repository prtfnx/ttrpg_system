# Protocol boundary

Audience: contributors changing browser/server WebSocket messages.

Status: current but partial.

Last source audit: 2026-10-21

The protocol boundary connects browser clients to a game session on the server.
It is message-based and should stay explicit.

## Client side

- `apps/web-ui/src/lib/websocket/message.ts` contains the generated browser
  message-type registry and defines the `Message` shape.
- `apps/web-ui/src/lib/websocket/clientProtocol.ts` owns the browser WebSocket,
  reconnect behavior, batching, handlers, and send helpers.
- `apps/web-ui/src/lib/api/ProtocolService.ts` stores the active
  `WebClientProtocol` instance for code that is not inside `ProtocolProvider`.
- `ProtocolProvider` creates and cleans up the active protocol instance.

## Server side

- `apps/server/api/game_ws.py` accepts WebSocket connections and owns the reader.
- `service/websocket_inbox.py` owns bounded per-connection FIFO dispatch. The
  reader processes pings without waiting for database-backed mutations. Other
  commands and queries preserve order; adjacent compatible queued sprite frames
  can merge within the 50-member transport limit. Durable sprite runs are
  capped at ten members so each commit can release outcomes before later work.
- `ConnectionManager` groups sockets by session and attaches user metadata.
- `GameSessionProtocolService` owns per-session protocol state and client
  registration.
- `GameSessionProtocolService.client_info` is the authoritative in-memory store
  for connected-client identity, role, ping, and readiness metadata. Protocol
  handlers must not maintain a second per-client status dictionary.
- `apps/server/service/protocol/base.py` registers server message handlers.
- Domain handlers live in `apps/server/service/protocol/`.
- `packages/core-table/protocol/message.schema.json` is the canonical message
  envelope and message-type registry.
- `packages/core-table/core_table/protocol.py` contains the generated Python
  message-type enum and the shared message objects. `Message.from_json()`
  validates incoming server messages with the packaged canonical schema before
  constructing a message or dispatching a handler.

Run `python packages/core-table/scripts/generate_protocol_types.py` after
changing the schema. Run the same command with `--check` in verification to
detect stale Python, TypeScript, or packaged schema bindings.

The browser validates the generated schema through its Ajv-based validator.
Python caches a `Draft202012Validator` over the same schema when the server
parses its first message. Both boundaries reject unknown message types,
non-object `data`, invalid envelope metadata, and unexpected top-level fields
before dispatch. Validation does not coerce wire values.

Payload validation is incremental. The canonical schema currently enforces the
heartbeat and error messages, session welcome, player join/leave/role-change
lifecycle messages, player roster, readiness, moderation, and direction-specific
player-status messages, table commands and settings, and the accepted/rejected
action response shapes.
Add a conditional payload schema whenever a message family is changed; generic
object payloads are transitional, not the target contract.

Table list and active-table queries carry empty data. The server resolves the
requesting user and session from authenticated connection state, so the browser
must not send `user_id` or `session_code` in those commands. Table mutations use
non-empty table identifiers and allow-listed fields. Creation dimensions are
validated by both schema and handlers: creation currently requires 500-10,000
pixels per dimension and names of at most 50 characters, even where the wire
schema permits a wider range. Scale is greater than zero and at most 100, and settings use their runtime
ranges and color formats. Fog updates contain coordinate-pair rectangles and are
capped at 10,000 rectangles per hide or reveal list.

Table mutations use `table_update_request` from browser to server. The server
continues to emit `table_update` broadcasts. These are separate message types
because their payloads and consumers are direction-specific.
At the server boundary, `table_name` maps to the domain's `display_name` and
`grid_size` maps to `grid_cell_px`. A failed domain update returns one error and
is not broadcast; successful commands are broadcast and the central dispatcher
sends the single response to the requester.

There is no generic `player_action` escape hatch. It had no production consumer,
did not authorize individual action kinds, and duplicated asset and combat
protocols. Asset work uses the dedicated asset messages, while combat mutations
use `combat_command`. Development UI must use the same domain-specific paths.

Authentication, token verification, and logout remain HTTP/session operations.
The WebSocket is authenticated while its connection is established and uses
server-side connection metadata afterward. Unsupported WebSocket auth stubs are
not part of the message registry and must not simulate logout or token checks.

Core messages are directional. Browsers send `ping` and `batch_request`; the
server emits `pong`, `batch_response`, `success`, and `error`. Response-only
`success` and `error` messages are not registered as server commands. The old
`test` echo message had no production consumer and is not part of the protocol.

Request, response, and broadcast semantics use separate message types even when
their payloads share a definition. For example, player readiness uses
`player_status_request`, `player_status_response`, and `player_status_changed`;
do not overload one type with direction-dependent payload shapes.

Batching follows the same rule: browsers send `batch_request` and servers emit
`batch_response`. Every nested entry is validated as a complete canonical
message, nested batches are rejected, and a batch contains at most 50 entries.
Code that already has a decoded object must use `Message.from_dict()` so nested
messages cannot bypass the server boundary validator.

The server serializes authoritative mutations with one fair lock per live
session. `service/command_policy.py` owns the explicit mutation and read classification
used by dispatch and rate accounting; `service/protocol/base.py` re-exports the
mutation set for existing callers. Reads of shared table, player, sprite, session,
and combat state use the same lock so they cannot observe a mutation that later
rolls back. Transport-only ping, ephemeral drag previews, and independent
durable-store queries remain concurrent. A batch holds the mutation lock for
its entire dispatch, including every nested handler. Add new state-changing
messages to that set and to the serialization tests.

The browser's `commandTracking.ts` mirrors every mutation classification; the
outer transport batch tracks its members. Schema errors preserve bounded request
identities, including bounded non-UUID operation IDs from malformed input. Error
codes remain an explicit schema enum, including text revision conflicts and
uncertain table creation failures. Their bounded recovery/revision fields are
validated alongside the code. Uncertain handler outcomes use
`outcome_unknown` with `resync_required`. Ordered per-socket writers isolate network delivery from the mutation
lock. Receipts stream after a member/run commits; snapshots use separate bounded
ordered streams. Incoming browser frames are serialized and fenced by socket
identity. See [Action confirmation and continuous editing](reference/ACTION_CONFIRMATION.md)
for optimistic ownership, buffering, rollback and full-table recovery.

Sprite previews carry optional `preview_id` and bounded relative `ttl_ms`
metadata. New raw transform commands retain that identity, and canonical events
close it with server-supplied source identity. Legacy preview expiry remains a
compatibility path. Unknown preview fields and invalid bounds still reject.

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

1. Add the message name and wire value to
   `packages/core-table/protocol/message.schema.json`.
2. Run `python packages/core-table/scripts/generate_protocol_types.py`.
3. Add a client send helper or handler in `WebClientProtocol`.
4. Add a server handler in the matching `apps/server/service/protocol/` mixin.
5. Register the server handler in `apps/server/service/protocol/base.py`.
6. Classify it as mutating or read-only in the server dispatcher.
7. Add tests on both sides of the boundary.

For combat mutations, do not add a new direct mutation message by default. Add
a command type to `combat_command` instead. Direct combat protocol messages are
reserved for query/view/suggestion messages such as combat state request,
attack preview, cover-zone sync, and DM-only AI suggestions.

## Rules

- Keep message names stable and lowercase.
- Keep payloads plain JSON values.
- Validate ids before sending table-specific messages.
- Resolve session-scoped player operations from authenticated connection state;
  never trust a client-supplied session code as the authorization boundary.
- Enforce the session role hierarchy for kick and ban on the server: owners may
  manage lower roles, co-DMs may manage non-DM roles, and self-targeting is
  denied.
- Do not hide protocol sends behind browser globals.
- Prefer typed helper methods over raw `sendMessage` calls in UI code.
- Use batching only for non-critical, repeat-heavy messages.
- Route combat mutations through `useCombatCommands` and `combat_command`.
- Keep `ACTION_RESULT` and `ACTION_REJECTED` as server responses, not client
  commands.

## Current message families

- Core: ping, pong, welcome, error, success, batch request/response.
- Tables: table CRUD, active table, settings, list.
- Sprites: create, update, remove, move, scale, rotate, previews.
- Assets: upload, download, list, delete, hash.
- Characters: save, load, update, delete, rolls, logs.
- Walls and paint: wall CRUD, door toggle, versioned paint-object commands,
  chunked snapshots, and disposable previews.
- Session: layer settings, game mode, session rules.
- Combat: one mutation message, `combat_command`, plus query/view/result
  messages such as combat state, action result/rejection, attack preview,
  turn start, initiative order, cover-zone sync, and DM-only AI suggestion.
- Encounters: encounter state and encounter workflow messages.
- Chat: send and request chat history.

## Persistence and guest dispatch

Successful core table mutations wait for confirmed persistence before the
handler broadcasts success. Failed snapshots remain pending for retry; they
are not universally rolled back in memory. See
[Persistence and application ownership](explanation/PERSISTENCE_AND_WRITER_OWNERSHIP.md).

Demo mode is selected at the authenticated WebSocket handshake. Guest messages
must pass the explicit read/own-active-table allowlist before normal dispatch.
A mixed read/write batch is rejected. New registered messages do not
automatically become guest-accessible. See [Auth and roles](features/AUTH_AND_ROLES.md).

Sprite broadcasts use authoritative layer visibility, including deletion and
previews. Recipient iteration is stable across concurrent connection changes.
Transport command and preview budgets, including retryable close 1013, are
specified in [WebSocket messages](reference/WEBSOCKET_MESSAGES.md).


## Canvas predecessor fences

For `transform`, `sprite_edit` and `restyle`, each canvas member may carry an
`after_operation_id` UUID. The server resolves it only in the authenticated
actor's journal for that table, inside the normal table transaction. Distinct
predecessor IDs share one bounded query per command. That query selects only
operation identity, kind, state and delta; authorization remains per command.
The predecessor must be an applied transform/property/style edit with retained
after-state for that exact member. Paint uses its current object version as
the fence. Sprites compare transform, layer and obstacle geometry with that
after-state; unrelated current stats and metadata are retained. The server uses
the committed fence instead of the member's earlier expected transform/version.
Authorization, movement,
combat, quotas and history checks still apply to every command.

An unavailable or unapplied predecessor returns `dependency_failed` before
applying any part of the command. A changed fence returns `conflict`; it cannot
silently overwrite an intervening remote edit. Self references, unrelated
members and dependency fields on clipboard/destructive/history commands reject.
Retries retain the exact operation identity and body. Each accepted command
keeps its own transaction, receipt and undo step. No database migration is
required; the existing journal stores the predecessor state.

Regression owners: `tests/unit/test_canvas_pipeline.py` in `apps/server` and
`packages/core-table/tests/test_canvas_protocol_schema.py`.

The server advertises predecessor-fence support with `version: "0.2"` on its
`welcome` envelope. The welcome data shape stays compatible with older clients.
`WebClientProtocol.supportsCanvasPipelining()` enables the browser feature only
for that advertised version; absent, legacy and unknown versions use sequential
overlapping edits. Capability resets when replacing or disconnecting the socket.
A reconnect to a server without support recovers existing in-flight dependency
commands from authoritative snapshots instead of replaying unsupported bodies.
Other message envelopes retain their existing version defaults.
