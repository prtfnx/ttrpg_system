import { createMessage, MessageType, type Message } from './message';

type Settings = Record<string, unknown>;
interface Scope {
  baseline: Settings;
  pending: Map<string, Message>;
  draft: Message | null;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Only unsent settings are merged. A dependent command flushes this barrier. */
export class TableSettingsBuffer {
  private readonly scopes = new Map<string, Scope>();
  private readonly options: {
    read: (tableId: string) => Settings;
    apply: (tableId: string, settings: Settings) => void;
    send: (message: Message) => boolean;
    connected: () => boolean;
  };
  constructor(options: TableSettingsBuffer['options']) { this.options = options; }

  seed(tableId: string, settings: Settings): void {
    this.scope(tableId).baseline = { ...settings };
  }

  stage(tableId: string, patch: Settings): boolean {
    const scope = this.scope(tableId);
    if (!this.options.connected()) {
      this.apply(tableId, scope);
      return false;
    }
    if (!scope.draft) {
      if (scope.pending.size >= 64) return false;
      scope.draft = createMessage(MessageType.TABLE_SETTINGS_UPDATE, { table_id: tableId }, 2);
      scope.startedAt = Date.now();
      scope.pending.set(scope.draft.message_id!, scope.draft);
    }
    scope.draft.data = { ...scope.draft.data, ...patch };
    if (scope.timer) clearTimeout(scope.timer);
    scope.timer = setTimeout(() => this.flush(tableId), Math.max(0, Math.min(150, 500 - (Date.now() - scope.startedAt))));
    this.apply(tableId, scope);
    return true;
  }

  flush(tableId?: string): void {
    for (const [id, scope] of this.scopes) {
      if (tableId && id !== tableId) continue;
      if (scope.timer) clearTimeout(scope.timer);
      scope.timer = null;
      const message = scope.draft;
      scope.draft = null;
      if (message && !this.options.send(message)) {
        scope.pending.delete(message.message_id!);
        this.apply(id, scope);
      }
    }
  }

  accept(message: Message): void {
    const tableId = message.data?.table_id;
    if (typeof tableId !== 'string') return;
    const scope = this.scope(tableId);
    const id = message.causation_id ?? message.correlation_id;
    if (id) scope.pending.delete(id);
    scope.baseline = { ...scope.baseline, ...message.data };
    this.apply(tableId, scope);
  }

  reject(message: Message): boolean {
    const id = message.causation_id ?? message.correlation_id;
    if (!id) return false;
    for (const [tableId, scope] of this.scopes) {
      if (scope.pending.delete(id)) {
        this.apply(tableId, scope);
        return true;
      }
    }
    return false;
  }

  reapply(tableId: string): void {
    const scope = this.scopes.get(tableId);
    if (scope) this.apply(tableId, scope);
  }

  resolveSnapshot(ids: readonly string[]): void {
    for (const scope of this.scopes.values()) for (const id of ids) scope.pending.delete(id);
  }

  dispose(): void {
    for (const scope of this.scopes.values()) if (scope.timer) clearTimeout(scope.timer);
    this.scopes.clear();
  }

  private scope(tableId: string): Scope {
    let scope = this.scopes.get(tableId);
    if (!scope) {
      scope = { baseline: this.options.read(tableId), pending: new Map(), draft: null, startedAt: 0, timer: null };
      this.scopes.set(tableId, scope);
    }
    return scope;
  }

  private apply(tableId: string, scope: Scope): void {
    const visible = { ...scope.baseline };
    for (const message of scope.pending.values()) Object.assign(visible, message.data);
    this.options.apply(tableId, visible);
  }
}
