// Gather obstacles from the game store, call into the Rust/WASM visibility
// routine and push resulting reveal polygons into the fog system.
import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { getSpriteHeight, getSpriteWidth } from '@shared/utils';

let _interval: number | null = null;
let _poller: number | null = null;
const activeIds = new Set<string>();
const exploredIds = new Set<string>();

// DM preview state
let _dmPreviewInterval: number | null = null;
const dmPreviewIds = new Set<string>();

// Caches to avoid expensive recompute when nothing changed
let lastObstaclesKey: string | null = null;
const lastSourcePos = new Map<string, string>();
// Last computed polygon per vision/darkvision id for explored-area tracking
const lastPolyCache = new Map<string, { x: number; y: number }[]>();

export interface VisionOptions {
  pollMs?: number;
  defaultRadius?: number;
  debug?: boolean;
}

function buildObstaclesFloat32(): Float32Array {
  const sprites = useGameStore.getState().sprites || [];
  const obstacles = sprites.filter((s: any) => s.layer === 'obstacles');
  const segs: number[] = [];

  for (const s of obstacles) {
    const x1 = s.x;
    const y1 = s.y;
    const x2 = s.x + getSpriteWidth(s);
    const y2 = s.y + getSpriteHeight(s);
    segs.push(x1, y1, x2, y1);
    segs.push(x2, y1, x2, y2);
    segs.push(x2, y2, x1, y2);
    segs.push(x1, y2, x1, y1);
  }

  return new Float32Array(segs);
}

function getVisionSources(defaultRadius = 600, forUserId?: number): Array<{ id: string; x: number; y: number; radius: number; darkvisionRadius?: number }> {
  const store = useGameStore.getState();
  const sprites = store.sprites || [];
  const userId = store.userId;
  const sessionRole = store.sessionRole;

  const out: Array<{ id: string; x: number; y: number; radius: number; darkvisionRadius?: number }> = [];

  for (const s of sprites) {
    if (!s || typeof s !== 'object') continue;
    const anyS = s as any;

    if (forUserId != null) {
      const controlledBy: number[] = anyS.controlledBy ?? anyS.controlled_by ?? [];
      if (!controlledBy.includes(forUserId)) continue;
    } else if (!isDM(sessionRole) && userId != null) {
      const controlledBy: number[] = anyS.controlledBy ?? anyS.controlled_by ?? [];
      if (controlledBy.length > 0 && !controlledBy.includes(userId)) continue;
    }

    let radius: number;
    if (typeof anyS.visionRadius === 'number' && anyS.visionRadius > 0) {
      radius = anyS.visionRadius;
    } else if (typeof anyS.vision_radius === 'number' && anyS.vision_radius > 0) {
      radius = anyS.vision_radius;
    } else {
      const legacyKeys = ['lightRadius', 'light_radius', 'radius', 'sightRadius', 'sight_radius', 'aura_radius'];
      radius = defaultRadius;
      for (const k of legacyKeys) {
        const v = anyS[k];
        if (typeof v === 'number' && v > 0) { radius = v; break; }
        if (typeof v === 'string' && !isNaN(Number(v)) && Number(v) > 0) { radius = Number(v); break; }
      }
    }

    const darkvisionRadius: number | undefined =
      anyS.hasDarkvision || anyS.has_darkvision
        ? ((anyS.darkvisionRadius ?? anyS.darkvision_radius ?? 0) > 0
            ? (anyS.darkvisionRadius ?? anyS.darkvision_radius)
            : undefined)
        : undefined;

    out.push({ id: anyS.id, x: anyS.x, y: anyS.y, radius, darkvisionRadius });
  }

  return out;
}

function computeObstaclesKey(arr: Float32Array) {
  if (!arr || arr.length === 0) return 'empty';
  let sumFirst = 0;
  for (let i = 0; i < Math.min(8, arr.length); i++) sumFirst += arr[i];
  let sumLast = 0;
  for (let i = Math.max(0, arr.length - 8); i < arr.length; i++) sumLast += arr[i];
  return `${arr.length}:${sumFirst.toFixed(3)}:${sumLast.toFixed(3)}`;
}

function applyPolygonsForSources(obstaclesArr: Float32Array, opts?: VisionOptions) {
  const debug = opts?.debug;
  const rm = (window as any).rustRenderManager;
  if (!rm || typeof rm.compute_visibility_polygon !== 'function') {
    if (debug) console.debug('[vision.service] wasm render manager not ready');
    return;
  }

  const obKey = computeObstaclesKey(obstaclesArr);
  const obstaclesChanged = obKey !== lastObstaclesKey;
  const { fogExplorationMode } = useGameStore.getState();
  const persistExplored = fogExplorationMode === 'persist_dimmed';

  const sources = getVisionSources(opts?.defaultRadius ?? 600);
  const seenIds = new Set<string>();

  for (const src of sources) {
    // --- Normal vision polygon ---
    const id = `vision_${src.id}`;
    const posKey = `${src.x.toFixed(2)},${src.y.toFixed(2)},${src.radius}`;
    const moved = lastSourcePos.get(src.id) !== posKey;

    if (!obstaclesChanged && !moved) {
      seenIds.add(id);
      activeIds.add(id);
    } else {
      const poly: { x: number; y: number }[] = rm.compute_visibility_polygon(src.x, src.y, obstaclesArr, src.radius);
      seenIds.add(id);
      activeIds.add(id);
      lastSourcePos.set(src.id, posKey);
      lastPolyCache.set(id, poly);
      // If token moves and we're tracking exploration, clear old explored polygon (new one is current)
      if (persistExplored) {
        const expId = `explored_${src.id}`;
        exploredIds.delete(expId);
        try { rm.remove_fog_polygon(expId); } catch {}
      }
      try { rm.add_fog_polygon(id, poly); } catch (err) {
        console.error('[vision.service] add_fog_polygon failed for', id, err);
      }
    }

    // --- Darkvision polygon ---
    if (src.darkvisionRadius != null && src.darkvisionRadius > 0) {
      const dvId = `darkvision_${src.id}`;
      const dvPosKey = `${src.x.toFixed(2)},${src.y.toFixed(2)},dv${src.darkvisionRadius}`;
      const dvMoved = lastSourcePos.get(dvId) !== dvPosKey;

      if (!obstaclesChanged && !dvMoved) {
        seenIds.add(dvId);
        activeIds.add(dvId);
      } else {
        const dvPoly: { x: number; y: number }[] = rm.compute_visibility_polygon(src.x, src.y, obstaclesArr, src.darkvisionRadius);
        seenIds.add(dvId);
        activeIds.add(dvId);
        lastSourcePos.set(dvId, dvPosKey);
        lastPolyCache.set(dvId, dvPoly);
        try { rm.add_fog_polygon(dvId, dvPoly); } catch (err) {
          console.error('[vision.service] add_fog_polygon failed for', dvId, err);
        }
      }
    }
  }

  // Remove stale polygons; if persist_dimmed, keep as explored
  for (const oldId of Array.from(activeIds)) {
    if (!seenIds.has(oldId)) {
      if (persistExplored && oldId.startsWith('vision_')) {
        const srcId = oldId.slice('vision_'.length);
        const expId = `explored_${srcId}`;
        const cached = lastPolyCache.get(oldId);
        if (cached && cached.length > 2) {
          try { rm.add_fog_polygon(expId, cached); } catch {}
          exploredIds.add(expId);
        }
      }
      try { rm.remove_fog_polygon(oldId); } catch {}
      activeIds.delete(oldId);
      lastPolyCache.delete(oldId);
    }
  }

  lastObstaclesKey = obKey;
}

export function initVisionService(pollMs = 150) {
  const sessionRole = useGameStore.getState().sessionRole;
  if (isDM(sessionRole)) return;
  if (!useGameStore.getState().dynamicLightingEnabled) return;
  if (_interval != null) return;

  if (!(window as any).rustRenderManager) {
    if (_poller != null) return;
    _poller = window.setInterval(() => {
      if ((window as any).rustRenderManager) {
        window.clearInterval(_poller!);
        _poller = null;
        initVisionService(pollMs);
      }
    }, 200);
    return;
  }

  const rm = (window as any).rustRenderManager;
  if (rm?.set_dynamic_lighting_enabled) rm.set_dynamic_lighting_enabled(true);

  _interval = window.setInterval(() => {
    try { applyPolygonsForSources(buildObstaclesFloat32()); } catch (err) {
      console.error('[vision.service] periodic update failed:', err);
    }
  }, pollMs);

  let _prevSprites = useGameStore.getState().sprites;
  let _prevLighting = useGameStore.getState().dynamicLightingEnabled;
  const unsubscribe = useGameStore.subscribe((state) => {
    if (!state.dynamicLightingEnabled && _prevLighting) {
      _prevLighting = false;
      stopVisionService();
      return;
    }
    _prevLighting = state.dynamicLightingEnabled;
    if (state.sprites !== _prevSprites) {
      _prevSprites = state.sprites;
      try { applyPolygonsForSources(buildObstaclesFloat32()); } catch {}
    }
  });

  (initVisionService as any)._unsubscribe = unsubscribe;
}

export function stopVisionService() {
  if (_interval != null) { window.clearInterval(_interval); _interval = null; }
  if (_poller != null) { window.clearInterval(_poller); _poller = null; }

  const unsub = (initVisionService as any)._unsubscribe;
  if (typeof unsub === 'function') unsub();

  const rm = (window as any).rustRenderManager;
  if (rm?.set_dynamic_lighting_enabled) rm.set_dynamic_lighting_enabled(false);

  for (const id of Array.from(activeIds)) {
    try { rm?.remove_fog_polygon(id); } catch {}
    activeIds.delete(id);
  }
  for (const id of Array.from(exploredIds)) {
    try { rm?.remove_fog_polygon(id); } catch {}
    exploredIds.delete(id);
  }
  lastPolyCache.clear();
  lastObstaclesKey = null;
  lastSourcePos.clear();
}

// --- DM Preview ---

function applyDmPreviewPolygons(obstaclesArr: Float32Array, userId: number) {
  const rm = (window as any).rustRenderManager;
  if (!rm?.compute_visibility_polygon) return;

  const sources = getVisionSources(600, userId);
  const seenIds = new Set<string>();

  for (const src of sources) {
    const id = `vision_${src.id}`;
    try {
      const poly = rm.compute_visibility_polygon(src.x, src.y, obstaclesArr, src.radius);
      rm.add_fog_polygon(id, poly);
    } catch {}
    dmPreviewIds.add(id);
    seenIds.add(id);

    if (src.darkvisionRadius && src.darkvisionRadius > 0) {
      const dvId = `darkvision_${src.id}`;
      try {
        const dvPoly = rm.compute_visibility_polygon(src.x, src.y, obstaclesArr, src.darkvisionRadius);
        rm.add_fog_polygon(dvId, dvPoly);
      } catch {}
      dmPreviewIds.add(dvId);
      seenIds.add(dvId);
    }
  }

  for (const id of Array.from(dmPreviewIds)) {
    if (!seenIds.has(id)) {
      try { rm.remove_fog_polygon(id); } catch {}
      dmPreviewIds.delete(id);
    }
  }
}

export function startDmPreview(userId: number) {
  stopDmPreview();
  const rm = (window as any).rustRenderManager;
  if (!rm) return;
  rm.set_gm_mode?.(false);
  rm.set_dynamic_lighting_enabled?.(true);
  _dmPreviewInterval = window.setInterval(() => {
    try { applyDmPreviewPolygons(buildObstaclesFloat32(), userId); } catch {}
  }, 150);
}

export function stopDmPreview() {
  if (_dmPreviewInterval != null) {
    window.clearInterval(_dmPreviewInterval);
    _dmPreviewInterval = null;
  }
  const rm = (window as any).rustRenderManager;
  for (const id of Array.from(dmPreviewIds)) {
    try { rm?.remove_fog_polygon(id); } catch {}
    dmPreviewIds.delete(id);
  }
  rm?.set_dynamic_lighting_enabled?.(false);
  rm?.set_gm_mode?.(true);
}

export default { initVisionService, stopVisionService, startDmPreview, stopDmPreview };

