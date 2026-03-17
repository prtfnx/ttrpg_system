/**
 * UnitConverter — Behaviour Tests
 *
 * Tests what a user/DM experiences when the grid scale changes:
 * distances display correctly, conversions are consistent,
 * and switching ft↔m affects all derived values.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import { DND_DISTANCES, UnitConverter, dndDefault } from '../unitConverter';

describe('UnitConverter — DnD default (50px/5ft)', () => {
  const conv = dndDefault();

  it('converts a torch radius (20ft) to correct pixel size', () => {
    // 20ft × 10px/ft = 200px
    expect(conv.toPixels(20)).toBe(200);
  });

  it('converts darkvision (60ft) to correct pixel size', () => {
    expect(conv.toPixels(60)).toBe(600);
  });

  it('converts pixels back to game units', () => {
    expect(conv.toUnits(200)).toBe(20);
    expect(conv.toUnits(600)).toBe(60);
  });

  it('round-trips px → units → px without drift', () => {
    const original = 137.5;
    expect(conv.toPixels(conv.toUnits(original))).toBeCloseTo(original);
  });

  it('fromFeet is identity when unit is ft', () => {
    expect(conv.fromFeet(60)).toBe(60);
  });

  it('formatDistance shows whole-number feet for standard distances', () => {
    expect(conv.formatDistance(200)).toBe('20ft');   // torch bright
    expect(conv.formatDistance(600)).toBe('60ft');   // darkvision
  });
});

describe('UnitConverter — metric table (50px/2m)', () => {
  const conv = new UnitConverter({ gridCellPx: 50, cellDistance: 2, distanceUnit: 'm' });

  it('converts 6m to correct pixels (6 × 25 = 150)', () => {
    expect(conv.toPixels(6)).toBe(150);
  });

  it('converts feet to meters correctly via fromFeet', () => {
    // 60ft ≈ 18.288m
    expect(conv.fromFeet(60)).toBeCloseTo(18.288, 2);
  });

  it('formatDistance shows meters', () => {
    // 150px → 6.0m
    expect(conv.formatDistance(150)).toBe('6.0m');
  });
});

describe('UnitConverter — custom grid (100px/10ft)', () => {
  const conv = new UnitConverter({ gridCellPx: 100, cellDistance: 10, distanceUnit: 'ft' });

  it('still converts 20ft correctly at doubled cell size', () => {
    // 20ft × (100/10) px/ft = 200px — same pixel size
    expect(conv.toPixels(20)).toBe(200);
  });

  it('toUnits is the inverse regardless of scale', () => {
    expect(conv.toUnits(200)).toBe(20);
  });
});

describe('Grid rescaling — game-unit values auto-adapt', () => {
  it('torch radius stays 20ft across different grid densities', () => {
    const smallGrid = new UnitConverter({ gridCellPx: 30, cellDistance: 5, distanceUnit: 'ft' });
    const largeGrid = new UnitConverter({ gridCellPx: 80, cellDistance: 5, distanceUnit: 'ft' });

    // 20ft in small grid
    const pxSmall = smallGrid.toPixels(20); // 20 × 6 = 120
    // 20ft in large grid
    const pxLarge = largeGrid.toPixels(20); // 20 × 16 = 320

    // Game-unit distance is preserved; only pixel rendering changes
    expect(smallGrid.toUnits(pxSmall)).toBe(20);
    expect(largeGrid.toUnits(pxLarge)).toBe(20);
    expect(pxLarge).toBeGreaterThan(pxSmall);
  });
});

describe('DND_DISTANCES constants', () => {
  it('torch bright and dim match PHB values', () => {
    expect(DND_DISTANCES.TORCH_BRIGHT).toBe(20);
    expect(DND_DISTANCES.TORCH_DIM).toBe(40);
  });

  it('Fireball radius matches PHB', () => {
    expect(DND_DISTANCES.FIREBALL_RADIUS).toBe(20);
  });

  it('standard darkvision is 60ft', () => {
    expect(DND_DISTANCES.DARKVISION_STANDARD).toBe(60);
  });

  it('converting all light presets produces positive pixel values', () => {
    const conv = dndDefault();
    const presets = [
      DND_DISTANCES.CANDLE_BRIGHT,
      DND_DISTANCES.TORCH_BRIGHT,
      DND_DISTANCES.LANTERN_HOODED_BRIGHT,
      DND_DISTANCES.CAMPFIRE_BRIGHT,
      DND_DISTANCES.DAYLIGHT_SPELL,
    ];
    for (const ft of presets) {
      expect(conv.toPixels(ft)).toBeGreaterThan(0);
    }
  });
});
