import { describe, expect, it } from 'vitest';
import { IDENTITY_TRANSFORM } from '../CanvasCommandController';
import { mapSelectionPoint, selectionBounds, selectionFrameCoordinates, selectionHandleTransform,
  transformSelectionPaint, transformSelectionSprite } from '../selectionTransforms';

describe('selection transforms', () => {
  it('unions member world bounds without creating persistent groups', () => {
    expect(selectionBounds([])).toBeNull();
    expect(selectionBounds([[10, 20, 40, 50], [-5, 30, 70, 90]])).toEqual([-5, 20, 70, 90]);
  });

  it.each(['nw', 'ne', 'se', 'sw'] as const)('scales proportionally around the opposite %s corner', handle => {
    const bounds = [0, 0, 100, 50] as const;
    const start = { x: handle.includes('w') ? 0 : 100, y: handle.includes('n') ? 0 : 50 };
    const pivot = { x: 100 - start.x, y: 50 - start.y };
    const current = { x: pivot.x + (start.x - pivot.x) * 2, y: pivot.y + (start.y - pivot.y) * 2 };
    const transform = selectionHandleTransform(bounds, handle, start, current, false);
    expect(transform.scale).toBe(2);
    expect(mapSelectionPoint(pivot, transform)).toEqual(pivot);
    expect(mapSelectionPoint(start, transform)).toEqual(current);
  });

  it('clamps crossed resize anchors instead of introducing unsupported flips', () => {
    expect(selectionHandleTransform([0, 0, 100, 50], 'se', { x: 100, y: 50 }, { x: -100, y: -50 }, false).scale).toBe(0.001);
  });

  it('rotates around the group center and supports 15-degree snapping', () => {
    const start = { x: 50, y: -28 };
    const transform = selectionHandleTransform([0, 0, 100, 50], 'rotate', start, { x: 103, y: 25 }, false);
    expect(transform).toMatchObject({ pivot_x: 50, pivot_y: 25, rotation: Math.PI / 2 });
    const snapped = selectionHandleTransform([0, 0, 100, 50], 'rotate', start, { x: 80, y: -10 }, true);
    expect(snapped.rotation / (Math.PI / 12)).toBeCloseTo(Math.round(snapped.rotation / (Math.PI / 12)));
    expect(selectionFrameCoordinates([0, 0, 100, 50], transform)[0]).toBeCloseTo(75);
  });

  it('maps paint origin and sprite center consistently while retaining dimensions and styles', () => {
    const transform = { ...IDENTITY_TRANSFORM, pivot_x: 50, pivot_y: 25, rotation: Math.PI / 2, scale: 2 };
    const sprite = { x: 0, y: 0, width: 20, height: 10, scale_x: 1, scale_y: 1, rotation: 30 };
    expect(transformSelectionSprite(sprite, transform)).toMatchObject({ x: 70, y: -65, width: 20, height: 10,
      scale_x: 2, scale_y: 2, rotation: 120 });
    const paint = { id: crypto.randomUUID(), kind: 'rectangle' as const, geometry: { kind: 'rectangle' as const, width: 20, height: 10 },
      transform: { x: 0, y: 0, scale_x: 1, scale_y: 1 }, style: { stroke_rgba: [1, 0, 0, 1] as [number, number, number, number], width: 2, fill_rgba: null } };
    const next = transformSelectionPaint(paint, transform);
    expect(next.transform.x).toBeCloseTo(100);
    expect(next.transform.y).toBeCloseTo(-75);
    expect(next.transform.rotation).toBeCloseTo(Math.PI / 2);
    expect(paint.transform.x).toBe(0);
    expect(next.style).toEqual(paint.style);
  });

  it('matches authoritative nearest-even integer anchors at half coordinates', () => {
    const sprite = { x: 0, y: 0, width: 20, height: 10, scale_x: 1, scale_y: 1, rotation: 0 };
    expect(transformSelectionSprite(sprite, { ...IDENTITY_TRANSFORM, dx: 0.5 }).x).toBe(0);
    expect(transformSelectionSprite(sprite, { ...IDENTITY_TRANSFORM, dx: 1.5 }).x).toBe(2);
  });
});
