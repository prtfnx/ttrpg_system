import { describe, expect, it, vi } from 'vitest';
import type { Sprite } from '@/types';
import { CanvasOptimisticState } from '../CanvasOptimisticState';
import { CanvasCommandController, IDENTITY_TRANSFORM, type CanvasIntent } from '../CanvasCommandController';

function harness() {
  const original: Sprite = { id: 'sprite', tableId: 'table', name: 'Token', texture: '', x: 0, y: 0,
    width: 50, height: 50, scale: { x: 1, y: 1 }, rotation: 0, layer: 'tokens' };
  let visible: Sprite | null = original;
  const state = new CanvasOptimisticState({ readSprite: () => original, readPaint: () => undefined,
    renderSprite: (_id, sprite) => { visible = sprite; }, renderPaints: vi.fn() });
  const move = (dx: number): CanvasIntent => ({ mode: 'transform', members: [{ kind: 'sprite', id: 'sprite',
    expected: { x: 0, y: 0, width: 50, height: 50, scale_x: 1, scale_y: 1, rotation: 0 } }],
    transform: { ...IDENTITY_TRANSFORM, dx } });
  return { state, original, move, visible: () => visible };
}

describe('optimistic canvas state', () => {
  it('reverts only denied intent and replays later transforms on the confirmed baseline', () => {
    const h = harness();
    h.state.stage('first', h.move(10));
    h.state.stage('second', h.move(20));
    expect(h.visible()?.x).toBe(30);
    h.state.settle('first', false);
    expect(h.visible()?.x).toBe(20);
    const rebased = h.state.rebase(h.move(20));
    expect('members' in rebased && rebased.members[0]).toMatchObject({ expected: { x: 0 } });
    h.state.canonical('second', 'sprite', 'sprite', { ...h.original, x: 20 });
    h.state.settle('second', true);
    expect(h.visible()?.x).toBe(20);
  });

  it('does not apply an acknowledged transform twice and preserves later preview', () => {
    const h = harness();
    h.state.stage('first', h.move(10));
    h.state.stage('second', h.move(20));
    h.state.canonical('first', 'sprite', 'sprite', { ...h.original, x: 10 });
    expect(h.visible()?.x).toBe(30);
    h.state.settle('first', true);
    expect(h.visible()?.x).toBe(30);
    h.state.settle('second', false);
    expect(h.visible()?.x).toBe(10);
  });

  it('previews dependent edits immediately while rebasing their wire commands after acknowledgement', () => {
    const h = harness();
    const send = vi.fn((_message: Record<string, unknown>) => true);
    const owner = new CanvasCommandController({ sendCanvasCommand: send, requestCanvasHistory: () => true }, {
      onResync: vi.fn(), onSelection: vi.fn(),
      onOptimistic: (id, intent) => h.state.stage(id, intent),
      beforeSend: intent => h.state.rebase(intent), onSettled: (id, accepted) => h.state.settle(id, accepted),
    });
    owner.selectScope('table', 1);
    owner.submit(h.move(10));
    const first = send.mock.calls[0][0];
    owner.submit(h.move(20));
    expect(h.visible()?.x).toBe(30);
    expect(send).toHaveBeenCalledOnce();
    h.state.canonical(String(first.operation_id), 'sprite', 'sprite', { ...h.original, x: 10 });
    owner.acceptResult({ operation_id: first.operation_id, table_id: 'table', success: true });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toMatchObject({ members: [{ expected: { x: 10 } }] });
    owner.dispose();
  });
});
