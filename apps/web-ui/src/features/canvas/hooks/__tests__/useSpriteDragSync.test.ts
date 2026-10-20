import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSpriteDragSync } from '../useSpriteDragSync';

const store = vi.hoisted(() => ({ activeTableId: 't1' as string | null }));
vi.mock('@/store', () => ({ useGameStore: { getState: () => store } }));
afterEach(() => { vi.useRealTimers(); store.activeTableId = 't1'; });

function event(type: string, detail: unknown) { window.dispatchEvent(new CustomEvent(type, { detail })); }

it('never stamps an older sample with a newly active table', () => {
  vi.useFakeTimers();
  const send = vi.fn(); const hook = renderHook(() => useSpriteDragSync(send));
  event('sprite-drag-preview', { spriteId: 'one', x: 10, y: 20 });
  store.activeTableId = 't2';
  vi.advanceTimersByTime(50);
  expect(send).not.toHaveBeenCalled();
  hook.unmount();
});

it('coalesces samples, carries sequence/expiry and cancels the final tail on commit', () => {
  vi.useFakeTimers();
  const send = vi.fn(); const hook = renderHook(() => useSpriteDragSync(send));
  event('sprite-drag-preview', { spriteId: 'one', x: 10, y: 20 });
  event('sprite-drag-preview', { spriteId: 'one', x: 30, y: 40 });
  vi.advanceTimersByTime(50);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: 'one', table_id: 't1', x: 30, y: 40, sequence: 2 }) }));
  event('sprite-drag-preview', { spriteId: 'one', x: 50, y: 60 });
  event('wasm-sprite-operation', { spriteId: 'one', operation: 'move' });
  vi.advanceTimersByTime(50);
  expect(send).toHaveBeenCalledTimes(1);
  event('sprite-resize-preview', { spriteId: 'one', width: 60, height: 60 });
  hook.unmount();
  vi.advanceTimersByTime(50);
  expect(send).toHaveBeenCalledTimes(1);
});
