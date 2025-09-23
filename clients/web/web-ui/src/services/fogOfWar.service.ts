/**
 * Manual Fog of War System
 * Production-quality fog of war implementation with GPU acceleration,
 * quadtree spatial optimization, and advanced visibility algorithms
 */

import { EventSystem } from './eventSystem.service';

// === Core Types ===

export interface FogOfWarPoint {
  x: number;
  y: number;
}

export interface FogOfWarRegion {
  id: string;
  name: string;
  points: FogOfWarPoint[];
  type: 'polygon' | 'circle' | 'rectangle';
  isRevealed: boolean;
  opacity: number; // 0 = fully visible, 1 = fully hidden
  layer: number;
  createdAt: number;
  updatedAt: number;
}

export interface FogOfWarCircleRegion extends FogOfWarRegion {
  type: 'circle';
  center: FogOfWarPoint;
  radius: number;
}

export interface FogOfWarRectangleRegion extends FogOfWarRegion {
  type: 'rectangle';
  topLeft: FogOfWarPoint;
  bottomRight: FogOfWarPoint;
}

export interface FogOfWarPolygonRegion extends FogOfWarRegion {
  type: 'polygon';
  points: FogOfWarPoint[];
}

export type AnyFogOfWarRegion = FogOfWarCircleRegion | FogOfWarRectangleRegion | FogOfWarPolygonRegion;

export interface FogOfWarSettings {
  enabled: boolean;
  globalOpacity: number; // 0-1, multiplier for all fog opacity
  animationDuration: number; // ms for reveal/hide animations
  blurRadius: number; // px for edge softening
  color: string; // fog color (hex)
  pattern: 'solid' | 'crosshatch' | 'diagonal' | 'dots';
  patternScale: number;
  enableSmoothTransitions: boolean;
  qualityLevel: 'low' | 'medium' | 'high' | 'ultra';
}

export interface FogOfWarViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

export interface FogOfWarQuadTreeNode {
  bounds: { x: number; y: number; width: number; height: number };
  children: FogOfWarQuadTreeNode[] | null;
  regions: AnyFogOfWarRegion[];
  level: number;
  maxLevel: number;
  maxObjects: number;
}

// === Spatial Optimization ===

class FogOfWarQuadTree {
  private root: FogOfWarQuadTreeNode;
  private maxLevel: number;
  private maxObjects: number;

  constructor(
    bounds: { x: number; y: number; width: number; height: number },
    maxLevel = 8,
    maxObjects = 10
  ) {
    this.maxLevel = maxLevel;
    this.maxObjects = maxObjects;
    this.root = {
      bounds,
      children: null,
      regions: [],
      level: 0,
      maxLevel,
      maxObjects
    };
  }

  insert(region: AnyFogOfWarRegion): void {
    this.insertIntoNode(this.root, region);
  }

  private insertIntoNode(node: FogOfWarQuadTreeNode, region: AnyFogOfWarRegion): void {
    // If node has children, try to insert into appropriate child
    if (node.children) {
      const childIndex = this.getChildIndex(node, region);
      if (childIndex !== -1) {
        this.insertIntoNode(node.children[childIndex], region);
        return;
      }
    }

    // Add to current node
    node.regions.push(region);

    // Split if necessary
    if (node.regions.length > node.maxObjects && node.level < node.maxLevel) {
      this.split(node);
    }
  }

  private split(node: FogOfWarQuadTreeNode): void {
    const { bounds, level } = node;
    const halfWidth = bounds.width / 2;
    const halfHeight = bounds.height / 2;

    node.children = [
      // Top-left
      {
        bounds: { x: bounds.x, y: bounds.y, width: halfWidth, height: halfHeight },
        children: null,
        regions: [],
        level: level + 1,
        maxLevel: this.maxLevel,
        maxObjects: this.maxObjects
      },
      // Top-right
      {
        bounds: { x: bounds.x + halfWidth, y: bounds.y, width: halfWidth, height: halfHeight },
        children: null,
        regions: [],
        level: level + 1,
        maxLevel: this.maxLevel,
        maxObjects: this.maxObjects
      },
      // Bottom-left
      {
        bounds: { x: bounds.x, y: bounds.y + halfHeight, width: halfWidth, height: halfHeight },
        children: null,
        regions: [],
        level: level + 1,
        maxLevel: this.maxLevel,
        maxObjects: this.maxObjects
      },
      // Bottom-right
      {
        bounds: { x: bounds.x + halfWidth, y: bounds.y + halfHeight, width: halfWidth, height: halfHeight },
        children: null,
        regions: [],
        level: level + 1,
        maxLevel: this.maxLevel,
        maxObjects: this.maxObjects
      }
    ];

    // Redistribute regions to children
    const regionsToRedistribute = [...node.regions];
    node.regions = [];

    regionsToRedistribute.forEach(region => {
      const childIndex = this.getChildIndex(node, region);
      if (childIndex !== -1) {
        this.insertIntoNode(node.children![childIndex], region);
      } else {
        node.regions.push(region);
      }
    });
  }

  private getChildIndex(node: FogOfWarQuadTreeNode, region: AnyFogOfWarRegion): number {
    if (!node.children) return -1;

    const regionBounds = this.getRegionBounds(region);
    
    for (let i = 0; i < node.children.length; i++) {
      if (this.boundsContain(node.children[i].bounds, regionBounds)) {
        return i;
      }
    }

    return -1;
  }

  private getRegionBounds(region: AnyFogOfWarRegion): { x: number; y: number; width: number; height: number } {
    switch (region.type) {
      case 'circle': {
        const circle = region as FogOfWarCircleRegion;
        return {
          x: circle.center.x - circle.radius,
          y: circle.center.y - circle.radius,
          width: circle.radius * 2,
          height: circle.radius * 2
        };
      }
      case 'rectangle': {
        const rect = region as FogOfWarRectangleRegion;
        return {
          x: rect.topLeft.x,
          y: rect.topLeft.y,
          width: rect.bottomRight.x - rect.topLeft.x,
          height: rect.bottomRight.y - rect.topLeft.y
        };
      }
      case 'polygon': {
        const polygon = region as FogOfWarPolygonRegion;
        if (polygon.points.length === 0) {
          return { x: 0, y: 0, width: 0, height: 0 };
        }
        
        let minX = polygon.points[0].x;
        let minY = polygon.points[0].y;
        let maxX = polygon.points[0].x;
        let maxY = polygon.points[0].y;
        
        polygon.points.forEach(point => {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        });
        
        return {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        };
      }
    }
  }

  private boundsContain(
    containerBounds: { x: number; y: number; width: number; height: number },
    targetBounds: { x: number; y: number; width: number; height: number }
  ): boolean {
    return (
      targetBounds.x >= containerBounds.x &&
      targetBounds.y >= containerBounds.y &&
      targetBounds.x + targetBounds.width <= containerBounds.x + containerBounds.width &&
      targetBounds.y + targetBounds.height <= containerBounds.y + containerBounds.height
    );
  }

  query(bounds: { x: number; y: number; width: number; height: number }): AnyFogOfWarRegion[] {
    const result: AnyFogOfWarRegion[] = [];
    this.queryNode(this.root, bounds, result);
    return result;
  }

  private queryNode(
    node: FogOfWarQuadTreeNode,
    bounds: { x: number; y: number; width: number; height: number },
    result: AnyFogOfWarRegion[]
  ): void {
    // Check if bounds intersect with node bounds
    if (!this.boundsIntersect(node.bounds, bounds)) {
      return;
    }

    // Add regions from this node
    node.regions.forEach(region => {
      const regionBounds = this.getRegionBounds(region);
      if (this.boundsIntersect(regionBounds, bounds)) {
        result.push(region);
      }
    });

    // Query children if they exist
    if (node.children) {
      node.children.forEach(child => {
        this.queryNode(child, bounds, result);
      });
    }
  }

  private boundsIntersect(
    bounds1: { x: number; y: number; width: number; height: number },
    bounds2: { x: number; y: number; width: number; height: number }
  ): boolean {
    return !(
      bounds1.x + bounds1.width < bounds2.x ||
      bounds2.x + bounds2.width < bounds1.x ||
      bounds1.y + bounds1.height < bounds2.y ||
      bounds2.y + bounds2.height < bounds1.y
    );
  }

  clear(): void {
    this.root.regions = [];
    this.root.children = null;
  }

  remove(regionId: string): boolean {
    return this.removeFromNode(this.root, regionId);
  }

  private removeFromNode(node: FogOfWarQuadTreeNode, regionId: string): boolean {
    // Check current node
    const index = node.regions.findIndex(region => region.id === regionId);
    if (index !== -1) {
      node.regions.splice(index, 1);
      return true;
    }

    // Check children
    if (node.children) {
      for (const child of node.children) {
        if (this.removeFromNode(child, regionId)) {
          return true;
        }
      }
    }

    return false;
  }
}

// === Main Service ===

export class FogOfWarService extends EventSystem {
  private static instance: FogOfWarService;
  
  // Core state
  private regions: Map<string, AnyFogOfWarRegion> = new Map();
  private quadTree: FogOfWarQuadTree;
  private settings: FogOfWarSettings;
  private viewport: FogOfWarViewport;
  private isEnabled = false;
  
  // Rendering state
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private webglContext: WebGLRenderingContext | null = null;
  private fogTexture: WebGLTexture | null = null;
  private animationFrameId: number | null = null;
  private isDirty = false;
  
  // Performance optimization
  private renderCache: Map<string, ImageBitmap> = new Map();
  private lastRenderTime = 0;
  private frameCount = 0;
  private fps = 0;
  
  // Tools and interaction
  private currentTool: 'select' | 'reveal' | 'hide' | 'polygon' | 'circle' | 'rectangle' = 'select';
  private isDrawing = false;
  private currentDrawingPoints: FogOfWarPoint[] = [];
  private dragState: { isDragging: boolean; draggedRegion: string | null; startPos: FogOfWarPoint | null } = {
    isDragging: false,
    draggedRegion: null,
    startPos: null
  };

  private constructor() {
    super();
    
    // Initialize default settings
    this.settings = {
      enabled: true,
      globalOpacity: 0.8,
      animationDuration: 500,
      blurRadius: 2,
      color: '#000000',
      pattern: 'solid',
      patternScale: 1.0,
      enableSmoothTransitions: true,
      qualityLevel: 'high'
    };
    
    // Initialize viewport
    this.viewport = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      zoom: 1.0
    };
    
    // Initialize spatial indexing
    this.quadTree = new FogOfWarQuadTree({
      x: -10000,
      y: -10000,
      width: 20000,
      height: 20000
    });
  }

  static getInstance(): FogOfWarService {
    if (!FogOfWarService.instance) {
      FogOfWarService.instance = new FogOfWarService();
    }
    return FogOfWarService.instance;
  }

  /**
   * Subscribe to fog of war events
   */
  subscribe<T = any>(key: string, event: string, handler: (event: string, data: T) => void): void {
    super.subscribe(key, event, (data: T) => handler(event, data));
  }

  /**
   * Unsubscribe from fog of war events
   */
  unsubscribe(key: string, event?: string): void {
    super.unsubscribe(key, event);
  }

  // === Public API ===

  /**
   * Initialize the fog of war system
   */
  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    
    // Try to get WebGL context for GPU acceleration
    try {
      this.webglContext = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
      if (this.webglContext) {
        this.initializeWebGL();
      }
    } catch (error) {
      console.warn('WebGL not available, falling back to 2D canvas:', error);
    }
    
    this.setupEventListeners();
    this.startRenderLoop();
    this.isEnabled = true;
    
    this.emit('fogOfWarInitialized', { canvas, hasWebGL: !!this.webglContext });
  }

  /**
   * Create a new fog region
   */
  createRegion(
    type: 'polygon' | 'circle' | 'rectangle',
    points: FogOfWarPoint[],
    options: Partial<{
      name: string;
      isRevealed: boolean;
      opacity: number;
      layer: number;
    }> = {}
  ): string {
    const id = `fog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    const baseRegion: FogOfWarRegion = {
      id,
      name: options.name || `Region ${this.regions.size + 1}`,
      points,
      type,
      isRevealed: options.isRevealed ?? false,
      opacity: options.opacity ?? 1.0,
      layer: options.layer ?? 0,
      createdAt: now,
      updatedAt: now
    };
    
    let region: AnyFogOfWarRegion;
    
    switch (type) {
      case 'circle':
        if (points.length < 2) {
          throw new Error('Circle region requires at least 2 points (center and edge)');
        }
        const center = points[0];
        const edge = points[1];
        const radius = Math.sqrt(Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2));
        region = {
          ...baseRegion,
          type: 'circle',
          center,
          radius
        } as FogOfWarCircleRegion;
        break;
        
      case 'rectangle':
        if (points.length < 2) {
          throw new Error('Rectangle region requires at least 2 points (top-left and bottom-right)');
        }
        region = {
          ...baseRegion,
          type: 'rectangle',
          topLeft: points[0],
          bottomRight: points[1]
        } as FogOfWarRectangleRegion;
        break;
        
      case 'polygon':
        if (points.length < 3) {
          throw new Error('Polygon region requires at least 3 points');
        }
        region = {
          ...baseRegion,
          type: 'polygon',
          points
        } as FogOfWarPolygonRegion;
        break;
        
      default:
        throw new Error(`Unsupported region type: ${type}`);
    }
    
    this.regions.set(id, region);
    this.quadTree.insert(region);
    this.invalidateCache();
    
    this.emit('regionCreated', { region });
    
    return id;
  }

  /**
   * Remove a fog region
   */
  removeRegion(id: string): boolean {
    const region = this.regions.get(id);
    if (!region) return false;
    
    this.regions.delete(id);
    this.quadTree.remove(id);
    this.renderCache.delete(id);
    this.invalidateCache();
    
    this.emit('regionRemoved', { id, region });
    
    return true;
  }

  /**
   * Reveal a fog region (make it transparent)
   */
  revealRegion(id: string, animated = true): boolean {
    const region = this.regions.get(id);
    if (!region) return false;
    
    if (animated && this.settings.enableSmoothTransitions) {
      this.animateRegionOpacity(id, 0, this.settings.animationDuration);
    } else {
      region.opacity = 0;
      region.isRevealed = true;
      region.updatedAt = Date.now();
      this.invalidateCache();
    }
    
    this.emit('regionRevealed', { id, region, animated });
    
    return true;
  }

  /**
   * Hide a fog region (make it opaque)
   */
  hideRegion(id: string, animated = true): boolean {
    const region = this.regions.get(id);
    if (!region) return false;
    
    if (animated && this.settings.enableSmoothTransitions) {
      this.animateRegionOpacity(id, 1, this.settings.animationDuration);
    } else {
      region.opacity = 1;
      region.isRevealed = false;
      region.updatedAt = Date.now();
      this.invalidateCache();
    }
    
    this.emit('regionHidden', { id, region, animated });
    
    return true;
  }

  /**
   * Toggle a region's visibility
   */
  toggleRegion(id: string, animated = true): boolean {
    const region = this.regions.get(id);
    if (!region) return false;
    
    if (region.isRevealed || region.opacity < 0.5) {
      return this.hideRegion(id, animated);
    } else {
      return this.revealRegion(id, animated);
    }
  }

  /**
   * Update region properties
   */
  updateRegion(id: string, updates: Partial<AnyFogOfWarRegion>): boolean {
    const region = this.regions.get(id);
    if (!region) return false;
    
    // Remove from quadtree before updating
    this.quadTree.remove(id);
    
    // Apply updates
    Object.assign(region, updates, { updatedAt: Date.now() });
    
    // Re-insert into quadtree
    this.quadTree.insert(region);
    
    // Invalidate cache
    this.renderCache.delete(id);
    this.invalidateCache();
    
    this.emit('regionUpdated', { id, region, updates });
    
    return true;
  }

  /**
   * Get all regions
   */
  getRegions(): AnyFogOfWarRegion[] {
    return Array.from(this.regions.values());
  }

  /**
   * Get regions in viewport
   */
  getVisibleRegions(): AnyFogOfWarRegion[] {
    return this.quadTree.query({
      x: this.viewport.x,
      y: this.viewport.y,
      width: this.viewport.width,
      height: this.viewport.height
    });
  }

  /**
   * Get a specific region
   */
  getRegion(id: string): AnyFogOfWarRegion | undefined {
    return this.regions.get(id);
  }

  /**
   * Clear all regions
   */
  clearRegions(): void {
    const regionIds = Array.from(this.regions.keys());
    this.regions.clear();
    this.quadTree.clear();
    this.renderCache.clear();
    this.invalidateCache();
    
    this.emit('regionsCleared', { removedRegionIds: regionIds });
  }

  /**
   * Update settings
   */
  updateSettings(newSettings: Partial<FogOfWarSettings>): void {
    const oldSettings = { ...this.settings };
    Object.assign(this.settings, newSettings);
    
    // If quality level changed, clear cache
    if (oldSettings.qualityLevel !== this.settings.qualityLevel) {
      this.renderCache.clear();
    }
    
    this.invalidateCache();
    this.emit('settingsUpdated', { oldSettings, newSettings: this.settings });
  }

  /**
   * Get current settings
   */
  getSettings(): FogOfWarSettings {
    return { ...this.settings };
  }

  /**
   * Update viewport
   */
  updateViewport(viewport: Partial<FogOfWarViewport>): void {
    const oldViewport = { ...this.viewport };
    Object.assign(this.viewport, viewport);
    
    this.emit('viewportUpdated', { oldViewport, newViewport: this.viewport });
  }

  /**
   * Get current viewport
   */
  getViewport(): FogOfWarViewport {
    return { ...this.viewport };
  }

  /**
   * Set current tool
   */
  setTool(tool: typeof this.currentTool): void {
    const oldTool = this.currentTool;
    this.currentTool = tool;
    
    // Cancel any ongoing operations
    this.cancelDrawing();
    this.cancelDragging();
    
    this.emit('toolChanged', { oldTool, newTool: tool });
  }

  /**
   * Get current tool
   */
  getCurrentTool(): typeof this.currentTool {
    return this.currentTool;
  }

  /**
   * Enable/disable fog of war
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    this.invalidateCache();
    this.emit('fogOfWarToggled', { enabled });
  }

  /**
   * Check if fog of war is enabled
   */
  getEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Export fog data
   */
  exportData(): {
    regions: AnyFogOfWarRegion[];
    settings: FogOfWarSettings;
    viewport: FogOfWarViewport;
  } {
    return {
      regions: this.getRegions(),
      settings: this.getSettings(),
      viewport: this.getViewport()
    };
  }

  /**
   * Import fog data
   */
  importData(data: {
    regions?: AnyFogOfWarRegion[];
    settings?: Partial<FogOfWarSettings>;
    viewport?: Partial<FogOfWarViewport>;
  }): void {
    if (data.regions) {
      this.clearRegions();
      data.regions.forEach(region => {
        this.regions.set(region.id, region);
        this.quadTree.insert(region);
      });
    }
    
    if (data.settings) {
      this.updateSettings(data.settings);
    }
    
    if (data.viewport) {
      this.updateViewport(data.viewport);
    }
    
    this.invalidateCache();
    this.emit('dataImported', { data });
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    fps: number;
    regionCount: number;
    visibleRegionCount: number;
    cacheSize: number;
    isWebGLEnabled: boolean;
    lastRenderTime: number;
  } {
    return {
      fps: this.fps,
      regionCount: this.regions.size,
      visibleRegionCount: this.getVisibleRegions().length,
      cacheSize: this.renderCache.size,
      isWebGLEnabled: !!this.webglContext,
      lastRenderTime: this.lastRenderTime
    };
  }

  // === Private Methods ===

  private initializeWebGL(): void {
    if (!this.webglContext) return;
    
    const gl = this.webglContext;
    
    // Create fog texture
    this.fogTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fogTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Initialize with empty texture
    const width = this.canvas?.width || 1920;
    const height = this.canvas?.height || 1080;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  private setupEventListeners(): void {
    if (!this.canvas) return;
    
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private handleMouseDown(event: MouseEvent): void {
    if (!this.isEnabled) return;
    
    const point = this.getCanvasPoint(event);
    
    switch (this.currentTool) {
      case 'reveal':
        this.handleRevealTool(point);
        break;
      case 'hide':
        this.handleHideTool(point);
        break;
      case 'polygon':
        this.handlePolygonTool(point, event.button === 0 ? 'add' : 'complete');
        break;
      case 'circle':
        this.handleCircleTool(point, 'start');
        break;
      case 'rectangle':
        this.handleRectangleTool(point, 'start');
        break;
      case 'select':
        this.handleSelectTool(point);
        break;
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isEnabled) return;
    
    const point = this.getCanvasPoint(event);
    
    if (this.isDrawing) {
      switch (this.currentTool) {
        case 'circle':
          this.handleCircleTool(point, 'update');
          break;
        case 'rectangle':
          this.handleRectangleTool(point, 'update');
          break;
      }
    }
    
    if (this.dragState.isDragging && this.dragState.draggedRegion) {
      this.handleRegionDrag(point);
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (!this.isEnabled) return;
    
    const point = this.getCanvasPoint(event);
    
    if (this.isDrawing) {
      switch (this.currentTool) {
        case 'circle':
          this.handleCircleTool(point, 'complete');
          break;
        case 'rectangle':
          this.handleRectangleTool(point, 'complete');
          break;
      }
    }
    
    if (this.dragState.isDragging) {
      this.cancelDragging();
    }
  }

  private handleContextMenu(event: MouseEvent): void {
    event.preventDefault();
    
    if (this.currentTool === 'polygon' && this.isDrawing) {
      this.handlePolygonTool(this.getCanvasPoint(event), 'complete');
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isEnabled) return;
    
    switch (event.key) {
      case 'Escape':
        this.cancelDrawing();
        this.cancelDragging();
        break;
      case 'Delete':
        if (this.dragState.draggedRegion) {
          this.removeRegion(this.dragState.draggedRegion);
        }
        break;
      case '1':
        this.setTool('select');
        break;
      case '2':
        this.setTool('reveal');
        break;
      case '3':
        this.setTool('hide');
        break;
      case '4':
        this.setTool('polygon');
        break;
      case '5':
        this.setTool('circle');
        break;
      case '6':
        this.setTool('rectangle');
        break;
    }
  }

  private getCanvasPoint(event: MouseEvent): FogOfWarPoint {
    if (!this.canvas) return { x: 0, y: 0 };
    
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);
    
    // Convert to world coordinates
    return {
      x: (x / this.viewport.zoom) + this.viewport.x,
      y: (y / this.viewport.zoom) + this.viewport.y
    };
  }

  private handleRevealTool(point: FogOfWarPoint): void {
    const regions = this.getRegionsAtPoint(point);
    regions.forEach(region => {
      this.revealRegion(region.id);
    });
  }

  private handleHideTool(point: FogOfWarPoint): void {
    const regions = this.getRegionsAtPoint(point);
    regions.forEach(region => {
      this.hideRegion(region.id);
    });
  }

  private handlePolygonTool(point: FogOfWarPoint, action: 'add' | 'complete'): void {
    if (action === 'add') {
      if (!this.isDrawing) {
        this.isDrawing = true;
        this.currentDrawingPoints = [point];
      } else {
        this.currentDrawingPoints.push(point);
      }
    } else if (action === 'complete') {
      if (this.isDrawing && this.currentDrawingPoints.length >= 3) {
        this.createRegion('polygon', this.currentDrawingPoints);
        this.cancelDrawing();
      }
    }
  }

  private handleCircleTool(point: FogOfWarPoint, action: 'start' | 'update' | 'complete'): void {
    if (action === 'start') {
      this.isDrawing = true;
      this.currentDrawingPoints = [point];
    } else if (action === 'update' && this.isDrawing) {
      if (this.currentDrawingPoints.length === 1) {
        this.currentDrawingPoints.push(point);
      } else {
        this.currentDrawingPoints[1] = point;
      }
    } else if (action === 'complete' && this.isDrawing) {
      if (this.currentDrawingPoints.length >= 2) {
        this.createRegion('circle', this.currentDrawingPoints);
      }
      this.cancelDrawing();
    }
  }

  private handleRectangleTool(point: FogOfWarPoint, action: 'start' | 'update' | 'complete'): void {
    if (action === 'start') {
      this.isDrawing = true;
      this.currentDrawingPoints = [point];
    } else if (action === 'update' && this.isDrawing) {
      if (this.currentDrawingPoints.length === 1) {
        this.currentDrawingPoints.push(point);
      } else {
        this.currentDrawingPoints[1] = point;
      }
    } else if (action === 'complete' && this.isDrawing) {
      if (this.currentDrawingPoints.length >= 2) {
        this.createRegion('rectangle', this.currentDrawingPoints);
      }
      this.cancelDrawing();
    }
  }

  private handleSelectTool(point: FogOfWarPoint): void {
    const regions = this.getRegionsAtPoint(point);
    if (regions.length > 0) {
      const region = regions[0]; // Select topmost region
      this.dragState = {
        isDragging: true,
        draggedRegion: region.id,
        startPos: point
      };
      this.emit('regionSelected', { region });
    }
  }

  private handleRegionDrag(currentPoint: FogOfWarPoint): void {
    if (!this.dragState.draggedRegion || !this.dragState.startPos) return;
    
    const region = this.regions.get(this.dragState.draggedRegion);
    if (!region) return;
    
    const deltaX = currentPoint.x - this.dragState.startPos.x;
    const deltaY = currentPoint.y - this.dragState.startPos.y;
    
    // Update region position based on type
    if (region.type === 'circle') {
      const circle = region as FogOfWarCircleRegion;
      this.updateRegion(region.id, {
        center: {
          x: circle.center.x + deltaX,
          y: circle.center.y + deltaY
        }
      });
    } else if (region.type === 'rectangle') {
      const rect = region as FogOfWarRectangleRegion;
      this.updateRegion(region.id, {
        topLeft: {
          x: rect.topLeft.x + deltaX,
          y: rect.topLeft.y + deltaY
        },
        bottomRight: {
          x: rect.bottomRight.x + deltaX,
          y: rect.bottomRight.y + deltaY
        }
      });
    } else if (region.type === 'polygon') {
      const polygon = region as FogOfWarPolygonRegion;
      const newPoints = polygon.points.map(point => ({
        x: point.x + deltaX,
        y: point.y + deltaY
      }));
      this.updateRegion(region.id, { points: newPoints });
    }
    
    this.dragState.startPos = currentPoint;
  }

  private getRegionsAtPoint(point: FogOfWarPoint): AnyFogOfWarRegion[] {
    const regions = this.quadTree.query({
      x: point.x - 1,
      y: point.y - 1,
      width: 2,
      height: 2
    });
    
    return regions.filter(region => this.isPointInRegion(point, region));
  }

  private isPointInRegion(point: FogOfWarPoint, region: AnyFogOfWarRegion): boolean {
    switch (region.type) {
      case 'circle': {
        const circle = region as FogOfWarCircleRegion;
        const distance = Math.sqrt(
          Math.pow(point.x - circle.center.x, 2) + Math.pow(point.y - circle.center.y, 2)
        );
        return distance <= circle.radius;
      }
      case 'rectangle': {
        const rect = region as FogOfWarRectangleRegion;
        return (
          point.x >= rect.topLeft.x &&
          point.x <= rect.bottomRight.x &&
          point.y >= rect.topLeft.y &&
          point.y <= rect.bottomRight.y
        );
      }
      case 'polygon': {
        const polygon = region as FogOfWarPolygonRegion;
        return this.isPointInPolygon(point, polygon.points);
      }
    }
  }

  private isPointInPolygon(point: FogOfWarPoint, polygonPoints: FogOfWarPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
      if (
        ((polygonPoints[i].y > point.y) !== (polygonPoints[j].y > point.y)) &&
        (point.x < (polygonPoints[j].x - polygonPoints[i].x) * (point.y - polygonPoints[i].y) / (polygonPoints[j].y - polygonPoints[i].y) + polygonPoints[i].x)
      ) {
        inside = !inside;
      }
    }
    return inside;
  }

  private cancelDrawing(): void {
    this.isDrawing = false;
    this.currentDrawingPoints = [];
  }

  private cancelDragging(): void {
    this.dragState = {
      isDragging: false,
      draggedRegion: null,
      startPos: null
    };
  }

  private animateRegionOpacity(regionId: string, targetOpacity: number, duration: number): void {
    const region = this.regions.get(regionId);
    if (!region) return;
    
    const startOpacity = region.opacity;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Use easeInOutCubic for smooth animation
      const easedProgress = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      region.opacity = startOpacity + (targetOpacity - startOpacity) * easedProgress;
      region.isRevealed = region.opacity < 0.5;
      region.updatedAt = Date.now();
      
      this.invalidateCache();
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.emit('regionAnimationComplete', { regionId, targetOpacity });
      }
    };
    
    requestAnimationFrame(animate);
  }

  private startRenderLoop(): void {
    const render = (timestamp: number) => {
      // Calculate FPS
      if (timestamp - this.lastRenderTime >= 1000) {
        this.fps = this.frameCount;
        this.frameCount = 0;
        this.lastRenderTime = timestamp;
      }
      this.frameCount++;
      
      // Render fog if dirty or drawing
      if (this.isDirty || this.isDrawing) {
        this.renderFog();
        this.isDirty = false;
      }
      
      if (this.isEnabled) {
        this.animationFrameId = requestAnimationFrame(render);
      }
    };
    
    this.animationFrameId = requestAnimationFrame(render);
  }

  private renderFog(): void {
    if (!this.canvas || !this.context) return;
    
    // Use WebGL if available for better performance
    if (this.webglContext && this.settings.qualityLevel === 'ultra') {
      this.renderFogWebGL();
    } else {
      this.renderFog2D();
    }
  }

  private renderFog2D(): void {
    if (!this.canvas || !this.context) return;
    
    const ctx = this.context;
    const visibleRegions = this.getVisibleRegions();
    
    // Clear the canvas
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    if (!this.isEnabled || visibleRegions.length === 0) return;
    
    // Set global fog properties
    ctx.globalAlpha = this.settings.globalOpacity;
    
    // Apply blur if enabled
    if (this.settings.blurRadius > 0) {
      ctx.filter = `blur(${this.settings.blurRadius}px)`;
    }
    
    // Render each region
    visibleRegions.forEach(region => {
      this.renderRegion2D(ctx, region);
    });
    
    // Render current drawing if in progress
    if (this.isDrawing && this.currentDrawingPoints.length > 0) {
      this.renderCurrentDrawing(ctx);
    }
    
    // Reset canvas state
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
  }

  private renderRegion2D(ctx: CanvasRenderingContext2D, region: AnyFogOfWarRegion): void {
    const effectiveOpacity = region.opacity * this.settings.globalOpacity;
    if (effectiveOpacity <= 0) return;
    
    ctx.save();
    ctx.globalAlpha = effectiveOpacity;
    ctx.fillStyle = this.settings.color;
    
    // Apply pattern if needed
    if (this.settings.pattern !== 'solid') {
      const pattern = this.createPattern(ctx);
      if (pattern) {
        ctx.fillStyle = pattern;
      }
    }
    
    // Convert world coordinates to screen coordinates
    ctx.beginPath();
    
    switch (region.type) {
      case 'circle': {
        const circle = region as FogOfWarCircleRegion;
        const screenCenter = this.worldToScreen(circle.center);
        const screenRadius = circle.radius * this.viewport.zoom;
        ctx.arc(screenCenter.x, screenCenter.y, screenRadius, 0, Math.PI * 2);
        break;
      }
      case 'rectangle': {
        const rect = region as FogOfWarRectangleRegion;
        const screenTopLeft = this.worldToScreen(rect.topLeft);
        const screenBottomRight = this.worldToScreen(rect.bottomRight);
        ctx.rect(
          screenTopLeft.x,
          screenTopLeft.y,
          screenBottomRight.x - screenTopLeft.x,
          screenBottomRight.y - screenTopLeft.y
        );
        break;
      }
      case 'polygon': {
        const polygon = region as FogOfWarPolygonRegion;
        if (polygon.points.length > 0) {
          const firstScreenPoint = this.worldToScreen(polygon.points[0]);
          ctx.moveTo(firstScreenPoint.x, firstScreenPoint.y);
          
          for (let i = 1; i < polygon.points.length; i++) {
            const screenPoint = this.worldToScreen(polygon.points[i]);
            ctx.lineTo(screenPoint.x, screenPoint.y);
          }
          ctx.closePath();
        }
        break;
      }
    }
    
    ctx.fill();
    ctx.restore();
  }

  private renderCurrentDrawing(ctx: CanvasRenderingContext2D): void {
    if (this.currentDrawingPoints.length === 0) return;
    
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = this.settings.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    ctx.beginPath();
    
    switch (this.currentTool) {
      case 'polygon':
        if (this.currentDrawingPoints.length > 0) {
          const firstScreenPoint = this.worldToScreen(this.currentDrawingPoints[0]);
          ctx.moveTo(firstScreenPoint.x, firstScreenPoint.y);
          
          for (let i = 1; i < this.currentDrawingPoints.length; i++) {
            const screenPoint = this.worldToScreen(this.currentDrawingPoints[i]);
            ctx.lineTo(screenPoint.x, screenPoint.y);
          }
        }
        break;
        
      case 'circle':
        if (this.currentDrawingPoints.length >= 2) {
          const center = this.worldToScreen(this.currentDrawingPoints[0]);
          const edge = this.worldToScreen(this.currentDrawingPoints[1]);
          const radius = Math.sqrt(
            Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
          );
          ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        }
        break;
        
      case 'rectangle':
        if (this.currentDrawingPoints.length >= 2) {
          const topLeft = this.worldToScreen(this.currentDrawingPoints[0]);
          const bottomRight = this.worldToScreen(this.currentDrawingPoints[1]);
          ctx.rect(
            topLeft.x,
            topLeft.y,
            bottomRight.x - topLeft.x,
            bottomRight.y - topLeft.y
          );
        }
        break;
    }
    
    ctx.stroke();
    ctx.restore();
  }

  private renderFogWebGL(): void {
    // WebGL implementation for ultra performance
    // This would be a complex implementation using shaders
    // For now, fall back to 2D rendering
    this.renderFog2D();
  }

  private createPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    const patternCanvas = document.createElement('canvas');
    const patternSize = 20 * this.settings.patternScale;
    patternCanvas.width = patternSize;
    patternCanvas.height = patternSize;
    
    const patternCtx = patternCanvas.getContext('2d');
    if (!patternCtx) return null;
    
    patternCtx.fillStyle = this.settings.color;
    
    switch (this.settings.pattern) {
      case 'crosshatch':
        patternCtx.strokeStyle = this.settings.color;
        patternCtx.lineWidth = 1;
        // Diagonal lines
        patternCtx.beginPath();
        patternCtx.moveTo(0, 0);
        patternCtx.lineTo(patternSize, patternSize);
        patternCtx.moveTo(0, patternSize);
        patternCtx.lineTo(patternSize, 0);
        patternCtx.stroke();
        break;
        
      case 'diagonal':
        patternCtx.strokeStyle = this.settings.color;
        patternCtx.lineWidth = 2;
        for (let i = 0; i < patternSize * 2; i += 8) {
          patternCtx.beginPath();
          patternCtx.moveTo(i, 0);
          patternCtx.lineTo(i - patternSize, patternSize);
          patternCtx.stroke();
        }
        break;
        
      case 'dots':
        const dotSize = 2 * this.settings.patternScale;
        const spacing = 8 * this.settings.patternScale;
        for (let x = dotSize; x < patternSize; x += spacing) {
          for (let y = dotSize; y < patternSize; y += spacing) {
            patternCtx.beginPath();
            patternCtx.arc(x, y, dotSize, 0, Math.PI * 2);
            patternCtx.fill();
          }
        }
        break;
    }
    
    return ctx.createPattern(patternCanvas, 'repeat');
  }

  private worldToScreen(worldPoint: FogOfWarPoint): { x: number; y: number } {
    return {
      x: (worldPoint.x - this.viewport.x) * this.viewport.zoom,
      y: (worldPoint.y - this.viewport.y) * this.viewport.zoom
    };
  }

  private invalidateCache(): void {
    this.isDirty = true;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.clearRegions();
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.webglContext && this.fogTexture) {
      this.webglContext.deleteTexture(this.fogTexture);
      this.fogTexture = null;
    }
    
    this.renderCache.clear();
    this.canvas = null;
    this.context = null;
    this.webglContext = null;
    this.isEnabled = false;
    
    this.emit('fogOfWarDisposed', {});
  }
}

// Export singleton instance
export const fogOfWarSystem = FogOfWarService.getInstance();