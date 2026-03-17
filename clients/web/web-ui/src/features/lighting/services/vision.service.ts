import { useGameStore } from '@/store';

class VisionService {
  private unsubscribe: (() => void) | null = null;
  private activeIds = new Set<string>();
  private exploredIds = new Set<string>();
  private lastPositions = new Map<string, string>();
  private lastObstaclesKey: string | null = null;
  private isRunning = false;
  private dmPreviewUserId: number | null = null;
  private pendingRecompute = false;
  // Live position cache updated by sprite-moved / sprite-drag-preview events (top-left coords)
  private spritePositions = new Map<string, { x: number; y: number }>();
  private spriteMovedListener: ((e: Event) => void) | null = null;
  private spriteDragPreviewListener: ((e: Event) => void) | null = null;
  private renderManagerReadyListener: (() => void) | null = null;

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

    const rm = (window as any).rustRenderManager;
    if (!rm) {
      if (this.renderManagerReadyListener) return; // already waiting
      const onReady = () => {
        window.removeEventListener('render-manager-ready', onReady);
        this.renderManagerReadyListener = null;
        this.start();
      };
      this.renderManagerReadyListener = onReady;
      window.addEventListener('render-manager-ready', onReady);
      return;
    }

    rm.set_dynamic_lighting_enabled(true);
    this.isRunning = true;
    this.recompute();
    this.attachSpriteMoveListener();

    let prevSprites = state.sprites;
    let prevLighting: boolean = state.dynamicLightingEnabled;
    let prevFogMode = state.fogExplorationMode;

    this.unsubscribe = useGameStore.subscribe((s) => {
      if (!s.dynamicLightingEnabled && prevLighting) {
        prevLighting = false;
        this.stop();
        return;
      }
      prevLighting = s.dynamicLightingEnabled;

      if (s.sprites !== prevSprites) {
        prevSprites = s.sprites;
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
    const rm = (window as any).rustRenderManager;
    for (const id of this.exploredIds) {
      try { rm?.remove_fog_polygon(id); } catch {}
    }
    this.exploredIds.clear();
  }

  stop(): void {
    if (this.renderManagerReadyListener) {
      window.removeEventListener('render-manager-ready', this.renderManagerReadyListener);
      this.renderManagerReadyListener = null;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.isRunning = false;
    this.dmPreviewUserId = null;

    const rm = (window as any).rustRenderManager;
    for (const id of this.activeIds) {
      try { rm?.remove_fog_polygon(id); } catch {}
    }
    this.clearExploredPolygons();
    rm?.set_dynamic_lighting_enabled(false);

    this.activeIds.clear();
    this.lastPositions.clear();
    this.lastObstaclesKey = null;
    this.spritePositions.clear();
    this.detachSpriteMoveListener();
  }

  startDmPreview(userId: number): void {
    this.stop();
    this.dmPreviewUserId = userId;

    const rm = (window as any).rustRenderManager;
    if (!rm) return;

    rm.set_gm_mode(false);
    rm.set_dynamic_lighting_enabled(true);
    this.isRunning = true;
    this.recompute();
    this.attachSpriteMoveListener();

    let prevSprites = useGameStore.getState().sprites;
    this.unsubscribe = useGameStore.subscribe((s) => {
      if (s.sprites !== prevSprites) {
        prevSprites = s.sprites;
        this.scheduleRecompute();
      }
    });
  }

  stopDmPreview(): void {
    this.stop();
    const rm = (window as any).rustRenderManager;
    rm?.set_gm_mode(true);
    rm?.set_dynamic_lighting_enabled(false);
  }

  private scheduleRecompute(): void {
    if (this.pendingRecompute) return;
    this.pendingRecompute = true;
    requestAnimationFrame(() => {
      this.pendingRecompute = false;
      this.recompute();
    });
  }

  private recompute(): void {
    const rm = (window as any).rustRenderManager;
    if (!rm) return;

    const obstacles = this.buildObstacles();
    const obstaclesKey = this.obstaclesKey(obstacles);
    const obstaclesChanged = obstaclesKey !== this.lastObstaclesKey;
    const { fogExplorationMode } = useGameStore.getState();
    const persistExplored = fogExplorationMode === 'persist_dimmed';
    if (!persistExplored && this.exploredIds.size > 0) this.clearExploredPolygons();
    const sources = this.getVisionSources();
    const seenIds = new Set<string>();

    for (const src of sources) {
      const id = `vision_${src.id}`;
      const posKey = `${src.x.toFixed(1)},${src.y.toFixed(1)},${src.radius}`;
      const moved = this.lastPositions.get(src.id) !== posKey;

      if (moved || obstaclesChanged) {
        const rawPoly: { x: number; y: number }[] = rm.compute_visibility_polygon(src.x, src.y, obstacles, src.radius);
        const poly = [{ x: src.x, y: src.y }, ...rawPoly];

        if (persistExplored && moved && this.lastPositions.has(src.id)) {
          const expId = `explored_${src.id}`;
          try { rm.add_fog_polygon(expId, poly); } catch {}
          this.exploredIds.add(expId);
        }

        try { rm.add_fog_polygon(id, poly); } catch {}
        this.lastPositions.set(src.id, posKey);
      }
      seenIds.add(id);
      this.activeIds.add(id);

      if (src.darkvisionRadius) {
        const dvId = `darkvision_${src.id}`;
        const dvPosKey = `${src.x.toFixed(1)},${src.y.toFixed(1)},dv${src.darkvisionRadius}`;
        const dvMoved = this.lastPositions.get(dvId) !== dvPosKey;

        if (dvMoved || obstaclesChanged) {
          const rawDv: { x: number; y: number }[] = rm.compute_visibility_polygon(src.x, src.y, obstacles, src.darkvisionRadius);
          try { rm.add_fog_polygon(dvId, [{ x: src.x, y: src.y }, ...rawDv]); } catch {}
          this.lastPositions.set(dvId, dvPosKey);
        }
        seenIds.add(dvId);
        this.activeIds.add(dvId);
      }
    }

    // Also reveal areas illuminated by active lights (vision union light)
    const allSprites = (useGameStore.getState().sprites || []) as any[];
    for (const ls of allSprites) {
      if (ls.layer !== 'light') continue;
      let meta: any = {};
      try { meta = typeof ls.metadata === 'string' ? JSON.parse(ls.metadata) : (ls.metadata ?? {}); } catch {}
      if (meta.isOn === false) continue;
      // meta.radius is stored in pixels (LightingPanel converts at placement)
      // Fallback: 20ft torch at default 10px/ft = 200px
      const lightRadius = meta.radius ?? useGameStore.getState().getUnitConverter().toPixels(20);
      const lightFogId = `fog_light_${ls.id}`;
      const lx = ls.x ?? 0;
      const ly = ls.y ?? 0;
      const lightPosKey = `${lx.toFixed(1)},${ly.toFixed(1)},${lightRadius}`;
      const lightMoved = this.lastPositions.get(lightFogId) !== lightPosKey;
      if (lightMoved || obstaclesChanged) {
        const rawLight: { x: number; y: number }[] = rm.compute_visibility_polygon(lx, ly, obstacles, lightRadius);
        const lightPoly = [{ x: lx, y: ly }, ...rawLight];
        try { rm.add_fog_polygon(lightFogId, lightPoly); } catch {}
        this.lastPositions.set(lightFogId, lightPosKey);
      }
      seenIds.add(lightFogId);
      this.activeIds.add(lightFogId);
    }

    for (const id of [...this.activeIds]) {
      if (!seenIds.has(id)) {
        try { rm.remove_fog_polygon(id); } catch {}
        this.activeIds.delete(id);
      }
    }

    this.lastObstaclesKey = obstaclesKey;
  }

  private buildObstacles(): Float32Array {
    const rm = (window as any).rustRenderManager;
    // Prefer live WASM data — always reflects current drag positions
    if (rm?.get_obstacle_segments_flat) {
      const segs: number[] = rm.get_obstacle_segments_flat();
      return new Float32Array(segs);
    }

    // Fallback: compute from store (when WASM isn't ready yet)
    const sprites = (useGameStore.getState().sprites || []) as any[];
    const segs: number[] = [];

    for (const s of sprites) {
      if (s.layer !== 'obstacles') continue;

      const obstacleType = s.obstacle_type || s.obstacleType;
      if (obstacleType === 'polygon' && s.polygon_vertices) {
        const verts: number[][] = s.polygon_vertices;
        for (let i = 0; i < verts.length; i++) {
          const next = (i + 1) % verts.length;
          segs.push(verts[i][0], verts[i][1], verts[next][0], verts[next][1]);
        }
        continue;
      }

      const w = s.width ?? ((s.scale_x ?? 1) * 64);
      const h = s.height ?? ((s.scale_y ?? 1) * 64);
      const cx = s.x + w / 2;
      const cy = s.y + h / 2;
      const angle = (s.rotation ?? 0) * (Math.PI / 180);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const hw = w / 2;
      const hh = h / 2;
      const corners: [number, number][] = [
        [cx + (-hw) * cosA - (-hh) * sinA, cy + (-hw) * sinA + (-hh) * cosA],
        [cx + hw * cosA - (-hh) * sinA, cy + hw * sinA + (-hh) * cosA],
        [cx + hw * cosA - hh * sinA, cy + hw * sinA + hh * cosA],
        [cx + (-hw) * cosA - hh * sinA, cy + (-hw) * sinA + hh * cosA],
      ];
      for (let i = 0; i < 4; i++) {
        const n = (i + 1) % 4;
        segs.push(corners[i][0], corners[i][1], corners[n][0], corners[n][1]);
      }
    }

    return new Float32Array(segs);
  }

  private getVisionSources(): { id: string; x: number; y: number; radius: number; darkvisionRadius?: number }[] {
    const { sprites, userId, dynamicLightingEnabled } = useGameStore.getState();
    if (!dynamicLightingEnabled && this.dmPreviewUserId == null) return [];

    const targetUserId = this.dmPreviewUserId ?? userId;
    const out: { id: string; x: number; y: number; radius: number; darkvisionRadius?: number }[] = [];

    for (const s of (sprites || []) as any[]) {
      const controlled: number[] = s.controlledBy ?? s.controlled_by ?? [];
      if (controlled.length === 0) continue;
      if (targetUserId != null && !controlled.includes(targetUserId)) continue;

      const radius = s.visionRadius ?? s.vision_radius;
      if (typeof radius !== 'number' || radius <= 0) continue;

      const hasDv = s.hasDarkvision || s.has_darkvision;
      const dvRadius = hasDv ? (s.darkvisionRadius ?? s.darkvision_radius ?? 0) : 0;

      // Use live position cache (top-left), offset to center for vision computation
      const pos = this.spritePositions.get(s.id) ?? { x: s.x, y: s.y };
      const w = s.width ?? ((s.scale_x ?? 1) * 64);
      const h = s.height ?? ((s.scale_y ?? 1) * 64);

      out.push({
        id: s.id,
        x: pos.x + w / 2,
        y: pos.y + h / 2,
        radius,
        darkvisionRadius: dvRadius > 0 ? dvRadius : undefined,
      });
    }

    return out;
  }

  private attachSpriteMoveListener(): void {
    if (!this.spriteMovedListener) {
      this.spriteMovedListener = (e: Event) => {
        const d = (e as CustomEvent).detail as any;
        const id = d?.sprite_id || d?.id;
        const pos: { x: number; y: number } | null =
          d?.to ?? d?.position ?? (d?.x !== undefined ? { x: d.x, y: d.y } : null);
        if (id && pos) {
          this.spritePositions.set(id, pos);
          this.scheduleRecompute();
        }
      };
      window.addEventListener('sprite-moved', this.spriteMovedListener);
    }

    if (!this.spriteDragPreviewListener) {
      // sprite-drag-preview fires every mousemove during local drag (player's own sprite)
      // detail: { spriteId, x, y } — top-left world coords from WASM
      this.spriteDragPreviewListener = (e: Event) => {
        const d = (e as CustomEvent).detail as any;
        const id = d?.spriteId;
        if (id && d?.x !== undefined && d?.y !== undefined) {
          this.spritePositions.set(id, { x: d.x, y: d.y });
          this.scheduleRecompute();
        }
      };
      window.addEventListener('sprite-drag-preview', this.spriteDragPreviewListener);
    }
  }

  private detachSpriteMoveListener(): void {
    if (this.spriteMovedListener) {
      window.removeEventListener('sprite-moved', this.spriteMovedListener);
      this.spriteMovedListener = null;
    }
    if (this.spriteDragPreviewListener) {
      window.removeEventListener('sprite-drag-preview', this.spriteDragPreviewListener);
      this.spriteDragPreviewListener = null;
    }
  }

  private obstaclesKey(arr: Float32Array): string {
    if (arr.length === 0) return 'empty';
    let sum = 0;
    for (let i = 0; i < Math.min(16, arr.length); i++) sum += arr[i];
    return `${arr.length}:${sum.toFixed(3)}`;
  }
}

export const visionService = new VisionService();

export function startDmPreview(userId: number): void {
  visionService.startDmPreview(userId);
}

export function stopDmPreview(): void {
  visionService.stopDmPreview();
}
