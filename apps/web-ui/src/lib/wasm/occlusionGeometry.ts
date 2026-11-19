export interface OcclusionGeometry {
  epoch: string;
  revision: number;
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
  return { epoch, revision, geometry: { schema_version: 1, valid, segments: valid ? segments : [] } };
}
