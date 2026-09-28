import paintObjectSchema from './paint_object.schema.generated.json';

export const PAINT_LIMITS = {
  maxSerializedBytes: paintObjectSchema['x-limits'].maxSerializedBytes,
  maxObjectsPerTable: paintObjectSchema['x-limits'].maxObjectsPerTable,
  maxPointsPerTable: paintObjectSchema['x-limits'].maxPointsPerTable,
} as const;

export type PaintKind = 'freehand' | 'line' | 'rectangle' | 'square' | 'ellipse' | 'circle';
export type Rgba = [number, number, number, number];

export interface PaintPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface PaintTransform {
  x: number;
  y: number;
  scale_x: number;
  scale_y: number;
}

export interface PaintStyle {
  stroke_rgba: Rgba;
  width: number;
  fill_rgba: Rgba | null;
}

export type PaintGeometry =
  | { kind: 'freehand'; points: PaintPoint[] }
  | { kind: 'line'; start: PaintPoint; end: PaintPoint }
  | { kind: 'rectangle'; width: number; height: number }
  | { kind: 'square'; size: number }
  | { kind: 'ellipse'; width: number; height: number }
  | { kind: 'circle'; diameter: number };

type PaintObjectInputFor<G extends PaintGeometry> = {
  id: string;
  kind: G['kind'];
  geometry: G;
  transform: PaintTransform;
  style: PaintStyle;
};

export type PaintObjectInput = {
  [G in PaintGeometry as G['kind']]: PaintObjectInputFor<G>;
}[PaintKind];

export type PaintObject = PaintObjectInput & {
  table_id: string;
  created_by: number;
  version: number;
  z_order: number;
  created_at: string;
  updated_at: string;
};

export class PaintValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaintValidationError';
  }
}

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const COORDINATE_LIMIT = 1_000_000;
const DIMENSION_LIMIT = 2_000_000;
const SCALE_LIMIT = 1_000;
const MAX_PATH_POINTS = 8_192;

function fail(path: string, reason: string): never {
  throw new PaintValidationError(`invalid paint payload at ${path}: ${reason}`);
}

function recordAt(value: unknown, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'must be an object');
  }
  return value as UnknownRecord;
}

function exactKeys(value: UnknownRecord, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(path, `must contain exactly: ${wanted.join(', ')}`);
  }
}

function finiteInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
  exclusiveMinimum = false,
): number {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || (exclusiveMinimum ? value <= minimum : value < minimum)
    || value > maximum
  ) {
    fail(path, `must be a finite number between ${minimum} and ${maximum}`);
  }
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    fail(path, 'must be a positive integer');
  }
  return value;
}

function uuid(value: unknown, path: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) fail(path, 'must be a UUID');
  return value;
}

function point(value: unknown, path: string): void {
  const candidate = recordAt(value, path);
  exactKeys(candidate, ['x', 'y', 'pressure'], path);
  finiteInRange(candidate.x, -COORDINATE_LIMIT, COORDINATE_LIMIT, `${path}.x`);
  finiteInRange(candidate.y, -COORDINATE_LIMIT, COORDINATE_LIMIT, `${path}.y`);
  finiteInRange(candidate.pressure, 0, 1, `${path}.pressure`);
}

function rgba(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length !== 4) fail(path, 'must contain four channels');
  value.forEach((channel, index) => finiteInRange(channel, 0, 1, `${path}.${index}`));
}

function geometry(value: unknown, expectedKind: PaintKind): void {
  const candidate = recordAt(value, 'geometry');
  if (candidate.kind !== expectedKind) fail('geometry.kind', `must be ${expectedKind}`);

  switch (expectedKind) {
    case 'freehand': {
      exactKeys(candidate, ['kind', 'points'], 'geometry');
      if (!Array.isArray(candidate.points) || candidate.points.length < 1 || candidate.points.length > MAX_PATH_POINTS) {
        fail('geometry.points', `must contain between 1 and ${MAX_PATH_POINTS} points`);
      }
      candidate.points.forEach((value, index) => point(value, `geometry.points.${index}`));
      break;
    }
    case 'line':
      exactKeys(candidate, ['kind', 'start', 'end'], 'geometry');
      point(candidate.start, 'geometry.start');
      point(candidate.end, 'geometry.end');
      break;
    case 'rectangle':
    case 'ellipse':
      exactKeys(candidate, ['kind', 'width', 'height'], 'geometry');
      finiteInRange(candidate.width, 0, DIMENSION_LIMIT, 'geometry.width', true);
      finiteInRange(candidate.height, 0, DIMENSION_LIMIT, 'geometry.height', true);
      break;
    case 'square':
      exactKeys(candidate, ['kind', 'size'], 'geometry');
      finiteInRange(candidate.size, 0, DIMENSION_LIMIT, 'geometry.size', true);
      break;
    case 'circle':
      exactKeys(candidate, ['kind', 'diameter'], 'geometry');
      finiteInRange(candidate.diameter, 0, DIMENSION_LIMIT, 'geometry.diameter', true);
      break;
  }
}

function transform(value: unknown, kind: PaintKind): void {
  const candidate = recordAt(value, 'transform');
  exactKeys(candidate, ['x', 'y', 'scale_x', 'scale_y'], 'transform');
  finiteInRange(candidate.x, -COORDINATE_LIMIT, COORDINATE_LIMIT, 'transform.x');
  finiteInRange(candidate.y, -COORDINATE_LIMIT, COORDINATE_LIMIT, 'transform.y');
  const scaleX = finiteInRange(candidate.scale_x, 0, SCALE_LIMIT, 'transform.scale_x', true);
  const scaleY = finiteInRange(candidate.scale_y, 0, SCALE_LIMIT, 'transform.scale_y', true);
  if ((kind === 'square' || kind === 'circle') && Math.abs(scaleX - scaleY) > Math.max(1e-12, Math.abs(scaleX) * 1e-9)) {
    fail('transform', `${kind} must preserve its aspect ratio`);
  }
}

function style(value: unknown): void {
  const candidate = recordAt(value, 'style');
  exactKeys(candidate, ['stroke_rgba', 'width', 'fill_rgba'], 'style');
  rgba(candidate.stroke_rgba, 'style.stroke_rgba');
  finiteInRange(candidate.width, 0.125, 512, 'style.width');
  if (candidate.fill_rgba !== null) rgba(candidate.fill_rgba, 'style.fill_rgba');
}

function serializedSize(value: unknown): number {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    fail('payload', 'must contain JSON values');
  }
  if (serialized === undefined) fail('payload', 'must contain JSON values');
  return new TextEncoder().encode(serialized).byteLength;
}

function validateEditable(value: unknown, authoritative: boolean): UnknownRecord {
  const candidate = recordAt(value, 'payload');
  const editableKeys = ['id', 'kind', 'geometry', 'transform', 'style'];
  const authoritativeKeys = ['table_id', 'created_by', 'version', 'z_order', 'created_at', 'updated_at'];
  exactKeys(candidate, authoritative ? [...editableKeys, ...authoritativeKeys] : editableKeys, 'payload');
  if (serializedSize(candidate) > PAINT_LIMITS.maxSerializedBytes) {
    fail('payload', `exceeds the ${PAINT_LIMITS.maxSerializedBytes}-byte serialized limit`);
  }
  uuid(candidate.id, 'id');
  const kind = candidate.kind;
  if (!['freehand', 'line', 'rectangle', 'square', 'ellipse', 'circle'].includes(kind as string)) {
    fail('kind', 'is unknown');
  }
  geometry(candidate.geometry, kind as PaintKind);
  transform(candidate.transform, kind as PaintKind);
  style(candidate.style);
  return candidate;
}

export function assertPaintObjectInput(value: unknown): asserts value is PaintObjectInput {
  validateEditable(value, false);
}

export function assertPaintObject(value: unknown): asserts value is PaintObject {
  const candidate = validateEditable(value, true);
  uuid(candidate.table_id, 'table_id');
  positiveInteger(candidate.created_by, 'created_by');
  positiveInteger(candidate.version, 'version');
  positiveInteger(candidate.z_order, 'z_order');
  for (const field of ['created_at', 'updated_at'] as const) {
    if (
      typeof candidate[field] !== 'string'
      || !RFC3339_PATTERN.test(candidate[field])
      || Number.isNaN(Date.parse(candidate[field]))
    ) {
      fail(field, 'must be a date-time string');
    }
  }
}

export function paintPointCount(value: PaintObjectInput | PaintObject): number {
  if (value.geometry.kind === 'freehand') return value.geometry.points.length;
  if (value.geometry.kind === 'line') return 2;
  return 0;
}

export function assertPaintTableBudget(values: readonly unknown[]): asserts values is PaintObject[] {
  if (values.length > PAINT_LIMITS.maxObjectsPerTable) {
    fail('objects', `exceeds the ${PAINT_LIMITS.maxObjectsPerTable}-object limit`);
  }
  let points = 0;
  for (const value of values) {
    assertPaintObject(value);
    points += paintPointCount(value);
    if (points > PAINT_LIMITS.maxPointsPerTable) {
      fail('objects', `exceeds the ${PAINT_LIMITS.maxPointsPerTable}-point limit`);
    }
  }
}
