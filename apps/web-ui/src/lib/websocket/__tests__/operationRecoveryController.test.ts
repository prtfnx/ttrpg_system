import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessage, MessageType } from '../message';
import { OperationRecoveryJournal } from '../operationRecovery';
import { OperationRecoveryController } from '../operationRecoveryController';

const capability = { contract: 'session-operations-v1', session_instance: '1:2026-10-30',
  domains: ['table_create', 'table_delete', 'table_settings', 'xp_award'] };
const welcome = { user_id: 1, session_code: 'ROOM', role: 'owner', operation_recovery: capability };
const scope = { actorId: 1, sessionCode: 'ROOM', sessionInstance: capability.session_instance, domains: capability.domains };
function setup() {
  const send = vi.fn(() => true), restore = vi.fn(), changed = vi.fn();
  return { owner: new OperationRecoveryController('ROOM', { isOpen: () => true, send, restore, changed }), send, restore };
}
beforeEach(() => sessionStorage.clear());

describe('authenticated operation recovery', () => {
  it('journals each high-risk batch member with its own original identity', () => {
    const { owner } = setup(); owner.welcome(welcome);
    const original = createMessage(MessageType.XP_AWARD, { character_id: 'hero', amount: 100 });
    const batch = createMessage(MessageType.BATCH_REQUEST, { messages: [original] });
    expect(owner.admit(batch).data?.messages).toEqual([original]);
    expect(new OperationRecoveryJournal(scope).entries().map(entry => entry.message)).toEqual([original]);
  });
  it('reconstructs and probes one exact original XP request only after a matching welcome', () => {
    const first = setup(); first.owner.welcome(welcome);
    const original = createMessage(MessageType.XP_AWARD, { character_id: 'hero', amount: 100 });
    first.owner.admit(original); first.owner.connectionLost();
    const restarted = setup();
    restarted.owner.replay(); expect(restarted.send).not.toHaveBeenCalled();
    restarted.owner.welcome(welcome); restarted.owner.replay(); restarted.owner.replay();
    expect(restarted.restore).toHaveBeenCalledWith(original);
    expect(restarted.send).toHaveBeenCalledOnce();
    expect(restarted.send).toHaveBeenCalledWith(original);
    const accepted = { ...createMessage(MessageType.XP_AWARD_RESPONSE,
      { operation_id: original.message_id, character_id: 'hero', success: true }), causation_id: original.message_id };
    expect(restarted.owner.outcome(accepted)).toBe(true);
    expect(restarted.owner.status().pending).toBe(0);
  });

  it.each([{ user_id: 2 }, { operation_recovery: { ...capability, session_instance: 'replacement' } }])(
    'never probes old scope under another actor or database instance', patch => {
      new OperationRecoveryJournal(scope).capture(createMessage(MessageType.NEW_TABLE_REQUEST, { table_name: 'Secret' }));
      const { owner, send } = setup(); owner.welcome({ ...welcome, ...patch }); owner.replay();
      expect(send).not.toHaveBeenCalled();
      expect(new OperationRecoveryJournal(scope).entries()).toHaveLength(1);
    });

  it('does not treat a snapshot or unrelated generic success as an operation receipt', () => {
    const { owner } = setup(); owner.welcome(welcome);
    const original = createMessage(MessageType.NEW_TABLE_REQUEST, { table_name: 'Scene' }); owner.admit(original);
    owner.outcome({ ...createMessage(MessageType.SUCCESS, { success: true, operation_id: original.message_id }),
      causation_id: original.message_id });
    owner.outcome(createMessage(MessageType.TABLE_RESPONSE, { table_data: {} }));
    expect(owner.status().pending).toBe(1);
  });

  it('retains unknown requests and holds denied lookups for manual review', () => {
    const { owner, send } = setup(); owner.welcome(welcome);
    const original = createMessage(MessageType.XP_AWARD, { character_id: 'hero', amount: 100 }); owner.admit(original);
    const error = (data: Record<string, unknown>) => ({ ...createMessage(MessageType.ERROR, data), causation_id: original.message_id });
    owner.outcome(error({ outcome: 'unknown', error: 'Lookup unavailable' }));
    expect(owner.status().pending).toBe(1);
    owner.outcome(error({ code: 'forbidden', error: 'Current authority required' }));
    expect(owner.status().blocked).toBe(1);
    owner.replay(); expect(send).not.toHaveBeenCalled();
    owner.replay(true); expect(send).toHaveBeenCalledWith(original);
  });

  it('does not replay as a player and does not discard unknown receipt evidence', () => {
    new OperationRecoveryJournal(scope).capture(createMessage(MessageType.XP_AWARD, { character_id: 'hero', amount: 100 }));
    const { owner, send } = setup(); owner.welcome({ ...welcome, role: 'player' }); owner.replay(true);
    expect(send).not.toHaveBeenCalled();
    expect(owner.status().error).toContain('DM authority');
    expect(new OperationRecoveryJournal(scope).entries()).toHaveLength(1);
  });

  it('requires a new authenticated welcome after connection loss', () => {
    const { owner, send } = setup(); owner.welcome(welcome); owner.connectionLost();
    expect(() => owner.admit(createMessage(MessageType.XP_AWARD, { character_id: 'hero', amount: 100 }))).toThrow();
    owner.replay(); expect(send).not.toHaveBeenCalled();
  });

  it('leaves unsupported-server records untouched', () => {
    new OperationRecoveryJournal(scope).capture(createMessage(MessageType.NEW_TABLE_REQUEST, { table_name: 'Scene' }));
    const { owner, send } = setup(); owner.welcome({ ...welcome, operation_recovery: null }); owner.replay();
    expect(send).not.toHaveBeenCalled();
    expect(new OperationRecoveryJournal(scope).entries()).toHaveLength(1);
  });

  it('fails closed on corrupt saved evidence and supports explicit scoped discard', () => {
    new OperationRecoveryJournal(scope).capture(createMessage(MessageType.NEW_TABLE_REQUEST, { table_name: 'Scene' }));
    sessionStorage.setItem(sessionStorage.key(0)!, '{broken');
    const { owner, send } = setup(); owner.welcome(welcome); owner.replay();
    expect(owner.status().error).not.toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(() => owner.admit(createMessage(MessageType.NEW_TABLE_REQUEST, { table_name: 'Another' }))).toThrow();
    expect(owner.discard()).toBe(true);
    expect(new OperationRecoveryJournal(scope).entries()).toEqual([]);
  });
});
