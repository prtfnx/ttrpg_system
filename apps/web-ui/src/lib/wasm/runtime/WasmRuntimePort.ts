import type { SessionRole } from '@features/session/types/roles';
import type {
  ActionsClient,
  BrushPreset,
  PlanningManager,
  RenderEngine,
  TableManager,
  TableSync,
  VisibilityPoint,
} from './types';
import type { AssetCacheStats, AssetInfo, CacheAssetOptions } from './BrowserAssetCache';
import type { WasmRuntimeSnapshot } from './wasmStore';

export interface AttachCanvasOptions {
  userId: number | null;
  role: SessionRole | string | null;
  activeLayer: string;
  onFrame?: () => void;
}

export interface WasmRuntimePort {
  readonly status: WasmRuntimeSnapshot;

  initialize(): Promise<void>;
  attachCanvas(canvas: HTMLCanvasElement, options: AttachCanvasOptions): Promise<RenderEngine>;
  detachCanvas(): void;
  dispose(): void;

  setProtocol(protocol: unknown | null): void;
  getRenderEngine(): RenderEngine | null;
  getActionsEngine(): ActionsClient | null;
  getPlanningManager(): PlanningManager | null;
  getTableManager(): TableManager | null;
  getTableSync(): TableSync | null;
  getDefaultBrushPresets(): BrushPreset[];
  computeVisibilityPolygon(x: number, y: number, obstacles: Float32Array, radius: number): VisibilityPoint[];

  configureAssetCache(options: { maxCacheBytes?: number; maxAgeMs?: number }): void;
  downloadAsset(url: string, expectedHash?: string): Promise<string>;
  cacheAssetBytes(data: Uint8Array, options: CacheAssetOptions): string;
  calculateAssetHash(data: Uint8Array): string;
  getAssetInfo(assetId: string): AssetInfo | null;
  hasAsset(assetId: string): boolean;
  hasAssetByHash(xxhash: string): boolean;
  getAssetByHash(xxhash: string): string | null;
  removeAsset(assetId: string): boolean;
  cleanupAssetCache(): void;
  clearAssetCache(): void;
  listAssets(): AssetInfo[];
  getAssetCacheStats(): AssetCacheStats;

  setUserContext(userId: number | null, role: SessionRole | string | null): void;
  setActiveLayer(layerName: string): void;
  setGridEnabled(enabled: boolean): void;
  setGridSnapping(enabled: boolean): void;
  setGridSize(size: number): void;
  setAmbientLight(level: number): void;
  setShapeStyle(color: string, opacity: number, filled: boolean): void;
  setTableUnits(tableId: string | null, gridCellPx: number, cellDistance: number, distanceUnit: string): void;
  handleTableData(tableData: unknown): void;

  addWall(wall: unknown): void;
  addWalls(walls: unknown[]): void;
  updateWall(wallId: string, updates: unknown): void;
  removeWall(wallId: string): void;
  clearWalls(): void;

  loadPaintStrokes(strokesJson: string): void;
  addRemotePaintStroke(strokeJson: string): void;
  removePaintStroke(strokeId: string): void;
  clearPaintStrokes(): void;

  applyLayerSettings(settings: Record<string, Record<string, unknown>>): void;
}
