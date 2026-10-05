import {
  PaintValidationError,
  type PaintKind,
  type PaintObject,
  type PaintObjectInput,
  type PaintPoint,
  type PaintStyle,
} from '../model/paintObject';
import paintObjectSchema from '../model/paint_object.schema.generated.json';

export type PaintTool = 'draw' | PaintKind | 'select' | 'delete';
export type PaintHandleKind = 'line-start' | 'line-end' | 'nw' | 'ne' | 'se' | 'sw';

const MIN_DIMENSION = 0.001;
export const MAX_FREEHAND_POINTS = paintObjectSchema.$defs.freehandGeometry.properties.points.maxItems;

function assertPointBudget(count: number): void {
  if (count > MAX_FREEHAND_POINTS) {
    throw new PaintValidationError(
      `Drawing exceeds the ${MAX_FREEHAND_POINTS.toLocaleString('en-US')}-point limit after simplification. Draw shorter paths.`,
    );
  }
}

function editableObject(object: PaintObject): PaintObjectInput {
  const {
    table_id: _tableId,
    created_by: _createdBy,
    version: _version,
    z_order: _zOrder,
    created_at: _createdAt,
    updated_at: _updatedAt,
    ...editable
  } = object;
  return structuredClone(editable) as PaintObjectInput;
}

function localBounds(object: PaintObject): [number, number, number, number] {
  switch (object.geometry.kind) {
    case 'freehand': {
      const xs = object.geometry.points.map(point => point.x);
      const ys = object.geometry.points.map(point => point.y);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    case 'line':
      return [
        Math.min(object.geometry.start.x, object.geometry.end.x),
        Math.min(object.geometry.start.y, object.geometry.end.y),
        Math.max(object.geometry.start.x, object.geometry.end.x),
        Math.max(object.geometry.start.y, object.geometry.end.y),
      ];
    case 'rectangle':
    case 'ellipse':
      return [0, 0, object.geometry.width, object.geometry.height];
    case 'square':
      return [0, 0, object.geometry.size, object.geometry.size];
    case 'circle':
      return [0, 0, object.geometry.diameter, object.geometry.diameter];
  }
}

export function resizePaintObject(
  object: PaintObject,
  handle: PaintHandleKind,
  worldPoint: PaintPoint,
): PaintObjectInput {
  const replacement = editableObject(object);
  if (object.geometry.kind === 'line') {
    if (handle !== 'line-start' && handle !== 'line-end') return replacement;
    const target = handle === 'line-start'
      ? replacement.geometry.kind === 'line' && replacement.geometry.start
      : replacement.geometry.kind === 'line' && replacement.geometry.end;
    if (!target) return replacement;
    target.x = (worldPoint.x - object.transform.x) / object.transform.scale_x;
    target.y = (worldPoint.y - object.transform.y) / object.transform.scale_y;
    target.pressure = worldPoint.pressure;
    return replacement;
  }
  if (handle === 'line-start' || handle === 'line-end') return replacement;

  const [minX, minY, maxX, maxY] = localBounds(object);
  const width = Math.max(maxX - minX, MIN_DIMENSION);
  const height = Math.max(maxY - minY, MIN_DIMENSION);
  const left = handle === 'nw' || handle === 'sw';
  const top = handle === 'nw' || handle === 'ne';
  const anchorLocalX = left ? maxX : minX;
  const anchorLocalY = top ? maxY : minY;
  const anchorWorldX = object.transform.x + anchorLocalX * object.transform.scale_x;
  const anchorWorldY = object.transform.y + anchorLocalY * object.transform.scale_y;
  let scaleX = Math.max(
    MIN_DIMENSION,
    (left ? anchorWorldX - worldPoint.x : worldPoint.x - anchorWorldX) / width,
  );
  let scaleY = Math.max(
    MIN_DIMENSION,
    (top ? anchorWorldY - worldPoint.y : worldPoint.y - anchorWorldY) / height,
  );
  if (object.kind === 'square' || object.kind === 'circle') {
    const uniform = Math.max(scaleX, scaleY);
    scaleX = uniform;
    scaleY = uniform;
  }
  replacement.transform = {
    x: anchorWorldX - anchorLocalX * scaleX,
    y: anchorWorldY - anchorLocalY * scaleY,
    scale_x: scaleX,
    scale_y: scaleY,
  };
  return replacement;
}

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
  pressureTolerance: number,
  keep: Set<number>,
): void {
  // Explicit work avoids call-stack overflow on long, highly detailed paths.
  const sections: [number, number][] = [[first, last]];
  while (sections.length > 0) {
    const [start, end] = sections.pop()!;
    if (end <= start + 1) continue;
    let furthest = start;
    let deviation = 1;
    const dx = points[end].x - points[start].x;
    const dy = points[end].y - points[start].y;
    const lengthSquared = dx * dx + dy * dy;
    for (let index = start + 1; index < end; index += 1) {
      const distance = pointDistanceToSegment(points[index], points[start], points[end]);
      const progress = lengthSquared === 0
        ? (index - start) / (end - start)
        : Math.max(0, Math.min(1, (
          (points[index].x - points[start].x) * dx
          + (points[index].y - points[start].y) * dy
        ) / lengthSquared));
      const interpolatedPressure = points[start].pressure
        + progress * (points[end].pressure - points[start].pressure);
      const pressureDifference = Math.abs(points[index].pressure - interpolatedPressure);
      const candidate = Math.max(
        tolerance > 0 ? distance / tolerance : distance > 0 ? Infinity : 0,
        pressureTolerance > 0 ? pressureDifference / pressureTolerance : pressureDifference > 0 ? Infinity : 0,
      );
      if (candidate > deviation) {
        deviation = candidate;
        furthest = index;
      }
    }
    if (furthest !== start) {
      keep.add(furthest);
      assertPointBudget(keep.size);
      sections.push([start, furthest], [furthest, end]);
    }
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
      assertPointBudget(keep.size);
    }
  }
  const anchors = [...keep].sort((left, right) => left - right);
  for (let index = 1; index < anchors.length; index += 1) {
    simplifySection(
      points, anchors[index - 1], anchors[index], Math.max(0, tolerance),
      Math.max(0, pressureTolerance), keep,
    );
  }
  return [...keep]
    .sort((left, right) => left - right)
    .map(index => ({ ...points[index] }));
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
