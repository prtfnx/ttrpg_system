import { describe, expect, it } from 'vitest';
import { applyJsonMergePatch } from '../jsonMergePatch';

describe('JSON Merge Patch', () => {
  it('preserves siblings, removes null members and replaces arrays without mutating the source', () => {
    const source = { data: { stats: { hp: 10, ac: 12 }, items: ['rope'], slots: { 1: 2 } } };
    expect(applyJsonMergePatch(source, { data: { stats: { hp: 0, ac: null }, items: [], slots: null } }))
      .toEqual({ data: { stats: { hp: 0 }, items: [] } });
    expect(source.data).toEqual({ stats: { hp: 10, ac: 12 }, items: ['rope'], slots: { 1: 2 } });
  });

  it('replaces scalar targets with objects and accepts an explicit null document', () => {
    expect(applyJsonMergePatch({ data: 'legacy' }, { data: { stats: { hp: 1 } } }))
      .toEqual({ data: { stats: { hp: 1 } } });
    expect(applyJsonMergePatch({}, null)).toBeNull();
  });

  it('treats prototype-named JSON members as data', () => {
    const patch = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
    const result = applyJsonMergePatch({}, patch);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result as object, '__proto__')).toBe(true);
    expect(Object.hasOwn({}, 'polluted')).toBe(false);
  });
});
