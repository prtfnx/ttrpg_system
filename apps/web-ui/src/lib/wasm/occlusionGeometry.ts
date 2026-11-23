export interface OcclusionShape { vertices: [number, number][]; closed: boolean }

export interface OcclusionGeometry {
  epoch: string;
  revision: number;
  shapes: OcclusionShape[];
  planningValid: boolean;
  terrain: [number, number][];
  geometry: { schema_version: 1; valid: boolean; segments: number[] };
}

/** Invalid geometry suppresses visibility; it must never become an open scene. */
export function parseOcclusionGeometry(value: unknown): OcclusionGeometry {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const epoch = typeof record.epoch === 'string' && record.epoch.length <= 64 ? record.epoch : '';
  const revision = typeof record.revision === 'number' && Number.isSafeInteger(record.revision) && record.revision >= 0
    ? record.revision : 0;
  const segments = record.segments;
  const valid = record.schema_version === 1 && record.valid === true && epoch !== '' && revision > 0
    && Array.isArray(segments) && segments.length <= 8192 * 4 && segments.length % 4 === 0
    && segments.every((number) => typeof number === 'number' && Number.isFinite(number) && Math.abs(number) <= 10_000_000);
  const rawShapes = record.shapes ?? (Array.isArray(segments) && segments.length === 0 ? [] : null);
  const shapes: OcclusionShape[] = [];
  let planningValid = valid && Array.isArray(rawShapes) && rawShapes.length <= 8192;
  let segmentCount = 0;
  if (planningValid && Array.isArray(rawShapes)) {
    for (const shape of rawShapes) {
      if (!shape || typeof shape !== 'object' || typeof shape.closed !== 'boolean' || !Array.isArray(shape.vertices)
        || shape.vertices.length < 2 || shape.vertices.length > 8192
        || !shape.vertices.every((point: unknown) => Array.isArray(point) && point.length === 2
          && point.every((coordinate: unknown) => typeof coordinate === 'number' && Number.isFinite(coordinate) && Math.abs(coordinate) <= 10_000_000))) {
        planningValid = false; break;
      }
      segmentCount += shape.vertices.length - (shape.closed ? 0 : 1);
      if (segmentCount > 8192) { planningValid = false; break; }
      shapes.push({ closed: shape.closed, vertices: shape.vertices });
    }
  }
  const flattened = shapes.flatMap((shape) => shape.vertices.slice(0, shape.closed ? undefined : -1)
    .flatMap((point, index) => [...point, ...shape.vertices[(index + 1) % shape.vertices.length]!]));
  planningValid = planningValid && valid && flattened.length === segments.length
    && flattened.every((coordinate, index) => coordinate === segments[index]);
  const cells = record.difficult_terrain_cells ?? [];
  const terrainValid = Array.isArray(cells) && cells.length <= 8192 && cells.every((cell) =>
    Array.isArray(cell) && cell.length === 2 && cell.every(Number.isSafeInteger));
  planningValid = planningValid && terrainValid;
  const terrain: [number, number][] = terrainValid ? cells : [];
  return { epoch, revision, terrain, shapes: planningValid ? shapes : [], planningValid, geometry: { schema_version: 1, valid, segments: valid ? segments : [] } };
}
