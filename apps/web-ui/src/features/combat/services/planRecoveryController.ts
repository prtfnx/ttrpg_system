import { isDM, canInteract } from '@features/session/types/roles';
import { createMessage, MessageType, type Message } from '@lib/websocket/message';
import type { CombatCommandBatch } from '../hooks/useCombatCommands';
import type { CombatStateView } from '../stores/combatStore';
import { usePlanningStore, type PlanRecoveryStatus } from '../stores/planningStore';
import { PlanRecoveryJournal, type PlanBinding, type PlanScope, type SavedPlan } from './planRecoveryJournal';

let nextOwner = 0;
function current(combat: CombatStateView | null) {
  const active = combat?.combatants.filter(actor => !actor.is_defeated) ?? [];
  return combat && combat.current_turn_index >= 0 && active.length ? active[combat.current_turn_index % active.length] : null;
}
/** Owns one authenticated tab/session plan. Restoration never submits intent. */
export class PlanRecoveryController {
  private readonly owner = `plan-recovery-${++nextOwner}`;
  private journal: PlanRecoveryJournal | null = null;
  private scope: PlanScope | null = null;
  private role: Parameters<typeof isDM>[0] = null;
  private combat: CombatStateView | null = null;
  private record: SavedPlan | null = null;
  private probe: Message | null = null;
  private probeTimer?: ReturnType<typeof setTimeout>;
  private unsubscribe?: () => void;
  private muted = false;
  private readable = true;
  private recovering = false;
  private awaitingRetry = false;
  private readonly sessionCode: string;
  private readonly send: (message: Message) => boolean;
  private readonly storage: () => Storage;
  constructor(sessionCode: string, send: (message: Message) => boolean, storage: () => Storage = () => window.sessionStorage) {
    this.sessionCode = sessionCode; this.send = send; this.storage = storage;
  }

  private owns() { return usePlanningStore.getState().recoveryOwner === this.owner; }
  private update(patch: Partial<ReturnType<typeof usePlanningStore.getState>>) {
    this.muted = true;
    try { usePlanningStore.setState(patch); } finally { this.muted = false; }
  }
  private status(phase: PlanRecoveryStatus, message: string | null = null) {
    this.update({ recoveryStatus: phase, recoveryError: message, ...(phase ? { isPlanningMode: false } : {}) });
  }
  clearContext() {
    this.unsubscribe?.(); this.unsubscribe = undefined;
    clearTimeout(this.probeTimer); this.probeTimer = undefined;
    if (this.owns()) this.update({
      queue: [], pendingSubmission: null, submissionOutcome: null,
      selectedSpriteId: null, isPlanningMode: false, recoveryOwner: null, recoveryStatus: null, recoveryError: null
    });
    this.journal = null; this.scope = null; this.record = null; this.probe = null; this.combat = null;
    this.recovering = false; this.awaitingRetry = false; this.readable = true;
  }
  welcome(data: Record<string, unknown>) {
    this.clearContext();
    const capability = data.operation_recovery as { session_instance?: unknown } | undefined;
    const user = data.user_id, instance = capability?.session_instance;
    if (data.session_code !== this.sessionCode || !Number.isSafeInteger(user) || Number(user) <= 0) return;
    this.update({
      queue: [], pendingSubmission: null, submissionOutcome: null, selectedSpriteId: null,
      isPlanningMode: false, recoveryOwner: this.owner, recoveryStatus: null, recoveryError: null
    });
    if (!Number.isSafeInteger(user) || Number(user) <= 0 || typeof instance !== 'string' || !instance
      || typeof data.role !== 'string' || !canInteract(data.role as Parameters<typeof canInteract>[0])) return;
    this.scope = { sessionCode: this.sessionCode, userId: Number(user), sessionInstance: instance };
    this.role = data.role as Parameters<typeof isDM>[0];
    try { this.journal = new PlanRecoveryJournal(this.scope, this.storage()); this.load(); }
    catch { this.readable = false; this.status('blocked', 'Saved plan storage could not be opened. Planning is paused.'); }
    this.unsubscribe = usePlanningStore.subscribe((state, previous) => {
      if (!this.muted && this.owns() && (state.queue !== previous.queue || state.pendingSubmission !== previous.pendingSubmission
        || state.selectedSpriteId !== previous.selectedSpriteId)) this.persist();
    });
    if (this.record?.pending) this.query();
    else this.send(createMessage(MessageType.COMBAT_STATE_REQUEST, {}));
  }
  private load() {
    this.record = this.journal!.read(); this.readable = true;
    if (!this.record) return;
    this.recovering = Boolean(this.record.pending);
    this.update({
      queue: this.record.queue, selectedSpriteId: this.record.selectedSpriteId,
      pendingSubmission: this.record.pending, isPlanningMode: false, submissionOutcome: null
    });
    this.status('checking', this.record.pending ? 'Checking the previous submission with the server.' : 'Checking the saved plan context.');
  }
  private compatible(): boolean {
    if (!this.record || !this.combat || !this.scope) return false;
    const actor = current(this.combat), binding = this.record.binding;
    return binding.combatId === this.combat.combat_id && binding.tableId === this.combat.table_id
      && binding.round === this.combat.round_number && binding.actorId === actor?.combatant_id
      && actor.entity_id === this.record.selectedSpriteId
      && (isDM(this.role) || actor.controlled_by?.includes(String(this.scope.userId)) === true);
  }
  observe(combat: CombatStateView | null): boolean {
    if (!this.scope) return usePlanningStore.getState().recoveryOwner === null || this.owns();
    if (!this.owns()) return false;
    this.combat = combat;
    if (this.recovering) { if (!this.probe && !this.awaitingRetry) this.query(); return true; }
    if (usePlanningStore.getState().recoveryStatus === 'blocked') return true;
    if (this.record && !this.compatible()) this.status('stale', 'The saved plan belongs to a different encounter or turn. Discard it before planning again.');
    else if (this.record && usePlanningStore.getState().recoveryStatus) this.status('review', 'Saved plan restored. Review it before committing.');
    return true;
  }
  private persist(): boolean {
    if (!this.journal || !this.owns() || !this.readable) return false;
    const state = usePlanningStore.getState();
    try {
      if (!state.pendingSubmission) {
        clearTimeout(this.probeTimer); this.probeTimer = undefined;
      }
      if (!state.queue.length && !state.pendingSubmission) {
        this.journal.clear(); this.record = null; this.recovering = false; this.awaitingRetry = false; this.probe = null; this.status(null); return true;
      }
      if (!this.record) {
        const actor = current(this.combat);
        if (!this.combat || !actor) throw new Error('No authenticated encounter context');
        const binding: PlanBinding = {
          combatId: this.combat.combat_id, tableId: this.combat.table_id,
          actorId: actor.combatant_id, round: this.combat.round_number
        };
        this.record = { format: 1, binding, selectedSpriteId: state.selectedSpriteId ?? actor.entity_id, queue: [], pending: null };
      }
      const pending = state.pendingSubmission;
      const record: SavedPlan = {
        ...this.record, queue: state.queue,
        selectedSpriteId: state.selectedSpriteId ?? this.record.selectedSpriteId,
        pending: pending ? { sequenceId: pending.sequenceId, actionIds: pending.actionIds, payload: pending.payload! } : null
      };
      const acknowledgedDuringRecovery = this.recovering && !pending && this.record.pending
        && state.submissionOutcome?.sequenceId === this.record.pending.sequenceId;
      this.journal.write(record); this.record = record;
      if (acknowledgedDuringRecovery) {
        clearTimeout(this.probeTimer); this.probeTimer = undefined;
        this.recovering = false; this.awaitingRetry = false; this.probe = null;
        this.status(this.compatible() ? 'review' : 'stale', 'Submission checked. Review the remaining plan before committing.');
      } else if (!pending && !this.compatible()) {
        this.status('stale', 'The saved plan belongs to a different encounter or turn. Discard it before planning again.');
      }
      return true;
    } catch { this.status('blocked', 'This plan could not be saved safely. Check storage before submitting.'); return false; }
  }
  admit(payload: CombatCommandBatch): boolean {
    if (!this.scope) return usePlanningStore.getState().recoveryOwner === null || this.owns();
    if (!this.owns() || usePlanningStore.getState().recoveryStatus || !this.combat) return false;
    const pending = usePlanningStore.getState().pendingSubmission;
    if (!pending || pending.sequenceId !== payload.sequence_id || JSON.stringify(pending.payload) !== JSON.stringify(payload)
      || payload.combat_id !== this.combat.combat_id || payload.expected_state_version !== this.combat.state_version
      || !this.compatible()) return false;
    if (!this.persist()) return false;
    this.watchSubmission(pending.sequenceId);
    return true;
  }
  private watchSubmission(sequenceId: number) {
    clearTimeout(this.probeTimer);
    this.probeTimer = setTimeout(() => {
      if (this.owns() && usePlanningStore.getState().pendingSubmission?.sequenceId === sequenceId) {
        this.recovering = true; this.awaitingRetry = false;
        this.status('blocked', 'The server has not confirmed the saved step. Checking its receipt before another submission.');
        this.query();
      }
    }, 10_000);
  }
  connectionLost() {
    if (!this.owns()) return;
    clearTimeout(this.probeTimer); this.probeTimer = undefined;
    this.probe = null;
    if (usePlanningStore.getState().pendingSubmission) {
      this.recovering = true;
      this.status('checking', 'Connection interrupted. The previous submission must be checked before retrying.');
    } else if (this.record) this.status('review', 'Connection interrupted. Review the saved plan after reconnecting.');
  }
  private query() {
    const pending = usePlanningStore.getState().pendingSubmission;
    if (!this.record || !pending || !this.owns()) return;
    const request = createMessage(MessageType.COMBAT_STATE_REQUEST, {
      receipt_probe: {
        combat_id: this.record.binding.combatId, sequence_id: pending.sequenceId,
      }
    });
    clearTimeout(this.probeTimer);
    this.probe = request;
    if (!this.send(request)) { this.probe = null; return; }
    this.probeTimer = setTimeout(() => {
      if (this.owns() && this.probe === request) {
        this.probe = null;
        this.status('blocked', 'The server has not confirmed the previous submission. Check again before retrying.');
      }
    }, 10_000);
  }
  receipt(message: Message) {
    const receipt = message.data?.receipt as { combat_id?: unknown; sequence_id?: unknown; status?: unknown; current_state_version?: unknown; encounter_ended?: unknown } | undefined;
    const pending = usePlanningStore.getState().pendingSubmission;
    if (!this.owns() || !this.probe || (message.causation_id ?? message.correlation_id) !== this.probe.message_id || !pending) return;
    clearTimeout(this.probeTimer); this.probeTimer = undefined;
    this.probe = null;
    if (!receipt || receipt.combat_id !== this.record?.binding.combatId || receipt.sequence_id !== pending.sequenceId
      || !['accepted', 'absent'].includes(String(receipt.status))) {
      this.status('blocked', 'The server could not confirm the previous submission. Check again before retrying.'); return;
    }
    const expectedVersion = pending.payload?.expected_state_version;
    if (receipt.status === 'absent' && receipt.encounter_ended !== true
      && !(typeof receipt.current_state_version === 'number' && typeof expectedVersion === 'number'
        && receipt.current_state_version > expectedVersion)) {
      this.awaitingRetry = false;
      this.status('retry', 'No acceptance is recorded yet. Retry the original step with its saved identity, or check again.');
      return;
    }
    this.recovering = false; this.awaitingRetry = false;
    this.muted = true;
    try { usePlanningStore.getState().finishSubmission(pending.sequenceId, receipt.status === 'accepted'); }
    finally { this.muted = false; }
    if (!this.persist()) return;
    if (this.record) this.status(this.compatible() ? 'review' : 'stale', this.compatible()
      ? 'Submission checked. Review the remaining plan before committing.' : 'The saved plan belongs to a different encounter or turn. Discard it before planning again.');
  }
  retry() {
    if (!this.owns() || !this.scope) return;
    if (!this.journal) {
      try { this.journal = new PlanRecoveryJournal(this.scope, this.storage()); }
      catch { this.status('blocked', 'Saved plan storage is still unavailable.'); return; }
    }
    if (!this.readable) {
      try { this.load(); } catch { this.status('blocked', 'Saved plan could not be read. Planning remains paused.'); return; }
    }
    if (usePlanningStore.getState().pendingSubmission) {
      this.recovering = true; this.status('checking', 'Checking the previous submission with the server.'); this.query();
    } else if (this.persist() && this.record) this.status(this.compatible() ? 'review' : 'stale', 'Review the saved plan context.');
  }
  retrySubmission() {
    const state = usePlanningStore.getState(), pending = state.pendingSubmission;
    if (!this.owns() || state.recoveryStatus !== 'retry' || !pending?.payload) return;
    this.recovering = true; this.awaitingRetry = true;
    this.status(null);
    if (this.send(createMessage(MessageType.COMBAT_COMMAND, pending.payload))) {
      this.status('checking', 'Waiting for confirmation of the original saved step.');
      this.watchSubmission(pending.sequenceId);
    } else {
      this.awaitingRetry = false;
      this.status('checking', 'The saved step was not sent. Check its status after reconnecting.');
      this.query();
    }
  }
  retainRejection(data: { sequence_id?: number; details?: { code?: string } }): boolean {
    const pending = usePlanningStore.getState().pendingSubmission;
    if (!this.owns() || !this.recovering || !pending || pending.sequenceId !== data.sequence_id) return false;
    if (['combat_state_conflict', 'combat_encounter_changed'].includes(data.details?.code ?? '')) return false;
    this.awaitingRetry = false;
    this.status('blocked', 'The original step was rejected. Its saved identity is retained until the outcome is checked.');
    this.query();
    return true;
  }
  review() {
    if (!this.owns() || !this.compatible() || usePlanningStore.getState().pendingSubmission) return;
    this.status(null); this.update({ isPlanningMode: true, selectedSpriteId: this.record!.selectedSpriteId });
  }
  discard() {
    if (!this.owns() || !this.readable || usePlanningStore.getState().pendingSubmission) return;
    try {
      this.journal?.clear(); this.record = null;
      this.update({ queue: [], selectedSpriteId: null, isPlanningMode: false, recoveryStatus: null, recoveryError: null });
    } catch { this.status('blocked', 'Saved plan could not be removed. Check storage.'); }
  }
}
