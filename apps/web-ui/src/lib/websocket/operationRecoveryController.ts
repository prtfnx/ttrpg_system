import { MessageType, parseMessage, type Message } from './message';
import { isRecoveryType, OperationRecoveryJournal, type RecoveryEntry, type RecoveryScope } from './operationRecovery';

export interface OperationRecoveryStatus {
  pending: number;
  blocked: number;
  error: string | null;
}
type Options = {
  isOpen: () => boolean;
  send: (message: Message) => boolean;
  restore: (message: Message) => void;
  changed: (status: OperationRecoveryStatus) => void;
  storage?: () => Storage;
};

/** Recovery is admitted only after a matching authenticated welcome. */
export class OperationRecoveryController {
  private journal: OperationRecoveryJournal | null = null;
  private enabled = false;
  private verified = false;
  private mayReplay = false;
  private error: string | null = null;
  private readonly attempted = new Set<string>();
  private readonly restored = new Set<string>();
  private readonly sessionCode: string;
  private readonly options: Options;
  private lastWelcome: Record<string, unknown> | null = null;

  constructor(sessionCode: string, options: Options) { this.sessionCode = sessionCode; this.options = options; }

  status(): OperationRecoveryStatus {
    const entries = this.readEntries();
    return { pending: entries.filter(entry => entry.state === 'pending').length,
      blocked: entries.filter(entry => entry.state === 'blocked').length, error: this.error };
  }

  private readEntries(): RecoveryEntry[] {
    try { return this.journal?.entries() ?? []; }
    catch { this.error = 'Saved requests could not be read. Recovery and new high-risk changes are paused.'; return []; }
  }

  private notify(): void { this.options.changed(this.status()); }

  welcome(data: Record<string, unknown>): void {
    this.lastWelcome = { user_id: data.user_id, session_code: data.session_code, role: data.role,
      operation_recovery: data.operation_recovery };
    this.verified = false;
    this.attempted.clear();
    this.restored.clear();
    this.journal = null;
    this.error = null;
    const capability = data.operation_recovery as Record<string, unknown> | null | undefined;
    if (!capability) {
      if (this.enabled) this.error = 'The server no longer advertises receipt recovery. Saved changes remain paused.';
      this.notify(); return;
    }
    this.enabled = true;
    const actorId = data.user_id;
    if (!Number.isSafeInteger(actorId) || Number(actorId) <= 0 || data.session_code !== this.sessionCode
      || capability.contract !== 'session-operations-v1' || typeof capability.session_instance !== 'string'
      || !Array.isArray(capability.domains) || capability.domains.some(domain => typeof domain !== 'string')) {
      this.error = 'Authenticated operation recovery context is unavailable.';
      this.notify(); return;
    }
    const scope: RecoveryScope = { actorId: Number(actorId), sessionCode: this.sessionCode,
      sessionInstance: capability.session_instance, domains: capability.domains };
    try {
      this.journal = new OperationRecoveryJournal(scope, this.options.storage?.() ?? window.sessionStorage);
      this.verified = true;
      this.mayReplay = data.role === 'owner' || data.role === 'co_dm';
      for (const entry of this.journal.entries()) {
        this.restored.add(entry.message.message_id!);
        this.options.restore(entry.message);
      }
    } catch { this.error = 'Saved requests could not be opened. High-risk changes are paused.'; }
    this.notify();
  }

  ready(): boolean { return !this.enabled || this.verified; }
  usesJournal(): boolean { return this.enabled; }
  owns(id: string | undefined): boolean { return Boolean(id && this.readEntries().some(entry => entry.message.message_id === id)); }

  wasRestored(id: string | undefined): boolean { return this.verified && Boolean(id && this.restored.has(id)); }

  admit(message: Message): Message {
    if (message.type === MessageType.BATCH_REQUEST && this.enabled) {
      const batch = parseMessage(JSON.stringify(message));
      const admitted: Message[] = [];
      try {
        for (const member of batch.data?.messages as Message[]) {
          if (member.type === MessageType.BATCH_REQUEST) throw new Error('Recovery requires a flat batch');
          admitted.push(this.admit(member));
        }
      } catch (error) {
        for (const member of admitted) if (isRecoveryType(member.type) && member.message_id) {
          try { this.journal?.block(member.message_id, 'Batch preparation did not complete; review before retrying.'); } catch { /* Evidence remains retained. */ }
        }
        throw error;
      }
      return { ...batch, data: { ...batch.data, messages: admitted } };
    }
    if (!isRecoveryType(message.type) || !this.enabled) return message;
    if (!this.verified || !this.journal || this.error) throw new Error('Saved request recovery is unavailable');
    try {
      const original = this.journal.capture(message);
      this.notify();
      return original;
    } catch {
      this.error = 'This change could not be queued safely. Review saved requests before retrying.';
      this.notify();
      throw new Error(this.error);
    }
  }

  replay(manual = false): void {
    if (manual && !this.options.isOpen()) {
      this.error = 'Reconnect to confirm saved changes.';
      this.notify(); return;
    }
    if (manual && !this.journal && this.lastWelcome?.operation_recovery) this.welcome(this.lastWelcome);
    if (!this.verified || !this.journal || !this.options.isOpen()) return;
    if (!this.mayReplay) {
      if (this.readEntries().length) this.error = 'Current session DM authority is required to retry saved changes.';
      this.notify(); return;
    }
    if (manual) { this.attempted.clear(); this.error = null; }
    const entries = this.readEntries();
    if (this.error) { this.notify(); return; }
    for (const entry of entries) {
      if (!this.verified || !this.options.isOpen()) break;
      if (entry.state === 'blocked' && !manual) continue;
      const id = entry.message.message_id!;
      if (this.attempted.has(id)) continue;
      this.attempted.add(id);
      this.options.send(entry.message);
    }
    this.notify();
  }

  outcome(message: Message): boolean {
    if (!this.verified || !this.journal) return false;
    const id = message.causation_id ?? message.correlation_id;
    const entry = id ? this.readEntries().find(item => item.message.message_id === id) : undefined;
    if (!entry) return false;
    const data = message.data ?? {};
    const original = entry.message;
    const accepted = data.operation_id === id && (
      original.type === MessageType.NEW_TABLE_REQUEST && message.type === MessageType.NEW_TABLE_RESPONSE && data.success === true
      || original.type === MessageType.TABLE_DELETE && message.type === MessageType.SUCCESS && data.operation === 'delete'
        && data.table_id === original.data?.table_id && data.success === true
      || original.type === MessageType.TABLE_SETTINGS_UPDATE && message.type === MessageType.TABLE_SETTINGS_CHANGED
        && data.table_id === original.data?.table_id && data.success === true
      || original.type === MessageType.XP_AWARD && message.type === MessageType.XP_AWARD_RESPONSE
        && data.character_id === original.data?.character_id && data.success === true
    );
    try {
      if (accepted) this.journal.complete(id!);
      else if (message.type === MessageType.ERROR || message.type === MessageType.XP_AWARD_RESPONSE && data.success === false) {
        if (data.outcome !== 'unknown') this.journal.block(id!, String(data.error ?? 'Saved change needs review'));
      }
    } catch { this.error = 'A saved outcome could not be cleared. Its original request is retained for review.'; }
    this.notify();
    return accepted && this.restored.has(id!);
  }

  connectionLost(): void {
    this.verified = false;
    this.attempted.clear();
  }

  discard(): boolean {
    if (!this.journal) return false;
    try { this.journal.discardAll(); this.error = null; }
    catch { this.error = 'Saved requests could not be discarded.'; }
    this.notify();
    return this.error === null;
  }
}
