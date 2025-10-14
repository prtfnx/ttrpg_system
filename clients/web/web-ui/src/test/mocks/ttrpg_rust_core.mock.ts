// Minimal WASM stub for tests
export class AssetManager {
  async initialize() { return Promise.resolve(); }
  get_cache_stats() { return JSON.stringify({ total_assets: 0, total_size: 0 }); }
  async download_asset() { return Promise.resolve('asset_test'); }
  get_asset_data() { return new Uint8Array(); }
  get_asset_info() { return JSON.stringify({}); }
  has_asset() { return false; }
  has_asset_by_hash() { return false; }
  async cleanup_cache() { return Promise.resolve(); }
  async clear_cache() { return Promise.resolve(); }
  list_assets() { return JSON.stringify([]); }
}

export class NetworkClient {
  private connectionHandler: ((status: string) => void) | null = null;
  
  set_message_handler(_fn: (msg: any) => void) { /* mock - no-op */ }
  set_connection_handler(fn: (status: string) => void) { this.connectionHandler = fn; }
  set_error_handler(_fn: (error: any) => void) { /* mock - no-op */ }
  
  async connect() { 
    Promise.resolve().then(() => {
      if (this.connectionHandler) {
        this.connectionHandler('connected');
      }
    });
    return Promise.resolve({ connected: true });
  }
  
  disconnect() { 
    if (this.connectionHandler) {
      this.connectionHandler('disconnected');
    }
  }
  
  send_message() { return Promise.resolve(); }
  get_client_id() { return 'wasm-mock-client'; }
}

export const RenderEngine = {
  screen_to_world: (x: number, y: number) => [x, y],
  world_to_screen: (x: number, y: number) => [x, y],
  render: () => {},
  get_performance_metrics: () => ({ fps: 60, frame_time: 16.67 }),
  get_sprite_info: (id: string) => ({ id, x: 0, y: 0, width: 32, height: 32 }),
};

export default { AssetManager, NetworkClient, RenderEngine };
