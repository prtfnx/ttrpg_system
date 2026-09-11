/**
 * Table synchronization service.
 * Handles table load/switch/update events and populates sprites via SpriteSyncService.
 */

import { useGameStore } from '@/store';
import { onProtocolEvent } from '@lib/websocket/protocolEvents';
import { logger } from '@shared/utils/logger';
import { normalizeTableSnapshot } from './tableSnapshot';
import { emitWasmEvent } from './wasmEvents';
import type { RenderEngine } from './runtime';
import type { SpriteSyncService } from './spriteSync.service';

interface TablePayload {
  [key: string]: unknown;
  table_id?: string;
  table_name?: string;
  name?: string;
  width?: number;
  height?: number;
  scale?: unknown;
  x_moved?: number;
  y_moved?: number;
  grid_enabled?: boolean;
  grid_size?: number;
  grid_snapping?: boolean;
  layers?: Record<string, unknown>;
  sprites?: unknown[];
  background_image?: string;
  table_data?: TablePayload;
  local_table_id?: string;
}

export class TableSyncService {
  private pendingPayload: TablePayload | null = null;
  private latestPayload: TablePayload | null = null;
  private eventCleanups: Array<() => void> = [];
  private readonly getEngine: () => RenderEngine | null;
  private readonly spriteSync: SpriteSyncService;
  private readonly onHydrated: (tableId: string) => void;
  private readonly onHydrationError: (error: Error) => void;

  constructor(
    getEngine: () => RenderEngine | null,
    spriteSync: SpriteSyncService,
    callbacks: {
      onHydrated?: (tableId: string) => void;
      onHydrationError?: (error: Error) => void;
    } = {},
  ) {
    this.getEngine = getEngine;
    this.spriteSync = spriteSync;
    this.onHydrated = callbacks.onHydrated ?? (() => undefined);
    this.onHydrationError = callbacks.onHydrationError ?? (() => undefined);
  }

  init(): void {
    if (this.eventCleanups.length > 0) return;

    this.eventCleanups.push(
      onProtocolEvent('table-data-received', d => this.handleTableDataReceived((d ?? {}) as TablePayload)),
      onProtocolEvent('table-response', d => this.handleTableDataReceived((d ?? {}) as TablePayload)),
      onProtocolEvent('new-table-response', d => this.handleTableDataReceived((d ?? {}) as TablePayload)),
      onProtocolEvent('table-updated', d => this.handleTableUpdate((d ?? {}) as TablePayload)),
    );
  }

  dispose(): void {
    this.eventCleanups.forEach(fn => fn());
    this.eventCleanups = [];
    this.pendingPayload = null;
    this.latestPayload = null;
  }

  flushPending(): void {
    if (!this.pendingPayload || !this.getEngine()) return;
    const payload = this.pendingPayload;
    this.pendingPayload = null;
    this.handleTableDataReceived(payload);
  }

  retainLatestForRenderer(): void {
    if (this.latestPayload) this.pendingPayload = this.latestPayload;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private handleTableDataReceived(data: TablePayload): void {
    try {
      const snapshot = normalizeTableSnapshot(data);
      const tableId = snapshot.renderer.table_id;
      const gameStore = useGameStore.getState();
      const localTableId = data.local_table_id?.trim();

      if (localTableId) {
        const localTable = gameStore.tables.find(table => table.table_id === localTableId);
        if (localTable) {
          gameStore.reconcileTableIdentity?.(localTableId, {
            table_id: tableId,
            table_name: snapshot.renderer.table_name,
            width: snapshot.renderer.width,
            height: snapshot.renderer.height,
          });
        }
      }

      const requestedTableId = useGameStore.getState().activeTableId;
      if (requestedTableId && requestedTableId !== tableId && requestedTableId !== localTableId) {
        logger.debug('[TableSyncService] Ignoring stale table snapshot', { tableId, requestedTableId });
        return;
      }

      const engine = this.getEngine();
      if (!engine) {
        this.pendingPayload = data;
        logger.debug('[TableSyncService] Retaining table snapshot until the renderer is attached', { tableId });
        return;
      }

      engine.handle_table_data(snapshot.renderer);
      engine.set_grid_size(snapshot.renderer.grid_cell_px);
      engine.set_grid_enabled(snapshot.renderer.show_grid);
      engine.set_grid_snapping(snapshot.snapToGrid);
      Object.entries(snapshot.layerVisibility).forEach(([layer, visible]) => {
        engine.set_layer_visibility(layer, visible);
      });
      if (snapshot.backgroundColor) engine.set_background_color(snapshot.backgroundColor);

      engine.clear_walls();
      snapshot.walls.forEach(wall => engine.add_wall(JSON.stringify(wall)));
      snapshot.specialSprites.forEach(sprite => {
        this.spriteSync.addSpriteToWasm({ ...sprite, obstacle_data: undefined, table_id: tableId });
      });

      gameStore.hydrateTableSprites?.(tableId, snapshot.storeSprites);
      gameStore.setActiveTableId?.(tableId);
      this.latestPayload = data;
      this.onHydrated(tableId);
      const spriteCount = Object.values(snapshot.renderer.layers).reduce((count, sprites) => count + sprites.length, snapshot.specialSprites.length);
      emitWasmEvent('table-sprites-loaded', { table_id: tableId, count: spriteCount });

    } catch (err) {
      logger.error('[TableSyncService] handleTableDataReceived failed:', err);
      this.onHydrationError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private handleTableUpdate(data: TablePayload): void {
    const engine = this.getEngine();
    if (!engine) return;
    try {
      const update = data.data && typeof data.data === 'object'
        ? data.data as TablePayload
        : data;
      if (update.grid_size) engine.set_grid_size(update.grid_size);
      if (typeof update.grid_enabled === 'boolean') engine.set_grid_enabled(update.grid_enabled);
      if (typeof update.grid_snapping === 'boolean') engine.set_grid_snapping(update.grid_snapping);
    } catch (err) {
      logger.error('[TableSyncService] handleTableUpdate failed:', err);
    }
  }

}
