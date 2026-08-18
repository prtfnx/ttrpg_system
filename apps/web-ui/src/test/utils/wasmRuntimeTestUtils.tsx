import { WasmRuntimeContext, type WasmRuntimePort, type WasmRuntimeSnapshot } from '@lib/wasm/runtime';
import { WasmRuntimeStore } from '@lib/wasm/runtime/wasmStore';
import { render, renderHook, type RenderHookOptions, type RenderOptions } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';

const readySnapshot: WasmRuntimeSnapshot = {
  isModuleReady: true,
  isCanvasAttached: true,
  error: null,
  version: 'test',
};

export interface MockWasmRuntime extends WasmRuntimePort {
  readonly store: WasmRuntimeStore;
}

export function createMockWasmRuntime(overrides: Partial<MockWasmRuntime> = {}): MockWasmRuntime {
  const store = new WasmRuntimeStore();
  store.setSnapshot(readySnapshot);

  const runtime: MockWasmRuntime = {
    store,
    get status() {
      return store.getSnapshot();
    },
    initialize: vi.fn().mockResolvedValue(undefined),
    attachCanvas: vi.fn(),
    detachCanvas: vi.fn(),
    dispose: vi.fn(),
    setProtocol: vi.fn(),
    getRenderEngine: vi.fn(() => null),
    getActionsEngine: vi.fn(() => null),
    getPlanningManager: vi.fn(() => null),
    getTableManager: vi.fn(() => null),
    getTableSync: vi.fn(() => null),
    getDefaultBrushPresets: vi.fn(() => []),
    computeVisibilityPolygon: vi.fn(() => []),
    configureAssetCache: vi.fn(),
    downloadAsset: vi.fn().mockResolvedValue('asset-test'),
    cacheAssetBytes: vi.fn(() => 'asset-test'),
    calculateAssetHash: vi.fn(() => 'ef46db3751d8e999'),
    getAssetInfo: vi.fn(() => null),
    hasAsset: vi.fn(() => false),
    hasAssetByHash: vi.fn(() => false),
    getAssetByHash: vi.fn(() => null),
    removeAsset: vi.fn(() => false),
    cleanupAssetCache: vi.fn(),
    clearAssetCache: vi.fn(),
    listAssets: vi.fn(() => []),
    getAssetCacheStats: vi.fn(() => ({
      total_assets: 0,
      total_size: 0,
      cache_hits: 0,
      cache_misses: 0,
      last_cleanup: 0,
      download_queue_size: 0,
      total_downloads: 0,
      failed_downloads: 0,
      hash_verifications: 0,
      hash_failures: 0,
    })),
    setUserContext: vi.fn(),
    setActiveLayer: vi.fn(),
    setGridEnabled: vi.fn(),
    setGridSnapping: vi.fn(),
    setGridSize: vi.fn(),
    setAmbientLight: vi.fn(),
    setShapeStyle: vi.fn(),
    setTableUnits: vi.fn(),
    handleTableData: vi.fn(),
    addWall: vi.fn(),
    addWalls: vi.fn(),
    updateWall: vi.fn(),
    removeWall: vi.fn(),
    clearWalls: vi.fn(),
    loadPaintStrokes: vi.fn(),
    addRemotePaintStroke: vi.fn(),
    removePaintStroke: vi.fn(),
    clearPaintStrokes: vi.fn(),
    applyLayerSettings: vi.fn(),
    ...overrides,
  };

  return runtime;
}

export function createWasmRuntimeWrapper(runtime: WasmRuntimePort) {
  return function WasmRuntimeTestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <WasmRuntimeContext.Provider value={runtime as never}>
        {children}
      </WasmRuntimeContext.Provider>
    );
  };
}

export function renderWithWasmRuntime(
  ui: React.ReactElement,
  runtime: WasmRuntimePort = createMockWasmRuntime(),
  options: Omit<RenderOptions, 'wrapper'> = {},
) {
  return render(ui, { wrapper: createWasmRuntimeWrapper(runtime), ...options });
}

export function renderHookWithWasmRuntime<Result, Props>(
  hook: (initialProps: Props) => Result,
  runtime: WasmRuntimePort = createMockWasmRuntime(),
  options: Omit<RenderHookOptions<Props>, 'wrapper'> = {},
) {
  return renderHook(hook, { wrapper: createWasmRuntimeWrapper(runtime), ...options });
}
