import { describe, expect, it } from 'vitest';
import { compactFreehandPoints, createPaintDraft, resizePaintObject } from '../paintGeometry';
import type { PaintObject, PaintPoint, PaintStyle } from '../../model/paintObject';

const style: PaintStyle = {
  stroke_rgba: [1, 0, 0, 1],
  width: 4,
  fill_rgba: [1, 0, 0, 0.25],
};
const start: PaintPoint = { x: 20, y: 30, pressure: 0.5 };

function object(kind: PaintObject['kind']): PaintObject {
  const geometry = kind === 'line'
    ? { kind: 'line' as const, start: { x: 0, y: 0, pressure: 1 }, end: { x: 10, y: 5, pressure: 1 } }
    : kind === 'freehand'
      ? { kind: 'freehand' as const, points: [{ x: 0, y: 0, pressure: 1 }, { x: 10, y: 5, pressure: 1 }] }
      : kind === 'square'
        ? { kind: 'square' as const, size: 10 }
        : { kind: 'circle' as const, diameter: 10 };
  return {
    id: crypto.randomUUID(),
    table_id: crypto.randomUUID(),
    kind,
    geometry,
    transform: { x: 10, y: 20, scale_x: 2, scale_y: 2 },
    style,
    created_by: 1,
    version: 1,
    z_order: 1,
    created_at: '2026-09-30T00:00:00Z',
    updated_at: '2026-09-30T00:00:00Z',
  } as PaintObject;
}

describe('paint gesture geometry', () => {
  it('keeps a freehand click as one local point', () => {
    const draft = createPaintDraft('draw', crypto.randomUUID(), start, start, [start], style);
    expect(draft).toMatchObject({
      kind: 'freehand',
      transform: { x: 20, y: 30 },
      geometry: { points: [{ x: 0, y: 0, pressure: 0.5 }] },
    });
  });

  it('normalizes rectangles and ellipses dragged up and left', () => {
    const end = { x: 5, y: 10, pressure: 1 };
    for (const tool of ['rectangle', 'ellipse'] as const) {
      const draft = createPaintDraft(tool, crypto.randomUUID(), start, end, [], style);
      expect(draft.transform).toMatchObject({ x: 5, y: 10 });
      expect(draft.geometry).toMatchObject({ width: 15, height: 20 });
    }
  });

  it('locks square and circle aspect ratios in every drag direction', () => {
    const end = { x: 5, y: 50, pressure: 1 };
    const square = createPaintDraft('square', crypto.randomUUID(), start, end, [], style);
    const circle = createPaintDraft('circle', crypto.randomUUID(), start, end, [], style);
    expect(square).toMatchObject({
      transform: { x: 0, y: 30, scale_x: 1, scale_y: 1 },
      geometry: { kind: 'square', size: 20 },
    });
    expect(circle).toMatchObject({
      transform: { x: 0, y: 30, scale_x: 1, scale_y: 1 },
      geometry: { kind: 'circle', diameter: 20 },
    });
  });

  it('compacts straight samples while preserving endpoints and pressure changes', () => {
    const points = Array.from({ length: 20 }, (_, index) => ({
      x: index,
      y: 0,
      pressure: index === 10 ? 1 : 0.5,
    }));
    const compacted = compactFreehandPoints(points, 0.25);
    expect(compacted[0]).toEqual(points[0]);
    expect(compacted.at(-1)).toEqual(points.at(-1));
    expect(compacted).toContainEqual(points[10]);
    expect(compacted.length).toBeLessThan(points.length);
  });

  it('edits one line endpoint in local coordinates', () => {
    const resized = resizePaintObject(
      object('line'),
      'line-end',
      { x: 50, y: 60, pressure: 0.75 },
    );
    expect(resized.geometry).toMatchObject({
      kind: 'line',
      start: { x: 0, y: 0, pressure: 1 },
      end: { x: 20, y: 20, pressure: 0.75 },
    });
  });

  it('resizes a freehand object as an anchored whole-object transform', () => {
    const resized = resizePaintObject(
      object('freehand'),
      'se',
      { x: 50, y: 50, pressure: 1 },
    );
    expect(resized.geometry).toEqual({
      kind: 'freehand',
      points: [
        { x: 0, y: 0, pressure: 1 },
        { x: 10, y: 5, pressure: 1 },
      ],
    });
    expect(resized.transform).toEqual({ x: 10, y: 20, scale_x: 4, scale_y: 6 });
  });

  it('keeps square and circle resize scales locked', () => {
    for (const kind of ['square', 'circle'] as const) {
      const resized = resizePaintObject(
        object(kind),
        'nw',
        { x: -20, y: 10, pressure: 1 },
      );
      expect(resized.transform.scale_x).toBe(resized.transform.scale_y);
      expect(resized.transform).toMatchObject({ x: -20, y: -10, scale_x: 5, scale_y: 5 });
    }
  });
});
