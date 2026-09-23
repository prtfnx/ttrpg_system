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
  compute_visibility_polygons,
  create_default_brush_presets,
  version,
} from '../generated/ttrpg_rust_core';
import { normalizeTableSnapshot } from '../tableSnapshot';
import { WasmRuntime } from '../runtime/WasmRuntime';
import { emitProtocolEvent } from '../../websocket/protocolEvents';
import { useGameStore } from '@/store';

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

function hydrateEmptyTable(engine: RenderEngine, tableId: string): void {
  const snapshot = normalizeTableSnapshot({ table_data: {
    table_id: tableId, table_name: 'Test table', width: 200, height: 200,
    scale: 1, grid_cell_px: 50, cell_distance: 5, distance_unit: 'ft', layers: {},
  } });
  engine.handle_table_data(snapshot.renderer);
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

  it('rejects an invalid snapshot before replacing the visible table', () => {
    const engine = new RenderEngine(document.createElement('canvas'));
    try {
      const valid = normalizeTableSnapshot({ table_data: {
        table_id: '550e8400-e29b-41d4-a716-446655440011', table_name: 'Stable', width: 200, height: 200,
        scale: 1, grid_cell_px: 50, cell_distance: 5, distance_unit: 'ft',
        layers: { tokens: {} },
      } });
      engine.handle_table_data(valid.renderer);

      expect(() => engine.handle_table_data({
        ...valid.renderer,
        table_id: '550e8400-e29b-41d4-a716-446655440012',
        layers: { unknown_layer: [] },
      })).toThrow(/Unknown renderer layer/);
      expect(engine.get_active_table_id()).toBe('550e8400-e29b-41d4-a716-446655440011');
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

  it('reports renderer-owned counters for a real submitted frame', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 160;
    const engine = new RenderEngine(canvas);
    try {
      const snapshot = normalizeTableSnapshot({ table_data: {
        table_id: '550e8400-e29b-41d4-a716-446655440013',
        table_name: 'Diagnostics fixture',
        width: 200,
        height: 120,
        scale: 1,
        grid_enabled: false,
        layers: {
          tokens: {
            first: { sprite_id: 'first', position: [20, 20], width: 20, height: 20 },
            second: { sprite_id: 'second', position: [60, 20], width: 20, height: 20 },
          },
        },
      } });
      engine.handle_table_data(snapshot.renderer);

      engine.render();
      const first = engine.get_render_diagnostics();
      expect(first).toMatchObject({
        frameNumber: 1,
        spritesConsidered: 2,
        spritesDrawn: 2,
        spritesCulled: 0,
        occlusionRevision: 1,
        occlusionRebuilds: 1,
      });
      expect(first.drawCalls).toBeGreaterThanOrEqual(4);
      expect(first.bufferUploads).toBeGreaterThanOrEqual(first.drawCalls);
      expect(first.residentTextures).toBeGreaterThanOrEqual(1);

      engine.render();
      expect(engine.get_render_diagnostics()).toMatchObject({
        frameNumber: 2,
        occlusionRevision: 1,
        occlusionRebuilds: 1,
      });
    } finally {
      engine.free();
    }
  });

  it('uploads immutable quad indices once while rendering each quad variant', () => {
    const bufferData = vi.spyOn(WebGL2RenderingContext.prototype, 'bufferData');
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 160;
    const engine = new RenderEngine(canvas);
    const staticElementUploads = (): number => bufferData.mock.calls.filter(
      ([target, , usage]) => target === WebGL2RenderingContext.ELEMENT_ARRAY_BUFFER
        && usage === WebGL2RenderingContext.STATIC_DRAW,
    ).length;

    try {
      expect(staticElementUploads()).toBe(1);
      const snapshot = normalizeTableSnapshot({ table_data: {
        table_id: '550e8400-e29b-41d4-a716-446655440014',
        table_name: 'Quad pipeline fixture',
        width: 200,
        height: 120,
        scale: 1,
        grid_enabled: false,
        layers: {
          tokens: {
            textured: {
              sprite_id: 'textured', position: [20, 20], width: 30, height: 30,
              texture_path: 'font_atlas',
            },
            shape: {
              sprite_id: 'shape', position: [70, 20], width: 30, height: 30,
              obstacle_type: 'rectangle', tint_color: [0.2, 0.7, 0.3, 1],
            },
          },
        },
      } });
      engine.handle_table_data(snapshot.renderer);
      engine.set_gm_mode(true);
      engine.set_input_mode_select();
      expect(engine.handle_mouse_down_full(30, 30, false, true)).toBe('textured');

      engine.render();
      engine.render();

      expect(engine.get_selected_sprites()).toContain('textured');
      expect(staticElementUploads()).toBe(1);
      const gl = canvas.getContext('webgl2');
      expect(gl?.getError()).toBe(gl?.NO_ERROR);
    } finally {
      engine.free();
      bufferData.mockRestore();
    }
  });

  it('resolves lighting attributes and uniforms only during pipeline construction', () => {
    const getAttribLocation = vi.spyOn(WebGL2RenderingContext.prototype, 'getAttribLocation');
    const getUniformLocation = vi.spyOn(WebGL2RenderingContext.prototype, 'getUniformLocation');
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 160;
    const engine = new RenderEngine(canvas);

    try {
      hydrateEmptyTable(engine, '550e8400-e29b-41d4-a716-446655440015');
      engine.add_light('pipeline-light', 80, 60);
      const attribLookupsAfterConstruction = getAttribLocation.mock.calls.length;
      const uniformLookupsAfterConstruction = getUniformLocation.mock.calls.length;

      engine.render();
      engine.render();

      expect(engine.get_render_diagnostics()).toMatchObject({
        frameNumber: 2,
        activeLights: 1,
      });
      expect(getAttribLocation).toHaveBeenCalledTimes(attribLookupsAfterConstruction);
      expect(getUniformLocation).toHaveBeenCalledTimes(uniformLookupsAfterConstruction);
      const gl = canvas.getContext('webgl2');
      expect(gl?.getError()).toBe(gl?.NO_ERROR);
    } finally {
      engine.free();
      getAttribLocation.mockRestore();
      getUniformLocation.mockRestore();
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

  it('compute_visibility_polygons() batches origins against one obstacle scene', () => {
    const obstacles = new Float32Array([0, 50, 100, 50]);
    const sources = new Float32Array([25, 0, 100, 75, 100, 80]);
    const batched = compute_visibility_polygons(sources, obstacles) as Array<Array<{ x: number; y: number }>>;

    expect(batched).toHaveLength(2);
    expect(batched[0]).toEqual(compute_visibility_polygon(25, 0, obstacles, 100));
    expect(batched[1]).toEqual(compute_visibility_polygon(75, 100, obstacles, 80));
  });

  it('switches complete scenes and replays the active table after real WebGL context restoration', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 140;
    document.body.append(canvas);
    const runtime = new WasmRuntime();
    const tableA = '550e8400-e29b-41d4-a716-446655440021';
    const tableB = '550e8400-e29b-41d4-a716-446655440022';
    const tablePayload = (tableId: string, tokenId: string, x: number, background: string, auraRadius?: number) => ({
      table_data: {
        table_id: tableId,
        table_name: tokenId,
        width: 200,
        height: 120,
        scale: 1,
        grid_enabled: false,
        background_color_hex: background,
        layers: {
          tokens: [{
            sprite_id: tokenId,
            texture_path: '',
            coord_x: x,
            coord_y: 50,
            scale_x: 1,
            scale_y: 1,
            width: 20,
            height: 20,
          }],
          light: auraRadius ? [{
            sprite_id: `light-${tokenId}`,
            texture_path: '__LIGHT__',
            layer: 'light',
            coord_x: x + 10,
            coord_y: 60,
            scale_x: 1,
            scale_y: 1,
            width: 20,
            height: 20,
            metadata: JSON.stringify({ radius: auraRadius, intensity: 2, color: '#ffffff', isOn: true }),
          }] : [],
        },
      },
    });

    try {
      runtime.start();
      await runtime.attachCanvas(canvas, { userId: 1, role: 'owner', activeLayer: 'tokens' });

      useGameStore.setState({ activeTableId: tableA });
      emitProtocolEvent('table-data-received', tablePayload(tableA, 'token-a', 20, '#203040'));
      await vi.waitFor(() => expect(runtime.status.frameTableId).toBe(tableA));
      expect(runtime.getRenderEngine()?.get_layer_sprite_count('tokens')).toBe(1);
      expect(runtime.getRenderEngine()?.get_sprite_position('token-a')).toBeDefined();

      useGameStore.setState({ activeTableId: tableB });
      emitProtocolEvent('table-data-received', tablePayload(tableB, 'token-b', 90, '#000000', 45));
      await vi.waitFor(() => expect(runtime.status.frameTableId).toBe(tableB));
      expect(runtime.getRenderEngine()?.get_active_table_id()).toBe(tableB);
      expect(runtime.getRenderEngine()?.get_sprite_position('token-a')).toBeUndefined();
      expect(runtime.getRenderEngine()?.get_sprite_position('token-b')).toBeDefined();
      runtime.getRenderEngine()?.render();
      expect(brightness(readPixel(canvas, 100, 60))).toBeGreaterThan(brightness(readPixel(canvas, 190, 110)) + 20);

      const gl = canvas.getContext('webgl2');
      const contextControl = gl?.getExtension('WEBGL_lose_context');
      expect(contextControl).not.toBeNull();
      const contextLost = new Promise<void>(resolve => {
        canvas.addEventListener('webglcontextlost', () => resolve(), { once: true });
      });
      contextControl?.loseContext();
      await contextLost;
      await vi.waitFor(() => expect(runtime.status.isContextLost).toBe(true));
      expect(runtime.getRenderEngine()).toBeNull();
      expect(gl?.isContextLost()).toBe(true);

      const contextRestored = new Promise<void>(resolve => {
        canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true });
      });
      // Chromium requires the loss event to finish and the context to enter
      // its restorable state before WEBGL_lose_context accepts restoration.
      await new Promise(resolve => setTimeout(resolve, 100));
      contextControl?.restoreContext();
      await contextRestored;
      await vi.waitFor(() => {
        expect(runtime.status.isContextLost).toBe(false);
        expect(runtime.status.frameTableId).toBe(tableB);
      }, { timeout: 5_000 });

      expect(runtime.getRenderEngine()?.get_active_table_id()).toBe(tableB);
      expect(runtime.getRenderEngine()?.get_layer_sprite_count('tokens')).toBe(1);
      expect(runtime.getRenderEngine()?.get_sprite_position('token-b')).toBeDefined();
      runtime.getRenderEngine()?.render();
      expect(brightness(readPixel(canvas, 100, 60))).toBeGreaterThan(brightness(readPixel(canvas, 190, 110)) + 20);
    } finally {
      runtime.dispose();
      useGameStore.setState({ activeTableId: null, sprites: [] });
      canvas.remove();
    }
  }, 30_000);

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
      hydrateEmptyTable(engine, '550e8400-e29b-41d4-a716-446655440001');
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
      hydrateEmptyTable(engine, '550e8400-e29b-41d4-a716-446655440002');
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
      engine.set_dynamic_lighting_enabled(false);
      engine.set_background_color('#000000');
      engine.render(); // Grow shared dynamic buffers before measuring the light batch.
      for (const [index, x] of [90, 100, 110].entries()) {
        expect(engine.add_wall(JSON.stringify({
          wall_id: `wall-multi-${index}`, table_id: tableId,
          x1: x, y1: 50, x2: x, y2: 150,
          blocks_light: true, blocks_sight: true,
        }))).toBe(true);
      }
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
      const diagnostics = engine.get_render_diagnostics();
      expect(diagnostics.activeLights).toBe(2);
      expect(diagnostics.shadowSegmentsAccepted).toBeGreaterThan(diagnostics.shadowDrawCalls);
      expect(diagnostics.shadowDrawCalls).toBeLessThanOrEqual(diagnostics.activeLights);
      expect(diagnostics.bufferUploads).toBe(diagnostics.drawCalls);
    } finally {
      engine.free();
    }
  });

  it('clips point-light accumulation to the active table plane', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 120;
    const engine = new RenderEngine(canvas);
    const tableId = '550e8400-e29b-41d4-a716-446655440013';
    try {
      const snapshot = normalizeTableSnapshot({ table_data: {
        table_id: tableId, table_name: 'Light clipping', width: 100, height: 100,
        scale: 1, grid_enabled: false, layers: {},
      } });
      engine.handle_table_data(snapshot.renderer);
      engine.set_background_color('#000000');
      engine.add_light_for_table('edge-light', 90, 50, tableId);
      engine.set_light_color('edge-light', 1, 1, 1, 1);
      engine.set_light_intensity('edge-light', 2);
      engine.set_light_radius('edge-light', 80);

      engine.render();

      const inside = brightness(readPixel(canvas, 90, 50));
      const outside = brightness(readPixel(canvas, 130, 50));
      expect(inside).toBeGreaterThan(outside + 100);
      expect(outside).toBeLessThan(50);
    } finally {
      engine.free();
    }
  });

  it('calculate_asset_hash() matches the server xxHash64 contract', () => {
    expect(calculate_asset_hash(new TextEncoder().encode('hello')))
      .toBe('26c7827d889f6da3');
  });
});
