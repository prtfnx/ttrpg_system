export type DistanceUnit = 'ft' | 'm';

export interface TableUnitConfig {
  gridCellPx: number;
  cellDistance: number;
  distanceUnit: DistanceUnit;
}

export class UnitConverter {
  private readonly pxPerUnit: number;
  private readonly unit: DistanceUnit;

  constructor(config: TableUnitConfig) {
    const cellDist = Number.isFinite(config.cellDistance) && config.cellDistance > 0
      ? config.cellDistance : 5;
    this.pxPerUnit = config.gridCellPx / cellDist;
    this.unit = config.distanceUnit;
  }

  pixelsPerUnit(): number {
    return this.pxPerUnit;
  }

  toPixels(gameDistance: number): number {
    return gameDistance * this.pxPerUnit;
  }

  toUnits(pixels: number): number {
    return pixels / this.pxPerUnit;
  }

  toFeet(gameUnits: number): number {
    return this.unit === 'ft' ? gameUnits : gameUnits / 0.3048;
  }

  fromFeet(feet: number): number {
    return this.unit === 'ft' ? feet : feet * 0.3048;
  }

  formatDistance(pixels: number): string {
    const d = this.toUnits(pixels);
    return d < 10 ? `${d.toFixed(1)}${this.unit}` : `${Math.round(d)}${this.unit}`;
  }
}

// D&D 5e default: 50px/cell, 5ft/cell → 10 px/ft
export const dndDefault = (): UnitConverter =>
  new UnitConverter({ gridCellPx: 50, cellDistance: 5, distanceUnit: 'ft' });

/** D&D 5e canonical distances in feet (PHB). Use these everywhere instead of magic numbers. */
export const DND_DISTANCES = {
  // Light sources
  CANDLE_BRIGHT: 5,
  CANDLE_DIM: 10,
  TORCH_BRIGHT: 20,
  TORCH_DIM: 40,
  LANTERN_HOODED_BRIGHT: 30,
  LANTERN_HOODED_DIM: 60,
  CAMPFIRE_BRIGHT: 20,
  CAMPFIRE_DIM: 40,
  LIGHT_CANTRIP: 20,
  MAGIC_LIGHT: 30,
  MOONLIGHT: 40,
  DAYLIGHT_SPELL: 60,
  DAYLIGHT_DIM: 120,
  // Vision
  DARKVISION_STANDARD: 60,
  DARKVISION_SUPERIOR: 120,
  // Movement
  SPEED_DEFAULT: 30,
  // Spell ranges
  RANGE_TOUCH: 5,
  RANGE_SHORT: 30,
  RANGE_MEDIUM: 60,
  RANGE_LONG: 120,
  // Spell areas
  FIREBALL_RADIUS: 20,
  CONE_LENGTH: 60,
  LIGHTNING_BOLT_LENGTH: 100,
  LIGHTNING_BOLT_WIDTH: 5,
} as const;
