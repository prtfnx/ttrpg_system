/**
 * Table synchronization service.
 * Handles table load/switch/update events and populates sprites via SpriteSyncService.
 */

import { useGameStore } from '@/store';
import { onProtocolEvent } from '@lib/websocket/protocolEvents';
import { logger } from '@shared/utils/logger';
import { emitWasmEvent } from './wasmEvents';
import type { RenderEngine } from './runtime';
import type { SpriteSyncService } from './spriteSync.service';

const CLEARABLE_TABLE_LAYERS = [
  'background',
  'map',
  'tokens',
  'objects',
  'foreground',
  'dungeon_master',
  'light',
  'height',
  'obstacles',
  'fog_of_war',
] as const;

interface TablePayload {
  [key: string]: unknown;
  table_id?: string;
  table_name?: string;
  name?: string;
  width?: number;
  height?: number;
  scale?: number;
  x_moved?: number;
  y_moved?: number;
  grid_enabled?: boolean;
  grid_size?: number;
  grid_snapping?: boolean;
  layers?: Record<string, unknown>;
  sprites?: unknown[];
  background_image?: string;
  table_data?: TablePayload;
}

export class TableSyncService {
  private eventCleanups: Array<() => void> = [];
  private readonly getEngine: () => RenderEngine | null;
  private readonly spriteSync: SpriteSyncService;

  constructor(
    getEngine: () => RenderEngine | null,
    spriteSync: SpriteSyncService,
  ) {
    this.getEngine = getEngine;
    this.spriteSync = spriteSync;
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
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private handleTableDataReceived(data: TablePayload): void {
    const engine = this.getEngine();
    if (!engine) return;

    try {
      const tableData = data.table_data || data;
      const tableId = tableData.table_id?.trim();
      if (!tableId) {
        logger.warn('[TableSyncService] Ignoring table data without an authoritative table_id');
        return;
      }

      // Sync UUID from server to React store when server returns authoritative ID
      const tableName = tableData.table_name;
      const isUUID = tableId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
      if (isUUID && tableName) {
        const gameStore = useGameStore?.getState();
        if (gameStore) {
          const current = gameStore.tables || [];
          const existing = current.find((t) => t.table_name === tableName || t.table_id === tableName || t.table_id === tableId);
          if (existing && existing.table_id !== tableId) {
            const updated = current.map((t) =>
              (t.table_name === tableName || t.table_id === tableName || t.table_id === tableId) ? { ...t, table_id: tableId } : t
            );
            gameStore.setTables?.(updated);
            if (gameStore.activeTableId === tableName || gameStore.activeTableId === existing.table_id) {
              gameStore.switchToTable?.(tableId);
            }
          }
        }
      }

      // Push table data to WASM
      const formattedLayers: Record<string, unknown[]> = {};
      if (tableData.layers && typeof tableData.layers === 'object') {
        const layers = tableData.layers;
        Object.keys(layers).forEach(name => {
          formattedLayers[name] = Array.isArray(layers[name]) ? layers[name] : [];
        });
      }
      if (Object.keys(formattedLayers).length === 0) {
        formattedLayers['background'] = [];
        formattedLayers['tokens'] = [];
        formattedLayers['objects'] = [];
        formattedLayers['foreground'] = [];
      }
      engine.handle_table_data({
        table_id: tableId,
        table_name: tableData.table_name || tableData.name || tableId,
        name: tableData.table_name || tableData.name || tableId,
        width: tableData.width || 20, height: tableData.height || 20,
        scale: tableData.scale || 1.0,
        x_moved: tableData.x_moved || 0, y_moved: tableData.y_moved || 0,
        show_grid: tableData.grid_enabled ?? true,
        cell_side: tableData.grid_size || 50,
        layers: formattedLayers,
      });
      try { useGameStore.getState().setActiveTableId?.(tableId); } catch { /* non-critical */ }

      // Grid config
      if (tableData.grid_size) engine.set_grid_size(tableData.grid_size);
      if (typeof tableData.grid_enabled === 'boolean') engine.set_grid_enabled(tableData.grid_enabled);
      if (typeof tableData.grid_snapping === 'boolean') engine.set_grid_snapping(tableData.grid_snapping);

      // Load sprites from layer structure
      if (tableData.layers) {
        CLEARABLE_TABLE_LAYERS.forEach(layerName => engine.clear_layer(layerName));
        Object.entries(tableData.layers as Record<string, unknown>).forEach(([layerName, layerData]) => {
          if (Array.isArray(layerData)) {
            layerData.forEach((sprite: Record<string, unknown>) => {
              this.spriteSync.addSpriteToWasm({ ...sprite, layer: layerName, table_id: tableId });
            });
          } else if (layerData && typeof layerData === 'object') {
            const ld = layerData as Record<string, unknown>;
            const sprites = ld['sprites'] ?? Object.values(ld);
            (Array.isArray(sprites) ? sprites : []).forEach((s: unknown) => {
              if (!s || typeof s !== 'object') return;
              const sprite = s as Record<string, unknown>;
              if (!sprite['sprite_id'] && !sprite['id']) return;
              this.spriteSync.addSpriteToWasm({ ...sprite, layer: layerName, table_id: tableId });
            });
          }
        });
      }

      // Fallback flat array
      if (data.sprites && Array.isArray(data.sprites)) {
        data.sprites.forEach((sprite: unknown) => {
          if (!sprite || typeof sprite !== 'object') return;
          this.spriteSync.addSpriteToWasm({ ...(sprite as Record<string, unknown>), table_id: tableId });
        });
      }

      if (tableData.background_image) this.loadBackgroundImage(engine, tableData.background_image, tableId);

      // Emit completion so thumbnail service can generate
      let spriteCount = 0;
      Object.values(tableData.layers ?? {}).forEach((ld: unknown) => {
        spriteCount += Array.isArray(ld) ? ld.length : ld && typeof ld === 'object' ? Object.keys(ld).length : 0;
      });
      emitWasmEvent('table-sprites-loaded', { table_id: tableId, count: spriteCount });

    } catch (err) {
      logger.error('[TableSyncService] handleTableDataReceived failed:', err);
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

  private loadBackgroundImage(engine: RenderEngine, imagePath: string, tableId: string): void {
    try {
      engine.add_sprite_to_layer('background', {
        id: `background_${Date.now()}`,
        world_x: 0, world_y: 0,
        width: 1920, height: 1080,
        scale_x: 1.0, scale_y: 1.0, rotation: 0.0,
        layer: 'background', texture_id: imagePath,
        tint_color: [1.0, 1.0, 1.0, 1.0],
        table_id: tableId,
      });
    } catch (err) {
      logger.error('[TableSyncService] loadBackgroundImage failed:', err);
    }
  }
}
