import { assetIntegrationService } from '@features/assets';
import { isDM, type SessionRole } from '@features/session/types/roles';
import { initializeWasmCore } from '../wasmCore';
import { wasmBridgeService } from '../wasmBridge';
import {
  ActionsClient,
  AssetManager,
  NetworkClient,
  PlanningManager,
  TableManager,
  TableSync,
  create_default_brush_presets,
  init_game_renderer,
  version,
  type RenderEngine,
} from '../ttrpg_rust_core';
import type { AttachCanvasOptions, WasmRuntimePort } from './WasmRuntimePort';
import type { BrushPreset } from './types';
import { WasmSyncCoordinator } from './WasmSyncCoordinator';
import { WasmRuntimeStore, type WasmRuntimeSnapshot } from './wasmStore';

type RuntimeCallbackRenderEngine = RenderEngine & {
  set_runtime_operation_handler?: (callback: (operation: WasmRuntimeOperation) => void) => void;
  set_runtime_event_handler?: (callback: (event: WasmRuntimeEvent) => void) => void;
  clear_runtime_operation_handler?: () => void;
  clear_runtime_event_handler?: () => void;
  set_shape_style?: (color: string, opacity: number, filled: boolean) => void;
};

type RuntimeProtocol = {
  createSprite?: (spriteData: Record<string, unknown>) => void;
};

type WasmRuntimeOperation = {
  type?: string;
  data?: unknown;
};

type WasmRuntimeEvent = {
  type?: string;
  data?: unknown;
};

const RUNTIME_EVENT_BROWSER_NAMES: Record<string, string> = {
  assetDownloadRequested: 'request-asset-download',
  cursorHint: 'wasm-cursor-hint',
  lightMoved: 'wasm-light-moved',
  measurementComplete: 'measurementComplete',
  polygonCreated: 'polygonCreated',
  spriteOperationCompleted: 'wasm-sprite-operation',
  spriteDragPreview: 'sprite-drag-preview',
  spriteResizePreview: 'sprite-resize-preview',
  spriteRotatePreview: 'sprite-rotate-preview',
  textSpriteClick: 'textSpriteClick',
  toolModeChanged: 'wasm-tool-mode-changed',
  tokenDoubleClick: 'tokenDoubleClick',
  wallDrawn: 'wallDrawn',
  wallMoved: 'wasm-wall-moved',
};

export class WasmRuntime implements WasmRuntimePort {
  readonly store = new WasmRuntimeStore();

  private initPromise: Promise<void> | null = null;
  private renderEngine: RenderEngine | null = null;
  private actionsEngine: ActionsClient | null = null;
  private assetManager: AssetManager | null = null;
  private networkClient: NetworkClient | null = null;
  private planningManager: PlanningManager | null = null;
  private tableManager: TableManager | null = null;
  private tableSync: TableSync | null = null;
  private animationFrameId: number | null = null;
  private onFrame: (() => void) | null = null;
  private protocol: RuntimeProtocol | null = null;
  private readonly syncCoordinator = new WasmSyncCoordinator();
  private readonly runtimeOperationHandler = (operation: WasmRuntimeOperation) => {
    this.handleRuntimeOperation(operation);
  };
  private readonly runtimeEventHandler = (event: WasmRuntimeEvent) => {
    this.handleRuntimeEvent(event);
  };

  get status(): WasmRuntimeSnapshot {
    return this.store.getSnapshot();
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = initializeWasmCore()
      .then(() => {
        this.actionsEngine ??= new ActionsClient();
        this.assetManager ??= new AssetManager();
        this.networkClient ??= new NetworkClient();
        this.tableManager ??= new TableManager();
        this.tableSync ??= new TableSync();
        this.store.setSnapshot({
          isModuleReady: true,
          error: null,
          version: typeof version === 'function' ? version() : null,
        });
      })
      .catch(error => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.initPromise = null;
        this.store.setSnapshot({ error: err, isModuleReady: false });
        throw err;
      });

    return this.initPromise;
  }

  async attachCanvas(canvas: HTMLCanvasElement, options: AttachCanvasOptions): Promise<RenderEngine> {
    await this.initialize();

    if (this.renderEngine) {
      this.setUserContext(options.userId, options.role);
      this.setActiveLayer(options.activeLayer);
      this.onFrame = options.onFrame ?? null;
      return this.renderEngine;
    }

    const engine = init_game_renderer(canvas);
    engine.set_camera?.(0, 0, 1.0);
    this.renderEngine = engine;
    this.onFrame = options.onFrame ?? null;
    this.registerRuntimeCallbacks(engine);
    this.setUserContext(options.userId, options.role);
    this.setActiveLayer(options.activeLayer);

    wasmBridgeService.init();
    this.syncCoordinator.initialize(engine);
    assetIntegrationService.initialize();
    this.startRenderLoop();
    this.store.setSnapshot({ isCanvasAttached: true, error: null });

    return engine;
  }

  detachCanvas(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.syncCoordinator.dispose();
    assetIntegrationService.dispose();
    this.onFrame = null;

    this.clearRuntimeCallbacks(this.renderEngine);

    try {
      this.renderEngine?.free?.();
    } catch {
      // best-effort wasm cleanup
    }

    this.renderEngine = null;
    this.store.setSnapshot({ isCanvasAttached: false });
  }

  dispose(): void {
    this.detachCanvas();
    wasmBridgeService.cleanup();

    try { this.actionsEngine?.free?.(); } catch {}
    try { this.assetManager?.free?.(); } catch {}
    try { this.networkClient?.free?.(); } catch {}
    try { this.planningManager?.free?.(); } catch {}
    try { this.tableManager?.free?.(); } catch {}
    try { this.tableSync?.free?.(); } catch {}

    this.actionsEngine = null;
    this.assetManager = null;
    this.networkClient = null;
    this.planningManager = null;
    this.tableManager = null;
    this.tableSync = null;
    this.initPromise = null;
    this.store.setSnapshot({
      isModuleReady: false,
      isCanvasAttached: false,
      error: null,
      version: null,
    });
  }

  setProtocol(protocol: unknown | null): void {
    this.protocol = this.toRuntimeProtocol(protocol);
    wasmBridgeService.setProtocol(protocol as never);
  }

  getRenderEngine(): RenderEngine | null {
    return this.renderEngine;
  }

  getActionsEngine(): ActionsClient | null {
    return this.actionsEngine;
  }

  getAssetManager(): AssetManager | null {
    return this.assetManager;
  }

  getNetworkClient(): NetworkClient | null {
    return this.networkClient;
  }

  getPlanningManager(): PlanningManager | null {
    if (!this.planningManager && this.status.isModuleReady) {
      this.planningManager = new PlanningManager(64, 5 / 64);
    }
    return this.planningManager;
  }

  getTableManager(): TableManager | null {
    return this.tableManager;
  }

  getTableSync(): TableSync | null {
    return this.tableSync;
  }

  getDefaultBrushPresets(): BrushPreset[] {
    if (!this.status.isModuleReady) return [];
    return create_default_brush_presets() as BrushPreset[];
  }

  setUserContext(userId: number | null, role: SessionRole | string | null): void {
    const engine = this.renderEngine;
    if (!engine) return;
    if (userId != null) engine.set_current_user_id?.(userId);
    engine.set_gm_mode?.(isDM(role as SessionRole | null));
  }

  setActiveLayer(layerName: string): void {
    this.renderEngine?.set_active_layer?.(layerName);
  }

  setGridEnabled(enabled: boolean): void {
    this.renderEngine?.set_grid_enabled?.(enabled);
  }

  setGridSnapping(enabled: boolean): void {
    this.renderEngine?.set_grid_snapping?.(enabled);
  }

  setGridSize(size: number): void {
    this.renderEngine?.set_grid_size?.(size);
  }

  setAmbientLight(level: number): void {
    this.renderEngine?.set_ambient_light?.(level);
  }

  setShapeStyle(color: string, opacity: number, filled: boolean): void {
    const engine = this.renderEngine as RuntimeCallbackRenderEngine | null;
    engine?.set_shape_style?.(color, opacity, filled);
  }

  setTableUnits(tableId: string | null, gridCellPx: number, cellDistance: number, distanceUnit: string): void {
    if (!tableId) return;
    this.tableManager?.set_table_units?.(tableId, gridCellPx, cellDistance, distanceUnit);
  }

  handleTableData(tableData: unknown): void {
    this.renderEngine?.handle_table_data?.(tableData);
  }

  addWall(wall: unknown): void {
    this.renderEngine?.add_wall?.(JSON.stringify(wall));
  }

  addWalls(walls: unknown[]): void {
    walls.forEach(wall => this.addWall(wall));
  }

  updateWall(wallId: string, updates: unknown): void {
    this.renderEngine?.update_wall?.(wallId, JSON.stringify(updates));
  }

  removeWall(wallId: string): void {
    this.renderEngine?.remove_wall?.(wallId);
  }

  clearWalls(): void {
    this.renderEngine?.clear_walls?.();
  }

  loadPaintStrokes(strokesJson: string): void {
    this.renderEngine?.paint_load_strokes?.(strokesJson);
  }

  addRemotePaintStroke(strokeJson: string): void {
    this.renderEngine?.paint_add_remote_stroke?.(strokeJson);
  }

  removePaintStroke(strokeId: string): void {
    this.renderEngine?.paint_remove_stroke?.(strokeId);
  }

  clearPaintStrokes(): void {
    this.renderEngine?.paint_clear_all?.();
  }

  applyLayerSettings(settings: Record<string, Record<string, unknown>>): void {
    const engine = this.renderEngine;
    if (!engine) return;

    for (const [layer, setting] of Object.entries(settings)) {
      if (typeof setting.opacity === 'number') engine.set_layer_opacity?.(layer, setting.opacity);
      if (typeof setting.visible === 'boolean') engine.set_layer_visibility?.(layer, setting.visible);
      if (Array.isArray(setting.tint_color) && setting.tint_color.length >= 3) {
        engine.set_layer_color?.(
          layer,
          Number(setting.tint_color[0]),
          Number(setting.tint_color[1]),
          Number(setting.tint_color[2]),
        );
      }
    }
  }

  private startRenderLoop(): void {
    if (this.animationFrameId !== null) return;

    const render = () => {
      try {
        this.renderEngine?.render?.();
        this.onFrame?.();
      } catch (error) {
        console.error('Rust WASM render error:', error);
      }

      if (this.renderEngine) {
        this.animationFrameId = requestAnimationFrame(render);
      } else {
        this.animationFrameId = null;
      }
    };

    this.animationFrameId = requestAnimationFrame(render);
  }

  private clearRuntimeCallbacks(engine: RenderEngine | null): void {
    const callbackEngine = engine as RuntimeCallbackRenderEngine | null;
    try { callbackEngine?.clear_runtime_operation_handler?.(); } catch {}
    try { callbackEngine?.clear_runtime_event_handler?.(); } catch {}
  }

  private registerRuntimeCallbacks(engine: RenderEngine): void {
    const callbackEngine = engine as RuntimeCallbackRenderEngine;
    callbackEngine.set_runtime_operation_handler?.(this.runtimeOperationHandler);
    callbackEngine.set_runtime_event_handler?.(this.runtimeEventHandler);
  }

  private handleRuntimeOperation(operation: WasmRuntimeOperation): void {
    if (operation.type !== 'spriteCreateRequested') {
      console.warn('[WasmRuntime] Ignoring unknown WASM runtime operation:', operation.type);
      return;
    }

    if (!this.protocol?.createSprite || !this.isRecord(operation.data)) {
      console.warn('[WasmRuntime] Cannot route WASM sprite creation without protocol and payload.');
      return;
    }

    this.protocol.createSprite(operation.data);
  }

  private toRuntimeProtocol(protocol: unknown | null): RuntimeProtocol | null {
    if (!this.isRecord(protocol) || typeof protocol.createSprite !== 'function') {
      return null;
    }
    return { createSprite: protocol.createSprite.bind(protocol) as RuntimeProtocol['createSprite'] };
  }

  private handleRuntimeEvent(event: WasmRuntimeEvent): void {
    if (event.type === 'spriteAdded') {
      window.dispatchEvent(new Event('spriteAdded'));
      return;
    }

    if (event.type && RUNTIME_EVENT_BROWSER_NAMES[event.type]) {
      const detail = this.isRecord(event.data) ? event.data : {};
      window.dispatchEvent(new CustomEvent(RUNTIME_EVENT_BROWSER_NAMES[event.type], { detail }));
      return;
    }

    console.warn('[WasmRuntime] Ignoring unknown WASM runtime event:', event.type);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}
