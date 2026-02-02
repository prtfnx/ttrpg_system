import { vi } from 'vitest';
import { MockNetworkClient } from './mockNetworkClient';

type NetworkClientFactory = () => any;

// Default: return the constructor (class) so existing code that expects a
// constructor continues to work. Tests can override with a factory that
// returns an instance if they prefer.
const defaultNetworkFactory: NetworkClientFactory = () => new MockNetworkClient();

let currentFactory: NetworkClientFactory = defaultNetworkFactory;

export function setNetworkClientFactory(factory: NetworkClientFactory) {
  currentFactory = factory;
}

export function resetNetworkClientFactory() {
  currentFactory = defaultNetworkFactory;
}

export function getNetworkClientForMock() {
  const res = currentFactory();
  // If factory returned a constructor, instantiate it so callers get an instance
  if (typeof res === 'function') {
    try {
      return new (res as any)();
    } catch (e) {
      // Fall back to returning the constructor if it can't be instantiated
      return res;
    }
  }
  return res;
}

export const mockWasmManager = {
  getInstance: vi.fn(() => Promise.resolve({
    initialize: vi.fn(),
    isInitialized: vi.fn(() => true)
  })),
  // Default returns whatever the factory provides (commonly a constructor)
  getNetworkClient: vi.fn(() => Promise.resolve(getNetworkClientForMock())),
  getRenderEngine: vi.fn(() => Promise.resolve((window as any).rustRenderManager)),
  getActionsClient: vi.fn(() => Promise.resolve({})),
  getAssetManager: vi.fn(() => Promise.resolve({
    initialize: vi.fn().mockResolvedValue(undefined),
    set_max_cache_size: vi.fn(),
    get_cache_stats: vi.fn().mockReturnValue(JSON.stringify({
      total_assets: 0,
      total_size: 0,
      cache_hits: 0,
      cache_misses: 0,
      last_cleanup: Date.now(),
      download_queue_size: 0,
      total_downloads: 0,
      failed_downloads: 0,
      hash_verifications: 0,
      hash_failures: 0
    })),
    download_asset: vi.fn().mockResolvedValue('asset_123'),
    has_asset: vi.fn().mockReturnValue(true),
    get_asset_info: vi.fn().mockReturnValue('{}'),
    get_asset_data: vi.fn().mockReturnValue(new Uint8Array()),
  }))
};

export default mockWasmManager;
