/**
 * Rust Measurement Integration
 * Bridge between TypeScript measurement system and Rust WebGL canvas
 * with performance-optimized rendering and spatial indexing
 */

import {
    advancedMeasurementSystem,
    type GeometricShape,
    type GridConfiguration,
    type MeasurementLine
} from '../services/advancedMeasurement.service';

export interface RustCanvasRenderer {
  // Canvas context methods
  getCanvasContext(): CanvasRenderingContext2D | WebGLRenderingContext | null;
  getCanvasSize(): { width: number; height: number };
  screenToWorld(screenX: number, screenY: number): { x: number; y: number };
  worldToScreen(worldX: number, worldY: number): { x: number; y: number };
  
  // Rendering methods
  renderMeasurement(measurement: MeasurementLine): void;
  renderShape(shape: GeometricShape): void;
  renderGrid(grid: GridConfiguration): void;
  renderMeasurementLine(start: { x: number; y: number }, end: { x: number; y: number }, style: {
    color: string;
    thickness: number;
    style: 'solid' | 'dashed' | 'dotted';
  }): void;
  
  // Event handling
  addEventListener(event: string, handler: (event: any) => void): void;
  removeEventListener(event: string, handler: (event: any) => void): void;
  
  // Performance optimization
  beginBatch(): void;
  endBatch(): void;
  invalidateRegion(x: number, y: number, width: number, height: number): void;
}

/**
 * Measurement Canvas Integration
 * Handles rendering and interaction between measurement system and Rust canvas
 */
export class MeasurementCanvasIntegration {
  private renderer: RustCanvasRenderer;
  private isInitialized = false;
  private measurementSubscriptionKey = 'canvas_integration';
  private animationFrameId: number | null = null;
  private isDirty = false;
  private dirtyRegions: Set<string> = new Set();
  
  // Canvas state
  private canvasScale = 1;
  private activeGrid: GridConfiguration | null = null;
  
  // Rendering caches
  private measurementCache: Map<string, Path2D> = new Map();
  private shapeCache: Map<string, Path2D> = new Map();
  private gridCache: Path2D | null = null;
  
  // Event handlers
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor(renderer: RustCanvasRenderer) {
    this.renderer = renderer;
  }

  /**
   * Initialize the integration system
   */
  initialize(): void {
    if (this.isInitialized) return;

    // Subscribe to measurement system events
    advancedMeasurementSystem.subscribe(this.measurementSubscriptionKey, this.handleMeasurementEvent.bind(this));
    
    // Set up canvas event listeners
    this.setupCanvasEventListeners();
    
    // Initialize active grid
    this.activeGrid = advancedMeasurementSystem.getActiveGrid();
    
    // Start render loop
    this.startRenderLoop();
    
    this.isInitialized = true;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (!this.isInitialized) return;

    // Unsubscribe from measurement system
    advancedMeasurementSystem.unsubscribe(this.measurementSubscriptionKey);
    
    // Stop render loop
    this.stopRenderLoop();
    
    // Clear caches
    this.clearCaches();
    
    // Remove event listeners
    this.removeCanvasEventListeners();
    
    this.isInitialized = false;
  }

  /**
   * Handle measurement system events
   */
  private handleMeasurementEvent(event: string, data: any): void {
    switch (event) {
      case 'measurementStarted':
      case 'measurementUpdated':
      case 'measurementCompleted':
        this.invalidateMeasurement(data.measurement);
        break;
        
      case 'shapeCreated':
        this.invalidateShape(data.shape);
        break;
        
      case 'activeGridChanged':
        this.activeGrid = data.grid;
        this.invalidateGrid();
        break;
        
      case 'gridUpdated':
        if (data.grid.id === this.activeGrid?.id) {
          this.activeGrid = data.grid;
          this.invalidateGrid();
        }
        break;
        
      case 'measurementsCleared':
        this.clearMeasurementCache();
        this.markDirty();
        break;
        
      default:
        break;
    }
  }

  /**
   * Set up canvas event listeners
   */
  private setupCanvasEventListeners(): void {
    const handleMouseMove = (event: MouseEvent) => this.handleCanvasMouseMove(event);
    const handleMouseDown = (event: MouseEvent) => this.handleCanvasMouseDown(event);
    const handleMouseUp = (event: MouseEvent) => this.handleCanvasMouseUp(event);
    const handleWheel = (event: WheelEvent) => this.handleCanvasWheel(event);
    
    this.renderer.addEventListener('mousemove', handleMouseMove);
    this.renderer.addEventListener('mousedown', handleMouseDown);
    this.renderer.addEventListener('mouseup', handleMouseUp);
    this.renderer.addEventListener('wheel', handleWheel);
    
    // Store handlers for cleanup
    this.storeEventHandler('mousemove', handleMouseMove);
    this.storeEventHandler('mousedown', handleMouseDown);
    this.storeEventHandler('mouseup', handleMouseUp);
    this.storeEventHandler('wheel', handleWheel);
  }

  /**
   * Remove canvas event listeners
   */
  private removeCanvasEventListeners(): void {
    for (const [event, handlers] of this.eventHandlers.entries()) {
      handlers.forEach(handler => {
        this.renderer.removeEventListener(event, handler as (event: any) => void);
      });
    }
    this.eventHandlers.clear();
  }

  /**
   * Store event handler for cleanup
   */
  private storeEventHandler(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Handle canvas mouse movement
   */
  private handleCanvasMouseMove(event: MouseEvent): void {
    const canvasRect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const screenX = event.clientX - canvasRect.left;
    const screenY = event.clientY - canvasRect.top;
    const worldPos = this.renderer.screenToWorld(screenX, screenY);
    
    // Update any active measurement
    const measurements = advancedMeasurementSystem.getMeasurements();
    const activeMeasurement = measurements.find(m => !m.distance || m.distance === 0);
    
    if (activeMeasurement) {
      advancedMeasurementSystem.updateMeasurement(activeMeasurement.id, worldPos);
    }
    
    // Emit mouse move event for external handlers
    this.emit('mousemove', { screenX, screenY, worldX: worldPos.x, worldY: worldPos.y });
  }

  /**
   * Handle canvas mouse down
   */
  private handleCanvasMouseDown(event: MouseEvent): void {
    const canvasRect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const screenX = event.clientX - canvasRect.left;
    const screenY = event.clientY - canvasRect.top;
    const worldPos = this.renderer.screenToWorld(screenX, screenY);
    
    this.emit('mousedown', { 
      screenX, 
      screenY, 
      worldX: worldPos.x, 
      worldY: worldPos.y,
      button: event.button 
    });
  }

  /**
   * Handle canvas mouse up
   */
  private handleCanvasMouseUp(event: MouseEvent): void {
    const canvasRect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const screenX = event.clientX - canvasRect.left;
    const screenY = event.clientY - canvasRect.top;
    const worldPos = this.renderer.screenToWorld(screenX, screenY);
    
    this.emit('mouseup', { 
      screenX, 
      screenY, 
      worldX: worldPos.x, 
      worldY: worldPos.y,
      button: event.button 
    });
  }

  /**
   * Handle canvas wheel (zoom)
   */
  private handleCanvasWheel(event: WheelEvent): void {
    event.preventDefault();
    
    const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const oldScale = this.canvasScale;
    this.canvasScale *= scaleFactor;
    
    // Invalidate grid if scale changed significantly
    if (Math.abs(this.canvasScale - oldScale) > 0.1) {
      this.invalidateGrid();
    }
    
    this.emit('zoom', { scale: this.canvasScale, delta: event.deltaY });
  }

  /**
   * Start the render loop
   */
  private startRenderLoop(): void {
    const render = () => {
      if (this.isDirty) {
        this.renderMeasurements();
        this.isDirty = false;
        this.dirtyRegions.clear();
      }
      
      if (this.isInitialized) {
        this.animationFrameId = requestAnimationFrame(render);
      }
    };
    
    this.animationFrameId = requestAnimationFrame(render);
  }

  /**
   * Stop the render loop
   */
  private stopRenderLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Render all measurements, shapes, and grids
   */
  private renderMeasurements(): void {
    this.renderer.beginBatch();
    
    try {
      // Render grid first (background)
      if (this.activeGrid && this.activeGrid.visible) {
        this.renderGrid();
      }
      
      // Render completed measurements
      const measurements = advancedMeasurementSystem.getMeasurements();
      measurements.forEach(measurement => {
        if (measurement.distance > 0) {
          this.renderMeasurement(measurement);
        }
      });
      
      // Render shapes
      const shapes = advancedMeasurementSystem.getShapes();
      shapes.forEach(shape => {
        this.renderShape(shape);
      });
      
      // Render active measurement (if any)
      const activeMeasurement = measurements.find(m => !m.distance || m.distance === 0);
      if (activeMeasurement) {
        this.renderActiveMeasurement(activeMeasurement);
      }
      
    } finally {
      this.renderer.endBatch();
    }
  }

  /**
   * Render a single measurement line
   */
  private renderMeasurement(measurement: MeasurementLine): void {
    // Check cache first
    let path = this.measurementCache.get(measurement.id);
    if (!path) {
      path = this.createMeasurementPath(measurement);
      this.measurementCache.set(measurement.id, path);
    }
    
    this.renderer.renderMeasurement(measurement);
  }

  /**
   * Render an active (in-progress) measurement
   */
  private renderActiveMeasurement(measurement: MeasurementLine): void {
    // Active measurements are not cached as they change frequently
    this.renderer.renderMeasurementLine(
      measurement.start,
      measurement.end,
      {
        color: measurement.color + '80', // Add transparency
        thickness: measurement.thickness,
        style: 'dashed'
      }
    );
    
    // Show distance label
    const midpoint = {
      x: (measurement.start.x + measurement.end.x) / 2,
      y: (measurement.start.y + measurement.end.y) / 2
    };
    
    this.renderDistanceLabel(midpoint, measurement.distance, measurement.gridDistance);
  }

  /**
   * Render a geometric shape
   */
  private renderShape(shape: GeometricShape): void {
    // Check cache first
    let path = this.shapeCache.get(shape.id);
    if (!path) {
      path = this.createShapePath(shape);
      this.shapeCache.set(shape.id, path);
    }
    
    this.renderer.renderShape(shape);
  }

  /**
   * Render the active grid
   */
  private renderGrid(): void {
    if (!this.activeGrid) return;
    
    // Check cache first
    if (!this.gridCache) {
      this.gridCache = this.createGridPath(this.activeGrid);
    }
    
    this.renderer.renderGrid(this.activeGrid);
  }

  /**
   * Render distance label
   */
  private renderDistanceLabel(position: { x: number; y: number }, distance: number, gridDistance?: number): void {
    const ctx = this.renderer.getCanvasContext() as CanvasRenderingContext2D;
    if (!ctx) return;
    
    const screenPos = this.renderer.worldToScreen(position.x, position.y);
    const distanceText = advancedMeasurementSystem.formatDistance(distance);
    
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw background
    const textMetrics = ctx.measureText(distanceText);
    const padding = 4;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(
      screenPos.x - textMetrics.width / 2 - padding,
      screenPos.y - 8 - padding,
      textMetrics.width + padding * 2,
      16 + padding * 2
    );
    
    // Draw text
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(distanceText, screenPos.x, screenPos.y);
    ctx.fillText(distanceText, screenPos.x, screenPos.y);
    
    // Draw grid distance if different
    if (gridDistance && Math.abs(gridDistance - distance) > 0.1) {
      const gridText = `(${advancedMeasurementSystem.formatDistance(gridDistance)} grid)`;
      ctx.font = '10px Arial';
      ctx.fillStyle = '#cccccc';
      ctx.fillText(gridText, screenPos.x, screenPos.y + 15);
    }
    
    ctx.restore();
  }

  /**
   * Create a Path2D for a measurement line
   */
  private createMeasurementPath(measurement: MeasurementLine): Path2D {
    const path = new Path2D();
    const startScreen = this.renderer.worldToScreen(measurement.start.x, measurement.start.y);
    const endScreen = this.renderer.worldToScreen(measurement.end.x, measurement.end.y);
    
    path.moveTo(startScreen.x, startScreen.y);
    path.lineTo(endScreen.x, endScreen.y);
    
    return path;
  }

  /**
   * Create a Path2D for a geometric shape
   */
  private createShapePath(shape: GeometricShape): Path2D {
    const path = new Path2D();
    
    if (shape.points.length === 0) return path;
    
    const firstPoint = this.renderer.worldToScreen(shape.points[0].x, shape.points[0].y);
    path.moveTo(firstPoint.x, firstPoint.y);
    
    for (let i = 1; i < shape.points.length; i++) {
      const point = this.renderer.worldToScreen(shape.points[i].x, shape.points[i].y);
      path.lineTo(point.x, point.y);
    }
    
    // Close path for filled shapes
    if (shape.filled || shape.type === 'circle' || shape.type === 'rectangle') {
      path.closePath();
    }
    
    return path;
  }

  /**
   * Create a Path2D for grid lines
   */
  private createGridPath(grid: GridConfiguration): Path2D {
    const path = new Path2D();
    const canvasSize = this.renderer.getCanvasSize();
    
    if (grid.type === 'square') {
      // Vertical lines
      for (let x = grid.origin.x; x < canvasSize.width; x += grid.size) {
        path.moveTo(x, 0);
        path.lineTo(x, canvasSize.height);
      }
      for (let x = grid.origin.x - grid.size; x > -grid.size; x -= grid.size) {
        path.moveTo(x, 0);
        path.lineTo(x, canvasSize.height);
      }
      
      // Horizontal lines
      for (let y = grid.origin.y; y < canvasSize.height; y += grid.size) {
        path.moveTo(0, y);
        path.lineTo(canvasSize.width, y);
      }
      for (let y = grid.origin.y - grid.size; y > -grid.size; y -= grid.size) {
        path.moveTo(0, y);
        path.lineTo(canvasSize.width, y);
      }
    }
    
    // Additional grid types implementation
    if (grid.type === 'hex') {
      this.createHexGridPath(path, grid as any, canvasSize);
    } else if (grid.type === 'isometric') {
      this.createIsometricGridPath(path, grid, canvasSize);
    } else if (grid.type === 'triangular') {
      this.createTriangularGridPath(path, grid, canvasSize);
    }
    
    return path;
  }

  private createHexGridPath(path: Path2D, grid: any, canvasSize: { width: number; height: number }): void {
    const hexRadius = grid.hexRadius || grid.size;
    const width = hexRadius * 1.5;
    const height = hexRadius * Math.sqrt(3);
    
    // Calculate grid bounds
    const startX = Math.floor((0 - grid.origin.x) / width) * width + grid.origin.x;
    const endX = Math.ceil((canvasSize.width - grid.origin.x) / width) * width + grid.origin.x;
    const startY = Math.floor((0 - grid.origin.y) / height) * height + grid.origin.y;
    const endY = Math.ceil((canvasSize.height - grid.origin.y) / height) * height + grid.origin.y;
    
    // Draw hexagonal grid
    for (let x = startX; x <= endX; x += width) {
      for (let y = startY; y <= endY; y += height) {
        // Offset every other row
        const offsetX = (Math.floor((y - grid.origin.y) / height) % 2) * (width / 2);
        const centerX = x + offsetX;
        const centerY = y;
        
        // Draw hexagon
        this.drawHexagon(path, centerX, centerY, hexRadius);
      }
    }
  }

  private drawHexagon(path: Path2D, centerX: number, centerY: number, radius: number): void {
    const angles = [0, 60, 120, 180, 240, 300].map(deg => deg * Math.PI / 180);
    
    angles.forEach((angle, index) => {
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      if (index === 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    });
    path.closePath();
  }

  private createIsometricGridPath(path: Path2D, grid: GridConfiguration, canvasSize: { width: number; height: number }): void {
    const size = grid.size;
    const halfSize = size / 2;
    
    // Calculate bounds for diamond pattern
    const maxDim = Math.max(canvasSize.width, canvasSize.height);
    const gridRange = Math.ceil(maxDim / halfSize) + 2;
    
    // Draw diagonal lines going from top-left to bottom-right
    for (let i = -gridRange; i <= gridRange; i++) {
      const startX = grid.origin.x + i * halfSize;
      const startY = grid.origin.y - maxDim;
      const endX = startX + maxDim;
      const endY = grid.origin.y + maxDim;
      
      path.moveTo(startX, startY);
      path.lineTo(endX, endY);
    }
    
    // Draw diagonal lines going from top-right to bottom-left
    for (let i = -gridRange; i <= gridRange; i++) {
      const startX = grid.origin.x + i * halfSize;
      const startY = grid.origin.y + maxDim;
      const endX = startX + maxDim;
      const endY = grid.origin.y - maxDim;
      
      path.moveTo(startX, startY);
      path.lineTo(endX, endY);
    }
  }

  private createTriangularGridPath(path: Path2D, grid: GridConfiguration, canvasSize: { width: number; height: number }): void {
    const size = grid.size;
    const height = size * Math.sqrt(3) / 2;
    const rowWidth = size * 0.75;
    
    // Calculate grid bounds
    const maxCols = Math.ceil(canvasSize.width / rowWidth) + 2;
    const maxRows = Math.ceil(canvasSize.height / height) + 2;
    
    // Draw triangular grid pattern
    for (let row = -2; row <= maxRows; row++) {
      const y = grid.origin.y + row * height;
      const offsetX = (row % 2) * (size * 0.375);
      
      for (let col = -2; col <= maxCols; col++) {
        const x = grid.origin.x + col * rowWidth + offsetX;
        
        // Draw upward pointing triangle
        this.drawTriangle(path, x, y, size, true);
        
        // Draw downward pointing triangle (offset pattern)
        if (col < maxCols) {
          this.drawTriangle(path, x + size * 0.375, y + height / 3, size, false);
        }
      }
    }
  }

  private drawTriangle(path: Path2D, x: number, y: number, size: number, pointUp: boolean): void {
    const height = size * Math.sqrt(3) / 2;
    const halfSize = size / 2;
    
    if (pointUp) {
      // Point up triangle
      path.moveTo(x, y - height / 3 * 2);  // Top point
      path.lineTo(x - halfSize, y + height / 3);  // Bottom left
      path.lineTo(x + halfSize, y + height / 3);  // Bottom right
    } else {
      // Point down triangle
      path.moveTo(x, y + height / 3 * 2);  // Bottom point
      path.lineTo(x - halfSize, y - height / 3);  // Top left
      path.lineTo(x + halfSize, y - height / 3);  // Top right
    }
    path.closePath();
  }

  /**
   * Mark the canvas as dirty for re-rendering
   */
  private markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Invalidate a specific measurement
   */
  private invalidateMeasurement(measurement: MeasurementLine): void {
    this.measurementCache.delete(measurement.id);
    this.markDirty();
  }

  /**
   * Invalidate a specific shape
   */
  private invalidateShape(shape: GeometricShape): void {
    this.shapeCache.delete(shape.id);
    this.markDirty();
  }

  /**
   * Invalidate the grid
   */
  private invalidateGrid(): void {
    this.gridCache = null;
    this.markDirty();
  }

  /**
   * Clear all caches
   */
  private clearCaches(): void {
    this.measurementCache.clear();
    this.shapeCache.clear();
    this.gridCache = null;
  }

  /**
   * Clear measurement cache only
   */
  private clearMeasurementCache(): void {
    this.measurementCache.clear();
  }

  /**
   * Event emitter functionality
   */
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in measurement canvas event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Add event listener
   */
  addEventListener(event: string, handler: Function): void {
    this.storeEventHandler(event, handler);
  }

  /**
   * Remove event listener
   */
  removeEventListener(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get canvas bounds in world coordinates
   */
  getWorldBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const canvasSize = this.renderer.getCanvasSize();
    const topLeft = this.renderer.screenToWorld(0, 0);
    const bottomRight = this.renderer.screenToWorld(canvasSize.width, canvasSize.height);
    
    return {
      minX: topLeft.x,
      minY: topLeft.y,
      maxX: bottomRight.x,
      maxY: bottomRight.y
    };
  }

  /**
   * Check if integration is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Force a full re-render
   */
  forceRender(): void {
    this.clearCaches();
    this.markDirty();
  }
}

export default MeasurementCanvasIntegration;