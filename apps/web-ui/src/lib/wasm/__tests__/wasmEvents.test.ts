import { describe, it, expect, vi, afterEach } from 'vitest';
import { emitWasmEvent, onWasmEvent } from '../wasmEvents';

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
