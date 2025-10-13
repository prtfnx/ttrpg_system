// Minimal WASM stub for tests. Provides AssetManager, NetworkClient and RenderEngine
// with deterministic no-op implementations to keep tests stable and quiet.

export class AssetManager {
  async initialize() { return Promise.resolve(); }

  get_cache_stats() {
    return JSON.stringify({
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
    });
  }

  async download_asset(_url: string, _expectedHash?: string) { return Promise.resolve('asset_test_1'); }
  get_asset_data(_id: string) { return new Uint8Array(); }
  get_asset_info(_id: string) { return JSON.stringify({ id: _id }); }
  has_asset(_id: string) { return false; }
  has_asset_by_hash(_hash: string) { return false; }
  async cleanup_cache() { return Promise.resolve(); }
  async clear_cache() { return Promise.resolve(); }
  list_assets() { return JSON.stringify([]); }
}

export class NetworkClient {
  private _messageHandler: any = null;
  private _connectionHandler: any = null;
  private _errorHandler: any = null;

  set_message_handler(fn: any) { this._messageHandler = fn; }
  set_connection_handler(fn: any) { this._connectionHandler = fn; }
  set_error_handler(fn: any) { this._errorHandler = fn; }

  async connect(_url: string) {
    // asynchronous but immediate connect notification
    Promise.resolve().then(() => this._connectionHandler && this._connectionHandler('connected'));
    return Promise.resolve({ connected: true });
  }

  disconnect() { this._connectionHandler && this._connectionHandler('disconnected'); }
  send_message(_type: string, _data: any) { return Promise.resolve(); }
  get_client_id() { return 'wasm-mock-client'; }
}

export const RenderEngine = {
  screen_to_world: (x: number, y: number) => [x, y],
  world_to_screen: (x: number, y: number) => [x, y],
  render: () => {},
  get_performance_metrics: () => ({ fps: 60, frame_time: 16.67, memory_usage: 1024 * 1024, sprite_count: 0 }),
  get_sprite_info: (id: string) => ({ id, x: 0, y: 0, width: 32, height: 32 }),
};

export default {
  AssetManager,
  NetworkClient,
  RenderEngine,
};
// Minimal WASM stub for tests. Exports classes and objects matching the
// production WASM module surface used by the UI and hooks. Methods are
// no-ops or return simple deterministic values.

export class AssetManager {
  async initialize() {
    return Promise.resolve();
  }

  get_cache_stats() {
    return JSON.stringify({
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
    });
  }

  async download_asset(_url: string, _expectedHash?: string) {
    return Promise.resolve('asset_test_1');
  }

  get_asset_data(_id: string) {
    return new Uint8Array();
  }

  get_asset_info(_id: string) {
    return JSON.stringify({ id: _id });
  }

  has_asset(_id: string) {
    return false;
  }

  has_asset_by_hash(_hash: string) {
    return false;
  }

  async cleanup_cache() { return Promise.resolve(); }
  async clear_cache() { return Promise.resolve(); }
  list_assets() { return JSON.stringify([]); }
}

export class NetworkClient {
  private messageHandler: any = null;
  private connectionHandler: any = null;
  private errorHandler: any = null;

  set_message_handler(fn: any) { this.messageHandler = fn; }
  set_connection_handler(fn: any) { this.connectionHandler = fn; }
  set_error_handler(fn: any) { this.errorHandler = fn; }

  async connect(_url: string) {
    // simulate async connect
    setTimeout(() => this.connectionHandler && this.connectionHandler('connected'), 0);
    return Promise.resolve({ connected: true });
  }

  disconnect() {
    this.connectionHandler && this.connectionHandler('disconnected');
  }

  send_message(_type: string, _data: any) { return Promise.resolve(); }

  get_client_id() { return 'wasm-mock-client'; }
}

export const RenderEngine = {
  // minimal methods the UI expects
  screen_to_world: (x: number, y: number) => [x, y],
  world_to_screen: (x: number, y: number) => [x, y],
  render: () => {},
  get_performance_metrics: () => ({ fps: 60, frame_time: 16.67, memory_usage: 1024 * 1024, sprite_count: 0 }),
};

// Default export shape similar to the real module
export default {
  AssetManager,
  NetworkClient,
  RenderEngine,
};
// Minimal mock of the ttrpg_rust_core JS bindings used in tests.
// Export only the pieces tests rely on: AssetManager, RenderEngine and any helpers.

export class AssetManager {
  async initialize() { return Promise.resolve(); }
  get_cache_stats() {
    return JSON.stringify({
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
    });
  }
  async download_asset() { return Promise.resolve('asset_123'); }
  has_asset() { return true; }
  get_asset_info() { return '{}'; }
  get_asset_data() { return new Uint8Array(); }
  async cleanup_cache() { return Promise.resolve(); }
  async clear_cache() { return Promise.resolve(); }
}

export const RenderEngine = {
  // minimal stubs used by tests
  screen_to_world: (x: number, y: number) => [x, y],
  world_to_screen: (x: number, y: number) => [x, y],
  get_sprite_info: (id: string) => ({ id, x: 0, y: 0, width: 32, height: 32 }),
  get_performance_metrics: () => ({ fps: 60, frame_time: 16.67, memory_usage: 1024 * 1024, sprite_count: 0 }),
};

export default {
  AssetManager,
  RenderEngine,
};
