import { MessageType, type Message } from './message';

export const PREVIEW_MESSAGES = new Set<MessageType>([
  MessageType.SPRITE_DRAG_PREVIEW, MessageType.SPRITE_RESIZE_PREVIEW, MessageType.SPRITE_ROTATE_PREVIEW,
  MessageType.PAINT_PREVIEW, MessageType.PAINT_PREVIEW_CANCEL,
]);

// Matches the server mutation boundary. Queries/control/response messages do
// not enter the acknowledgement ledger, and disposable previews never retry.
export const MUTATION_MESSAGES = new Set<MessageType>([
  MessageType.CANVAS_COMMAND, MessageType.NEW_TABLE_REQUEST, MessageType.TABLE_UPDATE_REQUEST,
  MessageType.TABLE_SCALE, MessageType.TABLE_MOVE, MessageType.TABLE_DELETE, MessageType.TABLE_ACTIVE_SET,
  MessageType.TABLE_ACTIVE_SET_ALL, MessageType.TABLE_SETTINGS_UPDATE, MessageType.PLAYER_READY,
  MessageType.PLAYER_UNREADY, MessageType.PLAYER_KICK_REQUEST, MessageType.PLAYER_BAN_REQUEST,
  MessageType.SPRITE_CREATE, MessageType.SPRITE_REMOVE, MessageType.SPRITE_MOVE, MessageType.SPRITE_SCALE,
  MessageType.SPRITE_ROTATE, MessageType.SPRITE_UPDATE, MessageType.ASSET_UPLOAD_REQUEST,
  MessageType.ASSET_UPLOAD_CONFIRM, MessageType.ASSET_DELETE_REQUEST, MessageType.COMPENDIUM_SPRITE_ADD,
  MessageType.COMPENDIUM_SPRITE_UPDATE, MessageType.COMPENDIUM_SPRITE_REMOVE, MessageType.CHARACTER_SAVE_REQUEST,
  MessageType.CHARACTER_DELETE_REQUEST, MessageType.CHARACTER_UPDATE, MessageType.CHARACTER_ROLL,
  MessageType.CHARACTER_DRAFT_CREATE_REQUEST, MessageType.CHARACTER_DRAFT_UPDATE_REQUEST,
  MessageType.CHARACTER_DRAFT_FINALIZE_REQUEST, MessageType.CHARACTER_DRAFT_ABANDON_REQUEST,
  MessageType.XP_AWARD, MessageType.MULTICLASS_REQUEST, MessageType.WALL_CREATE, MessageType.WALL_UPDATE,
  MessageType.WALL_REMOVE, MessageType.DOOR_TOGGLE, MessageType.PAINT_OBJECT_CREATE,
  MessageType.PAINT_OBJECT_UPDATE, MessageType.PAINT_OBJECT_DELETE, MessageType.MEASUREMENT_UPSERT,
  MessageType.MEASUREMENT_DELETE, MessageType.MEASUREMENT_CLEAR, MessageType.LAYER_SETTINGS_UPDATE,
  MessageType.GAME_MODE_CHANGE, MessageType.SESSION_RULES_UPDATE, MessageType.COMBAT_COMMAND,
  MessageType.ENCOUNTER_START, MessageType.ENCOUNTER_END, MessageType.ENCOUNTER_CHOICE,
  MessageType.ENCOUNTER_ROLL, MessageType.CHAT, MessageType.CHAT_MODERATE,
]);

export class CommandTracking {
  private readonly pending = new Map<string, { message: Message; tableId: string | null;
    timer: ReturnType<typeof setTimeout> }>();

  track(message: Message, tableId: string | null, uncertain: (tableId: string) => void): boolean {
    if (!MUTATION_MESSAGES.has(message.type) || !message.message_id || this.pending.has(message.message_id)) return true;
    if (this.pending.size >= 256) {
      if (tableId) uncertain(tableId);
      return false;
    }
    const timer = setTimeout(() => {
      if (tableId) uncertain(tableId);
      else this.pending.delete(message.message_id!);
    }, 10_000);
    this.pending.set(message.message_id, { message, tableId, timer });
    return true;
  }

  settle(response: Message): Message | undefined {
    const id = response.causation_id ?? response.correlation_id;
    let key = id && this.pending.has(id) ? id : undefined;
    // Standalone paint events carry the domain operation identity.
    const operationId = response.data?.operation_id;
    if (!key && typeof operationId === 'string') {
      key = [...this.pending].find(([, item]) => item.message.data?.operation_id === operationId)?.[0];
    }
    if (!key) return;
    const pending = this.pending.get(key)!;
    clearTimeout(pending.timer);
    this.pending.delete(key);
    return pending.message;
  }

  watermark(tableId: string): string[] {
    return [...this.pending].filter(([, item]) => item.tableId === tableId).map(([id]) => id);
  }
  has(id: string): boolean { return this.pending.has(id); }

  hasSprite(tableId: string, spriteId: string): boolean {
    return [...this.pending.values()].some(item => item.tableId === tableId
      && (item.message.data?.sprite_id === spriteId
        || (item.message.data?.sprite_data as { sprite_id?: unknown } | undefined)?.sprite_id === spriteId));
  }

  resolveSnapshot(ids: readonly string[]): void {
    for (const id of ids) {
      const item = this.pending.get(id);
      if (item) clearTimeout(item.timer);
      this.pending.delete(id);
    }
  }

  dispose(): void { this.resolveSnapshot([...this.pending.keys()]); }
}
