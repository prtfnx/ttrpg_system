import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Sprite } from '@/types';
import { emitProtocolEvent } from '@lib/websocket/protocolEvents';
import { createCanvasOptimism } from '../createCanvasOptimism';

const mock = vi.hoisted(() => ({ state: {} as { activeTableId: string; sprites: Sprite[] } }));
vi.mock('@/store', () => ({ useGameStore: { getState: () => mock.state,
  setState: (apply: (value: typeof mock.state) => Partial<typeof mock.state>) => Object.assign(mock.state, apply(mock.state)) } }));
let cleanup: () => void;
beforeEach(() => { mock.state = { activeTableId: 't1', sprites: [{ id: 's1', tableId: 't1', name: 'Token',
  layer: 'tokens', texture: '', x: 0, y: 0, width: 50, height: 50, rotation: 0, scale: { x: 1, y: 1 } }] }; });
afterEach(() => cleanup?.());

function harness() {
  const engine = { copy_sprite: vi.fn(() => JSON.stringify({ id: 's1', world_x: 0, world_y: 0, table_id: 't1' })),
    remove_sprite: vi.fn(), add_sprite_to_layer: vi.fn(), resize_sprite: vi.fn(), move_sprite_to_layer: vi.fn() };
  const runtime = { getRenderEngine: () => engine, previewSelectionSpriteTransform: vi.fn() };
  const paints = { getState: () => ({ committed: [] }), setEditorProjection: vi.fn(), setEditorBusy: vi.fn() };
  const owner = createCanvasOptimism(runtime as never, paints as never);
  cleanup = owner.connectEvents();
  return { engine, owner };
}

it('rolls back denied property updates without losing later edits', () => {
  harness();
  emitProtocolEvent('optimistic-sprite-command', { requestId: 'one', tableId: 't1', spriteId: 's1', kind: 'update', patch: { width: 60 } });
  emitProtocolEvent('optimistic-sprite-command', { requestId: 'two', tableId: 't1', spriteId: 's1', kind: 'update', patch: { width: 80 } });
  expect(mock.state.sprites[0].width).toBe(80);
  emitProtocolEvent('optimistic-sprite-settled', { requestId: 'one', accepted: false });
  expect(mock.state.sprites[0].width).toBe(80);
  emitProtocolEvent('optimistic-sprite-settled', { requestId: 'two', accepted: false });
  expect(mock.state.sprites[0].width).toBe(50);
});

it('restores a denied deletion with the same renderer identity and table', () => {
  const { engine } = harness();
  emitProtocolEvent('optimistic-sprite-command', { requestId: 'remove', tableId: 't1', spriteId: 's1', kind: 'remove', patch: {} });
  expect(mock.state.sprites[0].isVisible).toBe(false);
  expect(engine.remove_sprite).toHaveBeenCalledWith('s1');
  emitProtocolEvent('optimistic-sprite-settled', { requestId: 'remove', accepted: false });
  expect(mock.state.sprites[0].isVisible).not.toBe(false);
  expect(engine.add_sprite_to_layer).toHaveBeenCalledWith('tokens', expect.objectContaining({ id: 's1', table_id: 't1' }));
});
