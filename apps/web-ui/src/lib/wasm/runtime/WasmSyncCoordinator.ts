/**
 * Runtime-owned WASM sync coordinator.
 * Wires AssetSyncService, SpriteSyncService, TableSyncService, and RemoteSyncService
 * together around the RenderEngine owned by a WasmRuntime instance.
 */

import { AssetSyncService } from '../assetSync.service';
import { RemoteSyncService } from '../remoteSync.service';
import { SpriteSyncService } from '../spriteSync.service';
import { TableSyncService } from '../tableSync.service';
import { logger } from '@shared/utils/logger';
import type { RenderEngine } from './types';

export class WasmSyncCoordinator {
  private renderEngine: RenderEngine | null = null;

  private readonly assetSync: AssetSyncService;
  private readonly spriteSync: SpriteSyncService;
  private readonly tableSync: TableSyncService;
  private readonly remoteSync: RemoteSyncService;

  constructor() {
    this.assetSync = new AssetSyncService(() => this.renderEngine);
    this.spriteSync = new SpriteSyncService(() => this.renderEngine, this.assetSync);
    this.tableSync = new TableSyncService(() => this.renderEngine, this.spriteSync);
    this.remoteSync = new RemoteSyncService(this.spriteSync);
  }

  initialize(renderEngine: RenderEngine): void {
    this.renderEngine = renderEngine;
    this.assetSync.init();
    this.spriteSync.init();
    this.tableSync.init();
    this.remoteSync.init();
    logger.debug('WasmSyncCoordinator initialized');
  }

  dispose(): void {
    this.remoteSync.dispose();
    this.tableSync.dispose();
    this.spriteSync.dispose();
    this.assetSync.dispose();
    this.renderEngine = null;
  }

  getRenderEngine(): RenderEngine | null {
    return this.renderEngine;
  }
}
