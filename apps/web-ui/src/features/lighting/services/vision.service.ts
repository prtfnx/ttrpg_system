import { useGameStore } from '@/store';
import { getCurrentWasmRuntime } from '@lib/wasm/runtime';
import type { RenderEngine, WasmRuntimePort } from '@lib/wasm/runtime';

function getRuntime(): WasmRuntimePort | null {
  return getCurrentWasmRuntime();
}

function getRm(): RenderEngine | undefined {
  return getRuntime()?.getRenderEngine() ?? undefined;
}

interface SpriteData {
  id: string;
  tableId?: string;
  table_id?: string;
  layer?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  scale_x?: number;
  scale_y?: number;
  scale?: { x?: number; y?: number };
  rotation?: number;
  obstacle_type?: string;
  obstacleType?: string;
  polygon_vertices?: number[][];
  metadata?: string | Record<string, unknown>;
  controlledBy?: Array<string | number>;
  controlled_by?: Array<string | number>;
  visionRadiusUnits?: number;
  vision_radius_units?: number;
  visionRadius?: number;
  vision_radius?: number;
  hasDarkvision?: boolean;
  has_darkvision?: boolean;
  darkvisionRadiusUnits?: number;
  darkvision_radius_units?: number;
  darkvisionRadius?: number;
  darkvision_radius?: number;
  race_darkvision?: number;
  characterData?: { race?: { darkvision?: number } };
}

interface LightMeta {
  isOn?: boolean;
  radius?: number;
  radius_units?: number;
}

interface VisionPoint {
  x: number;
  y: number;
}

interface PendingVisibility {
  id: string;
  cacheId: string;
  x: number;
  y: number;
  radius: number;
  positionKey: string;
  sourceId?: string;
  moved?: boolean;
}

const MAX_EXPLORED_POLYGONS_PER_SOURCE = 128;

class VisionService {
  private unsubscribe: (() => void) | null = null;
  private activeIds = new Set<string>();
  private exploredIds = new Set<string>();
  private exploredIdsBySource = new Map<string, string[]>();
  private exploredSequence = new Map<string, number>();
  private lastVisionPolygons = new Map<string, VisionPoint[]>();
  private lastPositions = new Map<string, string>();
  private lastOcclusionRevision: number | null = null;
  private lastRenderEngine: RenderEngine | null = null;
  private isRunning = false;
  private dmPreviewUserId: number | null = null;
  private recomputeFrameId: number | null = null;
  private renderRetryId: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    if (this.isRunning) return;

    const state = useGameStore.getState();

    if (!state.dynamicLightingEnabled) {
      const unsub = useGameStore.subscribe((s) => {
        if (s.dynamicLightingEnabled) {
          unsub();
          this.start();
        }
      });
      this.unsubscribe = unsub;
      return;
    }

    const rm = getRm();
    if (!rm) {
      if (this.renderRetryId) return;
      this.renderRetryId = setTimeout(() => {
        this.renderRetryId = null;
        this.start();
      }, 100);
      return;
    }

    rm.set_dynamic_lighting_enabled(true);
    this.isRunning = true;
    this.recompute();

    let prevSprites = state.sprites;
    let prevWalls = state.walls;
    let prevUnits = `${state.gridCellPx}:${state.cellDistance}:${state.distanceUnit}`;
    let prevLighting: boolean = state.dynamicLightingEnabled;
    let prevFogMode = state.fogExplorationMode;
    let prevActiveTableId = state.activeTableId;

    this.unsubscribe = useGameStore.subscribe((s) => {
      if (!s.dynamicLightingEnabled && prevLighting) {
        prevLighting = false;
        this.stop();
        // Keep a lightweight subscription armed so a later table-settings
        // update can restart vision without requiring a role/component change.
        this.start();
        return;
      }
      prevLighting = s.dynamicLightingEnabled;

      if (s.activeTableId !== prevActiveTableId) {
        prevActiveTableId = s.activeTableId;
        this.resetVisionState();
        this.scheduleRecompute();
      }

      if (s.sprites !== prevSprites) {
        prevSprites = s.sprites;
        this.scheduleRecompute();
      }

      if (s.walls !== prevWalls) {
        prevWalls = s.walls;
        this.scheduleRecompute();
      }

      const units = `${s.gridCellPx}:${s.cellDistance}:${s.distanceUnit}`;
      if (units !== prevUnits) {
        prevUnits = units;
        this.scheduleRecompute();
      }

      if (s.fogExplorationMode !== prevFogMode) {
        if (s.fogExplorationMode !== 'persist_dimmed') this.clearExploredPolygons();
        prevFogMode = s.fogExplorationMode;
        this.scheduleRecompute();
      }
    });
  }

  private clearExploredPolygons(): void {
    const rm = getRm();
    for (const id of this.exploredIds) {
      rm?.remove_fog_polygon(id);
    }
    this.exploredIds.clear();
    this.exploredIdsBySource.clear();
    this.exploredSequence.clear();
    this.lastVisionPolygons.clear();
  }

  private resetVisionState(): void {
    const rm = getRm();
    if (rm?.clear_vision_polygons) {
      rm.clear_vision_polygons();
    } else {
      for (const id of this.activeIds) rm?.remove_fog_polygon(id);
      for (const id of this.exploredIds) rm?.remove_fog_polygon(id);
    }
    this.activeIds.clear();
    this.exploredIds.clear();
    this.exploredIdsBySource.clear();
    this.exploredSequence.clear();
    this.lastVisionPolygons.clear();
    this.lastPositions.clear();
    this.lastOcclusionRevision = null;
  }

  stop(): void {
    if (this.recomputeFrameId !== null) {
      cancelAnimationFrame(this.recomputeFrameId);
      this.recomputeFrameId = null;
    }
    if (this.renderRetryId) {
      clearTimeout(this.renderRetryId);
      this.renderRetryId = null;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.isRunning = false;
    this.dmPreviewUserId = null;

    const rm = getRm();
    this.resetVisionState();
    this.lastRenderEngine = null;
    rm?.set_dynamic_lighting_enabled(false);
  }

  startDmPreview(userId: number): void {
    this.stop();
    this.dmPreviewUserId = userId;

    const rm = getRm();
    if (!rm) return;

    rm.set_gm_mode(false);
    rm.set_dynamic_lighting_enabled(true);
    this.isRunning = true;
    this.recompute();

    let prevSprites = useGameStore.getState().sprites;
    let prevWalls = useGameStore.getState().walls;
    let prevUnits = this.unitSettingsKey();
    let prevActiveTableId = useGameStore.getState().activeTableId;
    this.unsubscribe = useGameStore.subscribe((s) => {
      if (s.activeTableId !== prevActiveTableId) {
        prevActiveTableId = s.activeTableId;
        this.resetVisionState();
        this.scheduleRecompute();
      }
      if (s.sprites !== prevSprites) {
        prevSprites = s.sprites;
        this.scheduleRecompute();
      }
      if (s.walls !== prevWalls) {
        prevWalls = s.walls;
        this.scheduleRecompute();
      }
      const units = `${s.gridCellPx}:${s.cellDistance}:${s.distanceUnit}`;
      if (units !== prevUnits) {
        prevUnits = units;
        this.scheduleRecompute();
      }
    });
  }

  stopDmPreview(): void {
    this.stop();
    const rm = getRm();
    rm?.set_gm_mode(true);
    rm?.set_dynamic_lighting_enabled(false);
  }

  private scheduleRecompute(): void {
    if (this.recomputeFrameId !== null) return;
    this.recomputeFrameId = requestAnimationFrame(() => {
      this.recomputeFrameId = null;
      if (!this.isRunning) return;
      this.recompute();
    });
  }

  private recompute(): void {
    const rm = getRm();
    if (!rm) return;
    const runtime = getRuntime();
    if (!runtime) return;

    if (rm !== this.lastRenderEngine) {
      this.resetVisionState();
      this.lastRenderEngine = rm;
    }
    const occlusionRevision = runtime.getOcclusionRevision();
    const obstaclesChanged = occlusionRevision !== this.lastOcclusionRevision;
    const { fogExplorationMode } = useGameStore.getState();
    const persistExplored = fogExplorationMode === 'persist_dimmed';
    if (!persistExplored && this.exploredIds.size > 0) this.clearExploredPolygons();
    const sources = this.getVisionSources();
    const seenIds = new Set<string>();
    const pendingSight: PendingVisibility[] = [];

    for (const src of sources) {
      const id = `vision_${src.id}`;
      const posKey = `${src.x.toFixed(1)},${src.y.toFixed(1)},${src.radius}`;
      const moved = this.lastPositions.get(src.id) !== posKey;
      const missing = !this.activeIds.has(id);

      if (moved || obstaclesChanged || missing) {
        pendingSight.push({
          id,
          cacheId: src.id,
          sourceId: src.id,
          x: src.x,
          y: src.y,
          radius: src.radius,
          positionKey: posKey,
          moved,
        });
      }
      seenIds.add(id);
      this.activeIds.add(id);

      if (src.darkvisionRadius) {
        const dvId = `darkvision_${src.id}`;
        const dvPosKey = `${src.x.toFixed(1)},${src.y.toFixed(1)},dv${src.darkvisionRadius}`;
        const dvMoved = this.lastPositions.get(dvId) !== dvPosKey;
        const dvMissing = !this.activeIds.has(dvId);

        if (dvMoved || obstaclesChanged || dvMissing) {
          pendingSight.push({
            id: dvId,
            cacheId: dvId,
            x: src.x,
            y: src.y,
            radius: src.darkvisionRadius,
            positionKey: dvPosKey,
          });
        }
        seenIds.add(dvId);
        this.activeIds.add(dvId);
      }
    }

    this.applyVisibilityBatch(runtime, rm, pendingSight, 'sight', persistExplored);

    // Also reveal areas illuminated by active lights (vision union light)
    const currentState = useGameStore.getState();
    const allSprites = (currentState.sprites || []) as SpriteData[];
    const pendingLights: PendingVisibility[] = [];
    for (const ls of allSprites) {
      if ((ls.tableId ?? ls.table_id) !== currentState.activeTableId) continue;
      if (ls.layer !== 'light') continue;
      let meta: LightMeta = {};
      try {
        const parsed: unknown = typeof ls.metadata === 'string' ? JSON.parse(ls.metadata) : ls.metadata;
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          meta = parsed as LightMeta;
        }
      } catch {}
      if (meta.isOn === false) continue;
      // Prefer game units so table unit/grid changes rescale light visibility;
      // fall back to the legacy pixel radius.
      const defaultLightRadius = useGameStore.getState().getUnitConverter().toPixels(20);
      const lightRadius = typeof meta.radius_units === 'number' && Number.isFinite(meta.radius_units)
        && meta.radius_units > 0
        ? useGameStore.getState().getUnitConverter().toPixels(meta.radius_units)
        : typeof meta.radius === 'number' && Number.isFinite(meta.radius) && meta.radius > 0
          ? meta.radius
          : defaultLightRadius;
      const lightFogId = `fog_light_${ls.id}`;
      const lx = typeof ls.x === 'number' && Number.isFinite(ls.x) ? ls.x : 0;
      const ly = typeof ls.y === 'number' && Number.isFinite(ls.y) ? ls.y : 0;
      const lightPosKey = `${lx.toFixed(1)},${ly.toFixed(1)},${lightRadius}`;
      const lightMoved = this.lastPositions.get(lightFogId) !== lightPosKey;
      const lightMissing = !this.activeIds.has(lightFogId);
      if (lightMoved || obstaclesChanged || lightMissing) {
        pendingLights.push({
          id: lightFogId,
          cacheId: lightFogId,
          x: lx,
          y: ly,
          radius: lightRadius,
          positionKey: lightPosKey,
        });
      }
      seenIds.add(lightFogId);
      this.activeIds.add(lightFogId);
    }

    this.applyVisibilityBatch(runtime, rm, pendingLights, 'light', false);

    for (const id of [...this.activeIds]) {
      if (!seenIds.has(id)) {
        rm.remove_fog_polygon(id);
        this.activeIds.delete(id);
        this.lastPositions.delete(id);
        if (id.startsWith('vision_')) {
          const sourceId = id.slice('vision_'.length);
          this.lastPositions.delete(sourceId);
          this.lastVisionPolygons.delete(sourceId);
        }
      }
    }

    this.lastOcclusionRevision = occlusionRevision;
  }

  private applyVisibilityBatch(
    runtime: WasmRuntimePort,
    rm: RenderEngine,
    pending: PendingVisibility[],
    index: 'sight' | 'light',
    persistExplored: boolean,
  ): void {
    if (pending.length === 0) return;
    const sources = new Float32Array(pending.length * 3);
    for (let index = 0; index < pending.length; index += 1) {
      const request = pending[index];
      const offset = index * 3;
      sources[offset] = request.x;
      sources[offset + 1] = request.y;
      sources[offset + 2] = request.radius;
    }
    const polygons = index === 'sight'
      ? runtime.computeSightVisibilityPolygons(sources)
      : runtime.computeLightVisibilityPolygons(sources);

    pending.forEach((request, index) => {
      const polygon = [{ x: request.x, y: request.y }, ...(polygons[index] ?? [])];
      if (request.sourceId) {
        const previousPolygon = this.lastVisionPolygons.get(request.sourceId);
        if (persistExplored && request.moved && previousPolygon) {
          this.addExploredPolygon(request.sourceId, previousPolygon, rm);
        }
        this.lastVisionPolygons.set(request.sourceId, polygon);
      }
      rm.add_fog_polygon(request.id, polygon);
      this.lastPositions.set(request.cacheId, request.positionKey);
    });
  }

  private addExploredPolygon(sourceId: string, polygon: VisionPoint[], rm: RenderEngine): void {
    const sequence = (this.exploredSequence.get(sourceId) ?? 0) + 1;
    this.exploredSequence.set(sourceId, sequence);
    const exploredId = `explored_${sourceId}_${sequence}`;
    rm.add_fog_polygon(exploredId, polygon);
    this.exploredIds.add(exploredId);

    const sourceIds = this.exploredIdsBySource.get(sourceId) ?? [];
    sourceIds.push(exploredId);
    while (sourceIds.length > MAX_EXPLORED_POLYGONS_PER_SOURCE) {
      const expiredId = sourceIds.shift();
      if (!expiredId) break;
      rm.remove_fog_polygon(expiredId);
      this.exploredIds.delete(expiredId);
    }
    this.exploredIdsBySource.set(sourceId, sourceIds);
  }

  private getVisionSources(): { id: string; x: number; y: number; radius: number; darkvisionRadius?: number }[] {
    const { sprites, userId, dynamicLightingEnabled, gridCellPx, activeTableId } = useGameStore.getState();
    if (!dynamicLightingEnabled && this.dmPreviewUserId == null) return [];
    const cellPx = gridCellPx ?? 50;

    const targetUserId = this.dmPreviewUserId ?? userId;
    const converter = useGameStore.getState().getUnitConverter();
    const out: { id: string; x: number; y: number; radius: number; darkvisionRadius?: number }[] = [];

    for (const s of (sprites || []) as SpriteData[]) {
      if ((s.tableId ?? s.table_id) !== activeTableId) continue;
      const controlled = (s.controlledBy ?? s.controlled_by ?? []).map(String);
      if (controlled.length === 0) continue;
      if (targetUserId != null && !controlled.includes(String(targetUserId))) continue;

      // Prefer game-unit fields, convert to pixels; fall back to legacy pixel fields
      let radiusPx: number;
      if (s.visionRadiusUnits != null || s.vision_radius_units != null) {
        radiusPx = converter.toPixels((s.visionRadiusUnits ?? s.vision_radius_units) ?? 0);
      } else {
        radiusPx = s.visionRadius ?? s.vision_radius ?? 0;
      }
      if (radiusPx <= 0) continue;

      const hasDv = s.hasDarkvision || s.has_darkvision;
      let dvRadiusPx = 0;
      if (hasDv) {
        if (s.darkvisionRadiusUnits != null || s.darkvision_radius_units != null) {
          dvRadiusPx = converter.toPixels((s.darkvisionRadiusUnits ?? s.darkvision_radius_units) ?? 0);
        } else if (s.darkvisionRadius != null || s.darkvision_radius != null) {
          dvRadiusPx = s.darkvisionRadius ?? s.darkvision_radius ?? 0;
        } else {
          // Auto-populate from compendium race data (already in feet)
          const raceDvFt: number = s.characterData?.race?.darkvision ?? s.race_darkvision ?? 0;
          if (raceDvFt > 0) dvRadiusPx = converter.toPixels(converter.fromFeet(raceDvFt));
        }
      }

      const w = s.width ?? ((s.scale_x ?? (s.scale?.x ?? 1)) * cellPx);
      const h = s.height ?? ((s.scale_y ?? (s.scale?.y ?? 1)) * cellPx);

      out.push({
        id: s.id,
        x: s.x + w / 2,
        y: s.y + h / 2,
        radius: radiusPx,
        darkvisionRadius: dvRadiusPx > 0 ? dvRadiusPx : undefined,
      });
    }

    return out;
  }

  private unitSettingsKey(): string {
    const { gridCellPx, cellDistance, distanceUnit } = useGameStore.getState();
    return `${gridCellPx}:${cellDistance}:${distanceUnit}`;
  }
}

export const visionService = new VisionService();

export function startDmPreview(userId: number): void {
  visionService.startDmPreview(userId);
}

export function stopDmPreview(): void {
  visionService.stopDmPreview();
}
