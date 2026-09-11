import { describe, expect, it } from 'vitest';
import { normalizeTableSnapshot, TableSnapshotValidationError } from '../tableSnapshot';

const TABLE_ID = '550e8400-e29b-41d4-a716-446655440000';

function pythonSerializedTable(overrides: Record<string, unknown> = {}) {
  return {
    table_id: TABLE_ID,
    table_name: 'Serializer fixture',
    width: 2000,
    height: 1500,
    layers: {
      map: {},
      tokens: {
        '7': {
          entity_id: 7,
          sprite_id: 'sprite-7',
          name: 'Hero',
          position: [0, 125],
          layer: 'tokens',
          texture_path: null,
          asset_id: 'asset-hash',
          scale_x: 1.25,
          scale_y: 0.75,
          rotation: 0,
          width: 50,
          height: 0,
          character_id: null,
          controlled_by: [12],
          hp: 0,
          max_hp: 10,
          ac: 15,
          moving: false,
          speed: null,
          collidable: false,
          metadata: { source: 'fixture' },
        },
      },
      dungeon_master: {},
      light: {},
      height: {},
      obstacles: {},
      fog_of_war: {},
    },
    fog_rectangles: { hide: [], reveal: [] },
    grid_cell_px: 64,
    cell_distance: 5,
    distance_unit: 'ft',
    grid_enabled: false,
    snap_to_grid: false,
    position: [-25, 0],
    scale: [1.5, 1.5],
    layer_visibility: { map: true, tokens: false },
    walls: [{
      wall_id: 'wall-1',
      table_id: TABLE_ID,
      x1: 0,
      y1: 10,
      x2: 20,
      y2: 30,
      wall_type: 'normal',
      blocks_movement: true,
      blocks_light: true,
      blocks_sight: true,
      blocks_sound: false,
      is_door: false,
      door_state: 'closed',
      is_secret: false,
      direction: 'both',
    }],
    ...overrides,
  };
}

describe('normalizeTableSnapshot', () => {
  it('maps the Python serializer shape to the strict Rust renderer DTO', () => {
    const result = normalizeTableSnapshot({ table_data: pythonSerializedTable() });

    expect(result.renderer).toMatchObject({
      table_id: TABLE_ID,
      table_name: 'Serializer fixture',
      width: 2000,
      height: 1500,
      scale: 1.5,
      x_moved: -25,
      y_moved: 0,
      show_grid: false,
      cell_side: 64,
      grid_cell_px: 64,
      cell_distance: 5,
      distance_unit: 'ft',
    });
    expect(result.renderer.layers.tokens).toEqual([
      expect.objectContaining({
        sprite_id: 'sprite-7',
        texture_path: 'asset-hash',
        coord_x: 0,
        coord_y: 125,
        width: 50,
        height: 0,
        hp: 0,
        controlled_by: [12],
        metadata: '{"source":"fixture"}',
      }),
    ]);
    expect(result.storeSprites).toEqual([
      expect.objectContaining({
        id: 'sprite-7',
        name: 'Hero',
        tableId: TABLE_ID,
        x: 0,
        y: 125,
        hp: 0,
        controlledBy: ['12'],
      }),
    ]);
    expect(result.snapToGrid).toBe(false);
    expect(result.layerVisibility.tokens).toBe(false);
    expect(result.walls[0]).toMatchObject({ wall_id: 'wall-1', blocks_sound: false });
  });

  it('supports the legacy scalar scale and grid keys without losing false values', () => {
    const result = normalizeTableSnapshot(pythonSerializedTable({
      scale: 2,
      grid_cell_px: undefined,
      grid_size: 32,
      snap_to_grid: undefined,
      grid_snapping: false,
    }));

    expect(result.renderer.scale).toBe(2);
    expect(result.renderer.grid_cell_px).toBe(32);
    expect(result.renderer.show_grid).toBe(false);
    expect(result.snapToGrid).toBe(false);
  });

  it('rejects a missing or non-authoritative identity', () => {
    expect(() => normalizeTableSnapshot(pythonSerializedTable({ table_id: undefined })))
      .toThrow(TableSnapshotValidationError);
    expect(() => normalizeTableSnapshot(pythonSerializedTable({ table_id: 'local_123' })))
      .toThrow('authoritative UUID');
  });

  it('reports non-uniform scale instead of silently discarding an axis', () => {
    expect(() => normalizeTableSnapshot(pythonSerializedTable({ scale: [1, 2] })))
      .toThrow('non-uniform table scale is not supported');
  });

  it('rejects malformed sprites and unsupported renderer layers before hydration', () => {
    expect(() => normalizeTableSnapshot(pythonSerializedTable({
      layers: { tokens: [{ position: [1, 2] }] },
    }))).toThrow('sprite_id');
    expect(() => normalizeTableSnapshot(pythonSerializedTable({
      layers: { foreground: [] },
    }))).toThrow('unsupported layer');
  });

  it('rejects walls belonging to another table', () => {
    expect(() => normalizeTableSnapshot(pythonSerializedTable({
      walls: [{
        wall_id: 'wall-1', table_id: '550e8400-e29b-41d4-a716-446655440001',
        x1: 0, y1: 0, x2: 1, y2: 1,
      }],
    }))).toThrow('does not match');
  });
});
