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

function readPixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 context unavailable');
  const pixel = new Uint8Array(4);
  gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return [...pixel];
}

function brightness(pixel: number[]): number {
  return pixel[0] + pixel[1] + pixel[2];
}

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

  it('renders a bounded table plane without map imagery or a grid', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 160;
    const engine = new RenderEngine(canvas);
    try {
      const snapshot = normalizeTableSnapshot({ table_data: {
        table_id: '550e8400-e29b-41d4-a716-446655440010',
        table_name: 'Surface fallback',
        width: 100,
        height: 100,
        scale: 1,
        grid_enabled: false,
        layers: {},
      } });
      engine.handle_table_data(snapshot.renderer);
      engine.set_grid_enabled(false);
      engine.set_background_color('#204060');
      engine.render();

      const insideTable = readPixel(canvas, 50, 50);
      const outsideTable = readPixel(canvas, 180, 120);
      expect(insideTable.slice(0, 3)).toEqual([32, 64, 96]);
      expect(brightness(insideTable)).toBeGreaterThan(brightness(outsideTable) + 100);
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

  it('exports sight-blocking walls independently from light-blocking walls', () => {
    const engine = new RenderEngine(document.createElement('canvas'));
    try {
      expect(engine.add_wall(JSON.stringify({
        wall_id: 'sight-only', table_id: 'table-1',
        x1: 10, y1: 20, x2: 30, y2: 40,
        blocks_light: false, blocks_sight: true,
      }))).toBe(true);
      expect([...engine.get_obstacle_segments_flat()]).toEqual([10, 20, 30, 40]);
      expect([...engine.get_light_obstacle_segments_flat()]).toEqual([]);

      expect(engine.update_wall('sight-only', JSON.stringify({
        blocks_light: true, blocks_sight: false,
      }))).toBe(true);
      expect([...engine.get_obstacle_segments_flat()]).toEqual([]);
      expect([...engine.get_light_obstacle_segments_flat()]).toEqual([10, 20, 30, 40]);
    } finally {
      engine.free();
    }
  });

  it('exports exact transformed line obstacle endpoints', () => {
    const engine = new RenderEngine(document.createElement('canvas'));
    try {
      engine.add_sprite_to_layer('obstacles', {
        id: 'line-1', table_id: '550e8400-e29b-41d4-a716-446655440001',
        world_x: 0, world_y: 0, width: 10, height: 4, scale_x: 1, scale_y: 1,
        rotation: 0, layer: 'obstacles', texture_id: '', tint_color: [1, 1, 1, 1],
        obstacle_type: 'line', polygon_vertices: [[0, 0], [10, 0]], shape_filled: false,
      });

      expect([...engine.get_obstacle_segments_flat()]).toEqual([0, 0, 10, 0]);
      expect(engine.update_sprite_position('line-1', 5, 6)).toBe(true);
      expect(engine.rotate_sprite('line-1', 90)).toBe(true);
      const transformed = [...engine.get_obstacle_segments_flat()];
      expect(transformed).toHaveLength(4);
      expect(transformed[0]).toBeCloseTo(10, 3);
      expect(transformed[1]).toBeCloseTo(1, 3);
      expect(transformed[2]).toBeCloseTo(10, 3);
      expect(transformed[3]).toBeCloseTo(11, 3);
    } finally {
      engine.free();
    }
  });

  it('exports circular obstacles as a closed segmented ellipse', () => {
    const engine = new RenderEngine(document.createElement('canvas'));
    try {
      engine.add_sprite_to_layer('obstacles', {
        id: 'circle-1', table_id: '550e8400-e29b-41d4-a716-446655440002',
        world_x: 10, world_y: 20, width: 40, height: 20, scale_x: 1, scale_y: 1,
        rotation: 0, layer: 'obstacles', texture_id: '', tint_color: [1, 1, 1, 1],
        obstacle_type: 'circle', shape_filled: false,
      });

      const segments = [...engine.get_obstacle_segments_flat()];
      expect(segments).toHaveLength(32 * 4);
      expect(segments[0]).toBeCloseTo(50, 3);
      expect(segments[1]).toBeCloseTo(30, 3);
      expect(segments.at(-2)).toBeCloseTo(segments[0], 3);
      expect(segments.at(-1)).toBeCloseTo(segments[1], 3);
    } finally {
      engine.free();
    }
  });

  it('casts a wall shadow from either side of a point light', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const engine = new RenderEngine(canvas);
    const tableId = '550e8400-e29b-41d4-a716-446655440003';
    try {
      const snapshot = normalizeTableSnapshot({ table_data: {
        table_id: tableId, table_name: 'Shadow test', width: 200, height: 200,
        scale: 1, grid_enabled: false, layers: {},
      } });
      engine.handle_table_data(snapshot.renderer);
      engine.set_background_color('#000000');
      expect(engine.add_wall(JSON.stringify({
        wall_id: 'wall-shadow', table_id: tableId,
        x1: 100, y1: 50, x2: 100, y2: 150,
        blocks_light: true, blocks_sight: true,
      }))).toBe(true);
      engine.add_light('light-shadow', 60, 100);
      engine.set_light_color('light-shadow', 1, 1, 1, 1);
      engine.set_light_intensity('light-shadow', 2);
      engine.set_light_radius('light-shadow', 90);

      engine.render();
      const litFromLeft = brightness(readPixel(canvas, 80, 100));
      const shadowFromLeft = brightness(readPixel(canvas, 130, 100));
      expect(litFromLeft).toBeGreaterThan(shadowFromLeft + 20);

      engine.update_light_position('light-shadow', 140, 100);
      engine.render();
      const litFromRight = brightness(readPixel(canvas, 120, 100));
      const shadowFromRight = brightness(readPixel(canvas, 70, 100));
      expect(litFromRight).toBeGreaterThan(shadowFromRight + 20);
    } finally {
      engine.free();
    }
  });

  it('clears the stencil shadow mask between point lights', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const engine = new RenderEngine(canvas);
    const tableId = '550e8400-e29b-41d4-a716-446655440004';
    try {
      const snapshot = normalizeTableSnapshot({ table_data: {
        table_id: tableId, table_name: 'Multi-light test', width: 200, height: 200,
        scale: 1, grid_enabled: false, layers: {},
      } });
      engine.handle_table_data(snapshot.renderer);
      engine.set_background_color('#000000');
      expect(engine.add_wall(JSON.stringify({
        wall_id: 'wall-multi', table_id: tableId,
        x1: 100, y1: 50, x2: 100, y2: 150,
        blocks_light: true, blocks_sight: true,
      }))).toBe(true);
      engine.add_light('left-light', 60, 100);
      engine.add_light('right-light', 140, 100);
      for (const lightId of ['left-light', 'right-light']) {
        engine.set_light_color(lightId, 1, 1, 1, 1);
        engine.set_light_intensity(lightId, 2);
        engine.set_light_radius(lightId, 90);
      }

      engine.render();

      expect(brightness(readPixel(canvas, 80, 100))).toBeGreaterThan(20);
      expect(brightness(readPixel(canvas, 120, 100))).toBeGreaterThan(20);
    } finally {
      engine.free();
    }
  });

  it('calculate_asset_hash() matches the server xxHash64 contract', () => {
    expect(calculate_asset_hash(new TextEncoder().encode('hello')))
      .toBe('26c7827d889f6da3');
  });
});
