import { describe, it, expect } from 'vitest';
import { RACES, calculateRacialASI, getRacialTraits, getRacialProficiencies } from '../raceData';

describe('RACES data', () => {
  it('contains Human, Elf, Dwarf, Halfling', () => {
    expect(RACES['Human']).toBeDefined();
    expect(RACES['Elf']).toBeDefined();
    expect(RACES['Dwarf']).toBeDefined();
    expect(RACES['Halfling']).toBeDefined();
  });

  it('Human has speed 30', () => {
    expect(RACES['Human'].speed).toBe(30);
  });

  it('Halfling is Small', () => {
    expect(RACES['Halfling'].size).toBe('Small');
  });
});

describe('calculateRacialASI', () => {
  it('returns {} for unknown race', () => {
    expect(calculateRacialASI('Unknown')).toEqual({});
  });

  it('returns base ASI for race without subrace', () => {
    const asi = calculateRacialASI('Elf');
    expect(asi.dexterity).toBe(2);
  });

  it('merges subrace ASI with race ASI', () => {
    const asi = calculateRacialASI('Elf', 'High Elf');
    expect(asi.dexterity).toBe(2);
    expect(asi.intelligence).toBe(1);
  });

  it('human has +1 to all stats', () => {
    const asi = calculateRacialASI('Human');
    expect(asi.strength).toBe(1);
    expect(asi.charisma).toBe(1);
  });

  it('supports custom racesData override', () => {
    const custom = { TestRace: { ...RACES['Dwarf'], name: 'TestRace' } };
    const asi = calculateRacialASI('TestRace', undefined, custom);
    expect(asi.constitution).toBe(2);
  });
});

describe('getRacialTraits', () => {
  it('returns [] for unknown race', () => {
    expect(getRacialTraits('Unknown')).toEqual([]);
  });

  it('returns race traits', () => {
    const traits = getRacialTraits('Human');
    expect(traits.length).toBeGreaterThan(0);
    expect(traits[0]).toHaveProperty('name');
    expect(traits[0]).toHaveProperty('description');
  });

  it('includes subrace traits when subrace given', () => {
    const traitsWithout = getRacialTraits('Elf');
    const traitsWith = getRacialTraits('Elf', 'High Elf');
    expect(traitsWith.length).toBeGreaterThan(traitsWithout.length);
  });

  it('accepts custom racesData', () => {
    const custom = { TestRace: { ...RACES['Human'], name: 'TestRace' } };
    const traits = getRacialTraits('TestRace', undefined, custom);
    expect(traits.length).toBeGreaterThan(0);
  });
});

describe('getRacialProficiencies', () => {
  it('returns {} for unknown race', () => {
    expect(getRacialProficiencies('Unknown')).toEqual({});
  });

  it('returns Dwarf weapon proficiencies', () => {
    const profs = getRacialProficiencies('Dwarf');
    expect(profs.weapons).toContain('Battleaxe');
  });

  it('merges subrace weapon profs with race profs', () => {
    const profs = getRacialProficiencies('Elf', 'High Elf');
    expect(profs.weapons).toContain('Longsword');
  });

  it('returns empty object for race with no proficiencies', () => {
    const profs = getRacialProficiencies('Halfling');
    expect(profs).toBeDefined();
  });
});
