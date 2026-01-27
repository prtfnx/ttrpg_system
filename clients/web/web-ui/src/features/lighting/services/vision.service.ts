// Gather obstacles from the game store, call into the Rust/WASM visibility
// routine and push resulting reveal polygons into the fog system.
import { getSpriteHeight, getSpriteWidth } from '@shared/utils';
import { useGameStore } from '../../../store';

let _interval: number | null = null;
let _poller: number | null = null;
const activeIds = new Set<string>();

// Caches to avoid expensive recompute when nothing changed
let lastObstaclesKey: string | null = null;
const lastSourcePos = new Map<string, string>();

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
    // Assume sprite x,y are top-left in world coords
    const x1 = s.x;
    const y1 = s.y;
    const x2 = s.x + getSpriteWidth(s);
    const y2 = s.y + getSpriteHeight(s);

    // Add rectangle edges as segments (x1,y1)-(x2,y1), (x2,y1)-(x2,y2), ...
    segs.push(x1, y1, x2, y1);
    segs.push(x2, y1, x2, y2);
    segs.push(x2, y2, x1, y2);
    segs.push(x1, y2, x1, y1);
  }

  return new Float32Array(segs);
}

function getVisionSources(defaultRadius = 600): Array<{ id: string; x: number; y: number; radius: number }> {
  const sprites = useGameStore.getState().sprites || [];

  // Candidate property names we accept for radius / presence
  const radiusKeys = [
    'visionRadius',
    'vision_radius',
    'lightRadius',
    'light_radius',
    'radius',
    'sightRadius',
    'sight_radius',
  ];

  const presenceKeys = ['isVisionSource', 'is_vision_source', 'hasVision', 'vision_enabled'];

  const out: Array<{ id: string; x: number; y: number; radius: number }> = [];

    for (const s of sprites) {
      if (!s || typeof s !== 'object') continue;

      const anyS = s as any;

      // Check presence flags first
      let present = false;
      for (const k of presenceKeys) {
        if (anyS[k]) {
          present = true;
          break;
        }
      }

      // If no explicit presence, check radius-like keys
      let radius: number | undefined = undefined;
      for (const k of radiusKeys) {
        const v = anyS[k];
        if (typeof v === 'number' && v > 0) {
          radius = v;
          present = true;
          break;
        }
        // Accept string numbers too
        if (typeof v === 'string' && !isNaN(Number(v))) {
          radius = Number(v);
          present = true;
          break;
        }
      }

      // Also accept nested fields (sprite.props?.visionRadius etc.)
      if (!present && anyS.props && typeof anyS.props === 'object') {
        for (const k of [...presenceKeys, ...radiusKeys]) {
          if (anyS.props[k]) {
            present = true;
            if (radius === undefined && typeof anyS.props[k] === 'number') radius = anyS.props[k];
          }
        }
      }

      if (!present) continue;

      out.push({ id: anyS.id, x: anyS.x, y: anyS.y, radius: radius ?? defaultRadius });
    }

  return out;
}

function computeObstaclesKey(arr: Float32Array) {
  // Simple fingerprint: count + sum of first/last values to detect changes cheaply
  if (!arr || arr.length === 0) return 'empty';
  let sumFirst = 0;
  for (let i = 0; i < Math.min(8, arr.length); i++) sumFirst += arr[i];
  let sumLast = 0;
  for (let i = Math.max(0, arr.length - 8); i < arr.length; i++) sumLast += arr[i];
  return `${arr.length}:${sumFirst.toFixed(3)}:${sumLast.toFixed(3)}`;
}

function applyPolygonsForSources(obstaclesArr: Float32Array, opts?: VisionOptions) {
  const debug = opts?.debug;
  if (!window.rustRenderManager || typeof (window as any).rustRenderManager.compute_visibility_polygon !== 'function') {
    if (debug) console.debug('[vision.service] wasm render manager not ready');
    return;
  }

  const obKey = computeObstaclesKey(obstaclesArr);
  const obstaclesChanged = obKey !== lastObstaclesKey;
  if (debug && !obstaclesChanged) console.debug('[vision.service] obstacles key unchanged');

  const sources = getVisionSources(opts?.defaultRadius ?? 600);
  const seenIds = new Set<string>();

  for (const src of sources) {
    const id = `vision_${src.id}`;

    const posKey = `${src.x.toFixed(2)},${src.y.toFixed(2)},${src.radius}`;
    const prev = lastSourcePos.get(src.id);
    const moved = prev !== posKey;

    // If neither obstacles nor this source moved, skip
    if (!obstaclesChanged && !moved) {
      seenIds.add(id);
      activeIds.add(id);
      if (debug) console.debug('[vision.service] skipping compute for', id);
      continue;
    }

    // perform wasm visibility compute
    const poly: any = (window as any).rustRenderManager.compute_visibility_polygon(
      src.x,
      src.y,
      obstaclesArr,
      src.radius
    );

    seenIds.add(id);
    activeIds.add(id);
    lastSourcePos.set(src.id, posKey);

    try {
      (window as any).rustRenderManager.add_fog_polygon(id, poly);
      if (debug) console.debug('[vision.service] updated fog polygon', id, poly?.length ?? 'unknown');
    } catch (err) {
      console.error('[vision.service] add_fog_polygon failed for', id, err);
    }
  }

  // Remove polygons for sources that disappeared
  for (const oldId of Array.from(activeIds)) {
    if (!seenIds.has(oldId)) {
      try {
        (window as any).rustRenderManager.remove_fog_polygon(oldId);
      } catch (err) {
        // ignore
      }
      activeIds.delete(oldId);
    }
  }

  // Update obstacles key after processing
  lastObstaclesKey = obKey;
}

export function initVisionService(pollMs = 150) {
  // If service already running, no-op
  if (_interval != null) return;

  // If WASM not ready yet, poll until it becomes available
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

  // Run loop that gathers obstacles and vision sources and updates fog polygons
  _interval = window.setInterval(() => {
    try {
      const obstacles = buildObstaclesFloat32();
      applyPolygonsForSources(obstacles);
    } catch (err) {
      console.error('[vision.service] periodic update failed:', err);
    }
  }, pollMs);

  // Also trigger an immediate update when sprites change to reduce latency
  const unsubscribe = useGameStore.subscribe(() => {
    try {
      const obstacles = buildObstaclesFloat32();
      applyPolygonsForSources(obstacles);
    } catch (err) {
      // ignore
    }
  });

  // Keep a small handle on unsubscribe so service can be torn down later if needed
  (initVisionService as any)._unsubscribe = unsubscribe;
}

export function stopVisionService() {
  if (_interval != null) {
    window.clearInterval(_interval);
    _interval = null;
  }
  if (_poller != null) {
    window.clearInterval(_poller);
    _poller = null;
  }
  const unsub = (initVisionService as any)._unsubscribe;
  if (typeof unsub === 'function') unsub();
  // Remove any remaining fog polygons we created
  for (const id of Array.from(activeIds)) {
    try {
      (window as any).rustRenderManager.remove_fog_polygon(id);
    } catch {}
    activeIds.delete(id);
  }
}

export default {
  initVisionService,
  stopVisionService,
};
