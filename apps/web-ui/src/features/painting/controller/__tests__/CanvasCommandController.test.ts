import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitProtocolEvent } from '@lib/websocket/protocolEvents';
import { CanvasCommandController, IDENTITY_TRANSFORM } from '../CanvasCommandController';

const TABLE = '9e8ed60d-f18c-4f47-a5ce-fc04db50506a';
const OTHER = 'd57d06dc-85d1-42a7-a928-2d1fa10848f9';
const members = [{ kind: 'paint' as const, id: 'dd830253-e2bf-4a92-9862-eabe85f79c99', version: 1 }];
const owners: CanvasCommandController[] = [];

afterEach(() => owners.splice(0).forEach(owner => owner.dispose()));

function harness() {
  let now = 1000;
  const transport = { sendCanvasCommand: vi.fn((_command: Record<string, unknown>) => true),
    requestCanvasHistory: vi.fn((_tableId: string) => true) };
  const options = { now: () => now, onError: vi.fn(), onResync: vi.fn(), onSelection: vi.fn() };
  const owner = new CanvasCommandController(transport, options);
  owners.push(owner);
  owner.connectEvents();
  owner.selectScope(TABLE, 42);
  const command = () => transport.sendCanvasCommand.mock.lastCall![0] as Record<string, unknown>;
  const accept = (extra = {}) => emitProtocolEvent('canvas-command-result', {
    operation_id: command().operation_id, table_id: TABLE, success: true,
    selection: members.map(({ kind, id }) => ({ kind, id })), can_undo: true, can_redo: false, ...extra,
  });
  return { owner, transport, options, command, accept, advance: (ms: number) => { now += ms; } };
}

describe('CanvasCommandController', () => {
  it('captures immutable restyle intent and retains the broader selection on acknowledgement', () => {
    const h = harness();
    const style = { stroke_rgba: [0, 1, 0, 1] as [number, number, number, number], width: 6, fill_rgba: null };
    expect(h.owner.submit({ mode: 'restyle', members, style })).toBe(true);
    style.width = 10;
    expect(h.command()).toMatchObject({ mode: 'restyle', style: { width: 6 } });
    h.accept();
    expect(h.options.onSelection).not.toHaveBeenCalled();
    expect(h.owner.getState()).toMatchObject({ pending: false, canUndo: true });
  });
  it('previews dependent intent without waiting and sends it after its predecessor settles', () => {
    const { owner, transport, accept } = harness();
    expect(owner.submit({ mode: 'transform', members, transform: IDENTITY_TRANSFORM })).toBe(true);
    expect(owner.getState().pending).toBe(true);
    emitProtocolEvent('canvas-command-result', { operation_id: 'other', table_id: TABLE, success: true });
    expect(owner.getState().pending).toBe(true);
    expect(owner.submit({ mode: 'delete', members })).toBe(true);
    expect(transport.sendCanvasCommand).toHaveBeenCalledOnce();
    accept();
    expect(transport.sendCanvasCommand).toHaveBeenCalledTimes(2);
    expect(owner.getState().pending).toBe(true);
    accept();
    expect(owner.getState()).toMatchObject({ pending: false, canUndo: true, canRedo: false });
  });

  it('supports synchronous confirmation without recreating pending state', () => {
    const { owner, transport } = harness();
    transport.sendCanvasCommand.mockImplementation(command => {
      owner.acceptResult({ ...command, success: true, can_undo: true, selection: [] });
      return true;
    });
    expect(owner.submit({ mode: 'delete', members })).toBe(true);
    expect(owner.getState().pending).toBe(false);
  });

  it('clones intent so caller changes cannot modify a retry body', () => {
    const { owner, transport, command } = harness();
    const transform = { ...IDENTITY_TRANSFORM, dx: 10 };
    owner.submit({ mode: 'transform', members, transform });
    const first = structuredClone(command());
    transform.dx = 999;
    emitProtocolEvent('protocol-connected');
    expect(transport.sendCanvasCommand).toHaveBeenCalledTimes(2);
    expect(command()).toEqual(first);
  });

  it('retries a missing acknowledgement with the same operation and timestamp', () => {
    const { owner, transport, command, advance } = harness();
    owner.submit({ mode: 'delete', members });
    const first = structuredClone(command());
    advance(10_000); owner.tick();
    expect(transport.sendCanvasCommand).toHaveBeenCalledTimes(2);
    expect(command()).toEqual(first);
    expect(owner.getState().pending).toBe(true);
  });

  it('expires uncertain intents instead of replaying them outside the server retry horizon', () => {
    const { owner, transport, options, advance } = harness();
    owner.submit({ mode: 'delete', members });
    advance(24 * 60 * 60 * 1000 + 1); owner.tick();
    emitProtocolEvent('protocol-connected');
    expect(transport.sendCanvasCommand).toHaveBeenCalledOnce();
    expect(owner.getState().pending).toBe(false);
    expect(options.onResync).toHaveBeenCalledWith(TABLE);
  });

  it.each(['table', 'actor'] as const)('drops stale intent and clipboard on %s scope replacement', scope => {
    const { owner, transport, accept } = harness();
    owner.submit({ mode: 'copy', members }); accept({ clipboard_id: crypto.randomUUID() });
    owner.submit({ mode: 'delete', members });
    owner.selectScope(scope === 'table' ? OTHER : TABLE, scope === 'actor' ? 43 : 42);
    emitProtocolEvent('protocol-connected');
    expect(transport.sendCanvasCommand).toHaveBeenCalledTimes(2);
    expect(owner.getState()).toMatchObject({ pending: false, canPaste: false, canUndo: false });
  });

  it.each(['false', 'throw'])('rejects a synchronous %s send failure without leaving a pending command', failure => {
    const { owner, transport, options } = harness();
    transport.sendCanvasCommand.mockImplementation(() => {
      if (failure === 'throw') throw new Error('closed');
      return false;
    });
    expect(owner.submit({ mode: 'delete', members })).toBe(false);
    expect(owner.getState().pending).toBe(false);
    expect(options.onError).toHaveBeenCalledOnce();
  });

  it('uses server clipboard tokens and generates new IDs without sending object metadata', () => {
    const { owner, command, accept } = harness();
    owner.submit({ mode: 'copy', members }); accept({ clipboard_id: crypto.randomUUID() });
    expect(owner.getState().canPaste).toBe(true);
    expect(owner.paste()).toBe(true);
    expect(command()).toMatchObject({ mode: 'paste', ids: [{ kind: 'paint', source_id: members[0].id }] });
    expect((command().ids as Array<{ id: string }>)[0].id).not.toBe(members[0].id);
    expect(command()).not.toHaveProperty('members');
    expect(command()).not.toHaveProperty('metadata');
  });

  it('duplicates only after the copy was accepted', () => {
    const { owner, command, transport, accept } = harness();
    owner.submit({ mode: 'copy', members }, true);
    expect(transport.sendCanvasCommand).toHaveBeenCalledOnce();
    accept({ clipboard_id: crypto.randomUUID() });
    expect(transport.sendCanvasCommand).toHaveBeenCalledTimes(2);
    expect(command().mode).toBe('paste');
    expect(owner.getState().pending).toBe(true);
  });

  it('does not duplicate after a rejected copy, and reconciles conflicts from fresh state', () => {
    const { owner, transport, options, accept } = harness();
    owner.submit({ mode: 'copy', members }, true);
    accept({ success: false, error: 'Permission changed' });
    expect(transport.sendCanvasCommand).toHaveBeenCalledOnce();
    expect(owner.getState()).toMatchObject({ pending: false, canPaste: false, lastError: 'Permission changed' });
    expect(options.onResync).not.toHaveBeenCalled();
  });

  it('requests fresh snapshots when a successful retry cannot replay historical sprite events', () => {
    const { owner, options, accept } = harness();
    owner.submit({ mode: 'undo' }); accept({ resync_required: true });
    expect(options.onResync).toHaveBeenCalledWith(TABLE);
    expect(options.onSelection).toHaveBeenCalledWith(members.map(({ kind, id }) => ({ kind, id })));
  });

  it('accepts availability only for the active scope, and ignores stale reads while an edit is pending', () => {
    const { owner } = harness();
    emitProtocolEvent('canvas-history-state', { table_id: OTHER, can_undo: true });
    expect(owner.getState().canUndo).toBe(false);
    emitProtocolEvent('canvas-history-state', { table_id: TABLE, can_undo: true });
    expect(owner.getState().canUndo).toBe(true);
    owner.submit({ mode: 'undo' });
    emitProtocolEvent('canvas-history-state', { table_id: TABLE, can_undo: false });
    expect(owner.getState().canUndo).toBe(true);
  });

  it('bounds member count and payload size before sending', () => {
    const { owner, transport } = harness();
    expect(owner.submit({ mode: 'copy', members: [] })).toBe(false);
    expect(owner.submit({ mode: 'copy', members: Array.from({ length: 101 }, () => members[0]) })).toBe(false);
    expect(transport.sendCanvasCommand).not.toHaveBeenCalled();
  });

  it('coalesces standalone paint history refreshes on the existing expiry tick', () => {
    const { owner, transport } = harness();
    for (let index = 0; index < 5; index++) window.dispatchEvent(new CustomEvent('paint-object-event'));
    expect(transport.requestCanvasHistory).toHaveBeenCalledOnce();
    owner.tick();
    expect(transport.requestCanvasHistory).toHaveBeenCalledTimes(2);
    owner.tick();
    expect(transport.requestCanvasHistory).toHaveBeenCalledTimes(2);
  });

  it.each(['sprite-response', 'protocol-success'] as const)('refreshes shared history after local %s acknowledgements only', type => {
    const { owner, transport } = harness();
    emitProtocolEvent(type, { table_id: OTHER, success: true, can_undo: true });
    emitProtocolEvent(type, { table_id: TABLE, success: false, can_undo: true });
    emitProtocolEvent(type, { table_id: TABLE, success: true });
    owner.tick();
    expect(transport.requestCanvasHistory).toHaveBeenCalledOnce();
    for (let index = 0; index < 5; index++) emitProtocolEvent(type, { table_id: TABLE, success: true, can_undo: true });
    owner.tick();
    expect(transport.requestCanvasHistory).toHaveBeenCalledTimes(2);
    expect(owner.getState().canUndo).toBe(false); // Availability comes from a fresh scoped history response.
  });

  it('publishes clipboard expiry to subscribers without a reconnect', () => {
    const { owner, accept, advance } = harness();
    owner.submit({ mode: 'copy', members }); accept({ clipboard_id: crypto.randomUUID() });
    const listener = vi.fn(); owner.subscribe(listener);
    advance(24 * 60 * 60 * 1000 + 1); owner.tick();
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ canPaste: false }));
    expect(owner.paste()).toBe(false);
  });

  it('disconnects event listeners and timers do not retry disposed work', () => {
    const { owner, transport, advance } = harness();
    owner.submit({ mode: 'delete', members }); owner.dispose();
    advance(10_000); owner.tick(); emitProtocolEvent('protocol-connected');
    expect(transport.sendCanvasCommand).toHaveBeenCalledOnce();
  });
});
