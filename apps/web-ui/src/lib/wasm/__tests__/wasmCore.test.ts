import { beforeEach, describe, expect, it, vi } from 'vitest';

const initWasm = vi.hoisted(() => vi.fn());

vi.mock('../generated/ttrpg_rust_core', () => ({ default: initWasm }));

describe('initializeWasmCore', () => {
  beforeEach(() => {
    vi.resetModules();
    initWasm.mockReset();
    initWasm.mockResolvedValue({});
  });

  it('uses the generated options-form initializer and shares an in-flight attempt', async () => {
    const { initializeWasmCore } = await import('../wasmCore');

    await Promise.all([initializeWasmCore(), initializeWasmCore()]);

    expect(initWasm).toHaveBeenCalledOnce();
    expect(initWasm).toHaveBeenCalledWith({
      module_or_path: expect.any(URL),
    });
  });

  it('clears a rejected attempt so an intentional retry can succeed', async () => {
    initWasm.mockRejectedValueOnce(new Error('load failed')).mockResolvedValueOnce({});
    const { initializeWasmCore } = await import('../wasmCore');

    await expect(initializeWasmCore()).rejects.toThrow('load failed');
    await expect(initializeWasmCore()).resolves.toBeUndefined();

    expect(initWasm).toHaveBeenCalledTimes(2);
  });
});
