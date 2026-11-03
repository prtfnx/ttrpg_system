import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessage, MessageType } from '../message';
import { OperationRecoveryJournal } from '../operationRecovery';

const TABLE = '550e8400-e29b-41d4-a716-446655440000';
const scope = { actorId: 1, sessionCode: 'ROOM', sessionInstance: '1:2026-10-30',
  domains: ['table_create', 'table_delete', 'table_settings', 'xp_award'] };
const journal = () => new OperationRecoveryJournal(scope);
const request = () => createMessage(MessageType.XP_AWARD, { character_id: 'hero', amount: 100 });
beforeEach(() => sessionStorage.clear());

describe('operation recovery journal', () => {
  it.each([
    () => request(),
    () => createMessage(MessageType.NEW_TABLE_REQUEST, { table_name: 'Scene', source_table_id: TABLE }),
    () => createMessage(MessageType.TABLE_DELETE, { table_id: TABLE }),
    () => createMessage(MessageType.TABLE_SETTINGS_UPDATE, { table_id: TABLE, grid_cell_px: 75 }),
  ])('retains the complete original envelope across reconstruction', create => {
    const message = create();
    journal().capture(message);
    expect(journal().entries()[0]?.message).toEqual(message);
    expect(journal().capture({ ...message, timestamp: 999 })).toEqual(message);
  });

  it('rejects changed input under one identity without changing saved evidence', () => {
    const original = request(); journal().capture(original);
    expect(() => journal().capture({ ...original, data: { character_id: 'hero', amount: 200 } })).toThrow('different input');
    expect(journal().entries()[0]?.message).toEqual(original);
  });

  it('isolates actor, session code and retained database instance', () => {
    journal().capture(request());
    for (const patch of [{ actorId: 2 }, { sessionCode: 'OTHER' }, { sessionInstance: 'replacement' }]) {
      const other = new OperationRecoveryJournal({ ...scope, ...patch });
      expect(other.entries()).toEqual([]);
      other.discardAll();
    }
    expect(journal().entries()).toHaveLength(1);
  });

  it('keeps records from independent owners without overwriting siblings', () => {
    const a = journal(), b = journal(); const first = request(), second = request();
    a.capture(first); b.capture(second); a.complete(first.message_id!);
    expect(b.entries().map(entry => entry.message.message_id)).toEqual([second.message_id]);
  });

  it('blocks a request without dropping its original body or expiring it by age', () => {
    const original = request(); journal().capture(original);
    journal().block(original.message_id!, 'Current DM authority required');
    expect(journal().entries()[0]).toMatchObject({ state: 'blocked', message: original });
  });

  it('rejects corrupt records and retains their bytes for explicit review', () => {
    journal().capture(request()); const key = sessionStorage.key(0)!;
    sessionStorage.setItem(key, '{corrupt');
    expect(() => journal().entries()).toThrow();
    expect(() => journal().capture(request())).toThrow();
    expect(sessionStorage.getItem(key)).toBe('{corrupt');
  });

  it('does not evict unresolved intent when its bounded queue is full', () => {
    const owner = journal();
    for (let i = 0; i < 64; i++) owner.capture(request());
    expect(() => owner.capture(request())).toThrow('full');
    expect(owner.entries()).toHaveLength(64);
  });

  it('surfaces storage write failure before admitting a request', () => {
    const owner = new OperationRecoveryJournal(scope, { length: 0, getItem: () => null, key: () => null,
      setItem: vi.fn(() => { throw new Error('Quota exceeded'); }), removeItem: vi.fn(), clear: vi.fn() });
    expect(() => owner.capture(request())).toThrow('Quota exceeded');
  });

  it('validates stored protocol data before it can be replayed', () => {
    journal().capture(request()); const key = sessionStorage.key(0)!;
    const raw = JSON.parse(sessionStorage.getItem(key)!);
    raw.wire = JSON.stringify({ ...request(), message_id: JSON.parse(raw.wire).message_id, data: { amount: -1 } });
    sessionStorage.setItem(key, JSON.stringify(raw));
    expect(() => journal().entries()).toThrow();
  });
});
