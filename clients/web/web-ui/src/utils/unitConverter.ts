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
    this.pxPerUnit = config.gridCellPx / config.cellDistance;
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
