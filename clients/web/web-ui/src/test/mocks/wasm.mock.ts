// Mock for WASM ttrpg_rust_core module
export class AssetManager {
  constructor() {}
  add_asset() {}
  remove_asset() {}
  get_asset() { return null; }
  list_assets() { return []; }
}

export class RenderEngine {
  constructor() {}
  render() {}
  clear() {}
  resize() {}
}

export default {
  AssetManager,
  RenderEngine,
};
