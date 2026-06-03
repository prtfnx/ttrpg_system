import type { RenderEngine, TableManager } from '@lib/wasm/ttrpg_rust_core';

class WasmRuntimeService {
  private static renderEngine: RenderEngine | null = null;
  private static tableManager: TableManager | null = null;

  static setRenderEngine(engine: RenderEngine | null): void {
    this.renderEngine = engine;
  }

  static getRenderEngine(): RenderEngine | null {
    return this.renderEngine;
  }

  static setTableManager(manager: TableManager | null): void {
    this.tableManager = manager;
  }

  static getTableManager(): TableManager | null {
    return this.tableManager;
  }
}

export { WasmRuntimeService };

