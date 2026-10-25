import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Sprite } from '@/types';
import { emitProtocolEvent } from '@lib/websocket/protocolEvents';
import { CanvasCommandController, IDENTITY_TRANSFORM, MAX_CANVAS_IN_FLIGHT, type CanvasIntent } from '../CanvasCommandController';
import { CanvasOptimisticState } from '../CanvasOptimisticState';

const owners: CanvasCommandController[] = [];
afterEach(() => { owners.splice(0).forEach(owner => owner.dispose()); vi.useRealTimers(); });

function harness() {
  let baseline: Sprite = { id: 'sprite', tableId: 'table', name: 'Token', texture: '', x: 0, y: 0,
    width: 50, height: 50, scale: { x: 1, y: 1 }, rotation: 0, layer: 'tokens' };
  let visible: Sprite | null = baseline;
  const optimism = new CanvasOptimisticState({ readSprite: () => baseline, readPaint: () => undefined,
    renderSprite: (_id, sprite) => { visible = sprite; }, renderPaints: vi.fn() });
  const send = vi.fn((_command: Record<string, unknown>) => true);
  const options = { onResync: vi.fn(), onError: vi.fn(), onSelection: vi.fn(),
    onOptimistic: (id: string, intent: CanvasIntent) => optimism.stage(id, intent),
    onSettled: (id: string, accepted: boolean) => optimism.settle(id, accepted),
    onReissued: (oldId: string, newId: string) => optimism.reissue(oldId, newId),
    beforeSend: (intent: CanvasIntent) => optimism.rebase(intent),
    onSnapshot: (ids: readonly string[]) => optimism.resolveSnapshot(ids) };
  const supportsCanvasPipelining = vi.fn(() => true);
  const owner = new CanvasCommandController({ sendCanvasCommand: send, requestCanvasHistory: () => true,
    supportsCanvasPipelining }, options);
  owners.push(owner); owner.selectScope('table', 1); owner.connectEvents();
  const move = (dx: number): CanvasIntent => ({ mode: 'transform', members: [{ kind: 'sprite', id: 'sprite',
    expected: { x: 0, y: 0, width: 50, height: 50, scale_x: 1, scale_y: 1, rotation: 0 } }],
    transform: { ...IDENTITY_TRANSFORM, dx } });
  const result = (command: Record<string, unknown>, extra = {}) => owner.acceptResult({
    operation_id: command.operation_id, table_id: 'table', success: true, ...extra });
  const canonical = (command: Record<string, unknown>, x: number) => {
    baseline = { ...baseline, x };
    optimism.canonical(String(command.operation_id), 'sprite', 'sprite', baseline);
    result(command);
  };
  return { owner, send, supportsCanvasPipelining, options, move, result, canonical, visible: () => visible,
    baseline: (x: number) => { baseline = { ...baseline, x }; } };
}

describe('bounded canvas pipeline', () => {
  it('completes twenty-four dependent edits in three simulated acknowledgement intervals', () => {
    vi.useFakeTimers();
    const h = harness();
    let acceptedX = 0;
    h.send.mockImplementation(command => {
      const body = structuredClone(command);
      setTimeout(() => { acceptedX++; h.canonical(body, acceptedX); }, 100);
      return true;
    });
    for (let index = 0; index < 24; index++) h.owner.submit(h.move(1));
    expect(h.visible()?.x).toBe(24);
    expect(h.send).toHaveBeenCalledTimes(MAX_CANVAS_IN_FLIGHT);
    expect(h.send.mock.calls[1][0]).toMatchObject({ members: [{ after_operation_id: h.send.mock.calls[0][0].operation_id }] });
    vi.advanceTimersByTime(299);
    expect(h.owner.getState().pending).toBe(true);
    vi.advanceTimersByTime(1);
    expect(h.send).toHaveBeenCalledTimes(24);
    expect(h.owner.getState().pending).toBe(false);
    expect(h.visible()?.x).toBe(24);
  });

  it('reissues unexecuted descendants after denial without dropping or doubling younger intent', () => {
    const h = harness();
    [10, 20, 30].forEach(dx => h.owner.submit(h.move(dx)));
    const [first, second, third] = h.send.mock.calls.map(([body]) => structuredClone(body));
    h.result(first, { success: false, code: 'forbidden', error: 'Denied' });
    expect(h.visible()?.x).toBe(50);
    h.result(second, { success: false, code: 'dependency_failed' });
    h.result(third, { success: false, code: 'dependency_failed' });
    const retrySecond = h.send.mock.calls[3][0], retryThird = h.send.mock.calls[4][0];
    expect(retrySecond.operation_id).not.toBe(second.operation_id);
    expect(retrySecond).toMatchObject({ members: [{ expected: { x: 0 } }] });
    expect(retryThird).toMatchObject({ members: [{ after_operation_id: retrySecond.operation_id }] });
    expect(h.visible()?.x).toBe(50);
    h.canonical(retrySecond, 20); h.canonical(retryThird, 50);
    expect(h.visible()?.x).toBe(50);
    expect(h.owner.getState().pending).toBe(false);
    expect(h.options.onError).toHaveBeenCalledOnce();
    expect(h.options.onResync).not.toHaveBeenCalled();
  });

  it('retains failed descendants across a recovery watermark and rebases only after hydration', () => {
    const h = harness();
    h.options.onResync.mockImplementation(() => emitProtocolEvent('table-resync-started', { tableId: 'table' }));
    h.owner.submit(h.move(10)); h.owner.submit(h.move(20));
    const [first, second] = h.send.mock.calls.map(([body]) => structuredClone(body));
    h.result(first, { success: false, code: 'conflict' });
    h.result(second, { success: false, code: 'dependency_failed' });
    expect(h.send).toHaveBeenCalledTimes(2);
    h.baseline(100);
    emitProtocolEvent('table-resync-completed', { tableId: 'table' });
    expect(h.send).toHaveBeenCalledTimes(3);
    expect(h.send.mock.calls[2][0]).toMatchObject({ members: [{ expected: { x: 100 } }] });
    expect(h.visible()?.x).toBe(120);
    h.canonical(h.send.mock.calls[2][0], 120);
    expect(h.owner.getState().pending).toBe(false);
  });

  it('keeps destructive and history operations behind predecessor outcomes', () => {
    const h = harness();
    h.owner.submit(h.move(10)); h.owner.submit(h.move(20));
    h.owner.submit({ mode: 'delete', members: (h.move(0) as Extract<CanvasIntent, { mode: 'transform' }>).members });
    h.owner.submit({ mode: 'undo' });
    expect(h.send).toHaveBeenCalledTimes(2);
    h.canonical(h.send.mock.calls[0][0], 10);
    expect(h.send).toHaveBeenCalledTimes(2);
    h.canonical(h.send.mock.calls[1][0], 30);
    expect(h.send.mock.calls[2][0].mode).toBe('delete');
    h.result(h.send.mock.calls[2][0]);
    expect(h.send.mock.calls[3][0].mode).toBe('undo');
  });

  it('retries immutable identities and dependencies on reconnect', () => {
    const h = harness();
    h.owner.submit(h.move(10)); h.owner.submit(h.move(20));
    const firstBodies = structuredClone(h.send.mock.calls.map(([body]) => body));
    emitProtocolEvent('protocol-connected');
    expect(h.send.mock.calls.slice(2).map(([body]) => body)).toEqual(firstBodies);
  });

  it('links each member to its latest overlapping predecessor across independent branches', () => {
    const send = vi.fn((_command: Record<string, unknown>) => true);
    const owner = new CanvasCommandController({ sendCanvasCommand: send, requestCanvasHistory: () => true,
      supportsCanvasPipelining: () => true }, { onResync: vi.fn(), onSelection: vi.fn() });
    owners.push(owner); owner.selectScope('table', 1);
    const member = (id: string) => ({ kind: 'paint' as const, id, version: 1 });
    owner.submit({ mode: 'transform', members: [member('a')], transform: IDENTITY_TRANSFORM });
    owner.submit({ mode: 'transform', members: [member('b')], transform: IDENTITY_TRANSFORM });
    owner.submit({ mode: 'transform', members: [member('a'), member('b')], transform: IDENTITY_TRANSFORM });
    expect(send.mock.calls[2][0]).toMatchObject({ members: [
      { id: 'a', after_operation_id: send.mock.calls[0][0].operation_id },
      { id: 'b', after_operation_id: send.mock.calls[1][0].operation_id },
    ] });
  });

  it('does not transmit a child before its external lifecycle barrier admits the parent', () => {
    let ready = false;
    const send = vi.fn((_command: Record<string, unknown>) => true);
    const owner = new CanvasCommandController({ sendCanvasCommand: send, requestCanvasHistory: () => true,
      supportsCanvasPipelining: () => true }, { onResync: vi.fn(), onSelection: vi.fn(), readyToSend: () => ready });
    owners.push(owner); owner.selectScope('table', 1);
    const intent = { mode: 'transform' as const, members: [{ kind: 'paint' as const, id: 'paint', version: 1 }], transform: IDENTITY_TRANSFORM };
    owner.submit(intent); owner.submit(intent);
    expect(send).not.toHaveBeenCalled();
    ready = true; owner.tick();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toMatchObject({ members: [{ after_operation_id: send.mock.calls[0][0].operation_id }] });
  });

  it('keeps legacy servers sequential and recovers in-flight dependencies after a downgrade', () => {
    const h = harness();
    h.supportsCanvasPipelining.mockReturnValue(false);
    h.owner.submit(h.move(10)); h.owner.submit(h.move(20));
    expect(h.send).toHaveBeenCalledOnce();
    h.canonical(h.send.mock.calls[0][0], 10);
    expect(h.send).toHaveBeenCalledTimes(2);
    h.supportsCanvasPipelining.mockReturnValue(true);
    h.owner.submit(h.move(30));
    expect(h.send).toHaveBeenCalledTimes(3);
    h.supportsCanvasPipelining.mockReturnValue(false);
    emitProtocolEvent('protocol-connected');
    expect(h.send).toHaveBeenCalledTimes(3);
    expect(h.options.onResync).toHaveBeenCalledWith('table');
  });
});
