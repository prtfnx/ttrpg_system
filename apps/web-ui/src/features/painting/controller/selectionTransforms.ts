import type { PaintObjectInput } from '../model/paintObject';
import { IDENTITY_TRANSFORM, type CanvasTransform, type SpriteExpectedTransform } from './CanvasCommandController';
import type { SelectionBounds } from './SelectionManager';

export type SelectionFrameHandle = 'nw' | 'ne' | 'se' | 'sw' | 'rotate';
type Point = { x: number; y: number };

export function selectionBounds(bounds: readonly SelectionBounds[]): SelectionBounds | null {
  if (!bounds.length) return null;
  return [Math.min(...bounds.map(item => item[0])), Math.min(...bounds.map(item => item[1])),
    Math.max(...bounds.map(item => item[2])), Math.max(...bounds.map(item => item[3]))];
}

export function mapSelectionPoint(point: Point, transform: CanvasTransform): Point {
  const x = (point.x - transform.pivot_x) * transform.scale;
  const y = (point.y - transform.pivot_y) * transform.scale;
  const c = Math.cos(transform.rotation), s = Math.sin(transform.rotation);
  return { x: transform.pivot_x + c * x - s * y + transform.dx,
    y: transform.pivot_y + s * x + c * y + transform.dy };
}

export function selectionFrameCoordinates(bounds: SelectionBounds, transform = IDENTITY_TRANSFORM): number[] {
  const [left, top, right, bottom] = bounds;
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]
    .flatMap(point => { const mapped = mapSelectionPoint(point, transform); return [mapped.x, mapped.y]; });
}

export function selectionHandleTransform(bounds: SelectionBounds, handle: SelectionFrameHandle,
  start: Point, current: Point, snapRotation: boolean): CanvasTransform {
  const [left, top, right, bottom] = bounds;
  const pivot_x = handle === 'rotate' ? (left + right) / 2 : handle.includes('w') ? right : left;
  const pivot_y = handle === 'rotate' ? (top + bottom) / 2 : handle.includes('n') ? bottom : top;
  if (handle === 'rotate') {
    let rotation = Math.atan2(current.y - pivot_y, current.x - pivot_x) - Math.atan2(start.y - pivot_y, start.x - pivot_x);
    if (snapRotation) rotation = Math.round(rotation / (Math.PI / 12)) * Math.PI / 12;
    rotation = ((rotation + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    return { ...IDENTITY_TRANSFORM, pivot_x, pivot_y, rotation };
  }
  const x = start.x - pivot_x, y = start.y - pivot_y;
  const lengthSquared = x * x + y * y;
  const scale = lengthSquared > 0 ? ((current.x - pivot_x) * x + (current.y - pivot_y) * y) / lengthSquared : 1;
  return { ...IDENTITY_TRANSFORM, pivot_x, pivot_y, scale: Math.max(0.001, Math.min(1000, scale)) };
}

export function transformSelectionPaint(object: PaintObjectInput, transform: CanvasTransform): PaintObjectInput {
  const next = structuredClone(object);
  const anchor = mapSelectionPoint(next.transform, transform);
  next.transform = { ...next.transform, ...anchor, scale_x: next.transform.scale_x * transform.scale,
    scale_y: next.transform.scale_y * transform.scale,
    rotation: (((next.transform.rotation ?? 0) + transform.rotation + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI };
  return next;
}

// Match the integer anchor convention in Python's authoritative canvas mapper.
function roundEven(value: number): number {
  const floor = Math.floor(value);
  return value - floor === 0.5 ? floor % 2 === 0 ? floor : floor + 1 : Math.round(value);
}

export function transformSelectionSprite(sprite: SpriteExpectedTransform, transform: CanvasTransform): SpriteExpectedTransform {
  const center = mapSelectionPoint({ x: sprite.x + sprite.width * sprite.scale_x / 2,
    y: sprite.y + sprite.height * sprite.scale_y / 2 }, transform);
  const scale_x = sprite.scale_x * transform.scale, scale_y = sprite.scale_y * transform.scale;
  return { ...sprite, scale_x, scale_y, x: roundEven(center.x - sprite.width * scale_x / 2),
    y: roundEven(center.y - sprite.height * scale_y / 2),
    rotation: ((sprite.rotation + transform.rotation * 180 / Math.PI + 180) % 360 + 360) % 360 - 180 };
}
