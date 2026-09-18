/**
 * Table synchronization service.
 * Handles table load/switch/update events and populates sprites via SpriteSyncService.
 */

import { useGameStore } from '@/store';
import { onProtocolEvent } from '@lib/websocket/protocolEvents';
import { logger } from '@shared/utils/logger';

const DEFAULT_TABLE_BACKGROUND = '#1a1a1a';
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
  layer_settings?: Record<string, Record<string, unknown>>;
  paint_strokes?: Array<{ stroke_id?: string; stroke_data?: string }>;
  dynamic_lighting_enabled?: boolean;
  fog_exploration_mode?: string;
  ambient_light_level?: number;
  grid_cell_px?: number;
  cell_distance?: number;
  distance_unit?: string;
  grid_color_hex?: string;
  background_color_hex?: string;
}

function parsePaintStrokes(strokes: TablePayload['paint_strokes']): Record<string, unknown>[] {
  if (!Array.isArray(strokes)) return [];
  return strokes.flatMap(stroke => {
    if (typeof stroke.stroke_data !== 'string') return [];
    try {
      const parsed: unknown = JSON.parse(stroke.stroke_data);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? [parsed as Record<string, unknown>]
        : [];
    } catch {
      return [];
    }
  });
}

export class TableSyncService {
  private pendingPayload: TablePayload | null = null;
  private latestPayload: TablePayload | null = null;
  private hydratedTableId: string | null = null;
  private readonly tableDerivedLightIds = new Map<string, Set<string>>();
  private eventCleanups: Array<() => void> = [];
  private readonly getEngine: () => RenderEngine | null;
  private readonly spriteSync: SpriteSyncService;
  private readonly onHydrated: (tableId: string, textureIds: readonly string[]) => void;
  private readonly onHydrationError: (error: Error) => void;

  constructor(
    getEngine: () => RenderEngine | null,
    spriteSync: SpriteSyncService,
    callbacks: {
      onHydrated?: (tableId: string, textureIds: readonly string[]) => void;
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
    this.hydratedTableId = null;
    this.tableDerivedLightIds.clear();
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

      if (this.hydratedTableId) {
        this.tableDerivedLightIds.get(this.hydratedTableId)?.forEach(lightId => {
          engine.remove_light(lightId);
        });
        engine.clear_fog();
        if (this.hydratedTableId !== tableId) engine.clear_vision_polygons?.();
      }

      engine.handle_table_data(snapshot.renderer);
      engine.set_grid_size(snapshot.renderer.grid_cell_px);
      engine.set_grid_enabled(snapshot.renderer.show_grid);
      engine.set_grid_snapping(snapshot.snapToGrid);
      Object.entries(snapshot.layerVisibility).forEach(([layer, visible]) => {
        engine.set_layer_visibility(layer, visible);
      });
      engine.set_background_color(snapshot.backgroundColor ?? DEFAULT_TABLE_BACKGROUND);

      engine.clear_walls();
      snapshot.walls.forEach(wall => engine.add_wall(JSON.stringify(wall)));
      snapshot.specialSprites.forEach(sprite => {
        this.spriteSync.addSpriteToWasm(
          { ...sprite, obstacle_data: undefined, table_id: tableId },
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
      engine.paint_set_current_table(tableId);
      engine.paint_load_strokes(JSON.stringify(parsePaintStrokes(data.paint_strokes)));

      gameStore.hydrateTableSprites?.(tableId, snapshot.storeSprites);
      useGameStore.setState({ walls: snapshot.walls });
      gameStore.applyTableLightingSettings?.({
        dynamic_lighting_enabled: tableData.dynamic_lighting_enabled ?? false,
        fog_exploration_mode: tableData.fog_exploration_mode ?? 'current_only',
        ambient_light_level: tableData.ambient_light_level ?? 1,
      });
      gameStore.setTableUnits?.({
        gridCellPx: snapshot.renderer.grid_cell_px,
        cellDistance: snapshot.renderer.cell_distance,
        distanceUnit: snapshot.renderer.distance_unit as import('@/utils/unitConverter').DistanceUnit,
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
