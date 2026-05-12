import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWasm } from '../useWasm';

vi.mock('../wasmManager', () => ({
  wasmManager: {
    getWasmModule: vi.fn(),
  },
}));

import { wasmManager } from '../wasmManager';

const mockApi = { version: '1.0', create_default_brush_presets: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useWasm', () => {
  it('starts with isReady=false and api=null', () => {
    (wasmManager.getWasmModule as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useWasm());
    expect(result.current.isReady).toBe(false);
    expect(result.current.api).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sets isReady=true and api when module resolves', async () => {
    (wasmManager.getWasmModule as ReturnType<typeof vi.fn>).mockResolvedValue(mockApi);
    const { result } = renderHook(() => useWasm());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.api).toBe(mockApi);
    expect(result.current.error).toBeNull();
  });

  it('sets error when module rejects', async () => {
    const err = new Error('WASM load failed');
    (wasmManager.getWasmModule as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    const { result } = renderHook(() => useWasm());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error?.message).toBe('WASM load failed');
    expect(result.current.isReady).toBe(false);
  });

  it('wraps non-Error rejections in an Error', async () => {
    (wasmManager.getWasmModule as ReturnType<typeof vi.fn>).mockRejectedValue('string error');
    const { result } = renderHook(() => useWasm());
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  });
});
