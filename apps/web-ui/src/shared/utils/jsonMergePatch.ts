/** RFC 7396: objects merge recursively, null deletes, arrays replace. */
export function applyJsonMergePatch(target: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const result: Record<string, unknown> = target !== null && typeof target === 'object' && !Array.isArray(target)
    ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else Object.defineProperty(result, key, {
      value: applyJsonMergePatch(Object.hasOwn(result, key) ? result[key] : undefined, value),
      enumerable: true, configurable: true, writable: true,
    });
  }
  return result;
}
