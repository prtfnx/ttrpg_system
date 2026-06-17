import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAssetSync = vi.hoisted(() => ({ init: vi.fn(), dispose: vi.fn() }));
const mockSpriteSync = vi.hoisted(() => ({ init: vi.fn(), dispose: vi.fn() }));
const mockTableSync = vi.hoisted(() => ({ init: vi.fn(), dispose: vi.fn() }));
const mockRemoteSync = vi.hoisted(() => ({ init: vi.fn(), dispose: vi.fn() }));

vi.mock('../../assetSync.service', () => ({ AssetSyncService: vi.fn(function () { return mockAssetSync; }) }));
vi.mock('../../spriteSync.service', () => ({ SpriteSyncService: vi.fn(function () { return mockSpriteSync; }) }));
vi.mock('../../tableSync.service', () => ({ TableSyncService: vi.fn(function () { return mockTableSync; }) }));
vi.mock('../../remoteSync.service', () => ({ RemoteSyncService: vi.fn(function () { return mockRemoteSync; }) }));

import { WasmSyncCoordinator } from '../WasmSyncCoordinator';

beforeEach(() => vi.clearAllMocks());

describe('WasmSyncCoordinator', () => {
  const fakeEngine = { resize: vi.fn() } as never;

  it('starts without a render engine', () => {
    const coordinator = new WasmSyncCoordinator();

    expect(coordinator.getRenderEngine()).toBeNull();
  });

  it('sets the render engine and initializes sub-services', () => {
    const coordinator = new WasmSyncCoordinator();

    coordinator.initialize(fakeEngine);

    expect(coordinator.getRenderEngine()).toBe(fakeEngine);
    expect(mockAssetSync.init).toHaveBeenCalledOnce();
    expect(mockSpriteSync.init).toHaveBeenCalledOnce();
    expect(mockTableSync.init).toHaveBeenCalledOnce();
    expect(mockRemoteSync.init).toHaveBeenCalledOnce();
  });

  it('disposes sub-services and clears the render engine', () => {
    const coordinator = new WasmSyncCoordinator();

    coordinator.initialize(fakeEngine);
    coordinator.dispose();

    expect(mockRemoteSync.dispose).toHaveBeenCalledOnce();
    expect(mockTableSync.dispose).toHaveBeenCalledOnce();
    expect(mockSpriteSync.dispose).toHaveBeenCalledOnce();
    expect(mockAssetSync.dispose).toHaveBeenCalledOnce();
    expect(coordinator.getRenderEngine()).toBeNull();
  });
});
