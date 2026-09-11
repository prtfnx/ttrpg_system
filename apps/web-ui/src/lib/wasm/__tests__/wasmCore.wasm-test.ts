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
import { beforeAll, describe, expect, it, vi } from 'vitest';
import initWasm, {
  RenderEngine,
  TableSync,
  calculate_asset_hash,
  compute_visibility_polygon,
  create_default_brush_presets,
  version,
} from '../generated/ttrpg_rust_core';
import { normalizeTableSnapshot } from '../tableSnapshot';

beforeAll(async () => {
  await initWasm({ module_or_path: new URL('../generated/ttrpg_rust_core_bg.wasm', import.meta.url) });
});

describe('WASM module (real browser)', () => {
  it('accepts a Python-serialized table only after canonical DTO conversion', () => {
    const snapshot = normalizeTableSnapshot({
      table_data: {
        table_id: '550e8400-e29b-41d4-a716-446655440000',
        table_name: 'Boundary fixture',
        width: 1000,
        height: 800,
        scale: [1, 1],
        position: [12, -4],
        grid_cell_px: 70,
        cell_distance: 5,
        distance_unit: 'ft',
        grid_enabled: false,
        snap_to_grid: true,
        layers: {
          tokens: {
            '1': {
              sprite_id: 'fixture-sprite',
              position: [0, 15],
              texture_path: null,
              scale_x: 1,
              scale_y: 1,
              width: 50,
              height: 50,
              controlled_by: [1],
            },
          },
        },
        walls: [{ wall_id: 'wall-1', x1: 0, y1: 0, x2: 10, y2: 10 }],
      },
    });
    const tableSync = new TableSync();
    try {
      expect(() => tableSync.handle_table_data(snapshot.renderer)).not.toThrow();
      expect(tableSync.get_table_id()).toBe(snapshot.renderer.table_id);
      expect(tableSync.get_sprites()).toEqual([
        expect.objectContaining({ sprite_id: 'fixture-sprite', coord_x: 0, coord_y: 15 }),
      ]);
    } finally {
      tableSync.free();
    }
  });

  it.each(['load', 'error', 'dispose'])('releases texture callbacks after %s', async (outcome) => {
    const onload = vi.spyOn(HTMLImageElement.prototype, 'onload', 'set');
    const deleteTexture = vi.spyOn(WebGL2RenderingContext.prototype, 'deleteTexture');
    const engine = new RenderEngine(document.createElement('canvas'));
    let disposed = false;
    try {
      const images = [...new Set(onload.mock.contexts)] as HTMLImageElement[];
      expect(images.length).toBeGreaterThan(0);
      const image = images[0];
      expect(image.onload).not.toBeNull();
      if (outcome === 'load') {
        image.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=';
        await vi.waitFor(() => expect(image.onload).toBeNull());
        engine.render();
      } else if (outcome === 'error') {
        image.onerror?.call(image, new Event('error'));
        engine.render();
      } else {
        engine.free();
        disposed = true;
      }
      for (const pending of images) {
        expect(pending.onload).toBeNull();
        expect(pending.onerror).toBeNull();
      }
      if (!disposed) {
        engine.free();
        disposed = true;
      }
      expect(deleteTexture).toHaveBeenCalled();
    } finally {
      if (!disposed) engine.free();
      onload.mockRestore();
      deleteTexture.mockRestore();
    }
  });

  it('reports unavailable WebGL without poisoning the WASM module', () => {
    const canvas = document.createElement('canvas');
    const context = vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    try {
      expect(() => new RenderEngine(canvas)).toThrow('WebGL2 is unavailable');
    } finally {
      context.mockRestore();
    }
    const engine = new RenderEngine(document.createElement('canvas'));
    engine.render();
    engine.free();
  });

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
