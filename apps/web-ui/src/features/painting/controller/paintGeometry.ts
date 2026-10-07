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
export type PaintHandleKind = 'line-start' | 'line-end' | 'nw' | 'ne' | 'se' | 'sw' | 'rotate';

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

export function localBounds(object: PaintObject): [number, number, number, number] {
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

export function paintLocalToWorld(object: PaintObjectInput, x: number, y: number): { x: number; y: number } {
  const angle = object.transform.rotation ?? 0;
  const sx = x * object.transform.scale_x;
  const sy = y * object.transform.scale_y;
  return {
    x: object.transform.x + Math.cos(angle) * sx - Math.sin(angle) * sy,
    y: object.transform.y + Math.sin(angle) * sx + Math.cos(angle) * sy,
  };
}

export function rotatePaintObject(object: PaintObject, start: PaintPoint, current: PaintPoint, snap = false): PaintObjectInput {
  const [minX, minY, maxX, maxY] = localBounds(object);
  const localX = (minX + maxX) / 2;
  const localY = (minY + maxY) / 2;
  const center = paintLocalToWorld(object, localX, localY);
  let angle = (object.transform.rotation ?? 0)
    + Math.atan2(current.y - center.y, current.x - center.x)
    - Math.atan2(start.y - center.y, start.x - center.x);
  if (snap) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  const replacement = editableObject(object);
  replacement.transform.rotation = angle;
  const movedCenter = paintLocalToWorld(replacement, localX, localY);
  replacement.transform.x += center.x - movedCenter.x;
  replacement.transform.y += center.y - movedCenter.y;
  return replacement;
}

export function paintWorldBounds(object: PaintObject): [number, number, number, number] {
  const [minX, minY, maxX, maxY] = localBounds(object);
  const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]
    .map(([x, y]) => paintLocalToWorld(object, x, y));
  const padding = object.style.width * Math.max(object.transform.scale_x, object.transform.scale_y) / 2;
  return [Math.min(...corners.map(p => p.x)) - padding, Math.min(...corners.map(p => p.y)) - padding,
    Math.max(...corners.map(p => p.x)) + padding, Math.max(...corners.map(p => p.y)) + padding];
}

export function resizePaintObject(
  object: PaintObject,
  handle: PaintHandleKind,
  worldPoint: PaintPoint,
): PaintObjectInput {
  const replacement = editableObject(object);
  const angle = object.transform.rotation ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = worldPoint.x - object.transform.x;
  const dy = worldPoint.y - object.transform.y;
  const point = { x: cos * dx + sin * dy, y: -sin * dx + cos * dy };
  if (handle === 'rotate') return replacement;
  if (object.geometry.kind === 'line') {
    if (handle !== 'line-start' && handle !== 'line-end') return replacement;
    const target = handle === 'line-start'
      ? replacement.geometry.kind === 'line' && replacement.geometry.start
      : replacement.geometry.kind === 'line' && replacement.geometry.end;
    if (!target) return replacement;
    target.x = point.x / object.transform.scale_x;
    target.y = point.y / object.transform.scale_y;
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
  const anchor = paintLocalToWorld(object, anchorLocalX, anchorLocalY);
  const anchorX = anchorLocalX * object.transform.scale_x;
  const anchorY = anchorLocalY * object.transform.scale_y;
  let scaleX = Math.max(
    MIN_DIMENSION,
    (left ? anchorX - point.x : point.x - anchorX) / width,
  );
  let scaleY = Math.max(
    MIN_DIMENSION,
    (top ? anchorY - point.y : point.y - anchorY) / height,
  );
  if (object.kind === 'square' || object.kind === 'circle') {
    const uniform = Math.max(scaleX, scaleY);
    scaleX = uniform;
    scaleY = uniform;
  }
  replacement.transform = {
    x: anchor.x - cos * anchorLocalX * scaleX + sin * anchorLocalY * scaleY,
    y: anchor.y - sin * anchorLocalX * scaleX - cos * anchorLocalY * scaleY,
    scale_x: scaleX,
    scale_y: scaleY,
    ...('rotation' in object.transform ? { rotation: angle } : {}),
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
