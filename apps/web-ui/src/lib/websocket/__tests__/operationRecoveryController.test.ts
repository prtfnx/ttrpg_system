import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessage, MessageType } from '../message';
import { OperationRecoveryJournal, V2_RECOVERY_DOMAINS } from '../operationRecovery';
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
  const extended = { ...welcome, role: 'player', operation_recovery: {
    ...capability, contract: 'session-operations-v2', domains: [...V2_RECOVERY_DOMAINS] } };
  const intents = [
    [MessageType.CHARACTER_UPDATE, { character_id: 'hero', updates: { name: 'New' }, version: 3 }],
    [MessageType.MULTICLASS_REQUEST, { character_id: 'hero', new_class: 'rogue', version: 3 }],
    [MessageType.ENCOUNTER_CHOICE, { encounter_id: 'prompt', choice_id: 'door' }],
    [MessageType.ENCOUNTER_ROLL, { encounter_id: 'prompt', choice_id: 'door', bonus: 2 }],
  ] as const;

  it.each(intents.flatMap(([type, data]) => ['player', 'trusted_player'].map(role => [type, data, role] as const)))(
    'restores and retries original %s with %j once per welcome for %s', (type, data, role) => {
      const first = setup(); first.owner.welcome({ ...extended, role });
      const original = createMessage(type, data); first.owner.admit(original);
      const restarted = setup(); restarted.owner.welcome({ ...extended, role });
      restarted.owner.replay(); restarted.owner.replay();
      expect(restarted.restore).toHaveBeenCalledExactlyOnceWith(original);
      expect(restarted.send).toHaveBeenCalledExactlyOnceWith(original);
    });

  it('keeps v2 evidence dormant during a v1 fallback and restores it when v2 returns', () => {
    const first = setup(); first.owner.welcome(extended);
    const original = createMessage(...intents[0]); first.owner.admit(original);
    const fallback = setup(); fallback.owner.welcome(welcome); fallback.owner.replay(true);
    expect(fallback.restore).not.toHaveBeenCalled(); expect(fallback.send).not.toHaveBeenCalled();
    expect(fallback.owner.admit(createMessage(...intents[0]))).toBeDefined();
    expect(fallback.owner.status().pending).toBe(1);
    fallback.owner.welcome(extended); fallback.owner.replay();
    expect(fallback.send).toHaveBeenCalledExactlyOnceWith(original);
  });

  it('allows player originals while retaining DM-only intents for deliberate review', () => {
    const first = setup(); first.owner.welcome({ ...extended, role: 'owner' });
    first.owner.admit(createMessage(MessageType.ENCOUNTER_END, { encounter_id: 'prompt' }));
    const original = first.owner.admit(createMessage(...intents[0]));
    const restarted = setup(); restarted.owner.welcome(extended); restarted.owner.replay();
    expect(restarted.send).toHaveBeenCalledExactlyOnceWith(original);
    expect(restarted.owner.status()).toMatchObject({ pending: 1, blocked: 1, error: null });
    const spectator = setup(); spectator.owner.welcome({ ...extended, role: 'spectator' }); spectator.owner.replay(true);
    expect(spectator.send).not.toHaveBeenCalled(); expect(spectator.owner.status().blocked).toBe(2);
  });

  it.each(['character_update', 'choice_encounter', 'character_multiclass'])(
    'rejects silently extended v1 domain %s before restoring anything', domain => {
      const { owner, restore, send } = setup();
      owner.welcome({ ...welcome, operation_recovery: { ...capability, domains: [...capability.domains, domain] } });
      owner.replay(); expect(owner.ready()).toBe(false); expect(restore).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

  it.each(intents)('retains unknown and denied %s until a correlated receipt or proven nonacceptance', (type, data) => {
    const { owner } = setup(); owner.welcome(extended); const original = owner.admit(createMessage(type, data));
    const error = (patch: Record<string, unknown>) => ({ ...createMessage(MessageType.ERROR, {
      operation_id: original.message_id, error: 'Unavailable', ...patch }), causation_id: original.message_id });
    owner.outcome(error({ outcome: 'unknown' })); expect(owner.status().pending).toBe(1);
    owner.outcome(error({ code: 'forbidden' })); expect(owner.status().blocked).toBe(1);
    owner.outcome(error({ not_accepted: true, operation_id: 'wrong' })); expect(owner.status().blocked).toBe(1);
    owner.outcome(error({ not_accepted: true })); expect(owner.status().blocked).toBe(0);
  });

  it.each([
    [MessageType.CHARACTER_UPDATE, MessageType.CHARACTER_UPDATE_RESPONSE, { character_id: 'hero', success: true }],
    [MessageType.MULTICLASS_REQUEST, MessageType.MULTICLASS_RESPONSE, { character_id: 'hero', success: true }],
    [MessageType.ENCOUNTER_CHOICE, MessageType.ENCOUNTER_STATE, { encounter_id: 'prompt', accepted: true, kind: 'encounter_choice' }],
    [MessageType.ENCOUNTER_ROLL, MessageType.ENCOUNTER_RESULT, { encounter_id: 'prompt', accepted: true, kind: 'encounter_roll' }],
  ])('clears only the matching %s receipt', (type, response, data) => {
    const { owner } = setup(); owner.welcome(extended);
    const input = intents.find(([kind]) => kind === type)!;
    const original = owner.admit(createMessage(input[0], input[1]));
    owner.outcome({ ...createMessage(response, { ...data, operation_id: 'different' }), causation_id: original.message_id });
    expect(owner.status().pending).toBe(1);
    owner.outcome({ ...createMessage(response, { ...data, operation_id: original.message_id }), causation_id: original.message_id });
    expect(owner.status().pending).toBe(0);
  });
  it('cannot discard the previous actor records after the active context is cleared', () => {
    const { owner } = setup(); owner.welcome(welcome);
    const original = createMessage(MessageType.XP_AWARD, { character_id: 'hero', amount: 100 }); owner.admit(original);
    owner.clearContext();
    expect(owner.discard()).toBe(false);
    expect(new OperationRecoveryJournal(scope).entries()).toHaveLength(1);
    owner.welcome({ ...welcome, user_id: 2 }); owner.discard();
    expect(new OperationRecoveryJournal(scope).entries()).toHaveLength(1);
  });
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
    expect(owner.status().blocked).toBe(1);
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
