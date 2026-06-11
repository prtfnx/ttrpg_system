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
    getAssetManager: vi.fn(() => null),
    getNetworkClient: vi.fn(() => null),
    getPlanningManager: vi.fn(() => null),
    getTableManager: vi.fn(() => null),
    getTableSync: vi.fn(() => null),
    getDefaultBrushPresets: vi.fn(() => []),
    setUserContext: vi.fn(),
    setActiveLayer: vi.fn(),
    setGridEnabled: vi.fn(),
    setGridSnapping: vi.fn(),
    setGridSize: vi.fn(),
    setAmbientLight: vi.fn(),
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
