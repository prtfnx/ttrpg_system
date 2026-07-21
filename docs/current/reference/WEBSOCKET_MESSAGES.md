# WebSocket messages

Audience: contributors changing browser/server protocol behavior.

Status: partial. This page catalogs the currently registered server handlers
and the main browser message families. It does not document every payload field.

Last source audit: 2026-07-21

## Source of truth

Current message definitions live in two places:

- Browser enum and `Message` shape:
  `apps/web-ui/src/lib/websocket/message.ts`.
- Python enum and shared `Message` dataclass:
  `packages/core-table/core_table/protocol.py`.

Server handler registration lives in
`apps/server/service/protocol/base.py`.

The browser and Python enums cover different runtime responsibilities and are
not expected to be textually identical. Every active browser/server flow must,
however, define the same wire value on both sides. XP awards and multiclass
requests are exposed by both enums and by typed browser protocol methods.
Verify the sender, receiver, and their tests before adding a message.

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
  traceparent?: string;
}
```

The Python `Message` dataclass uses the same core fields. Correlation and trace
fields connect an accepted command to its response without trusting them for
identity or authorization. Normal priority is `5`; lower numbers are more
urgent in the existing comments.

## Registered server inbound messages

These messages are registered in `ServerProtocol.init_handlers`.

| Domain | Client sends | Main server module |
| --- | --- | --- |
| Core | `ping`, `pong`, `test`, `batch`, `error`, `success` | `protocol/base.py` |
| Auth stubs | `auth_register`, `auth_login`, `auth_logout`, `auth_token`, `auth_status` | `protocol/auth.py` |
| Tables | `new_table_request`, `table_request`, `table_update`, `table_scale`, `table_move`, `table_delete`, `table_list_request`, `table_active_request`, `table_active_set`, `table_active_set_all`, `table_settings_update` | `protocol/tables.py` |
| Players | `player_action`, `player_ready`, `player_unready`, `player_status`, `player_list_request`, `player_kick_request`, `player_ban_request`, `connection_status_request` | `protocol/players.py` |
| Sprites | `sprite_request`, `sprite_create`, `sprite_remove`, `sprite_move`, `sprite_scale`, `sprite_rotate`, `sprite_update`, `sprite_drag_preview`, `sprite_resize_preview`, `sprite_rotate_preview` | `protocol/sprites.py` |
| Files and assets | `file_request`, `file_data`, `asset_upload_request`, `asset_download_request`, `asset_list_request`, `asset_upload_confirm`, `asset_delete_request`, `asset_hash_check` | `protocol/assets.py` and `protocol/players.py` |
| Compendium sprites | `compendium_sprite_add`, `compendium_sprite_update`, `compendium_sprite_remove` | `protocol/sprites.py` |
| Characters | `character_save_request`, `character_load_request`, `character_list_request`, `character_delete_request`, `character_update`, `character_log_request`, `character_roll`, `xp_award`, `multiclass_request` | `protocol/characters.py` |
| Walls and doors | `wall_create`, `wall_update`, `wall_remove`, `wall_batch_create`, `door_toggle` | `protocol/walls.py` |
| Paint | `paint_stroke_create`, `paint_stroke_delete`, `paint_stroke_clear` | `protocol/paint.py` |
| Session | `layer_settings_update`, `game_mode_change`, `session_rules_update`, `session_rules_request` | `protocol/session.py` |
| Combat | `combat_state_request`, `cover_zones_sync`, `attack_preview`, `ai_action`, `combat_command` | `protocol/combat.py` |
| Encounters | `encounter_start`, `encounter_end`, `encounter_choice`, `encounter_roll` | `protocol/encounter.py` |
| Chat | `chat`, `chat_request` | `protocol/chat.py` |

If a message is only present in an enum but not registered here, it is not a
normal server inbound handler unless another path handles it explicitly.

## Main server response and broadcast families

The server sends responses and broadcasts with the same `Message` envelope.
Common families include:

- Core: `pong`, `success`, `error`, `batch`, `welcome`.
- Tables: `new_table_response`, `table_response`, `table_data`,
  `table_update`, `table_list_response`, `table_active_response`,
  `table_active_set_all_response`, `table_settings_changed`.
- Players: `player_joined`, `player_left`, `player_action_response`,
  `player_action_update`, `player_status`, `player_list_response`,
  `player_kick_response`, `player_ban_response`, `player_role_changed`,
  `connection_status_response`.
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

Feature code should prefer protocol helper methods or focused hooks over raw
`sendMessage` calls. Combat mutations are stricter: use `combat_command`, not
new direct mutation messages.

Protocol sends use the bounded `WS_SEND_TIMEOUT_SECONDS` deadline. A timed-out
peer is handled through normal disconnect cleanup so one slow connection cannot
hold a protocol broadcast indefinitely.

## Adding or changing a message

1. Update the browser message enum when browser code sends or receives it.
2. Update the Python enum when the server receives or sends it.
3. Add or update the client send helper or handler in `clientProtocol.ts`.
4. Add or update the matching server protocol handler.
5. Register the server handler in `ServerProtocol.init_handlers`.
6. Add focused client and server tests.
7. Update this reference if the message family or handler ownership changes.

For combat writes, read [Combat commands](COMBAT_COMMANDS.md) first. New direct
combat mutation messages are usually the wrong boundary.
