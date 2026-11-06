import { MessageType, parseMessage, type Message } from './message';

export const RECOVERY_DOMAINS = {
  [MessageType.NEW_TABLE_REQUEST]: 'table_create',
  [MessageType.TABLE_DELETE]: 'table_delete',
  [MessageType.TABLE_SETTINGS_UPDATE]: 'table_settings',
  [MessageType.XP_AWARD]: 'xp_award',
  [MessageType.CHARACTER_UPDATE]: 'character_update',
  [MessageType.MULTICLASS_REQUEST]: 'character_multiclass',
  [MessageType.ENCOUNTER_START]: 'choice_encounter',
  [MessageType.ENCOUNTER_END]: 'choice_encounter',
  [MessageType.ENCOUNTER_CHOICE]: 'choice_encounter',
  [MessageType.ENCOUNTER_ROLL]: 'choice_encounter',
} as const;
export const V1_RECOVERY_DOMAINS = ['table_create', 'table_delete', 'table_settings', 'xp_award'] as const;
export const V2_RECOVERY_DOMAINS = [...V1_RECOVERY_DOMAINS, 'character_update', 'choice_encounter', 'character_multiclass'] as const;
export type RecoveryType = keyof typeof RECOVERY_DOMAINS;
export function isRecoveryType(type: MessageType): type is RecoveryType { return type in RECOVERY_DOMAINS; }

export interface RecoveryScope {
  sessionCode: string;
  actorId: number;
  sessionInstance: string;
  domains: readonly string[];
}
export interface RecoveryEntry {
  message: Message;
  order: number;
  state: 'pending' | 'blocked';
  error?: string;
}
interface StoredEntry {
  format: 1;
  wire: string;
  order: number;
  state: 'pending' | 'blocked';
  error?: string;
}
const MAX_ENTRIES = 64;
const MAX_BYTES = 512 * 1024;
const encoder = new TextEncoder();

function canonical(value: unknown, depth = 0): string {
  if (depth > 64) throw new Error('Saved request nesting exceeds the recovery limit');
  if (Array.isArray(value)) return `[${value.map(item => canonical(item, depth + 1)).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key], depth + 1)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Synchronous write-before-send journal. Each request owns its storage key. */
export class OperationRecoveryJournal {
  private readonly prefix: string;
  readonly scope: RecoveryScope;
  private readonly storage: Storage;
  constructor(scope: RecoveryScope, storage: Storage = window.sessionStorage) {
    this.scope = scope;
    this.storage = storage;
    if (!Number.isSafeInteger(scope.actorId) || scope.actorId <= 0 || !scope.sessionCode || !scope.sessionInstance) {
      throw new Error('Authenticated recovery scope is required');
    }
    this.prefix = `ttrpg:operation-recovery:v1:${encodeURIComponent(JSON.stringify([
      scope.sessionCode, scope.actorId, scope.sessionInstance,
    ]))}:`;
  }

  supports(type: MessageType): type is RecoveryType {
    return isRecoveryType(type) && this.scope.domains.includes(RECOVERY_DOMAINS[type]);
  }

  private key(id: string): string { return `${this.prefix}${encodeURIComponent(id)}`; }

  private keys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(this.prefix)) keys.push(key);
    }
    return keys;
  }

  private read(key: string, raw: string): RecoveryEntry {
    if (encoder.encode(raw).length > MAX_BYTES) throw new Error('Saved recovery data exceeds its limit');
    const record = JSON.parse(raw) as StoredEntry;
    if (!record || record.format !== 1 || typeof record.wire !== 'string'
      || !Number.isSafeInteger(record.order) || record.order < 1
      || !['pending', 'blocked'].includes(record.state)
      || (record.error !== undefined && (typeof record.error !== 'string' || record.error.length > 200))
      || Object.keys(record).some(name => !['format', 'wire', 'order', 'state', 'error'].includes(name))) {
      throw new Error('Saved recovery data is invalid');
    }
    if (encoder.encode(record.wire).length > 64 * 1024) throw new Error('Saved request exceeds the wire limit');
    const message = parseMessage(record.wire);
    if (!isRecoveryType(message.type) || !message.message_id || key !== this.key(message.message_id)) {
      throw new Error('Saved request identity is invalid');
    }
    return { message, order: record.order, state: record.state, ...(record.error ? { error: record.error } : {}) };
  }

  entries(): RecoveryEntry[] {
    const keys = this.keys();
    if (keys.length > MAX_ENTRIES) throw new Error('Too many saved requests');
    let bytes = 0;
    const entries = keys.map(key => {
      const raw = this.storage.getItem(key);
      if (raw === null) throw new Error('Saved request changed during recovery');
      bytes += encoder.encode(raw).length;
      if (bytes > MAX_BYTES) throw new Error('Saved recovery data exceeds its limit');
      return this.read(key, raw);
    });
    return entries.sort((a, b) => a.order - b.order || a.message.message_id!.localeCompare(b.message.message_id!));
  }

  capture(message: Message): Message {
    if (!this.supports(message.type)) throw new Error('Server does not advertise this recovery domain');
    const wire = JSON.stringify(message);
    const parsed = parseMessage(wire);
    const entries = this.entries();
    const existing = entries.find(entry => entry.message.message_id === parsed.message_id);
    if (existing) {
      if (canonical([existing.message.type, existing.message.data]) !== canonical([parsed.type, parsed.data])) {
        throw new Error('Saved request identity already belongs to different input');
      }
      return existing.message;
    }
    const order = Math.max(0, ...entries.map(entry => entry.order)) + 1;
    const record: StoredEntry = { format: 1, wire, order, state: 'pending' };
    const raw = JSON.stringify(record);
    if (entries.length >= MAX_ENTRIES || !Number.isSafeInteger(order)) throw new Error('Saved request queue is full');
    const used = this.keys().reduce((sum, key) => sum + encoder.encode(this.storage.getItem(key) ?? '').length, 0);
    if (used + encoder.encode(raw).length > MAX_BYTES) throw new Error('Saved request storage is full');
    this.read(this.key(parsed.message_id!), raw);
    this.storage.setItem(this.key(parsed.message_id!), raw);
    if (this.storage.getItem(this.key(parsed.message_id!)) !== raw) throw new Error('Saved request could not be verified');
    return parsed;
  }

  block(id: string, error: string): void {
    const key = this.key(id);
    const raw = this.storage.getItem(key);
    if (raw === null) return;
    this.read(key, raw);
    this.storage.setItem(key, JSON.stringify({ ...JSON.parse(raw), state: 'blocked', error: error.slice(0, 200) }));
  }

  complete(id: string): void { this.storage.removeItem(this.key(id)); }

  discardAll(): void {
    for (const key of this.keys()) this.storage.removeItem(key);
  }
}
