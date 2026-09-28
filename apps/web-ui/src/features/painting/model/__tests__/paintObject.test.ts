import { describe, expect, it } from 'vitest';

import {
  assertPaintObject,
  assertPaintObjectInput,
  assertPaintTableBudget,
  PaintValidationError,
  PAINT_LIMITS,
  paintPointCount,
  type PaintObjectInput,
} from '../paintObject';

const base = (): PaintObjectInput => ({
  id: '4e34ddf1-b61d-43ee-92ea-834c30a4c8d4',
  kind: 'freehand',
  geometry: { kind: 'freehand', points: [{ x: 0, y: 0, pressure: 0.5 }] },
  transform: { x: 10, y: 20, scale_x: 1, scale_y: 1 },
  style: { stroke_rgba: [0.1, 0.2, 0.3, 1], width: 3, fill_rgba: null },
});

describe('paint object contract', () => {
  it.each([
    ['freehand', { kind: 'freehand', points: [{ x: 1, y: 2, pressure: 0.25 }] }],
    ['line', { kind: 'line', start: { x: 0, y: 0, pressure: 0.5 }, end: { x: 20, y: 10, pressure: 0.5 } }],
    ['rectangle', { kind: 'rectangle', width: 20, height: 10 }],
    ['square', { kind: 'square', size: 20 }],
    ['ellipse', { kind: 'ellipse', width: 20, height: 10 }],
    ['circle', { kind: 'circle', diameter: 20 }],
  ] as const)('accepts %s geometry', (kind, geometry) => {
    const value = { ...base(), kind, geometry };
    assertPaintObjectInput(value);
  });

  it('accepts server-authoritative metadata', () => {
    const value = {
      ...base(),
      table_id: '9e8ed60d-f18c-4f47-a5ce-fc04db50506a',
      created_by: 42,
      version: 1,
      z_order: 7,
      created_at: '2026-09-28T10:00:00Z',
      updated_at: '2026-09-28T10:00:00Z',
    };

    assertPaintObject(value);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite coordinate %s',
    coordinate => {
      const value = base();
      value.transform.x = coordinate;
      expect(() => assertPaintObjectInput(value)).toThrow(/transform\.x/);
    },
  );

  it('rejects kind and geometry mismatches', () => {
    const value = { ...base(), kind: 'circle' };
    expect(() => assertPaintObjectInput(value)).toThrow(/geometry\.kind/);
  });

  it('rejects unknown fields', () => {
    const value = { ...base(), created_by: 42 };
    expect(() => assertPaintObjectInput(value)).toThrow(/exactly/);
  });

  it('rejects oversized serialized paths before transport', () => {
    const value = base();
    if (value.geometry.kind !== 'freehand') throw new Error('test fixture is not freehand');
    value.geometry.points = Array.from({ length: 3_000 }, () => ({ x: 0, y: 0, pressure: 0.5 }));

    expect(() => assertPaintObjectInput(value)).toThrow(/serialized limit/);
  });

  it.each(['square', 'circle'] as const)('preserves %s aspect ratio', kind => {
    const value = kind === 'square'
      ? { ...base(), kind, geometry: { kind, size: 20 } as const }
      : { ...base(), kind, geometry: { kind, diameter: 20 } as const };
    value.transform.scale_y = 2;

    expect(() => assertPaintObjectInput(value)).toThrow(/preserve its aspect ratio/);
  });

  it('publishes limits from the generated schema', () => {
    expect(PAINT_LIMITS).toEqual({
      maxSerializedBytes: 61_440,
      maxObjectsPerTable: 2_000,
      maxPointsPerTable: 100_000,
    });
  });

  it('counts path and line points for aggregate budgets', () => {
    const line: PaintObjectInput = {
      ...base(),
      kind: 'line',
      geometry: {
        kind: 'line',
        start: { x: 0, y: 0, pressure: 0.5 },
        end: { x: 10, y: 10, pressure: 0.5 },
      },
    };

    expect(paintPointCount(base())).toBe(1);
    expect(paintPointCount(line)).toBe(2);
  });

  it('rejects tables over the object budget before hydration', () => {
    expect(() => assertPaintTableBudget(
      Array.from({ length: PAINT_LIMITS.maxObjectsPerTable + 1 }),
    )).toThrow(/object limit/);
  });

  it('uses a stable validation error type', () => {
    expect(() => assertPaintObjectInput(null)).toThrow(PaintValidationError);
  });
});
