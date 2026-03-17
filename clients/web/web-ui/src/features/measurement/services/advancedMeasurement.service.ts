/**
 * Advanced Measurement & Grid System Service
 * Production-ready measurement tools with geometric algorithms, spatial indexing,
 * and comprehensive grid management for tabletop gaming
 */

export interface MeasurementPoint {
  x: number;
  y: number;
  timestamp: number;
  id: string;
}

export interface MeasurementLine {
  id: string;
  start: MeasurementPoint;
  end: MeasurementPoint;
  distance: number;
  gridDistance: number;
  angle: number; // In degrees
  color: string;
  thickness: number;
  style: 'solid' | 'dashed' | 'dotted';
  persistent: boolean;
  label?: string;
  created: number;
}

export interface GridConfiguration {
  id: string;
  name: string;
  type: 'square' | 'hex' | 'isometric' | 'triangular';
  size: number; // Base grid size in pixels
  scale: number; // Units per grid square (e.g., 5 feet)
  unit: 'feet' | 'meters' | 'squares' | 'hexes' | 'custom';
  customUnit?: string;
  color: string;
  opacity: number;
  thickness: number;
  visible: boolean;
  snapToGrid: boolean;
  showCoordinates: boolean;
  coordinateSystem: 'cartesian' | 'alphanumeric' | 'numeric';
  origin: { x: number; y: number };
  rotation: number; // In degrees
  offsetX: number;
  offsetY: number;
  majorGridEvery: number; // Show major grid lines every N squares
  majorGridColor: string;
  majorGridThickness: number;
}

export interface HexGridConfiguration extends GridConfiguration {
  type: 'hex';
  orientation: 'flat' | 'pointy'; // Flat-top or pointy-top hexagons
  hexRadius: number;
}

export interface GeometricShape {
  id: string;
  type: 'circle' | 'rectangle' | 'polygon' | 'arc' | 'ellipse';
  points: MeasurementPoint[];
  color: string;
  fillColor?: string;
  opacity: number;
  thickness: number;
  style: 'solid' | 'dashed' | 'dotted';
  filled: boolean;
  label?: string;
  area?: number;
  perimeter?: number;
  created: number;
}

export interface MeasurementTemplate {
  id: string;
  name: string;
  type: 'cone' | 'line' | 'sphere' | 'cylinder' | 'cube' | 'custom';
  size: number; // Primary dimension
  secondarySize?: number; // Height for cylinder, width for line, etc.
  color: string;
  fillColor: string;
  opacity: number;
  rotatable: boolean;
  snapToGrid: boolean;
  showArea: boolean;
  description: string;
}

export interface SpatialIndex {
  quadtree: QuadTreeNode;
  gridCells: Map<string, MeasurementPoint[]>;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface QuadTreeNode {
  bounds: { x: number; y: number; width: number; height: number };
  points: MeasurementPoint[];
  children?: [QuadTreeNode, QuadTreeNode, QuadTreeNode, QuadTreeNode];
  maxPoints: number;
  depth: number;
}

export interface MeasurementHistory {
  measurements: MeasurementLine[];
  shapes: GeometricShape[];
  currentIndex: number;
  maxHistory: number;
}

export interface MeasurementSettings {
  defaultUnit: 'feet' | 'meters' | 'squares' | 'hexes';
  precision: number; // Decimal places for measurements
  showTooltips: boolean;
  showAngleMarkers: boolean;
  showDistanceLabels: boolean;
  snapToGrid: boolean;
  snapTolerance: number;
  measurementLineColor: string;
  measurementLineThickness: number;
  highlightColor: string;
  autoSaveHistory: boolean;
  maxHistorySize: number;
  keyboardShortcuts: {
    toggleMeasurement: string;
    clearMeasurements: string;
    undoMeasurement: string;
    redoMeasurement: string;
    toggleGrid: string;
    snapToGrid: string;
  };
}

/**
 * Advanced Measurement & Grid System Service
 * Comprehensive measurement tools with spatial indexing and grid management
 */
class AdvancedMeasurementService {
  private measurements: Map<string, MeasurementLine> = new Map();
  private shapes: Map<string, GeometricShape> = new Map();
  private templates: Map<string, MeasurementTemplate> = new Map();
  private grids: Map<string, GridConfiguration> = new Map();
  private activeGrid: string | null = null;
  private spatialIndex: SpatialIndex;
  private history: MeasurementHistory;
  private settings: MeasurementSettings;
  private activeMeasurement: string | null = null;
  private measurementCallbacks: Map<string, Function> = new Map();

  constructor() {
    this.spatialIndex = this.createSpatialIndex();
    this.history = {
      measurements: [],
      shapes: [],
      currentIndex: -1,
      maxHistory: 100
    };

    this.settings = this.getDefaultSettings();
    this.initializeDefaultTemplates();
    this.initializeDefaultGrids();
  }

  // MEASUREMENT OPERATIONS

  /**
   * Start a new measurement from a point
   */
  startMeasurement(point: { x: number; y: number }, options: {
    color?: string;
    thickness?: number;
    style?: 'solid' | 'dashed' | 'dotted';
    persistent?: boolean;
    label?: string;
  } = {}): string {
    const id = `measurement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startPoint: MeasurementPoint = {
      ...point,
      timestamp: Date.now(),
      id: `${id}_start`
    };

    // Snap to grid if enabled
    const snappedStart = this.settings.snapToGrid ? this.snapToGrid(startPoint) : startPoint;

    const measurement: MeasurementLine = {
      id,
      start: snappedStart,
      end: snappedStart, // Initially same as start
      distance: 0,
      gridDistance: 0,
      angle: 0,
      color: options.color || this.settings.measurementLineColor,
      thickness: options.thickness || this.settings.measurementLineThickness,
      style: options.style || 'solid',
      persistent: options.persistent || false,
      label: options.label,
      created: Date.now()
    };

    this.measurements.set(id, measurement);
    this.activeMeasurement = id;
    this.addToSpatialIndex(snappedStart);

    this.notifyCallbacks('measurementStarted', { measurement });
    return id;
  }

  /**
   * Update an active measurement with a new endpoint
   */
  updateMeasurement(measurementId: string, endPoint: { x: number; y: number }): void {
    const measurement = this.measurements.get(measurementId);
    if (!measurement) return;

    // Snap to grid if enabled
    const snappedEnd = this.settings.snapToGrid ? this.snapToGrid({
      ...endPoint,
      timestamp: Date.now(),
      id: `${measurementId}_end`
    }) : {
      ...endPoint,
      timestamp: Date.now(),
      id: `${measurementId}_end`
    };

    // Calculate distance and angle
    const distance = this.calculateDistance(measurement.start, snappedEnd);
    const gridDistance = this.calculateGridDistance(measurement.start, snappedEnd);
    const angle = this.calculateAngle(measurement.start, snappedEnd);

    measurement.end = snappedEnd;
    measurement.distance = distance;
    measurement.gridDistance = gridDistance;
    measurement.angle = angle;

    this.addToSpatialIndex(snappedEnd);
    this.notifyCallbacks('measurementUpdated', { measurement });
  }

  /**
   * Complete a measurement
   */
  completeMeasurement(measurementId: string): MeasurementLine | null {
    const measurement = this.measurements.get(measurementId);
    if (!measurement) return null;

    // Add to history
    this.addToHistory('measurement', measurement);

    // Clear active measurement
    if (this.activeMeasurement === measurementId) {
      this.activeMeasurement = null;
    }

    this.notifyCallbacks('measurementCompleted', { measurement });
    return measurement;
  }

  /**
   * Cancel an active measurement
   */
  cancelMeasurement(measurementId: string): void {
    if (this.measurements.has(measurementId)) {
      this.measurements.delete(measurementId);
      if (this.activeMeasurement === measurementId) {
        this.activeMeasurement = null;
      }
      this.notifyCallbacks('measurementCancelled', { measurementId });
    }
  }

  /**
   * Clear all measurements
   */
  clearMeasurements(persistent = false): void {
    const toRemove: string[] = [];
    for (const [id, measurement] of this.measurements.entries()) {
      if (!measurement.persistent || persistent) {
        toRemove.push(id);
      }
    }

    toRemove.forEach(id => this.measurements.delete(id));
    this.activeMeasurement = null;
    this.rebuildSpatialIndex();
    this.notifyCallbacks('measurementsCleared', { count: toRemove.length });
  }

  // GEOMETRIC SHAPE OPERATIONS

  /**
   * Create a geometric shape from points
   */
  createShape(type: GeometricShape['type'], points: { x: number; y: number }[], options: {
    color?: string;
    fillColor?: string;
    opacity?: number;
    thickness?: number;
    style?: 'solid' | 'dashed' | 'dotted';
    filled?: boolean;
    label?: string;
  } = {}): string {
    const id = `shape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const shapePoints: MeasurementPoint[] = points.map((point, index) => ({
      ...point,
      timestamp: Date.now(),
      id: `${id}_point_${index}`
    }));

    const shape: GeometricShape = {
      id,
      type,
      points: shapePoints,
      color: options.color || this.settings.measurementLineColor,
      fillColor: options.fillColor,
      opacity: options.opacity || 1.0,
      thickness: options.thickness || this.settings.measurementLineThickness,
      style: options.style || 'solid',
      filled: options.filled || false,
      label: options.label,
      created: Date.now()
    };

    // Calculate area and perimeter
    if (type === 'circle' && points.length >= 2) {
      const radius = this.calculateDistance(shapePoints[0], shapePoints[1]);
      shape.area = Math.PI * radius * radius;
      shape.perimeter = 2 * Math.PI * radius;
    } else if (type === 'rectangle' && points.length >= 2) {
      const width = Math.abs(points[1].x - points[0].x);
      const height = Math.abs(points[1].y - points[0].y);
      shape.area = width * height;
      shape.perimeter = 2 * (width + height);
    } else if (type === 'polygon' && points.length >= 3) {
      shape.area = this.calculatePolygonArea(points);
      shape.perimeter = this.calculatePolygonPerimeter(points);
    }

    this.shapes.set(id, shape);
    shapePoints.forEach(point => this.addToSpatialIndex(point));
    this.addToHistory('shape', shape);

    this.notifyCallbacks('shapeCreated', { shape });
    return id;
  }

  /**
   * Create a measurement template (spell areas, etc.)
   */
  createTemplate(template: Omit<MeasurementTemplate, 'id'>): string {
    const id = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullTemplate: MeasurementTemplate = { id, ...template };
    
    this.templates.set(id, fullTemplate);
    this.notifyCallbacks('templateCreated', { template: fullTemplate });
    return id;
  }

  // GRID MANAGEMENT

  /**
   * Create a new grid configuration
   */
  createGrid(config: Omit<GridConfiguration, 'id'>): string {
    const id = `grid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const grid: GridConfiguration = { id, ...config };
    
    this.grids.set(id, grid);
    if (!this.activeGrid) {
      this.activeGrid = id;
    }

    this.notifyCallbacks('gridCreated', { grid });
    return id;
  }

  /**
   * Set the active grid
   */
  setActiveGrid(gridId: string): void {
    if (this.grids.has(gridId)) {
      this.activeGrid = gridId;
      this.notifyCallbacks('activeGridChanged', { gridId });
    }
  }

  /**
   * Update grid configuration
   */
  updateGrid(gridId: string, updates: Partial<GridConfiguration>): void {
    const grid = this.grids.get(gridId);
    if (grid) {
      Object.assign(grid, updates);
      this.grids.set(gridId, grid);
      this.notifyCallbacks('gridUpdated', { grid });
    }
  }

  /**
   * Snap a point to the active grid
   */
  snapToGrid(point: MeasurementPoint): MeasurementPoint {
    const grid = this.activeGrid ? this.grids.get(this.activeGrid) : null;
    if (!grid || !grid.snapToGrid) return point;

    let snappedX: number;
    let snappedY: number;

    switch (grid.type) {
      case 'square':
        snappedX = Math.round((point.x - grid.origin.x - grid.offsetX) / grid.size) * grid.size + grid.origin.x + grid.offsetX;
        snappedY = Math.round((point.y - grid.origin.y - grid.offsetY) / grid.size) * grid.size + grid.origin.y + grid.offsetY;
        break;

      case 'hex':
        const hexGrid = grid as HexGridConfiguration;
        const hexSnap = this.snapToHexGrid(point, hexGrid);
        snappedX = hexSnap.x;
        snappedY = hexSnap.y;
        break;

      case 'isometric':
        const isoSnap = this.snapToIsometricGrid(point, grid);
        snappedX = isoSnap.x;
        snappedY = isoSnap.y;
        break;

      case 'triangular':
        const triSnap = this.snapToTriangularGrid(point, grid);
        snappedX = triSnap.x;
        snappedY = triSnap.y;
        break;

      default:
        snappedX = point.x;
        snappedY = point.y;
    }

    return { ...point, x: snappedX, y: snappedY };
  }

  // DISTANCE CALCULATIONS

  /**
   * Calculate Euclidean distance between two points
   */
  calculateDistance(point1: { x: number; y: number }, point2: { x: number; y: number }): number {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate grid-based distance (following grid rules)
   */
  calculateGridDistance(point1: { x: number; y: number }, point2: { x: number; y: number }): number {
    const grid = this.activeGrid ? this.grids.get(this.activeGrid) : null;
    if (!grid) return this.calculateDistance(point1, point2);

    switch (grid.type) {
      case 'square':
        // D&D 5e distance rules: diagonal movement
        const dx = Math.abs(point2.x - point1.x) / grid.size;
        const dy = Math.abs(point2.y - point1.y) / grid.size;
        const diagonals = Math.min(dx, dy);
        const straights = Math.max(dx, dy) - diagonals;
        return (diagonals * 1.5 + straights) * grid.scale;

      case 'hex':
        return this.calculateHexDistance(point1, point2, grid as HexGridConfiguration);

      default:
        return this.calculateDistance(point1, point2) * grid.scale / grid.size;
    }
  }

  /**
   * Calculate angle between two points in degrees
   */
  calculateAngle(point1: { x: number; y: number }, point2: { x: number; y: number }): number {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    return angle < 0 ? angle + 360 : angle;
  }

  // SPATIAL INDEXING

  /**
   * Create a spatial index for efficient point queries
   */
  private createSpatialIndex(): SpatialIndex {
    return {
      quadtree: {
        bounds: { x: -10000, y: -10000, width: 20000, height: 20000 },
        points: [],
        maxPoints: 10,
        depth: 0
      },
      gridCells: new Map(),
      bounds: {
        minX: -10000,
        minY: -10000,
        maxX: 10000,
        maxY: 10000
      }
    };
  }

  /**
   * Add a point to the spatial index
   */
  private addToSpatialIndex(point: MeasurementPoint): void {
    this.insertIntoQuadTree(this.spatialIndex.quadtree, point);
    
    // Also add to grid-based index
    const cellKey = `${Math.floor(point.x / 100)}_${Math.floor(point.y / 100)}`;
    if (!this.spatialIndex.gridCells.has(cellKey)) {
      this.spatialIndex.gridCells.set(cellKey, []);
    }
    this.spatialIndex.gridCells.get(cellKey)!.push(point);
  }

  /**
   * Find nearby points using spatial index
   */
  findNearbyPoints(point: { x: number; y: number }, radius: number): MeasurementPoint[] {
    const queryBounds = {
      x: point.x - radius,
      y: point.y - radius,
      width: radius * 2,
      height: radius * 2
    };

    const candidates = this.queryQuadTree(this.spatialIndex.quadtree, queryBounds);
    return candidates.filter(p => this.calculateDistance(point, p) <= radius);
  }

  // UTILITY METHODS

  /**
   * Format distance for display
   */
  formatDistance(distance: number, unit?: string): string {
    const displayUnit = unit || this.settings.defaultUnit;
    const precision = this.settings.precision;
    
    switch (displayUnit) {
      case 'feet':
        return `${distance.toFixed(precision)} ft`;
      case 'meters':
        return `${distance.toFixed(precision)} m`;
      case 'squares':
        return `${distance.toFixed(precision)} sq`;
      case 'hexes':
        return `${distance.toFixed(precision)} hex`;
      default:
        return `${distance.toFixed(precision)} ${displayUnit || 'units'}`;
    }
  }

  /**
   * Export measurements and shapes to JSON
   */
  exportData(): string {
    return JSON.stringify({
      measurements: Array.from(this.measurements.values()),
      shapes: Array.from(this.shapes.values()),
      grids: Array.from(this.grids.values()),
      templates: Array.from(this.templates.values()),
      settings: this.settings,
      activeGrid: this.activeGrid,
      version: '1.0.0',
      exported: Date.now()
    }, null, 2);
  }

  /**
   * Import measurements and shapes from JSON
   */
  importData(jsonData: string): void {
    try {
      const data = JSON.parse(jsonData);
      
      // Import measurements
      if (data.measurements) {
        data.measurements.forEach((m: MeasurementLine) => {
          this.measurements.set(m.id, m);
        });
      }

      // Import shapes
      if (data.shapes) {
        data.shapes.forEach((s: GeometricShape) => {
          this.shapes.set(s.id, s);
        });
      }

      // Import grids
      if (data.grids) {
        data.grids.forEach((g: GridConfiguration) => {
          this.grids.set(g.id, g);
        });
      }

      // Import templates
      if (data.templates) {
        data.templates.forEach((t: MeasurementTemplate) => {
          this.templates.set(t.id, t);
        });
      }

      // Import settings
      if (data.settings) {
        this.settings = { ...this.settings, ...data.settings };
      }

      // Set active grid
      if (data.activeGrid) {
        this.activeGrid = data.activeGrid;
      }

      this.rebuildSpatialIndex();
      this.notifyCallbacks('dataImported', { success: true });
    } catch (error) {
      this.notifyCallbacks('dataImported', { success: false, error });
    }
  }

  // PRIVATE HELPER METHODS

  private getDefaultSettings(): MeasurementSettings {
    return {
      defaultUnit: 'feet',
      precision: 1,
      showTooltips: true,
      showAngleMarkers: true,
      showDistanceLabels: true,
      snapToGrid: true,
      snapTolerance: 10,
      measurementLineColor: '#ff6b35',
      measurementLineThickness: 2,
      highlightColor: '#ffd23f',
      autoSaveHistory: true,
      maxHistorySize: 100,
      keyboardShortcuts: {
        toggleMeasurement: 'M',
        clearMeasurements: 'Ctrl+Delete',
        undoMeasurement: 'Ctrl+Z',
        redoMeasurement: 'Ctrl+Y',
        toggleGrid: 'G',
        snapToGrid: 'S'
      }
    };
  }

  private initializeDefaultTemplates(): void {
    // D&D 5e spell templates
    const templates = [
      { name: 'Cone (15 ft)', type: 'cone' as const, size: 15, color: '#ff6b35', fillColor: '#ff6b3533', opacity: 0.7, rotatable: true, snapToGrid: true, showArea: true, description: '15-foot cone' },
      { name: 'Cone (30 ft)', type: 'cone' as const, size: 30, color: '#ff6b35', fillColor: '#ff6b3533', opacity: 0.7, rotatable: true, snapToGrid: true, showArea: true, description: '30-foot cone' },
      { name: 'Sphere (20 ft)', type: 'sphere' as const, size: 20, color: '#4ecdc4', fillColor: '#4ecdc433', opacity: 0.7, rotatable: false, snapToGrid: true, showArea: true, description: '20-foot radius sphere' },
      { name: 'Line (30 ft)', type: 'line' as const, size: 30, secondarySize: 5, color: '#45b7d1', fillColor: '#45b7d133', opacity: 0.7, rotatable: true, snapToGrid: true, showArea: true, description: '30-foot line, 5 feet wide' },
      { name: 'Cylinder (20 ft)', type: 'cylinder' as const, size: 20, secondarySize: 40, color: '#96ceb4', fillColor: '#96ceb433', opacity: 0.7, rotatable: false, snapToGrid: true, showArea: true, description: '20-foot radius, 40-foot high cylinder' }
    ];

    templates.forEach(template => {
      const id = `default_${template.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      this.templates.set(id, { id, ...template });
    });
  }

  private initializeDefaultGrids(): void {
    // Standard D&D grid
    const dndGrid: GridConfiguration = {
      id: 'dnd_standard',
      name: 'D&D Standard (5ft squares)',
      type: 'square',
      size: 30, // 30 pixels per square
      scale: 5, // 5 feet per square
      unit: 'feet',
      color: '#cccccc',
      opacity: 0.5,
      thickness: 1,
      visible: true,
      snapToGrid: true,
      showCoordinates: false,
      coordinateSystem: 'alphanumeric',
      origin: { x: 0, y: 0 },
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
      majorGridEvery: 5,
      majorGridColor: '#999999',
      majorGridThickness: 2
    };

    // Hex grid
    const hexGrid: HexGridConfiguration = {
      id: 'hex_standard',
      name: 'Hex Grid (5ft)',
      type: 'hex',
      orientation: 'flat',
      size: 30,
      hexRadius: 26,
      scale: 5,
      unit: 'feet',
      color: '#cccccc',
      opacity: 0.5,
      thickness: 1,
      visible: false,
      snapToGrid: true,
      showCoordinates: false,
      coordinateSystem: 'numeric',
      origin: { x: 0, y: 0 },
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
      majorGridEvery: 1,
      majorGridColor: '#999999',
      majorGridThickness: 2
    };

    this.grids.set(dndGrid.id, dndGrid);
    this.grids.set(hexGrid.id, hexGrid);
    this.activeGrid = dndGrid.id;
  }

  private snapToHexGrid(point: MeasurementPoint, grid: HexGridConfiguration): { x: number; y: number } {
    // Hex grid snapping algorithm
    const size = grid.hexRadius;

    // Convert to hex coordinates
    const q = (2/3 * (point.x - grid.origin.x)) / size;
    const r = (-1/3 * (point.x - grid.origin.x) + Math.sqrt(3)/3 * (point.y - grid.origin.y)) / size;
    const s = -q - r;

    // Round to nearest hex
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);

    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);

    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs;
    } else if (rDiff > sDiff) {
      rr = -rq - rs;
    } else {
      rs = -rq - rr;
    }

    // Convert back to pixel coordinates
    const x = size * (3/2 * rq) + grid.origin.x;
    const y = size * (Math.sqrt(3)/2 * rq + Math.sqrt(3) * rr) + grid.origin.y;

    return { x, y };
  }

  private calculateHexDistance(point1: { x: number; y: number }, point2: { x: number; y: number }, grid: HexGridConfiguration): number {
    // Convert points to hex coordinates and calculate hex distance
    const hex1 = this.pixelToHex(point1, grid);
    const hex2 = this.pixelToHex(point2, grid);
    
    return (Math.abs(hex1.q - hex2.q) + Math.abs(hex1.q + hex1.r - hex2.q - hex2.r) + Math.abs(hex1.r - hex2.r)) / 2 * grid.scale;
  }

  private pixelToHex(point: { x: number; y: number }, grid: HexGridConfiguration): { q: number; r: number } {
    const size = grid.hexRadius;
    const q = (2/3 * (point.x - grid.origin.x)) / size;
    const r = (-1/3 * (point.x - grid.origin.x) + Math.sqrt(3)/3 * (point.y - grid.origin.y)) / size;
    return { q: Math.round(q), r: Math.round(r) };
  }

  private snapToIsometricGrid(point: MeasurementPoint, grid: GridConfiguration): { x: number; y: number } {
    // Isometric grid snapping using diamond pattern
    // Transform coordinates to isometric space
    const size = grid.size;
    const halfSize = size / 2;
    
    // Apply rotation if needed
    const rotatedX = point.x - grid.origin.x - grid.offsetX;
    const rotatedY = point.y - grid.origin.y - grid.offsetY;
    
    // Convert to isometric coordinates (45-degree rotated and scaled)
    const isoX = (rotatedX + rotatedY) / size;
    const isoY = (rotatedY - rotatedX) / size;
    
    // Round to nearest grid intersection
    const roundedIsoX = Math.round(isoX);
    const roundedIsoY = Math.round(isoY);
    
    // Convert back to screen coordinates
    const screenX = (roundedIsoX - roundedIsoY) * halfSize + grid.origin.x + grid.offsetX;
    const screenY = (roundedIsoX + roundedIsoY) * halfSize + grid.origin.y + grid.offsetY;
    
    return { x: screenX, y: screenY };
  }

  private snapToTriangularGrid(point: MeasurementPoint, grid: GridConfiguration): { x: number; y: number } {
    // Triangular grid snapping using equilateral triangle pattern
    const size = grid.size;
    const height = size * Math.sqrt(3) / 2; // Height of equilateral triangle
    
    // Offset from origin
    const offsetX = point.x - grid.origin.x - grid.offsetX;
    const offsetY = point.y - grid.origin.y - grid.offsetY;
    
    // Convert to triangular grid coordinates
    const col = Math.round(offsetX / (size * 0.75)); // 3/4 size for overlapping pattern
    const row = Math.round(offsetY / height);
    
    // Calculate position based on triangular grid
    let snapX: number;
    let snapY: number;
    
    if (row % 2 === 0) {
      // Even rows - standard position
      snapX = col * size * 0.75;
      snapY = row * height;
    } else {
      // Odd rows - offset by half triangle width
      snapX = col * size * 0.75 + size * 0.375;
      snapY = row * height;
    }
    
    // Handle point-up vs point-down triangles
    const triangleIndex = Math.floor(offsetX / (size * 0.5)) + Math.floor(offsetY / (height * 0.5));
    if (triangleIndex % 2 === 1) {
      // Adjust for inverted triangles if needed
      snapY += height * 0.33; // Slight adjustment for triangle centers
    }
    
    return { 
      x: snapX + grid.origin.x + grid.offsetX, 
      y: snapY + grid.origin.y + grid.offsetY 
    };
  }

  private calculatePolygonArea(points: { x: number; y: number }[]): number {
    let area = 0;
    const n = points.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    
    return Math.abs(area) / 2;
  }

  private calculatePolygonPerimeter(points: { x: number; y: number }[]): number {
    let perimeter = 0;
    const n = points.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      perimeter += this.calculateDistance(points[i], points[j]);
    }
    
    return perimeter;
  }

  private insertIntoQuadTree(node: QuadTreeNode, point: MeasurementPoint): void {
    if (!this.pointInBounds(point, node.bounds)) return;

    if (node.points.length < node.maxPoints && !node.children) {
      node.points.push(point);
      return;
    }

    if (!node.children) {
      this.subdivideQuadTree(node);
    }

    node.children!.forEach(child => this.insertIntoQuadTree(child, point));
  }

  private queryQuadTree(node: QuadTreeNode, bounds: { x: number; y: number; width: number; height: number }): MeasurementPoint[] {
    if (!this.boundsIntersect(node.bounds, bounds)) return [];

    let points = [...node.points];
    
    if (node.children) {
      node.children.forEach(child => {
        points = points.concat(this.queryQuadTree(child, bounds));
      });
    }

    return points;
  }

  private subdivideQuadTree(node: QuadTreeNode): void {
    const halfWidth = node.bounds.width / 2;
    const halfHeight = node.bounds.height / 2;

    node.children = [
      // Top-left
      {
        bounds: { x: node.bounds.x, y: node.bounds.y, width: halfWidth, height: halfHeight },
        points: [],
        maxPoints: node.maxPoints,
        depth: node.depth + 1
      },
      // Top-right
      {
        bounds: { x: node.bounds.x + halfWidth, y: node.bounds.y, width: halfWidth, height: halfHeight },
        points: [],
        maxPoints: node.maxPoints,
        depth: node.depth + 1
      },
      // Bottom-left
      {
        bounds: { x: node.bounds.x, y: node.bounds.y + halfHeight, width: halfWidth, height: halfHeight },
        points: [],
        maxPoints: node.maxPoints,
        depth: node.depth + 1
      },
      // Bottom-right
      {
        bounds: { x: node.bounds.x + halfWidth, y: node.bounds.y + halfHeight, width: halfWidth, height: halfHeight },
        points: [],
        maxPoints: node.maxPoints,
        depth: node.depth + 1
      }
    ];

    // Redistribute points
    node.points.forEach(point => {
      node.children!.forEach(child => this.insertIntoQuadTree(child, point));
    });
    node.points = [];
  }

  private pointInBounds(point: { x: number; y: number }, bounds: { x: number; y: number; width: number; height: number }): boolean {
    return point.x >= bounds.x && point.x < bounds.x + bounds.width &&
           point.y >= bounds.y && point.y < bounds.y + bounds.height;
  }

  private boundsIntersect(bounds1: { x: number; y: number; width: number; height: number }, bounds2: { x: number; y: number; width: number; height: number }): boolean {
    return bounds1.x < bounds2.x + bounds2.width &&
           bounds1.x + bounds1.width > bounds2.x &&
           bounds1.y < bounds2.y + bounds2.height &&
           bounds1.y + bounds1.height > bounds2.y;
  }

  private addToHistory(type: 'measurement' | 'shape', item: MeasurementLine | GeometricShape): void {
    if (!this.settings.autoSaveHistory) return;

    // Remove future history if we're not at the end
    if (this.history.currentIndex < this.history.measurements.length + this.history.shapes.length - 1) {
      if (type === 'measurement') {
        this.history.measurements = this.history.measurements.slice(0, this.history.currentIndex + 1);
      } else {
        this.history.shapes = this.history.shapes.slice(0, this.history.currentIndex + 1);
      }
    }

    // Add new item
    if (type === 'measurement') {
      this.history.measurements.push(item as MeasurementLine);
    } else {
      this.history.shapes.push(item as GeometricShape);
    }

    // Limit history size
    const totalItems = this.history.measurements.length + this.history.shapes.length;
    if (totalItems > this.settings.maxHistorySize) {
      if (this.history.measurements.length > 0) {
        this.history.measurements.shift();
      } else {
        this.history.shapes.shift();
      }
    }

    this.history.currentIndex = this.history.measurements.length + this.history.shapes.length - 1;
  }

  private rebuildSpatialIndex(): void {
    this.spatialIndex = this.createSpatialIndex();
    
    // Re-index all points
    this.measurements.forEach(measurement => {
      this.addToSpatialIndex(measurement.start);
      this.addToSpatialIndex(measurement.end);
    });

    this.shapes.forEach(shape => {
      shape.points.forEach(point => this.addToSpatialIndex(point));
    });
  }

  private notifyCallbacks(event: string, data: any): void {
    this.measurementCallbacks.forEach((callback, key) => {
      try {
        callback(event, data);
      } catch (error) {
        console.error(`Error in measurement callback ${key}:`, error);
      }
    });
  }

  // PUBLIC API

  /**
   * Subscribe to measurement events
   */
  subscribe(key: string, callback: (event: string, data: any) => void): void {
    this.measurementCallbacks.set(key, callback);
  }

  /**
   * Unsubscribe from measurement events
   */
  unsubscribe(key: string): void {
    this.measurementCallbacks.delete(key);
  }

  /**
   * Get all measurements
   */
  getMeasurements(): MeasurementLine[] {
    return Array.from(this.measurements.values());
  }

  /**
   * Get all shapes
   */
  getShapes(): GeometricShape[] {
    return Array.from(this.shapes.values());
  }

  /**
   * Get all grids
   */
  getGrids(): GridConfiguration[] {
    return Array.from(this.grids.values());
  }

  /**
   * Get all templates
   */
  getTemplates(): MeasurementTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get current settings
   */
  getSettings(): MeasurementSettings {
    return { ...this.settings };
  }

  /**
   * Update settings
   */
  updateSettings(updates: Partial<MeasurementSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.notifyCallbacks('settingsUpdated', { settings: this.settings });
  }

  /**
   * Get active grid
   */
  getActiveGrid(): GridConfiguration | null {
    return this.activeGrid ? this.grids.get(this.activeGrid) || null : null;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.measurements.clear();
    this.shapes.clear();
    this.templates.clear();
    this.grids.clear();
    this.measurementCallbacks.clear();
    this.activeMeasurement = null;
    this.activeGrid = null;
  }
}

// Create and export singleton instance
export const advancedMeasurementSystem = new AdvancedMeasurementService();
export default advancedMeasurementSystem;