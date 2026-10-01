import { describe, expect, it } from 'vitest';
import { compactFreehandPoints, createPaintDraft } from '../paintGeometry';
import type { PaintPoint, PaintStyle } from '../../model/paintObject';

const style: PaintStyle = {
  stroke_rgba: [1, 0, 0, 1],
  width: 4,
  fill_rgba: [1, 0, 0, 0.25],
};
const start: PaintPoint = { x: 20, y: 30, pressure: 0.5 };

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
});
