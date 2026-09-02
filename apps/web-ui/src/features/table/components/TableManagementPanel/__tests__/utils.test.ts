import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatRelativeTime, TABLE_TEMPLATES, validateImportedTableData } from '../utils';

describe('formatDate', () => {
  it('returns Unknown for undefined', () => {
    expect(formatDate(undefined)).toBe('Unknown');
  });

  it('returns Unknown for empty string', () => {
    expect(formatDate('')).toBe('Unknown');
  });

  it('returns a locale date string for valid date', () => {
    const result = formatDate('2024-01-15');
    expect(result).not.toBe('Unknown');
    expect(typeof result).toBe('string');
  });

  it('returns Invalid Date for an invalid date string', () => {
    // new Date('not-a-date') doesn't throw; toLocaleDateString() returns 'Invalid Date'
    expect(formatDate('not-a-date')).toBe('Invalid Date');
  });
});

describe('formatRelativeTime', () => {
  let now: number;

  beforeEach(() => {
    now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty string for undefined', () => {
    expect(formatRelativeTime(undefined)).toBe('');
  });

  it('returns just now for < 60s', () => {
    expect(formatRelativeTime(now - 30_000)).toBe('just now');
  });

  it('returns Xm ago for < 60 minutes', () => {
    expect(formatRelativeTime(now - 5 * 60_000)).toBe('5m ago');
  });

  it('returns Xh ago for < 24 hours', () => {
    expect(formatRelativeTime(now - 3 * 60 * 60_000)).toBe('3h ago');
  });

  it('returns Xd ago for >= 24 hours', () => {
    expect(formatRelativeTime(now - 2 * 24 * 60 * 60_000)).toBe('2d ago');
  });
});

describe('TABLE_TEMPLATES', () => {
  it('has four templates', () => {
    expect(Object.keys(TABLE_TEMPLATES)).toHaveLength(4);
  });

  it('small is 1000×1000', () => {
    expect(TABLE_TEMPLATES.small).toEqual({ width: 1000, height: 1000, label: 'Small (1000×1000)' });
  });

  it('huge is 8000×8000', () => {
    expect(TABLE_TEMPLATES.huge).toEqual({ width: 8000, height: 8000, label: 'Huge (8000×8000)' });
  });
});

describe('validateImportedTableData', () => {
  it('accepts a canonical table export with layers', () => {
    const data = validateImportedTableData({
      table_name: 'Dungeon',
      width: 2000,
      height: 1500,
      layers: { tokens: { 1: { name: 'Hero' } } },
    });

    expect(data).toMatchObject({ table_name: 'Dungeon', width: 2000, height: 1500 });
  });

  it.each([
    { table_name: 'Dungeon', width: '2000', height: 1500, layers: {} },
    { table_name: 'Dungeon', width: -1, height: 1500, layers: {} },
    { table_name: 'Dungeon', width: 2000, height: 10_001, layers: {} },
    { table_name: 'Dungeon', width: 2000, height: 1500 },
  ])('rejects invalid or incomplete exports', payload => {
    expect(validateImportedTableData(payload)).toBeNull();
  });
});
