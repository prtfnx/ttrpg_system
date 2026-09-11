/**
 * Runtime-owned WASM sync coordinator.
 * Wires AssetSyncService, SpriteSyncService, TableSyncService, and RemoteSyncService
 * together around the RenderEngine owned by a WasmRuntime instance.
 */

import { AssetSyncService, type AssetDownloadResolver } from '../assetSync.service';
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

  constructor(
    resolveDownloadedAsset: AssetDownloadResolver,
    callbacks: {
      onTableHydrated?: (tableId: string) => void;
      onTableHydrationError?: (error: Error) => void;
    } = {},
  ) {
    this.assetSync = new AssetSyncService(() => this.renderEngine, resolveDownloadedAsset);
    this.spriteSync = new SpriteSyncService(() => this.renderEngine, this.assetSync);
    this.tableSync = new TableSyncService(() => this.renderEngine, this.spriteSync, {
      onHydrated: callbacks.onTableHydrated,
      onHydrationError: callbacks.onTableHydrationError,
    });
    this.remoteSync = new RemoteSyncService(this.spriteSync);
  }

  start(): void {
    // Table responses can arrive before the canvas mounts. Listen as soon as
    // the committed provider starts and retain the latest validated snapshot.
    this.tableSync.init();
  }

  initialize(renderEngine: RenderEngine): void {
    this.start();
    this.renderEngine = renderEngine;
    this.assetSync.init();
    this.spriteSync.init();
    this.remoteSync.init();
    this.tableSync.flushPending();
    logger.debug('WasmSyncCoordinator initialized');
  }

  detachRenderer(): void {
    this.remoteSync.dispose();
    this.spriteSync.dispose();
    this.assetSync.dispose();
    this.tableSync.retainLatestForRenderer();
    this.renderEngine = null;
  }

  dispose(): void {
    this.detachRenderer();
    this.tableSync.dispose();
  }

  getRenderEngine(): RenderEngine | null {
    return this.renderEngine;
  }
}
