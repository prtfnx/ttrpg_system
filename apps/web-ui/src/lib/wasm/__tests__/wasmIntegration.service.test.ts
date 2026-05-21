import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mock instances — must be set up before the module is imported
const mockAssetSync = vi.hoisted(() => ({ init: vi.fn(), dispose: vi.fn() }));
const mockSpriteSync = vi.hoisted(() => ({ init: vi.fn(), dispose: vi.fn() }));
const mockTableSync = vi.hoisted(() => ({ init: vi.fn(), dispose: vi.fn() }));
const mockRemoteSync = vi.hoisted(() => ({ init: vi.fn(), dispose: vi.fn() }));

vi.mock('../assetSync.service', () => ({ AssetSyncService: vi.fn(function () { return mockAssetSync; }) }));
vi.mock('../spriteSync.service', () => ({ SpriteSyncService: vi.fn(function () { return mockSpriteSync; }) }));
vi.mock('../tableSync.service', () => ({ TableSyncService: vi.fn(function () { return mockTableSync; }) }));
vi.mock('../remoteSync.service', () => ({ RemoteSyncService: vi.fn(function () { return mockRemoteSync; }) }));

// Import after mocks
import { wasmIntegrationService } from '../wasmIntegration.service';

beforeEach(() => vi.clearAllMocks());

describe('WasmIntegrationService', () => {
  const fakeEngine = { resize: vi.fn() } as never;

  describe('getRenderEngine', () => {
    it('returns null before initialization', () => {
      // Force null (in case a previous test set it)
      (wasmIntegrationService as unknown as { renderEngine: null }).renderEngine = null;
      expect(wasmIntegrationService.getRenderEngine()).toBeNull();
    });
  });

  describe('initialize', () => {
    it('sets the render engine', () => {
      wasmIntegrationService.initialize(fakeEngine);
      expect(wasmIntegrationService.getRenderEngine()).toBe(fakeEngine);
    });

    it('calls init on all sub-services', () => {
      wasmIntegrationService.initialize(fakeEngine);
      expect(mockAssetSync.init).toHaveBeenCalledOnce();
      expect(mockSpriteSync.init).toHaveBeenCalledOnce();
      expect(mockTableSync.init).toHaveBeenCalledOnce();
      expect(mockRemoteSync.init).toHaveBeenCalledOnce();
    });
  });

  describe('dispose', () => {
    it('clears the render engine', () => {
      wasmIntegrationService.initialize(fakeEngine);
      wasmIntegrationService.dispose();
      expect(wasmIntegrationService.getRenderEngine()).toBeNull();
    });

    it('calls dispose on all sub-services', () => {
      wasmIntegrationService.initialize(fakeEngine);
      wasmIntegrationService.dispose();
      expect(mockAssetSync.dispose).toHaveBeenCalledOnce();
      expect(mockSpriteSync.dispose).toHaveBeenCalledOnce();
      expect(mockTableSync.dispose).toHaveBeenCalledOnce();
      expect(mockRemoteSync.dispose).toHaveBeenCalledOnce();
    });
  });
});
