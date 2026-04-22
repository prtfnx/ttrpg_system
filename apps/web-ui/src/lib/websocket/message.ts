/**
 * Message protocol definitions matching Python protocol.py exactly
 * Ensures compatibility with server-side message handling
 */

export const MessageType = {
  // Core messages
  PING: "ping",
  PONG: "pong",
  ERROR: "error",
  TEST: "test",
  SUCCESS: "success",
  WELCOME: "welcome",

  // Authentication messages
  AUTH_REGISTER: "auth_register",
  AUTH_LOGIN: "auth_login",
  AUTH_LOGOUT: "auth_logout",
  AUTH_TOKEN: "auth_token",
  AUTH_STATUS: "auth_status",
  
  // Table sync
  NEW_TABLE_REQUEST: "new_table_request",
  NEW_TABLE_RESPONSE: "new_table_response",
  TABLE_REQUEST: "table_request",
  TABLE_RESPONSE: "table_response",
  TABLE_DATA: "table_data",
  TABLE_UPDATE: "table_update",
  TABLE_SCALE: "table_scale",
  TABLE_MOVE: "table_move",
  TABLE_LIST_REQUEST: "table_list_request",
  TABLE_LIST_RESPONSE: "table_list_response",
  TABLE_DELETE: "table_delete",
  // Active table persistence
  TABLE_ACTIVE_REQUEST: "table_active_request",
  TABLE_ACTIVE_RESPONSE: "table_active_response",
  TABLE_ACTIVE_SET: "table_active_set",
  TABLE_ACTIVE_SET_ALL: "table_active_set_all",
  TABLE_ACTIVE_SET_ALL_RESPONSE: "table_active_set_all_response",
  
  // Player actions
  PLAYER_ACTION: "player_action",
  PLAYER_ACTION_RESPONSE: "player_action_response",
  PLAYER_ACTION_UPDATE: "player_action_update",
  PLAYER_ACTION_REMOVE: "player_action_remove",
  PLAYER_LEFT: "player_left",
  PLAYER_JOINED: "player_joined",
  PLAYER_READY: "player_ready",
  PLAYER_UNREADY: "player_unready",
  PLAYER_STATUS: "player_status",
  PLAYER_LIST_REQUEST: "player_list_request",
  PLAYER_LIST_RESPONSE: "player_list_response",
  PLAYER_KICK_REQUEST: "player_kick_request",
  PLAYER_BAN_REQUEST: "player_ban_request",
  PLAYER_KICK_RESPONSE: "player_kick_response",
  PLAYER_BAN_RESPONSE: "player_ban_response",
  PLAYER_ROLE_CHANGED: "player_role_changed",
  CONNECTION_STATUS_REQUEST: "connection_status_request",
  CONNECTION_STATUS_RESPONSE: "connection_status_response",

  // Sprite sync
  SPRITE_REQUEST: "sprite_request",
  SPRITE_RESPONSE: "sprite_response",
  SPRITE_DATA: "sprite_data",
  SPRITE_UPDATE: "sprite_update",
  SPRITE_REMOVE: "sprite_remove",
  SPRITE_CREATE: "sprite_create",
  SPRITE_MOVE: "sprite_move",
  SPRITE_SCALE: "sprite_scale",
  SPRITE_ROTATE: "sprite_rotate",
  // Live drag previews — broadcast-only, never persisted
  SPRITE_DRAG_PREVIEW: "sprite_drag_preview",
  SPRITE_RESIZE_PREVIEW: "sprite_resize_preview",
  SPRITE_ROTATE_PREVIEW: "sprite_rotate_preview",
  
  // File transfer
  FILE_REQUEST: "file_request",
  FILE_DATA: "file_data",
  
  // R2 Asset Management
  ASSET_UPLOAD_REQUEST: "asset_upload_request",
  ASSET_UPLOAD_RESPONSE: "asset_upload_response",
  ASSET_DOWNLOAD_REQUEST: "asset_download_request",
  ASSET_DOWNLOAD_RESPONSE: "asset_download_response",
  ASSET_LIST_REQUEST: "asset_list_request",
  ASSET_LIST_RESPONSE: "asset_list_response",
  ASSET_UPLOAD_CONFIRM: "asset_upload_confirm",
  ASSET_DELETE_REQUEST: "asset_delete_request",
  ASSET_DELETE_RESPONSE: "asset_delete_response",
  ASSET_HASH_CHECK: "asset_hash_check",

  // Compendium operations
  COMPENDIUM_SPRITE_ADD: "compendium_sprite_add",
  COMPENDIUM_SPRITE_UPDATE: "compendium_sprite_update",
  COMPENDIUM_SPRITE_REMOVE: "compendium_sprite_remove",
  
  // Character management
  CHARACTER_SAVE_REQUEST: "character_save_request",
  CHARACTER_SAVE_RESPONSE: "character_save_response",
  CHARACTER_LOAD_REQUEST: "character_load_request",
  CHARACTER_LOAD_RESPONSE: "character_load_response",
  CHARACTER_LIST_REQUEST: "character_list_request",
  CHARACTER_LIST_RESPONSE: "character_list_response",
  CHARACTER_DELETE_REQUEST: "character_delete_request",
  CHARACTER_DELETE_RESPONSE: "character_delete_response",
  // Character delta updates
  CHARACTER_UPDATE: "character_update",
  CHARACTER_UPDATE_RESPONSE: "character_update_response",
  // Character action log
  CHARACTER_LOG_REQUEST: "character_log_request",
  CHARACTER_LOG_RESPONSE: "character_log_response",
  // Skill/ability/saving-throw rolls
  CHARACTER_ROLL: "character_roll",
  CHARACTER_ROLL_RESULT: "character_roll_result",
  
  // Batch messaging for performance
  BATCH: "batch",
  
  // Dynamic lighting / table settings
  TABLE_SETTINGS_UPDATE: "table_settings_update",
  TABLE_SETTINGS_CHANGED: "table_settings_changed",

  // Wall segments
  WALL_CREATE: "wall_create",
  WALL_UPDATE: "wall_update",
  WALL_REMOVE: "wall_remove",
  WALL_BATCH_CREATE: "wall_batch_create",
  WALL_DATA: "wall_data",
  DOOR_TOGGLE: "door_toggle",

  // Layer settings persistence
  LAYER_SETTINGS_UPDATE: "layer_settings_update",

  // ── Game Mode ──
  GAME_MODE_CHANGE: "game_mode_change",
  GAME_MODE_STATE: "game_mode_state",

  // ── Session Rules ──
  SESSION_RULES_UPDATE: "session_rules_update",
  SESSION_RULES_CHANGED: "session_rules_changed",
  SESSION_RULES_REQUEST: "session_rules_request",

  // ── Planning / Preview ──
  PLAN_START: "plan_start",
  PLAN_ACK: "plan_ack",
  ACTION_COMMIT: "action_commit",
  ACTION_RESULT: "action_result",
  ACTION_REJECTED: "action_rejected",

  // ── State Sync ──
  STATE_SYNC_REQUEST: "state_sync_request",
  STATE_SYNC_RESPONSE: "state_sync_response",

  // ── Combat ──
  COMBAT_START: "combat_start",
  COMBAT_END: "combat_end",
  COMBAT_STATE: "combat_state",
  COMBAT_STATE_REQUEST: "combat_state_request",
  INITIATIVE_ROLL: "initiative_roll",
  INITIATIVE_ROLL_RESULT: "initiative_roll_result",
  INITIATIVE_SET: "initiative_set",
  INITIATIVE_ADD: "initiative_add",
  INITIATIVE_REMOVE: "initiative_remove",
  INITIATIVE_ORDER: "initiative_order",
  TURN_START: "turn_start",
  TURN_END: "turn_end",
  TURN_SKIP: "turn_skip",
  ROUND_START: "round_start",
  ROUND_END: "round_end",
  EXPLORE_SUBMIT: "explore_submit",
  EXPLORE_ROUND_RESOLVE: "explore_round_resolve",
  EXPLORE_ROUND_RESULT: "explore_round_result",

  // ── Conditions ──
  CONDITION_ADD: "condition_add",
  CONDITION_REMOVE: "condition_remove",
  CONDITION_UPDATE: "condition_update",
  CONDITIONS_SYNC: "conditions_sync",

  // ── DM Combat Controls ──
  DM_OVERRIDE: "dm_override",
  DM_SET_HP: "dm_set_hp",
  DM_SET_TEMP_HP: "dm_set_temp_hp",
  DM_SET_RESISTANCES: "dm_set_resistances",
  DM_SET_SURPRISED: "dm_set_surprised",
  DM_APPLY_DAMAGE: "dm_apply_damage",
  DM_ADD_ACTION: "dm_add_action",
  DM_ADD_MOVEMENT: "dm_add_movement",
  DM_REVERT_ACTION: "dm_revert_action",
  DM_TOGGLE_AI: "dm_toggle_ai",

  // ── NPC AI ──
  AI_ACTION: "ai_action",
  AI_SUGGESTION: "ai_suggestion",

  // ── Encounters ──
  ENCOUNTER_START: "encounter_start",
  ENCOUNTER_END: "encounter_end",
  ENCOUNTER_CHOICE: "encounter_choice",
  ENCOUNTER_ROLL: "encounter_roll",
  ENCOUNTER_RESULT: "encounter_result",
  ENCOUNTER_STATE: "encounter_state",

  // ── Death Saves ──
  DEATH_SAVE_ROLL: "death_save_roll",
  DEATH_SAVE_RESULT: "death_save_result",

  // ── Concentration ──
  CONCENTRATION_BROKEN: "concentration_broken",

  // ── Terrain Zones ──
  TERRAIN_ZONE_ADD: "terrain_zone_add",
  TERRAIN_ZONE_REMOVE: "terrain_zone_remove",
  TERRAIN_ZONE_UPDATE: "terrain_zone_update",
  TERRAIN_ZONES_SYNC: "terrain_zones_sync",

  // ── Cover Zones ──
  COVER_ZONE_ADD: "cover_zone_add",
  COVER_ZONE_REMOVE: "cover_zone_remove",
  COVER_ZONE_UPDATE: "cover_zone_update",
  COVER_ZONES_SYNC: "cover_zones_sync",

  // ── Opportunity Attacks ──
  OPPORTUNITY_ATTACK_WARNING: "opportunity_attack_warning",
  OPPORTUNITY_ATTACK_CONFIRM_MOVE: "opportunity_attack_confirm_move",
  OPPORTUNITY_ATTACK_PROMPT: "opportunity_attack_prompt",
  OPPORTUNITY_ATTACK_RESOLVE: "opportunity_attack_resolve",

  // ── Attack Preview ──
  ATTACK_PREVIEW: "attack_preview",
  ATTACK_PREVIEW_RESULT: "attack_preview_result",

  // ── Surprised / Turn Skipped ──
  TURN_SKIPPED: "turn_skipped",

  // Extension point for new message types
  CUSTOM: "custom"
} as const;

export type MessageType = typeof MessageType[keyof typeof MessageType];

export interface Message {
  type: MessageType;
  data?: Record<string, unknown>;
  client_id?: string;
  timestamp?: number;
  version: string;
  priority: number;
  sequence_id?: number;
}

export type MessageHandler = (message: Message) => Promise<void> | void;

/**
 * Create a standardized message with proper formatting
 */
export function createMessage(
  type: MessageType,
  data?: Record<string, unknown>,
  priority: number = 5
): Message {
  return {
    type,
    data: data || {},
    timestamp: Date.now() / 1000,
    version: "0.1",
    priority,
  };
}

/**
 * Parse incoming JSON message to Message interface
 */
export function parseMessage(jsonStr: string): Message {
  const data = JSON.parse(jsonStr);
  // Validate message structure
  if (!data || typeof data.type !== 'string') {
    throw new Error('Invalid message: missing or invalid "type" field');
  }
  return {
    type: data.type as MessageType,
    data: data.data || {},
    client_id: data.client_id,
    timestamp: data.timestamp,
    version: data.version || "0.1",
    priority: data.priority || 5,
    sequence_id: data.sequence_id
  };
}
