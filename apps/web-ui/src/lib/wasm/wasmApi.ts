// Single typed facade over RenderEngine — the contract between React and WASM.
// Any WASM export not listed here is considered internal implementation detail.
// Components should use this interface, never touch raw WASM classes directly.

export interface WasmApi {
  // Lifecycle
  init(canvas: HTMLCanvasElement): Promise<void>;
  dispose(): void;

  // Rendering
  render(): void;
  resize(width: number, height: number): void;

  // Sprites
  addSprite(layerId: string, spriteData: unknown): string;
  removeSprite(spriteId: string): boolean;
  updateSpritePosition(spriteId: string, x: number, y: number): void;
  updateSpriteScale(spriteId: string, w: number, h: number): void;
  updateSpriteRotation(spriteId: string, angle: number): void;
  getSpriteData(spriteId: string): unknown;
  getSpritePosition(spriteId: string): number[] | undefined;
  getSpriteScale(spriteId: string): number[] | undefined;
  getSelectedSprites(): string[];

  // Camera
  setCamera(x: number, y: number, zoom: number): void;
  resetCamera(): void;
  screenToWorld(sx: number, sy: number): Float64Array;
  worldToScreen(wx: number, wy: number): Float64Array;
  getViewportBounds(): Float64Array;
  handleWheel(sx: number, sy: number, deltaY: number): void;

  // Layers
  setLayerVisibility(name: string, visible: boolean): boolean;
  setLayerOpacity(name: string, opacity: number): boolean;
  getLayerNames(): string[];

  // Lighting
  addLight(id: string, x: number, y: number): void;
  removeLight(id: string): void;
  setLightColor(id: string, r: number, g: number, b: number, a: number): void;
  setLightRadius(id: string, radius: number): void;
  setLightIntensity(id: string, intensity: number): void;
  updateLightPosition(id: string, x: number, y: number): void;
  setAmbientLight(level: number): void;
  setDynamicLightingEnabled(enabled: boolean): void;

  // Fog
  addFogRectangle(id: string, x1: number, y1: number, x2: number, y2: number, mode: string): void;
  removeFogRectangle(id: string): void;
  clearFog(): void;
  hideEntireTable(w: number, h: number): void;
  isPointInFog(x: number, y: number): boolean;

  // Textures / assets
  loadTexture(name: string, image: HTMLImageElement): void;

  // Table data (received from server)
  handleTableData(jsonData: unknown): void;
  handleSpriteUpdate(updateData: unknown): void;

  // Grid
  setGridEnabled(enabled: boolean): void;
  setGridSnapping(enabled: boolean): void;
  setGridSize(size: number): void;
  getGridSize(): number;

  // GM / user mode
  setGmMode(isGm: boolean): void;
  setCurrentUserId(userId: number): void;

  // Input modes
  setInputModeSelect(): void;
  setInputModePaint(): void;
  setInputModeMeasurement(): void;

  // Mouse input
  handleMouseDown(sx: number, sy: number): void;
  handleMouseDownWithCtrl(sx: number, sy: number, ctrl: boolean): void;
  handleMouseMove(sx: number, sy: number): void;
  handleMouseUp(sx: number, sy: number): void;
  handleRightClick(sx: number, sy: number): string | undefined;

  // Paint system
  paintEnterMode(w: number, h: number): void;
  paintExitMode(): void;
  paintSetBrushColor(r: number, g: number, b: number, a: number): void;
  paintSetBrushWidth(width: number): void;
  paintStartStroke(wx: number, wy: number, pressure: number): boolean;
  paintAddPoint(wx: number, wy: number, pressure: number): boolean;
  paintEndStroke(): boolean;

  // Visibility / LOS
  computeVisibilityPolygon(px: number, py: number, obstacles: Float32Array, maxDist: number): unknown;

  // WASM memory cleanup
  free(): void;
}
