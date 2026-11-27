import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType, type Message } from '@lib/websocket/message';
import { createCombatMessage } from '@lib/websocket/combatMessages';
import type { CombatReceiptWire } from '@lib/websocket/combat.generated';
import type { CombatStateView } from '../../stores/combatStore';
import type { CombatCommandBatch } from '../../hooks/useCombatCommands';
import { usePlanningStore } from '../../stores/planningStore';
import { PlanRecoveryController } from '../planRecoveryController';
import { PlanRecoveryJournal, type SavedPlan } from '../planRecoveryJournal';

const scope = { sessionCode: 'ROOM', userId: 1, sessionInstance: 'session:created' };
const welcome = { session_code: 'ROOM', user_id: 1, role: 'player', operation_recovery: { session_instance: scope.sessionInstance } };
const combat = {
  state_version: 1, combat_id: 'combat', table_id: 'table', round_number: 1, current_turn_index: 0,
  combatants: [{ combatant_id: 'actor', entity_id: 'sprite', controlled_by: ['1'], is_npc: false, is_defeated: false }]
} as unknown as CombatStateView;
const action = { id: 'a', action_type: 'dodge' as const, label: 'Dodge', sequence_index: 0 };
const payload = { combat_id: 'combat', sequence_id: 42, expected_state_version: 1, commands: [{ type: 'dodge', actor_id: 'actor' }] } satisfies CombatCommandBatch;
function saved(pending = false): SavedPlan {
  return {
    format: 1, binding: { combatId: 'combat', tableId: 'table', actorId: 'actor', round: 1 },
    selectedSpriteId: 'sprite', queue: [action], pending: pending ? { sequenceId: 42, actionIds: ['a'], payload } : null
  };
}
const controllers: PlanRecoveryController[] = [];
function controller() {
  const send = vi.fn((_message: Message) => true);
  const result = new PlanRecoveryController('ROOM', send);
  controllers.push(result); result.welcome(welcome);
  return { controller: result, send };
}
beforeEach(() => {
  sessionStorage.clear(); usePlanningStore.setState({
    queue: [], selectedSpriteId: null, isPlanningMode: false,
    pendingSubmission: null, submissionOutcome: null, recoveryOwner: null, recoveryStatus: null, recoveryError: null
  });
});
afterEach(() => { for (const item of controllers.splice(0)) item.clearContext(); vi.useRealTimers(); });

function receipt(control: ReturnType<typeof controller>, status: 'accepted' | 'absent' | 'unavailable', causation?: string) {
  const request = control.send.mock.calls.at(-1)![0];
  const outcome: CombatReceiptWire = status === 'accepted' ? { combat_id: 'combat', sequence_id: 42, status, state_version: 1 }
    : status === 'absent' ? { combat_id: 'combat', sequence_id: 42, status, current_state_version: 1, encounter_ended: false }
    : { combat_id: 'combat', sequence_id: 42, status };
  const message = createCombatMessage(MessageType.COMBAT_STATE, { combat: null, receipt: outcome });
  message.causation_id = causation ?? request.message_id;
  control.controller.receipt(message);
}

describe('PlanRecoveryJournal', () => {
  it('round-trips scoped drafts and isolates users and session instances', () => {
    const journal = new PlanRecoveryJournal(scope, sessionStorage); journal.write(saved());
    expect(journal.read()).toEqual(saved());
    expect(new PlanRecoveryJournal({ ...scope, userId: 2 }, sessionStorage).read()).toBeNull();
    expect(new PlanRecoveryJournal({ ...scope, sessionInstance: 'replacement' }, sessionStorage).read()).toBeNull();
  });
  it('rejects malformed render fields, formats and changed submission payloads', () => {
    const journal = new PlanRecoveryJournal(scope, sessionStorage);
    expect(() => journal.write({ ...saved(), queue: [{ ...action, cost_ft: {} as never }] })).toThrow();
    journal.write(saved(true));
    expect(() => journal.write({ ...saved(true), pending: { ...saved(true).pending!, payload: { ...payload, commands: [{ type: 'hide', actor_id: 'actor' }] } } })).toThrow();
    sessionStorage.setItem(sessionStorage.key(0)!, JSON.stringify({ ...saved(), format: 2 }));
    expect(() => journal.read()).toThrow();
  });
});

describe('plan recovery lifecycle', () => {
  it('restores an unsent draft paused for review and never submits it', () => {
    const first = controller(); first.controller.observe(combat);
    usePlanningStore.getState().startPlanning('sprite'); usePlanningStore.getState().addAction(action);
    first.controller.clearContext();
    const next = controller(); next.controller.observe(combat);
    expect(usePlanningStore.getState().queue).toHaveLength(1);
    expect(usePlanningStore.getState().recoveryStatus).toBe('review');
    expect(usePlanningStore.getState().isPlanningMode).toBe(false);
    expect(next.send.mock.calls.every(([message]) => message.type === MessageType.COMBAT_STATE_REQUEST)).toBe(true);
    next.controller.review(); expect(usePlanningStore.getState().isPlanningMode).toBe(true);
  });
  it.each(['accepted', 'absent'] as const)('reconciles a restored submission only from its correlated %s receipt', status => {
    new PlanRecoveryJournal(scope, sessionStorage).write(saved(true));
    const next = controller(); next.controller.observe(combat);
    expect(usePlanningStore.getState().markSubmitted(99)).toBe(false);
    receipt(next, status, 'foreign-query'); expect(usePlanningStore.getState().pendingSubmission).not.toBeNull();
    receipt(next, status);
    expect(usePlanningStore.getState().pendingSubmission === null).toBe(status === 'accepted');
    expect(usePlanningStore.getState().queue).toHaveLength(status === 'accepted' ? 0 : 1);
    expect(usePlanningStore.getState().isPlanningMode).toBe(false);
  });
  it('keeps uncertain receipts blocked and retains evidence through retry', () => {
    new PlanRecoveryJournal(scope, sessionStorage).write(saved(true));
    const next = controller(); next.controller.observe(combat); receipt(next, 'unavailable');
    next.controller.discard(); expect(usePlanningStore.getState().pendingSubmission).not.toBeNull();
    expect(usePlanningStore.getState().recoveryStatus).toBe('blocked');
    next.controller.retry(); receipt(next, 'accepted');
    expect(usePlanningStore.getState().queue).toEqual([]);
  });
  it('blocks stale turns and clears volatile state when another user takes ownership', () => {
    new PlanRecoveryJournal(scope, sessionStorage).write(saved());
    const first = controller(); first.controller.observe({ ...combat, round_number: 2 });
    expect(usePlanningStore.getState().recoveryStatus).toBe('stale');
    first.controller.review(); expect(usePlanningStore.getState().isPlanningMode).toBe(false);
    const second = controller(); second.controller.welcome({ ...welcome, user_id: 2 });
    expect(usePlanningStore.getState().queue).toEqual([]);
    expect(first.controller.observe(combat)).toBe(false);
  });
  it('captures exact payload before send and refuses storage failure', () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => { }, clear: () => { }, key: () => null, length: 0 };
    const next = new PlanRecoveryController('ROOM', () => true, () => storage); controllers.push(next);
    next.welcome(welcome); next.observe(combat);
    usePlanningStore.getState().startPlanning('sprite'); usePlanningStore.getState().addAction(action);
    expect(usePlanningStore.getState().recoveryStatus).toBe('blocked');
    expect(next.admit(payload)).toBe(false);
  });
  it('allows receipt reconciliation for an ended encounter without replaying intent', () => {
    new PlanRecoveryJournal(scope, sessionStorage).write(saved(true));
    const next = controller(); next.controller.observe(null); receipt(next, 'accepted');
    expect(usePlanningStore.getState().pendingSubmission).toBeNull();
    expect(usePlanningStore.getState().queue).toEqual([]);
    expect(next.send.mock.calls.some(([message]) => message.type === MessageType.COMBAT_COMMAND)).toBe(false);
  });
});


it('persists the exact payload before send and rejects another body under its identity', () => {
  const next = controller(); next.controller.observe(combat);
  usePlanningStore.getState().startPlanning('sprite'); usePlanningStore.getState().addAction(action);
  expect(usePlanningStore.getState().markSubmitted(42, ['a'], payload)).toBe(true);
  expect(new PlanRecoveryJournal(scope, sessionStorage).read()?.pending?.payload).toEqual(payload);
  expect(next.controller.admit({ ...payload, commands: [{ type: 'hide', actor_id: 'actor' }] })).toBe(false);
  expect(next.controller.admit(payload)).toBe(true);
});

it('a late acknowledgement ends uncertainty but leaves remaining steps paused', () => {
  const next = controller(); next.controller.observe(combat);
  usePlanningStore.getState().startPlanning('sprite'); usePlanningStore.getState().addAction(action);
  usePlanningStore.getState().addAction({ ...action, id: 'later' });
  usePlanningStore.getState().markSubmitted(42, ['a'], payload);
  next.controller.connectionLost();
  usePlanningStore.getState().finishSubmission(42, true);
  expect(usePlanningStore.getState().pendingSubmission).toBeNull();
  expect(usePlanningStore.getState().queue.map(action => action.id)).toEqual(['later']);
  expect(usePlanningStore.getState().recoveryStatus).toBe('review');
});

it('clears another users volatile plan even when the new welcome has no recovery capability', () => {
  new PlanRecoveryJournal(scope, sessionStorage).write(saved());
  const first = controller(); first.controller.observe(combat);
  const second = controller(); second.controller.welcome({ ...welcome, user_id: 2, operation_recovery: null });
  expect(usePlanningStore.getState().queue).toEqual([]);
  expect(first.controller.observe(combat)).toBe(false);
});


it('retains submission evidence when its queued step is deleted during flight', () => {
  const next = controller(); next.controller.observe(combat);
  usePlanningStore.getState().startPlanning('sprite'); usePlanningStore.getState().addAction(action);
  usePlanningStore.getState().markSubmitted(42, ['a'], payload);
  usePlanningStore.getState().removeAction('a');
  const record = new PlanRecoveryJournal(scope, sessionStorage).read();
  expect(record?.queue).toEqual([]);
  expect(record?.pending?.payload).toEqual(payload);
  next.controller.clearContext();
  const restored = controller(); restored.controller.observe(combat); receipt(restored, 'accepted');
  expect(usePlanningStore.getState().queue).toEqual([]);
  expect(usePlanningStore.getState().pendingSubmission).toBeNull();
});


it('bounds receipt waiting without dropping the saved submission', () => {
  vi.useFakeTimers(); new PlanRecoveryJournal(scope, sessionStorage).write(saved(true));
  const next = controller(); next.controller.observe(combat);
  vi.advanceTimersByTime(10_000);
  expect(usePlanningStore.getState().recoveryStatus).toBe('blocked');
  expect(usePlanningStore.getState().pendingSubmission?.sequenceId).toBe(42);
  expect(new PlanRecoveryJournal(scope, sessionStorage).read()?.pending?.sequenceId).toBe(42);
});


it('retries an absent saved step using the original identity and exact payload', () => {
  new PlanRecoveryJournal(scope, sessionStorage).write(saved(true));
  const next = controller(); next.controller.observe(combat); receipt(next, 'absent');
  expect(usePlanningStore.getState().recoveryStatus).toBe('retry');
  next.controller.discard(); expect(usePlanningStore.getState().pendingSubmission).not.toBeNull();
  next.controller.retrySubmission();
  const sent = next.send.mock.calls.at(-1)![0];
  expect(sent.type).toBe(MessageType.COMBAT_COMMAND);
  expect(sent.data).toEqual(payload);
  expect(usePlanningStore.getState().recoveryStatus).toBe('checking');
});

it('bounds confirmation waiting after an explicit retry without losing its identity', () => {
  vi.useFakeTimers();
  new PlanRecoveryJournal(scope, sessionStorage).write(saved(true));
  const next = controller();
  next.controller.observe(combat);
  receipt(next, 'absent');
  next.controller.retrySubmission();
  vi.advanceTimersByTime(10_000);
  expect(usePlanningStore.getState().recoveryStatus).toBe('blocked');
  expect(new PlanRecoveryJournal(scope, sessionStorage).read()?.pending?.payload).toEqual(payload);
  expect(next.send.mock.calls.filter(([message]) => message.type === MessageType.COMBAT_COMMAND)).toHaveLength(1);
});

it('checks a newly sent step after a lost acknowledgement without replaying it', () => {
  vi.useFakeTimers();
  const next = controller();
  next.controller.observe(combat);
  usePlanningStore.getState().startPlanning('sprite');
  usePlanningStore.getState().addAction(action);
  usePlanningStore.getState().markSubmitted(42, ['a'], payload);
  expect(next.controller.admit(payload)).toBe(true);
  vi.advanceTimersByTime(10_000);
  expect(usePlanningStore.getState().recoveryStatus).toBe('blocked');
  expect(next.send.mock.calls.at(-1)![0].data).toEqual({ receipt_probe: { combat_id: 'combat', sequence_id: 42 } });
  receipt(next, 'accepted');
  expect(usePlanningStore.getState().queue).toEqual([]);
  expect(usePlanningStore.getState().pendingSubmission).toBeNull();
  expect(next.send.mock.calls.some(([message]) => message.type === MessageType.COMBAT_COMMAND)).toBe(false);
});

it('cancels the acknowledgement deadline once a normal step settles', () => {
  vi.useFakeTimers();
  const next = controller();
  next.controller.observe(combat);
  usePlanningStore.getState().startPlanning('sprite');
  usePlanningStore.getState().addAction(action);
  usePlanningStore.getState().markSubmitted(42, ['a'], payload);
  expect(next.controller.admit(payload)).toBe(true);
  usePlanningStore.getState().finishSubmission(42, true);
  const queryCount = next.send.mock.calls.length;
  vi.advanceTimersByTime(10_000);
  expect(usePlanningStore.getState().recoveryStatus).toBeNull();
  expect(next.send.mock.calls).toHaveLength(queryCount);
});

it('releases an absent request only when its saved version is obsolete', () => {
  new PlanRecoveryJournal(scope, sessionStorage).write(saved(true));
  const next = controller(); next.controller.observe({ ...combat, state_version: 2 });
  const request = next.send.mock.calls.at(-1)![0];
  next.controller.receipt({
    ...createCombatMessage(MessageType.COMBAT_STATE, {
      combat: null,
      receipt: {
combat_id: 'combat', sequence_id: 42,
        status: 'absent', current_state_version: 2, encounter_ended: false
      }
    }), causation_id: request.message_id
});
  expect(usePlanningStore.getState().pendingSubmission).toBeNull();
  expect(usePlanningStore.getState().recoveryStatus).toBe('review');
});

it('retains a rejected retry until a receipt or version fence settles it', () => {
  new PlanRecoveryJournal(scope, sessionStorage).write(saved(true));
  const next = controller(); next.controller.observe(combat); receipt(next, 'absent');
  next.controller.retrySubmission();
  expect(next.controller.retainRejection({ sequence_id: 99 })).toBe(false);
  expect(next.controller.retainRejection({ sequence_id: 42 })).toBe(true);
  expect(new PlanRecoveryJournal(scope, sessionStorage).read()?.pending?.payload).toEqual(payload);
  expect(usePlanningStore.getState().pendingSubmission?.sequenceId).toBe(42);
  expect(next.controller.retainRejection({ sequence_id: 42, details: { code: 'combat_state_conflict' } })).toBe(false);
  usePlanningStore.getState().finishSubmission(42, false);
  expect(new PlanRecoveryJournal(scope, sessionStorage).read()?.pending).toBeNull();
  expect(usePlanningStore.getState().recoveryStatus).toBe('review');
});

it('pauses a saved plan when selection changes to another actor', () => {
  const next = controller(); next.controller.observe(combat);
  usePlanningStore.getState().startPlanning('sprite'); usePlanningStore.getState().addAction(action);
  usePlanningStore.getState().startPlanning('other-sprite');
  expect(usePlanningStore.getState().recoveryStatus).toBe('stale');
  expect(usePlanningStore.getState().markSubmitted(42, ['a'], payload)).toBe(false);
  next.controller.discard();
  expect(usePlanningStore.getState().queue).toEqual([]);
});
