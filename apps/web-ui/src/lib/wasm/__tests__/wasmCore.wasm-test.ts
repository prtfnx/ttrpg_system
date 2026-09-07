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
  RenderEngine,
  calculate_asset_hash,
  compute_visibility_polygon,
  create_default_brush_presets,
  version,
} from '../generated/ttrpg_rust_core';

beforeAll(async () => {
  await initWasm(new URL('../generated/ttrpg_rust_core_bg.wasm', import.meta.url));
});

describe('WASM module (real browser)', () => {
  it('keeps rendering after malformed UTF-8 colors arrive from a table', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const engine = new RenderEngine(canvas);
    try {
      for (const color of ['💥aa', '#💥aa', 'a💥a', 'ééé']) {
        engine.handle_table_data({
          table_id: 'color-regression', table_name: 'Colors', width: 1000, height: 1000, scale: 1,
          layers: { tokens: [{
            sprite_id: 'light-token', texture_path: '', coord_x: 100, coord_y: 100,
            scale_x: 1, scale_y: 1, layer: 'tokens', width: 50, height: 50,
            aura_radius: 100, aura_color: color,
          }] },
        });
        engine.set_background_color(color);
        engine.set_shape_style(color, 1, true);
        engine.render();
        expect(engine.get_active_table_id()).toBe('color-regression');
        expect(engine.get_layer_sprite_count('tokens')).toBe(1);
      }
      engine.set_background_color('#123456');
      engine.render();
    } finally {
      engine.free();
    }
  });

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

  it('calculate_asset_hash() matches the server xxHash64 contract', () => {
    expect(calculate_asset_hash(new TextEncoder().encode('hello')))
      .toBe('26c7827d889f6da3');
  });
});
