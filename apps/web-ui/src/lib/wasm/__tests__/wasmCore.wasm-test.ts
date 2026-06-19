/**
 * Real-browser WASM integration tests.
 *
 * These run via Vitest browser mode (Playwright / Chromium) so the generated
 * browser ESM module and WASM binary are loaded through the same source path
 * used by the app runtime.
 *
 * Prerequisites:
 *   1. Build WASM first:  .\scripts\build-wasm.ps1
 *   2. Run tests:          pnpm vitest run --project browser
 */
import { beforeAll, describe, expect, it } from 'vitest';
import initWasm, {
  compute_visibility_polygon,
  create_default_brush_presets,
  version,
} from '../generated/ttrpg_rust_core';

beforeAll(async () => {
  await initWasm(new URL('../generated/ttrpg_rust_core_bg.wasm', import.meta.url));
});

describe('WASM module (real browser)', () => {
  it('version() returns a semver string', () => {
    const v = version();
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
    const parts = v.split('.');
    expect(parts.length).toBeGreaterThanOrEqual(3);
    parts.forEach(part => expect(part[0]).toMatch(/\d/));
  });

  it('create_default_brush_presets() is non-empty', () => {
    const presets = create_default_brush_presets();
    expect(presets.length).toBeGreaterThan(0);
  });

  it('compute_visibility_polygon() returns an array-like value', () => {
    const result = compute_visibility_polygon(0, 0, new Float32Array(0), 100);
    expect(result !== null && result !== undefined).toBe(true);
  });
});
