import type { WallData } from '@/store';
import { MessageType, type Message } from './message';

/** Replays wall edits over confirmed rows, including relative door toggles. */
export class WallCommandSync {
  private baseline = new Map<string, WallData | null>();
  private pending = new Map<string, { id: string; tableId: string; creating: boolean; apply: (row: WallData | null) => WallData | null }>();
  private readonly port: { read(): readonly WallData[]; active(): string | null; render(id: string, row: WallData | null): void };
  constructor(port: WallCommandSync['port']) { this.port = port; }

  seed(): void { this.baseline = new Map(this.port.read().map(row => [row.wall_id, structuredClone(row)])); }

  stage(message: Message): boolean {
    const data = message.data;
    if (!message.message_id || data?.table_id !== this.port.active()) return false;
    let id = typeof data.wall_id === 'string' ? data.wall_id : '';
    let apply: (row: WallData | null) => WallData | null;
    if (message.type === MessageType.WALL_CREATE) {
      id = message.message_id;
      const row = { wall_id: id, table_id: String(data.table_id), wall_type: 'normal', blocks_movement: true,
        blocks_light: true, blocks_sight: true, blocks_sound: false, is_door: false, door_state: 'closed',
        is_secret: false, direction: 'both', ...(data.wall_data as object) } as WallData;
      apply = () => row;
      this.baseline.set(id, null);
    } else {
      if (!id) return false;
      if (!this.baseline.has(id)) this.baseline.set(id, structuredClone(this.port.read().find(row => row.wall_id === id) ?? null));
      if (!this.baseline.get(id) && ![...this.pending.values()].some(command => command.id === id && command.creating)) return false;
      if (message.type === MessageType.WALL_REMOVE) apply = () => null;
      else if (message.type === MessageType.WALL_UPDATE) apply = row => row ? { ...row, ...(data.updates as object) } : null;
      else if (message.type === MessageType.DOOR_TOGGLE) apply = row => row ? { ...row, door_state: row.door_state === 'open' ? 'closed' : 'open' } : null;
      else return false;
    }
    this.pending.set(message.message_id, { id, tableId: String(data.table_id), creating: message.type === MessageType.WALL_CREATE, apply });
    this.render(id);
    return true;
  }

  reject(requestId: string): boolean {
    const command = this.pending.get(requestId);
    if (!command) return false;
    this.pending.delete(requestId);
    this.render(command.id);
    return true;
  }

  accept(message: Message): boolean {
    const data = message.data;
    if (!data || data.table_id !== this.port.active()) return false;
    const key = message.causation_id ?? message.correlation_id;
    const command = key ? this.pending.get(key) : undefined;
    const row = data.wall as WallData | undefined;
    if (command && key) {
      this.pending.delete(key);
      if (command.creating && row?.wall_id) {
        for (const pending of this.pending.values()) if (pending.id === command.id) pending.id = row.wall_id;
        this.baseline.delete(command.id);
        this.port.render(command.id, null);
      } else this.render(command.id);
    }
    const id = row?.wall_id ?? data.wall_id;
    if (typeof id !== 'string') return false;
    this.baseline.set(id, data.operation === 'remove' ? null : { ...this.baseline.get(id), ...row } as WallData);
    this.render(id);
    return true;
  }

  resolveSnapshot(ids: readonly string[]): void {
    for (const id of ids) this.pending.delete(id);
    this.seed();
    for (const command of this.pending.values()) this.render(command.id);
  }

  dispose(): void { this.pending.clear(); this.baseline.clear(); }

  private render(id: string): void {
    let row = this.baseline.get(id) ?? null;
    for (const command of this.pending.values()) if (command.id === id && command.tableId === this.port.active()) row = command.apply(row);
    if (row && row.table_id !== this.port.active()) return;
    this.port.render(id, row);
  }
}
