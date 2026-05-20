import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitWasmEvent, onWasmEvent, onWasmEvents } from '../wasmEvents';

afterEach(() => {
  // ensure no event listeners leak between tests
  vi.restoreAllMocks();
});

describe('emitWasmEvent', () => {
  it('dispatches a CustomEvent on window with correct type', () => {
    const spy = vi.fn();
    window.addEventListener('wasm-ready', spy);
    emitWasmEvent('wasm-ready', { timestamp: 1000, module: {} });
    expect(spy).toHaveBeenCalledOnce();
    window.removeEventListener('wasm-ready', spy);
  });

  it('passes detail payload to listeners', () => {
    const received: { timestamp: number; module: unknown }[] = [];
    window.addEventListener('wasm-ready', (e) => {
      received.push((e as CustomEvent).detail);
    });
    emitWasmEvent('wasm-ready', { timestamp: 42, module: { version: 1 } });
    window.removeEventListener('wasm-ready', () => {});
    expect(received[0]).toMatchObject({ timestamp: 42 });
  });

  it('works for sprite-created event', () => {
    const handler = vi.fn();
    window.addEventListener('sprite-created', handler);
    emitWasmEvent('sprite-created', { sprite_id: 'sp1', x: 10, y: 20 });
    expect(handler).toHaveBeenCalled();
    window.removeEventListener('sprite-created', handler);
  });
});

describe('onWasmEvent', () => {
  it('calls handler when event fires', () => {
    const handler = vi.fn();
    const off = onWasmEvent('sprite-moved', handler);
    emitWasmEvent('sprite-moved', { sprite_id: 'sp1', x: 5, y: 10 });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ sprite_id: 'sp1', x: 5, y: 10 }));
    off();
  });

  it('returns an unsubscribe function that removes the listener', () => {
    const handler = vi.fn();
    const off = onWasmEvent('sprite-removed', handler);
    off();
    emitWasmEvent('sprite-removed', { sprite_id: 'dead' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call other handlers for different events', () => {
    const handler = vi.fn();
    const off = onWasmEvent('sprite-updated', handler);
    emitWasmEvent('sprite-created', { sprite_id: 'other' });
    expect(handler).not.toHaveBeenCalled();
    off();
  });

  it('receives correct detail for render-manager-ready', () => {
    const handler = vi.fn();
    const off = onWasmEvent('render-manager-ready', handler);
    emitWasmEvent('render-manager-ready', {});
    expect(handler).toHaveBeenCalledWith({});
    off();
  });
});

describe('onWasmEvents', () => {
  it('registers multiple handlers and all fire', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const off = onWasmEvents([
      ['sprite-created', h1],
      ['sprite-removed', h2],
    ]);
    emitWasmEvent('sprite-created', { sprite_id: 'a' });
    emitWasmEvent('sprite-removed', { sprite_id: 'b' });
    expect(h1).toHaveBeenCalledWith(expect.objectContaining({ sprite_id: 'a' }));
    expect(h2).toHaveBeenCalledWith(expect.objectContaining({ sprite_id: 'b' }));
    off();
  });

  it('cleanup removes all handlers at once', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const off = onWasmEvents([
      ['sprite-created', h1],
      ['sprite-moved', h2],
    ]);
    off();
    emitWasmEvent('sprite-created', { sprite_id: 'x' });
    emitWasmEvent('sprite-moved', { sprite_id: 'x', x: 0, y: 0 });
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });
});
