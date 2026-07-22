import { describe, expect, it } from 'vitest';
import { formatEquipmentCost, parseCompendiumSpeed } from '../compendiumNormalization';

describe('compendium normalization', () => {
  it('formats generated currency objects and prefers the source display value', () => {
    expect(formatEquipmentCost({ gold: 15, silver: 2 })).toBe('15 gp, 2 sp');
    expect(formatEquipmentCost({ gold: 15 }, '15 gp')).toBe('15 gp');
    expect(formatEquipmentCost({ gold: 0 })).toBe('—');
  });

  it('parses an unnamed walking speed before named movement modes', () => {
    expect(parseCompendiumSpeed('10 ft., swim 40 ft.')).toEqual({ walk: 10, swim: 40 });
    expect(parseCompendiumSpeed('40 ft., climb 40 ft., fly 80 ft.')).toEqual({
      walk: 40,
      climb: 40,
      fly: 80,
    });
  });

  it('accepts numeric and object speed formats', () => {
    expect(parseCompendiumSpeed(25)).toEqual({ walk: 25 });
    expect(parseCompendiumSpeed({ walk: '20', burrow: 10 })).toEqual({ walk: 20, burrow: 10 });
  });
});
