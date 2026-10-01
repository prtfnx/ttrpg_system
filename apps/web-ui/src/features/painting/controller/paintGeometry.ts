import type {
  PaintKind,
  PaintObjectInput,
  PaintPoint,
  PaintStyle,
} from '../model/paintObject';

export type PaintTool = 'draw' | PaintKind | 'select' | 'delete';

const MIN_DIMENSION = 0.001;
const MAX_PATH_POINTS = 8_192;

function pointDistanceToSegment(point: PaintPoint, start: PaintPoint, end: PaintPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(0, Math.min(1, (
    (point.x - start.x) * dx + (point.y - start.y) * dy
  ) / lengthSquared));
  return Math.hypot(
    point.x - (start.x + projection * dx),
    point.y - (start.y + projection * dy),
  );
}

function simplifySection(
  points: readonly PaintPoint[],
  first: number,
  last: number,
  tolerance: number,
  keep: Set<number>,
): void {
  if (last <= first + 1) return;
  let furthest = first;
  let distance = tolerance;
  for (let index = first + 1; index < last; index += 1) {
    const candidate = pointDistanceToSegment(points[index], points[first], points[last]);
    if (candidate > distance) {
      distance = candidate;
      furthest = index;
    }
  }
  if (furthest !== first) {
    keep.add(furthest);
    simplifySection(points, first, furthest, tolerance, keep);
    simplifySection(points, furthest, last, tolerance, keep);
  }
}

export function compactFreehandPoints(
  points: readonly PaintPoint[],
  tolerance: number,
  pressureTolerance = 0.08,
): PaintPoint[] {
  if (points.length <= 2) return points.map(point => ({ ...point }));
  const keep = new Set<number>([0, points.length - 1]);
  for (let index = 1; index < points.length - 1; index += 1) {
    if (
      Math.abs(points[index].pressure - points[index - 1].pressure) >= pressureTolerance
      || Math.abs(points[index].pressure - points[index + 1].pressure) >= pressureTolerance
    ) {
      keep.add(index);
    }
  }
  const anchors = [...keep].sort((left, right) => left - right);
  for (let index = 1; index < anchors.length; index += 1) {
    simplifySection(points, anchors[index - 1], anchors[index], Math.max(0, tolerance), keep);
  }
  const compacted = [...keep]
    .sort((left, right) => left - right)
    .map(index => ({ ...points[index] }));
  if (compacted.length <= MAX_PATH_POINTS) return compacted;

  const bounded = [compacted[0]];
  const step = (compacted.length - 1) / (MAX_PATH_POINTS - 1);
  for (let index = 1; index < MAX_PATH_POINTS - 1; index += 1) {
    bounded.push(compacted[Math.round(index * step)]);
  }
  bounded.push(compacted[compacted.length - 1]);
  return bounded;
}

export function createPaintDraft(
  tool: Exclude<PaintTool, 'select' | 'delete'>,
  id: string,
  start: PaintPoint,
  current: PaintPoint,
  sampledPoints: readonly PaintPoint[],
  style: PaintStyle,
): PaintObjectInput {
  const transform = { x: start.x, y: start.y, scale_x: 1, scale_y: 1 };
  const shared = { id, transform, style: structuredClone(style) };
  if (tool === 'draw' || tool === 'freehand') {
    const points = sampledPoints.length > 0 ? sampledPoints : [start];
    return {
      ...shared,
      kind: 'freehand',
      geometry: {
        kind: 'freehand',
        points: points.map(point => ({
          x: point.x - start.x,
          y: point.y - start.y,
          pressure: point.pressure,
        })),
      },
    };
  }
  if (tool === 'line') {
    return {
      ...shared,
      kind: 'line',
      geometry: {
        kind: 'line',
        start: { x: 0, y: 0, pressure: start.pressure },
        end: {
          x: current.x - start.x,
          y: current.y - start.y,
          pressure: current.pressure,
        },
      },
    };
  }

  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  if (tool === 'square' || tool === 'circle') {
    const size = Math.max(Math.abs(deltaX), Math.abs(deltaY), MIN_DIMENSION);
    transform.x = deltaX < 0 ? start.x - size : start.x;
    transform.y = deltaY < 0 ? start.y - size : start.y;
    return tool === 'square'
      ? { ...shared, kind: 'square', geometry: { kind: 'square', size } }
      : { ...shared, kind: 'circle', geometry: { kind: 'circle', diameter: size } };
  }

  transform.x = Math.min(start.x, current.x);
  transform.y = Math.min(start.y, current.y);
  const width = Math.max(Math.abs(deltaX), MIN_DIMENSION);
  const height = Math.max(Math.abs(deltaY), MIN_DIMENSION);
  return tool === 'rectangle'
    ? { ...shared, kind: 'rectangle', geometry: { kind: 'rectangle', width, height } }
    : { ...shared, kind: 'ellipse', geometry: { kind: 'ellipse', width, height } };
}
