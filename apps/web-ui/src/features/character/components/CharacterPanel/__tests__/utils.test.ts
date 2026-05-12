import { describe, it, expect } from 'vitest';
import { genId } from '../utils';

describe('genId', () => {
  it('starts with temp-', () => {
    expect(genId()).toMatch(/^temp-/);
  });

  it('is unique across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => genId()));
    expect(ids.size).toBe(100);
  });

  it('contains only url-safe characters', () => {
    const id = genId();
    expect(id).toMatch(/^[\w-]+$/);
  });
});
