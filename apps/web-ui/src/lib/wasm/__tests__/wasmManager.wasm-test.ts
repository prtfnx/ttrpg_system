/**
 * Real-browser WASM integration tests.
 *
 * These run via Vitest browser mode (Playwright / Chromium) so the WASM
 * module is loaded from the built file at /wasm/ttrpg_rust_core.js.
 * They are intentionally skipped in the jsdom project (pattern: *.wasm-test.ts).
 *
 * Prerequisites:
 *   1. Build WASM first:  .\build_and_deploy.ps1 -WasmOnly
 *   2. Run tests:          pnpm vitest run --project browser
 */
import { describe, it, expect, beforeAll } from 'vitest';

let wasm: Record<string, unknown>;

beforeAll(async () => {
  // Dynamic path — Vite serves public/ files under the root during test.
  // @ts-expect-error — runtime URL not resolvable at compile time
  wasm = await import(/* @vite-ignore */ '/wasm/ttrpg_rust_core.js');
  if (typeof (wasm as { default?: () => Promise<void> }).default === 'function') {
    await (wasm as { default: () => Promise<void> }).default();
  }
});

describe('WASM module (real browser)', () => {
  it('version() returns a semver string', () => {
    const v = (wasm as { version?: () => string }).version?.();
    expect(typeof v).toBe('string');
    expect(v!.length).toBeGreaterThan(0);
    const parts = v!.split('.');
    expect(parts.length).toBeGreaterThanOrEqual(3);
    parts.forEach(p => expect(p[0]).toMatch(/\d/));
  });

  it('create_default_brush_presets() is non-empty', () => {
    const fn_ = (wasm as { create_default_brush_presets?: () => unknown[] })
      .create_default_brush_presets;
    expect(typeof fn_).toBe('function');
    const presets = fn_!();
    // JsValue array from wasm-bindgen; length > 0 confirms the preset list exists.
    expect((presets as unknown[]).length ?? presets).toBeTruthy();
  });

  it('compute_visibility_polygon() returns an array-like value', () => {
    const fn_ = (wasm as {
      compute_visibility_polygon?: (px: number, py: number, obs: Float32Array, r: number) => unknown;
    }).compute_visibility_polygon;
    expect(typeof fn_).toBe('function');
    const result = fn_!(0, 0, new Float32Array(0), 100);
    // Result is a JS array/object from wasm-bindgen
    expect(result !== null && result !== undefined).toBe(true);
  });
});
