import { beforeEach, describe, expect, it, vi } from 'vitest';

// Do NOT mock wasmManager here — we want to exercise the real code

// Mock the WASM module itself so it doesn't try to load .wasm binary
vi.mock('@lib/wasm/wasm', () => ({}));

import { wasmManager, initializeWasm } from '@lib/wasm/wasmManager';

beforeEach(() => {
  // Reset singleton state between tests so each gets a fresh init
  (wasmManager as unknown as Record<string, unknown>)['wasmModule'] = null;
  (wasmManager as unknown as Record<string, unknown>)['initPromise'] = null;
  (wasmManager as unknown as Record<string, unknown>)['isInitialized'] = false;
});

describe('WasmManager', () => {
  it('getInstance returns same instance each time', async () => {
    // Import the class indirectly via the exported singleton reference
    const { wasmManager: wm2 } = await import('@lib/wasm/wasmManager');
    expect(wm2).toBe(wasmManager);
  });

  it('getWasmModule resolves with a module object in test env', async () => {
    const mod = await wasmManager.getWasmModule();
    expect(mod).toBeDefined();
    expect(typeof mod).toBe('object');
  });

  it('getWasmModule returns cached module on second call', async () => {
    const first = await wasmManager.getWasmModule();
    const second = await wasmManager.getWasmModule();
    expect(first).toBe(second);
  });

  it('concurrent calls resolve to the same module', async () => {
    const p1 = wasmManager.getWasmModule();
    const p2 = wasmManager.getWasmModule();
    const [m1, m2] = await Promise.all([p1, p2]);
    expect(m1).toBe(m2);
  });

  it('isReady returns true after successful init', async () => {
    await wasmManager.getWasmModule();
    expect(wasmManager.isReady()).toBe(true);
  });

  it('isReady returns false before init', () => {
    expect(wasmManager.isReady()).toBe(false);
  });

  it('initializeWasm helper resolves with the module', async () => {
    const mod = await initializeWasm();
    expect(mod).toBeDefined();
  });

  it('mock module includes create_default_brush_presets', async () => {
    const mod = await wasmManager.getWasmModule();
    expect(typeof mod.create_default_brush_presets).toBe('function');
    expect(Array.isArray(mod.create_default_brush_presets())).toBe(true);
  });

  it('mock module default() resolves without error', async () => {
    const mod = await wasmManager.getWasmModule();
    await expect(mod.default()).resolves.toBeUndefined();
  });

  it('getRenderEngine returns the RenderEngine constructor', async () => {
    const engine = await wasmManager.getRenderEngine();
    expect(engine).toBeDefined();
  });

  it('getAssetManager returns AssetManager', async () => {
    const am = await wasmManager.getAssetManager();
    expect(am).toBeDefined();
  });
});
