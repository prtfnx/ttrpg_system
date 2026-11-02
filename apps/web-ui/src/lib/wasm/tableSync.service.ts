/**
 * Table synchronization service.
 * Handles table load/switch/update events and populates sprites via SpriteSyncService.
 */

import { useGameStore } from '@/store';
import { emitProtocolEvent, onProtocolEvent } from '@lib/websocket/protocolEvents';
import { logger } from '@shared/utils/logger';

const DEFAULT_TABLE_BACKGROUND = '#1a1a1a';
import { normalizeTableSnapshot, RENDERER_LAYER_NAMES } from './tableSnapshot';
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
  layer_settings?: Record<string, Record<string, unknown>>;
  dynamic_lighting_enabled?: boolean;
  fog_exploration_mode?: string;
  ambient_light_level?: number;
  grid_cell_px?: number;
  cell_distance?: number;
  distance_unit?: string;
  grid_color_hex?: string;
  background_color_hex?: string;
}

export class TableSyncService {
  private pendingPayload: TablePayload | null = null;
  private latestPayload: TablePayload | null = null;
  private cacheInvalidated = false;
  private freshSnapshotRequested = false;
  private hydratedTableId: string | null = null;
  private readonly retiredTableIds = new Set<string>();
  private readonly tableDerivedLightIds = new Map<string, Set<string>>();
  private eventCleanups: Array<() => void> = [];
  private readonly getEngine: () => RenderEngine | null;
  private readonly spriteSync: SpriteSyncService;
  private readonly onHydrated: (tableId: string, textureIds: readonly string[]) => void;
  private readonly onHydrationError: (error: Error) => void;
  private readonly onDeleted: (tableId: string) => void;

  constructor(
    getEngine: () => RenderEngine | null,
    spriteSync: SpriteSyncService,
    callbacks: {
      onHydrated?: (tableId: string, textureIds: readonly string[]) => void;
      onHydrationError?: (error: Error) => void;
      onDeleted?: (tableId: string) => void;
    } = {},
  ) {
    this.getEngine = getEngine;
    this.spriteSync = spriteSync;
    this.onHydrated = callbacks.onHydrated ?? (() => undefined);
    this.onHydrationError = callbacks.onHydrationError ?? (() => undefined);
    this.onDeleted = callbacks.onDeleted ?? (() => undefined);
  }

  init(): void {
    if (this.eventCleanups.length > 0) return;

    this.eventCleanups.push(
      onProtocolEvent('table-data-received', d => this.handleTableDataReceived((d ?? {}) as TablePayload)),
      onProtocolEvent('table-response', d => this.handleTableDataReceived((d ?? {}) as TablePayload)),
      onProtocolEvent('new-table-response', d => this.handleTableDataReceived((d ?? {}) as TablePayload)),
      onProtocolEvent('table-updated', d => this.handleTableUpdate((d ?? {}) as TablePayload)),
      onProtocolEvent('table-deleted', d => this.handleTableDeletion((d ?? {}) as TablePayload)),
      ...(['sprite-created', 'sprite-updated', 'sprite-removed', 'sprite-response', 'sprite-moved',
        'sprite-scaled', 'sprite-rotated', 'compendium-sprite-added', 'compendium-sprite-updated',
        'compendium-sprite-removed', 'wall-data', 'table-settings-changed'] as const).map(type =>
        onProtocolEvent(type, d => {
          if (d?.table_id === useGameStore.getState().activeTableId) this.cacheInvalidated = true;
        })),
      onProtocolEvent('canvas-canonical-object', d => {
        if (d.kind === 'sprite' && d.tableId === useGameStore.getState().activeTableId) this.cacheInvalidated = true;
      }),
    );
  }

  dispose(): void {
    this.eventCleanups.forEach(fn => fn());
    this.eventCleanups = [];
    this.pendingPayload = null;
    this.latestPayload = null;
    this.cacheInvalidated = false;
    this.freshSnapshotRequested = false;
    this.hydratedTableId = null;
    this.tableDerivedLightIds.clear();
    this.retiredTableIds.clear();
  }

  flushPending(): void {
    if (!this.getEngine()) return;
    if (this.cacheInvalidated) {
      const tableId = useGameStore.getState().activeTableId;
      if (tableId && !this.freshSnapshotRequested) {
        this.freshSnapshotRequested = true;
        this.pendingPayload = null;
        emitProtocolEvent('protocol-send-message', { type: 'table_request', data: { table_id: tableId } });
      }
      return;
    }
    if (!this.pendingPayload || !this.getEngine()) return;
    const payload = this.pendingPayload;
    this.pendingPayload = null;
    this.handleTableDataReceived(payload);
  }

  retainLatestForRenderer(): void {
    this.freshSnapshotRequested = false;
    if (this.latestPayload) this.pendingPayload = this.latestPayload;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private handleTableDataReceived(data: TablePayload): void {
    try {
      const snapshot = normalizeTableSnapshot(data);
      const tableId = snapshot.renderer.table_id;
      if (this.retiredTableIds.has(tableId)) return;
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
      this.cacheInvalidated = false;
      this.freshSnapshotRequested = false;
      if (!engine) {
        this.pendingPayload = data;
        logger.debug('[TableSyncService] Retaining table snapshot until the renderer is attached', { tableId });
        return;
      }

      if (this.hydratedTableId) {
        this.tableDerivedLightIds.get(this.hydratedTableId)?.forEach(lightId => {
          engine.remove_light(lightId);
        });
        engine.clear_fog();
        if (this.hydratedTableId !== tableId) engine.clear_vision_polygons?.();
      }

      this.spriteSync.retainTextSprites(snapshot.specialSprites
        .filter(sprite => sprite.texture_path === '__TEXT__').map(sprite => sprite.sprite_id));
      engine.handle_table_data(snapshot.renderer);
      engine.set_grid_size(snapshot.renderer.grid_cell_px);
      engine.set_grid_enabled(snapshot.renderer.show_grid);
      engine.set_grid_snapping(snapshot.snapToGrid);
      Object.entries(snapshot.layerVisibility).forEach(([layer, visible]) => {
        engine.set_layer_visibility(layer, visible);
      });
      engine.set_background_color(snapshot.backgroundColor ?? DEFAULT_TABLE_BACKGROUND);

      // Unit-backed light metadata must be converted with the incoming table's
      // settings, not whichever table happened to be resident previously.
      gameStore.setTableUnits?.({
        gridCellPx: snapshot.renderer.grid_cell_px,
        cellDistance: snapshot.renderer.cell_distance,
        distanceUnit: snapshot.renderer.distance_unit as import('@/utils/unitConverter').DistanceUnit,
      });

      engine.clear_walls();
      snapshot.walls.forEach(wall => engine.add_wall(JSON.stringify(wall)));
      snapshot.specialSprites.forEach(sprite => {
        this.spriteSync.addSpriteToWasm(
          { ...sprite, x: sprite.coord_x, y: sprite.coord_y, table_id: tableId },
          { authoritativeSnapshot: true },
        );
      });

      const derivedLightIds = new Set<string>();
      snapshot.specialSprites.forEach(sprite => {
        if (sprite.texture_path === '__LIGHT__') derivedLightIds.add(sprite.sprite_id);
      });
      Object.values(snapshot.renderer.layers).forEach(sprites => {
        sprites.forEach(sprite => {
          if (sprite.aura_radius !== undefined || sprite.aura_radius_units !== undefined) {
            derivedLightIds.add(`token_light_${sprite.sprite_id}`);
          }
        });
      });
      this.tableDerivedLightIds.set(tableId, derivedLightIds);
      this.hydratedTableId = tableId;

      const tableData = data.table_data ?? data;
      const layerSettings = data.layer_settings ?? {};
      Object.entries(layerSettings).forEach(([layer, settings]) => {
        if (typeof settings.visible === 'boolean') engine.set_layer_visibility(layer, settings.visible);
        if (typeof settings.opacity === 'number') engine.set_layer_opacity(layer, settings.opacity);
        if (Array.isArray(settings.color) && settings.color.length >= 4) {
          engine.set_layer_color(layer, Number(settings.color[0]), Number(settings.color[1]), Number(settings.color[2]));
        }
        if (typeof settings.blend_mode === 'string') engine.set_layer_blend_mode(layer, settings.blend_mode);
      });
      gameStore.hydrateTableSprites?.(tableId, snapshot.storeSprites);
      useGameStore.setState({ walls: snapshot.walls });
      gameStore.applyTableLightingSettings?.({
        dynamic_lighting_enabled: tableData.dynamic_lighting_enabled ?? false,
        fog_exploration_mode: tableData.fog_exploration_mode ?? 'current_only',
        ambient_light_level: tableData.ambient_light_level ?? 1,
      });
      gameStore.setGridEnabled?.(snapshot.renderer.show_grid);
      gameStore.setGridSnapping?.(snapshot.snapToGrid);
      if (tableData.grid_color_hex) gameStore.setGridColorHex?.(tableData.grid_color_hex);
      gameStore.setBackgroundColorHex?.(snapshot.backgroundColor ?? DEFAULT_TABLE_BACKGROUND);
      Object.entries(layerSettings).forEach(([layer, settings]) => {
        if (typeof settings.visible === 'boolean') gameStore.setLayerVisibility?.(layer, settings.visible);
        if (typeof settings.opacity === 'number') gameStore.setLayerOpacity?.(layer, settings.opacity);
      });
      if (useGameStore.getState().activeTableId !== tableId) gameStore.setActiveTableId?.(tableId);
      this.latestPayload = data;
      const textureIds = [...new Set(
        Object.values(snapshot.renderer.layers)
          .flatMap(sprites => sprites.map(sprite => sprite.texture_path))
          .filter(Boolean),
      )];
      this.onHydrated(tableId, textureIds);
      const spriteCount = Object.values(snapshot.renderer.layers).reduce((count, sprites) => count + sprites.length, snapshot.specialSprites.length);
      emitWasmEvent('table-sprites-loaded', { table_id: tableId, count: spriteCount });

    } catch (err) {
      logger.error('[TableSyncService] handleTableDataReceived failed:', err);
      this.onHydrationError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private handleTableUpdate(data: TablePayload): void {
    if (data.operation === 'delete') {
      this.handleTableDeletion(data);
      return;
    }
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

  private handleTableDeletion(data: TablePayload): void {
    const tableId = data.table_id;
    if (!tableId) return;
    this.retiredTableIds.add(tableId);
    const payloadId = (payload: TablePayload | null) => (payload?.table_data ?? payload)?.table_id;
    if (payloadId(this.pendingPayload) === tableId) this.pendingPayload = null;
    if (payloadId(this.latestPayload) === tableId) this.latestPayload = null;
    if (this.hydratedTableId === tableId) {
      this.hydratedTableId = null;
      this.cacheInvalidated = false;
      this.freshSnapshotRequested = false;
      const engine = this.getEngine();
      if (engine) {
        engine.cancel_current_operation();
        engine.clear_selection();
        engine.selection_clear_frame();
        engine.paint_clear_object_selection();
        engine.paint_clear_drafts();
        engine.paint_replace_object_snapshot(tableId, engine.paint_object_revision(), '[]');
        RENDERER_LAYER_NAMES.forEach(layer => engine.clear_layer(layer));
        this.tableDerivedLightIds.get(tableId)?.forEach(lightId => engine.remove_light(lightId));
        engine.clear_walls();
        engine.clear_fog();
        engine.clear_vision_polygons?.();
        engine.set_grid_enabled(false);
      }
      this.spriteSync.retainTextSprites([]);
    }
    this.tableDerivedLightIds.delete(tableId);
    this.onDeleted(tableId);
  }

}
