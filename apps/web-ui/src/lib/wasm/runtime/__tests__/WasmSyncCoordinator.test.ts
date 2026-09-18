import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAssetSync = vi.hoisted(() => ({
  init: vi.fn(),
  dispose: vi.fn(),
  areTexturesSettled: vi.fn(() => false),
  releaseTexturesExcept: vi.fn(),
}));
const mockSpriteSync = vi.hoisted(() => ({ init: vi.fn(), dispose: vi.fn() }));
const mockTableSync = vi.hoisted(() => ({
  init: vi.fn(),
  dispose: vi.fn(),
  flushPending: vi.fn(),
  retainLatestForRenderer: vi.fn(),
}));
const mockRemoteSync = vi.hoisted(() => ({ init: vi.fn(), dispose: vi.fn() }));
const tableCallbacks = vi.hoisted(() => ({
  value: null as null | { onHydrated?: (tableId: string, textureIds: readonly string[]) => void },
}));

vi.mock('../../assetSync.service', () => ({ AssetSyncService: vi.fn(function () { return mockAssetSync; }) }));
vi.mock('../../spriteSync.service', () => ({ SpriteSyncService: vi.fn(function () { return mockSpriteSync; }) }));
vi.mock('../../tableSync.service', () => ({
  TableSyncService: vi.fn(function (_getEngine, _spriteSync, callbacks) {
    tableCallbacks.value = callbacks;
    return mockTableSync;
  }),
}));
vi.mock('../../remoteSync.service', () => ({ RemoteSyncService: vi.fn(function () { return mockRemoteSync; }) }));

import { WasmSyncCoordinator } from '../WasmSyncCoordinator';

beforeEach(() => {
  vi.clearAllMocks();
  tableCallbacks.value = null;
  mockAssetSync.areTexturesSettled.mockReturnValue(false);
});

describe('WasmSyncCoordinator', () => {
  const fakeEngine = { resize: vi.fn() } as never;
  const resolveDownloadedAsset = vi.fn(async () => 'blob:cached-asset');

  it('starts without a render engine', () => {
    const coordinator = new WasmSyncCoordinator(resolveDownloadedAsset);

    expect(coordinator.getRenderEngine()).toBeNull();
    expect(mockTableSync.init).not.toHaveBeenCalled();

    coordinator.start();
    expect(mockTableSync.init).toHaveBeenCalledOnce();
  });

  it('sets the render engine and initializes sub-services', () => {
    const coordinator = new WasmSyncCoordinator(resolveDownloadedAsset);

    coordinator.initialize(fakeEngine);

    expect(coordinator.getRenderEngine()).toBe(fakeEngine);
    expect(mockAssetSync.init).toHaveBeenCalledOnce();
    expect(mockSpriteSync.init).toHaveBeenCalledOnce();
    expect(mockTableSync.init).toHaveBeenCalledOnce();
    expect(mockTableSync.flushPending).toHaveBeenCalledOnce();
    expect(mockRemoteSync.init).toHaveBeenCalledOnce();
  });

  it('reports visual readiness only after required textures settle', () => {
    const onTableHydrated = vi.fn();
    const coordinator = new WasmSyncCoordinator(resolveDownloadedAsset, { onTableHydrated });

    tableCallbacks.value?.onHydrated?.('table-1', ['map-asset', 'token-asset']);

    expect(onTableHydrated).toHaveBeenCalledWith('table-1');
    expect(mockAssetSync.releaseTexturesExcept).toHaveBeenCalledWith(['map-asset', 'token-asset']);
    expect(coordinator.isTableVisuallyReady('table-1')).toBe(false);
    expect(mockAssetSync.areTexturesSettled).toHaveBeenCalledWith(['map-asset', 'token-asset']);

    mockAssetSync.areTexturesSettled.mockReturnValue(true);
    expect(coordinator.isTableVisuallyReady('table-1')).toBe(true);
    expect(coordinator.isTableVisuallyReady('unknown-table')).toBe(false);
  });

  it('forgets readiness for the prior table after a switch', () => {
    const coordinator = new WasmSyncCoordinator(resolveDownloadedAsset);
    tableCallbacks.value?.onHydrated?.('table-1', ['old-map']);
    tableCallbacks.value?.onHydrated?.('table-2', ['new-map']);

    expect(coordinator.isTableVisuallyReady('table-1')).toBe(false);
    expect(mockAssetSync.releaseTexturesExcept).toHaveBeenLastCalledWith(['new-map']);
  });

  it('disposes sub-services and clears the render engine', () => {
    const coordinator = new WasmSyncCoordinator(resolveDownloadedAsset);

    coordinator.initialize(fakeEngine);
    coordinator.dispose();

    expect(mockRemoteSync.dispose).toHaveBeenCalledOnce();
    expect(mockTableSync.dispose).toHaveBeenCalledOnce();
    expect(mockSpriteSync.dispose).toHaveBeenCalledOnce();
    expect(mockAssetSync.dispose).toHaveBeenCalledOnce();
    expect(coordinator.getRenderEngine()).toBeNull();
  });

  it('keeps the table listener alive while the renderer is detached', () => {
    const coordinator = new WasmSyncCoordinator(resolveDownloadedAsset);
    coordinator.initialize(fakeEngine);

    coordinator.detachRenderer();

    expect(mockTableSync.retainLatestForRenderer).toHaveBeenCalledOnce();
    expect(mockTableSync.dispose).not.toHaveBeenCalled();
    expect(coordinator.getRenderEngine()).toBeNull();
  });
});
