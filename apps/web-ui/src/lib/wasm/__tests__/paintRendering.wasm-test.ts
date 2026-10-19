import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  assertPaintObject,
  assertPaintTableBudget,
  paintPointCount,
  type PaintGeometry,
  type PaintObject,
} from '@/features/painting/model/paintObject';
import initWasm, { RenderEngine } from '../generated/ttrpg_rust_core';
import { normalizeTableSnapshot } from '../tableSnapshot';
import { PaintController } from '@/features/painting/controller/PaintController';

// Real Chromium/WebGL tests; rebuild WASM before running the browser project.
beforeAll(async () => {
  await initWasm({ module_or_path: new URL('../generated/ttrpg_rust_core_bg.wasm', import.meta.url) });
});

const TABLE_ID = '550e8400-e29b-41d4-a716-446655440020';

function object(geometry: PaintGeometry, index = 1): PaintObject {
  const value = {
    id: `550e8400-e29b-41d4-a716-${index.toString().padStart(12, '0')}`,
    table_id: TABLE_ID,
    kind: geometry.kind,
    geometry,
    transform: { x: 20, y: 20, scale_x: 1, scale_y: 1 },
    style: { stroke_rgba: [1, 0, 0, 1], width: 4, fill_rgba: null },
    created_by: 1,
    version: 1,
    z_order: index,
    created_at: '2026-10-02T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
  };
  assertPaintObject(value);
  return value;
}

function renderer(size = 200): { canvas: HTMLCanvasElement; engine: RenderEngine } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const engine = new RenderEngine(canvas);
  const snapshot = normalizeTableSnapshot({ table_data: {
    table_id: TABLE_ID, table_name: 'Paint rendering', width: size, height: size,
    scale: 1, grid_enabled: false, layers: {},
  } });
  engine.handle_table_data(snapshot.renderer);
  engine.set_grid_enabled(false);
  engine.set_background_color('#000000');
  engine.set_camera(0, 0, 1);
  return { canvas, engine };
}

function pixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 unavailable');
  const value = new Uint8Array(4);
  gl.readPixels(x, canvas.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
  return [...value];
}

describe('paint triangle rendering (real browser)', () => {
  it('previews dependent paint edits and rolls back a denial without losing the later gesture', () => {
    const { engine } = renderer();
    const original = object({ kind: 'rectangle', width: 20, height: 20 });
    original.style.fill_rgba = [1, 0, 0, 1];
    const send = vi.fn(() => true);
    const scene = new PaintController({ createPaintObject: send, updatePaintObject: send, deletePaintObject: send,
      requestPaintSnapshot: send, sendPaintPreview: send, cancelPaintPreview: send }, {
      getRenderEngine: () => engine,
      replacePaintObjectSnapshot: (id, revision, objects) => engine.paint_replace_object_snapshot(id, revision, JSON.stringify(objects)),
      upsertPaintObject: (id, revision, value) => engine.paint_upsert_object(id, revision, JSON.stringify(value)),
      removePaintObject: (id, revision, target, version) => engine.paint_remove_object(id, revision, target, version),
    }, { snapshotRequestId: () => 'paint-sync' });
    try {
      scene.selectTable(TABLE_ID);
      scene.acceptSnapshotChunk({ table_id: TABLE_ID, revision: 1, chunk_index: 0, chunk_count: 1,
        objects: [original], request_id: 'paint-sync', snapshot_id: crypto.randomUUID(), complete: true });
      const { table_id: _table, created_by: _actor, version: _version, z_order: _order,
        created_at: _created, updated_at: _updated, ...editable } = original;
      const first = scene.submitUpdate(original.id, 1, { ...editable, transform: { ...editable.transform, x: 60 } });
      const second = scene.submitUpdate(original.id, 1, { ...editable, transform: { ...editable.transform, x: 100 } });
      expect(engine.paint_hit_test_object(110, 30, 1)).toBe(original.id);
      expect(engine.paint_hit_test_object(30, 30, 1)).toBeUndefined();
      scene.rejectOperation({ operation_id: first!, code: 'forbidden', error: 'Denied' });
      // The second +40 gesture rebases onto the original x=20 baseline.
      expect(scene.getState().visible?.[0].transform.x).toBe(60);
      expect(engine.paint_hit_test_object(70, 30, 1)).toBe(original.id);
      scene.acceptEvent({ operation_id: second!, table_id: TABLE_ID, revision: 2, action: 'update',
        object: { ...original, version: 2, transform: { ...original.transform, x: 60 } } });
      expect(scene.getState().pending).toHaveLength(0);
      expect(engine.paint_object_revision()).toBe(2);
      expect(engine.paint_hit_test_object(70, 30, 1)).toBe(original.id);
    } finally { scene.dispose(); engine.free(); }
  });
  it('renders and picks a transient shared frame without creating paint objects', () => {
    const { canvas, engine } = renderer();
    try {
      expect(engine.paint_replace_object_snapshot(TABLE_ID, 0, '[]')).toBe(true);
      expect(engine.selection_set_frame(TABLE_ID, new Float32Array([30, 40, 130, 40, 130, 120, 30, 120]))).toBe(true);
      expect(engine.selection_hit_test_frame(80, 12, 6)).toBe('rotate');
      expect(engine.selection_hit_test_frame(130, 120, 6)).toBe('se');
      engine.render();
      expect(pixel(canvas, 30, 40)[2]).toBeGreaterThan(230);
      expect(pixel(canvas, 80, 12)[2]).toBeGreaterThan(230);
      engine.set_camera(0, 0, 2);
      expect(engine.selection_hit_test_frame(80, 26, 6)).toBe('rotate');
      expect(engine.selection_set_frame('other-table', new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]))).toBe(false);
      expect(engine.paint_object_count()).toBe(0);
      expect(engine.paint_object_revision()).toBe(0);
      engine.selection_clear_frame();
      expect(engine.selection_hit_test_frame(130, 120, 6)).toBeUndefined();
    } finally { engine.free(); }
  });
  it('renders and picks rotated paint with a retained group selection', () => {
    const { canvas, engine } = renderer();
    const rotated = object({ kind: 'rectangle', width: 60, height: 20 });
    rotated.transform = { ...rotated.transform, x: 80, y: 40, rotation: Math.PI / 2 };
    rotated.style.fill_rgba = [0, 1, 0, 1];
    const second = object({ kind: 'circle', diameter: 20 }, 2);
    try {
      expect(engine.paint_replace_object_snapshot(TABLE_ID, 1, JSON.stringify([rotated, second]))).toBe(true);
      engine.render();
      expect(pixel(canvas, 70, 70)[1]).toBeGreaterThan(240);
      expect(engine.paint_hit_test_object(70, 70, 1)).toBe(rotated.id);
      expect(engine.paint_hit_test_object(100, 50, 1)).toBeUndefined();
      expect(engine.paint_select_object(rotated.id)).toBe(true);
      expect(engine.paint_hit_test_handle(rotated.id, 108, 70, 2)).toBe('rotate');
      expect(engine.paint_select_objects(JSON.stringify([rotated.id, second.id]))).toBe(true);
      expect(engine.paint_select_objects(JSON.stringify(['missing']))).toBe(false);
    } finally { engine.free(); }
  });
  it('renders pressure-scaled dots and portable thick line widths', () => {
    const { canvas, engine } = renderer();
    const low = object({ kind: 'freehand', points: [{ x: 0, y: 0, pressure: 0.25 }] });
    low.transform = { ...low.transform, x: 30, y: 30 };
    low.style.width = 20;
    const high = object({ kind: 'freehand', points: [{ x: 0, y: 0, pressure: 1 }] }, 2);
    high.transform = { ...high.transform, x: 80, y: 30 };
    high.style.width = 20;
    const line = object({
      kind: 'line', start: { x: 0, y: 0, pressure: 1 }, end: { x: 80, y: 0, pressure: 1 },
    }, 3);
    line.transform = { ...line.transform, x: 30, y: 80 };
    line.style.width = 12;
    try {
      expect(engine.paint_replace_object_snapshot(TABLE_ID, 1, JSON.stringify([low, high, line])))
        .toBe(true);
      engine.render();
      expect(pixel(canvas, 30, 30)[0]).toBeGreaterThan(240);
      expect(pixel(canvas, 35, 30)[0]).toBeLessThan(10);
      expect(pixel(canvas, 85, 30)[0]).toBeGreaterThan(240);
      expect(pixel(canvas, 92, 30)[0]).toBeLessThan(10);
      expect(pixel(canvas, 60, 84)[0]).toBeGreaterThan(240);
      expect(pixel(canvas, 60, 88)[0]).toBeLessThan(10);
    } finally {
      engine.free();
    }
  });

  it.each<PaintGeometry>([
    { kind: 'rectangle', width: 60, height: 40 },
    { kind: 'square', size: 60 },
    { kind: 'ellipse', width: 60, height: 40 },
    { kind: 'circle', diameter: 60 },
  ])('renders filled $kind forms with distinct outlines', geometry => {
    const { canvas, engine } = renderer();
    const form = object(geometry);
    form.style.fill_rgba = [0, 1, 0, 1];
    const centerY = geometry.kind === 'square' || geometry.kind === 'circle' ? 50 : 40;
    try {
      expect(engine.paint_replace_object_snapshot(TABLE_ID, 1, JSON.stringify([form]))).toBe(true);
      engine.render();
      expect(pixel(canvas, 50, centerY).slice(0, 3)).toEqual([0, 255, 0]);
      expect(engine.paint_hit_test_object(50, centerY, 0)).toBe(form.id);
      expect(pixel(canvas, 20, centerY)[0]).toBeGreaterThan(200);
      expect(pixel(canvas, 10, centerY).slice(0, 3)).toEqual([0, 0, 0]);
      form.style.fill_rgba = null;
      expect(engine.paint_replace_object_snapshot(TABLE_ID, 2, JSON.stringify([form]))).toBe(true);
      expect(engine.paint_hit_test_object(50, centerY, 0)).toBeUndefined();
    } finally {
      engine.free();
    }
  });

  it('blends translucent objects by immutable z-order, not snapshot array order', () => {
    const { canvas, engine } = renderer();
    const red = object({ kind: 'square', size: 60 });
    red.style.fill_rgba = [1, 0, 0, 0.5];
    const blue = object({ kind: 'square', size: 60 }, 2);
    blue.style.fill_rgba = [0, 0, 1, 0.5];
    try {
      expect(engine.paint_replace_object_snapshot(TABLE_ID, 1, JSON.stringify([blue, red])))
        .toBe(true);
      engine.render();
      const first = pixel(canvas, 50, 50);
      expect(first[0]).toBeGreaterThan(50);
      expect(first[2]).toBeGreaterThan(first[0] + 50);
      expect(engine.paint_replace_object_snapshot(TABLE_ID, 1, JSON.stringify([red, blue])))
        .toBe(true);
      engine.render();
      expect(pixel(canvas, 50, 50)).toEqual(first);
    } finally {
      engine.free();
    }
  });

  it('retains a 1,000-object / 100,000-point workload and rebuilds only one changed path', () => {
    const objects = Array.from({ length: 1_000 }, (_, index) => {
      const path = object({ kind: 'freehand', points: Array.from({ length: 100 }, (_, point) => ({
        x: point / 10, y: (point % 2) * 3, pressure: 1,
      })) }, index + 1);
      path.transform = { ...path.transform, x: 10 + (index % 32) * 18, y: 10 + Math.floor(index / 32) * 18 };
      path.style.width = 1;
      return path;
    });
    assertPaintTableBudget(objects);
    expect(objects.reduce((total, value) => total + paintPointCount(value), 0)).toBe(100_000);
    const { engine } = renderer(600);
    const createBuffer = vi.spyOn(WebGL2RenderingContext.prototype, 'createBuffer');
    const deleteBuffer = vi.spyOn(WebGL2RenderingContext.prototype, 'deleteBuffer');
    try {
      engine.render();
      expect(engine.paint_replace_object_snapshot(TABLE_ID, 1, JSON.stringify(objects))).toBe(true);
      expect(engine.paint_object_count()).toBe(1_000);
      expect(engine.paint_object_mesh_rebuild_count()).toBe(1_000);
      engine.render();
      const uploaded = engine.get_render_diagnostics().bufferUploads;
      const allocated = createBuffer.mock.calls.length;
      for (let frame = 0; frame < 20; frame += 1) engine.render();
      expect(createBuffer.mock.calls.length).toBe(allocated);
      expect(engine.paint_object_mesh_rebuild_count()).toBe(1_000);
      const unchanged = engine.get_render_diagnostics().bufferUploads;
      expect(uploaded - unchanged).toBe(1_000);

      const changed = { ...objects[0], version: 2, updated_at: '2026-10-02T00:01:00Z',
        transform: { ...objects[0].transform, x: 12 } };
      const released = deleteBuffer.mock.calls.length;
      expect(engine.paint_upsert_object(TABLE_ID, 2, JSON.stringify(changed))).toBe(true);
      expect(deleteBuffer.mock.calls.length - released).toBe(1);
      engine.render();
      expect(engine.paint_object_mesh_rebuild_count()).toBe(1_001);
      expect(engine.get_render_diagnostics().bufferUploads - unchanged).toBe(1);
      const allocatedAfterUpdate = createBuffer.mock.calls.length;
      engine.render();
      expect(createBuffer.mock.calls.length).toBe(allocatedAfterUpdate);

      const releasedBeforeSwitch = deleteBuffer.mock.calls.length;
      expect(engine.paint_replace_object_snapshot(TABLE_ID, 2, '[]')).toBe(true);
      expect(deleteBuffer.mock.calls.length - releasedBeforeSwitch).toBe(1_000);
    } finally {
      engine.free();
      createBuffer.mockRestore();
      deleteBuffer.mockRestore();
    }
  }, 30_000);
});
