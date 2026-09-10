# WebSocket messages

Audience: contributors changing browser/server protocol behavior.

Status: partial. This page catalogs the currently registered server handlers
and the main browser message families. It does not document every payload field.

Last source audit: 2026-09-10

## Source of truth

`packages/core-table/protocol/message.schema.json` is the canonical envelope,
message registry, and incrementally typed payload schema. Run
`python packages/core-table/scripts/generate_protocol_types.py` to generate
the Python enum, TypeScript enum, and packaged schema; `--check` detects drift.
`apps/web-ui/src/lib/websocket/message.ts` and
`packages/core-table/core_table/protocol.py` validate messages against that
shared schema. Server registration lives in `service/protocol/base.py`.

An enum value does not by itself register an inbound handler or authorize a
caller. Verify direction, registration, payload validation, and role checks.
See [Protocol boundary](../PROTOCOL_BOUNDARY.md).

## Message envelope

Browser messages use this shape:

```ts
{
  type: MessageType;
  data?: Record<string, unknown>;
  client_id?: string;
  timestamp?: number;
  version: string;
  priority: number;
  sequence_id?: number;
  message_id?: string;
  causation_id?: string;
  correlation_id?: string;
}
```

The Python `Message` dataclass uses the same core fields. Correlation
fields connect an accepted command to its response without trusting them for
identity or authorization. Normal priority is `5`; lower numbers are more
urgent in the existing comments.

## Authenticated connection context

The WebSocket handshake and session join establish the authoritative
`user_id`, `username`, role, session code, and database session ID. Inbound
message payloads are untrusted and must not override any of those values.
Handlers resolve identity through the registered `client_id` and resolve the
session through `GameSessionProtocolService`; if either context is absent, the
operation fails closed. Payload usernames remain valid only when they identify
a command target, such as the player selected for a kick or ban.

Committed role changes update the authorization context for every socket owned
by the affected user before `player_role_changed` is broadcast. Durable
membership removal sends a terminal error, removes every matching socket from
both server registries, and closes them with policy code `1008` and reason
`Kicked from session`. Repeating that cleanup has no effect.

Password reset or change closes all of the account's sockets with reason
`Account session revoked`. Account disablement uses reason `Account disabled`.
Both are terminal policy closes (`1008`), and the server removes authorization
context before awaiting the close notification.

## Registered server inbound messages

These messages are registered in `ServerProtocol.init_handlers`.

| Domain | Client sends | Main server module |
| --- | --- | --- |
| Core | `ping`, `batch_request` | `protocol/base.py` |
| Tables | `new_table_request`, `table_request`, `table_update_request`, `table_scale`, `table_move`, `table_delete`, `table_list_request`, `table_active_request`, `table_active_set`, `table_active_set_all`, `table_settings_update` | `protocol/tables.py` |
| Players | `player_ready`, `player_unready`, `player_status_request`, `player_list_request`, `player_kick_request`, `player_ban_request` | `protocol/players.py` |
| Sprites | `sprite_request`, `sprite_create`, `sprite_remove`, `sprite_move`, `sprite_scale`, `sprite_rotate`, `sprite_update`, `sprite_drag_preview`, `sprite_resize_preview`, `sprite_rotate_preview` | `protocol/sprites.py` |
| Assets | `asset_upload_request`, `asset_download_request`, `asset_list_request`, `asset_upload_confirm`, `asset_delete_request`, `asset_hash_check` | `protocol/assets.py` |
| Compendium sprites | `compendium_sprite_add`, `compendium_sprite_update`, `compendium_sprite_remove` | `protocol/sprites.py` |
| Characters | `character_save_request`, `character_load_request`, `character_list_request`, `character_delete_request`, `character_update`, `character_log_request`, `character_roll`, `xp_award`, `multiclass_request` | `protocol/characters.py` |
| Character drafts | `character_draft_create_request`, `character_draft_list_request`, `character_draft_load_request`, `character_draft_update_request`, `character_draft_finalize_request`, `character_draft_abandon_request` | `protocol/characters.py` |
| Walls and doors | `wall_create`, `wall_update`, `wall_remove`, `door_toggle` | `protocol/walls.py` |
| Paint | `paint_stroke_create`, `paint_stroke_delete`, `paint_stroke_clear` | `protocol/paint.py` |
| Paint templates | `paint_template_upsert`, `paint_template_delete`, `paint_template_sync` | `protocol/paint_templates.py` |
| Measurements | `measurement_upsert`, `measurement_delete`, `measurement_clear`, `measurement_sync` | `protocol/measurements.py` |
| Session | `layer_settings_update`, `game_mode_change`, `session_rules_update`, `session_rules_request` | `protocol/session.py` |
| Combat | `combat_state_request`, `cover_zones_sync`, `attack_preview`, `ai_action`, `combat_command` | `protocol/combat.py` |
| Encounters | `encounter_start`, `encounter_end`, `encounter_choice`, `encounter_roll` | `protocol/encounter.py` |
| Chat | `chat`, `chat_request`, `chat_moderate` | `protocol/chat.py` |

If a message is only present in an enum but not registered here, it is not a
normal server inbound handler unless another path handles it explicitly.

The unused `connection_status_request` and `connection_status_response`
messages were retired on 2026-08-12. Liveness is already owned by WebSocket
state, heartbeat handling, and reconnect state; do not reintroduce a second
status-query API without a production consumer and a distinct requirement.

## Main server response and broadcast families

The server sends responses and broadcasts with the same `Message` envelope.
Common families include:

- Core: `pong`, `success`, `error`, `batch_response`, `welcome`.
- Tables: `new_table_response`, `table_response`, `table_data`,
  `table_update`, `table_list_response`, `table_active_response`,
  `table_active_set_all_response`, `table_settings_changed`.
- Players: `player_joined`, `player_left`, player-status responses and broadcasts,
  `player_list_response`,
  `player_kick_response`, `player_ban_response`, and `player_role_changed`.
- Sprites: `sprite_response`, `sprite_data`, `sprite_update`,
  `sprite_remove`, `sprite_move`, `sprite_scale`, `sprite_rotate`, preview
  messages.
- Assets: upload, download, list, delete, and hash responses.
- Characters: save, load, list, delete, update, log, roll, XP, and multiclass
  responses.
- Walls and paint: `wall_data`, paint stroke broadcasts, and `paint_sync`.
- Session: `game_mode_state`, `session_rules_changed`,
  `layer_settings_update`.
- Combat: `combat_state`, `action_result`, `action_rejected`,
  `initiative_order`, `turn_start`, `conditions_sync`,
  `cover_zones_sync`, `attack_preview_result`, `ai_suggestion`,
  opportunity-attack messages.
- Encounters: `encounter_state`, `encounter_result`.
- Chat: `chat`, `chat_confirmation`.

## Browser protocol owner

Browser WebSocket behavior lives in
`apps/web-ui/src/lib/websocket/clientProtocol.ts`.

That file owns:

- connection lifecycle;
- heartbeat and reconnect behavior;
- batching;
- registered browser handlers;
- typed send helper methods;
- store/runtime updates after server messages.

Reconnect behavior has one owner. `WebClientProtocol` retries transient
transport and server-availability closes with capped exponential backoff and
full jitter, up to ten attempts. Manual disconnect cancels pending work.
Heartbeat timeout closes the stale socket and enters the same retry path.
Close codes for normal shutdown, policy/auth rejection, protocol errors,
unsupported or invalid payloads, oversized messages, and banned users do not
retry. `ProtocolProvider` reflects protocol recovery in React connection state.

Feature code should prefer protocol helper methods or focused hooks over raw
`sendMessage` calls. Combat mutations are stricter: use `combat_command`, not
new direct mutation messages.

Protocol sends use the bounded `WS_SEND_TIMEOUT_SECONDS` deadline. A timed-out
peer is handled through normal disconnect cleanup so one slow connection cannot
hold a protocol broadcast indefinitely.

## Adding or changing a message

1. Update `packages/core-table/protocol/message.schema.json`, including payload rules.
2. Run `python packages/core-table/scripts/generate_protocol_types.py`; do not hand-edit generated enums.
3. Add or update the client send helper or handler in `clientProtocol.ts`.
4. Add or update the matching server protocol handler.
5. Register the server handler in `ServerProtocol.init_handlers`.
6. Add focused client and server tests.
7. Update this reference if the message family or handler ownership changes.

For combat writes, read [Combat commands](COMBAT_COMMANDS.md) first. New direct
combat mutation messages are usually the wrong boundary.

## Transport budgets and close behavior

`utils/websocket_rate_limit.py` accounts for commands and disposable sprite
drag/resize/rotate previews separately for each socket over a rolling minute.
Defaults are 120 commands and 1,800 previews. Batch members consume their own
budgets, so batching does not bypass command limits. The envelope schema allows
at most 50 batch entries; the transport parser's preliminary bound is looser.
The frame budget is the sum of the two configured limits and bounds malformed
traffic too.

Excess previews are dropped while durable commands in a mixed batch are
preserved. Exhausted command/frame budgets close with retryable code 1013.
Normal sustained 20 Hz dragging fits the preview budget. Do not interpret 1013
as lost authorization. `WS_MAX_MESSAGE_BYTES` defaults to 65,536 bytes.

Server replacement or graceful restart uses retryable close 1012. Normal close
1000 and authorization/policy close 1008 remain terminal. The current reconnect
implementation, rather than the reason text, decides retry behavior.

See [Environment variables](ENVIRONMENT_VARIABLES.md) for settings and
[Writer handover](../operations/WRITER_HANDOVER.md) for process replacement.
