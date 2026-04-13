import type { PlanningManager, GhostToken, MovementRange } from '@lib/wasm/wasm';
import { wasmManager } from '@lib/wasm/wasmManager';

// Grid size and ft-per-unit defaults — should be overridden by session settings
const GRID_SIZE = 64;
const FT_PER_UNIT = 5 / 64; // 5ft per grid cell (64 units)

let manager: PlanningManager | null = null;

// Cell-change gate: only rerun pathfinding when mouse crosses into a new grid cell.
// Tracks last computed cell per sprite to avoid redundant A* calls.
const lastCell = new Map<string, { cx: number; cy: number; cost: number }>();

function snapToCell(x: number, y: number, gridSize: number) {
  return {
    cx: Math.floor(x / gridSize) * gridSize + gridSize * 0.5,
    cy: Math.floor(y / gridSize) * gridSize + gridSize * 0.5,
  };
}

async function getManager(): Promise<PlanningManager | null> {
  if (manager) return manager;
  try {
    const wasm = await wasmManager.getWasmModule();
    if (wasm?.PlanningManager) {
      manager = new wasm.PlanningManager(GRID_SIZE, FT_PER_UNIT);
    }
  } catch {
    // WASM may not be available in tests
  }
  return manager;
}

export const planningService = {
  async setWalls(wallsJson: string) {
    (await getManager())?.set_walls(wallsJson);
  },

  async setObstacles(obstaclesJson: string) {
    (await getManager())?.set_obstacles(obstaclesJson);
  },

  async startGhost(spriteId: string, realX: number, realY: number, previewX: number, previewY: number, speedFt: number): Promise<number> {
    const m = await getManager();
    if (!m) return 0;
    // Throttle: skip pathfinding if mouse is still in the same cell as last call
    const { cx, cy } = snapToCell(previewX, previewY, GRID_SIZE);
    const prev = lastCell.get(spriteId);
    if (prev && prev.cx === cx && prev.cy === cy) return prev.cost;
    const cost = m.start_ghost(spriteId, realX, realY, cx, cy, speedFt) ?? 0;
    lastCell.set(spriteId, { cx, cy, cost });
    return cost;
  },

  async clearGhost(spriteId: string) {
    lastCell.delete(spriteId);
    (await getManager())?.clear_ghost(spriteId);
  },

  async clearAll() {
    lastCell.clear();
    (await getManager())?.clear_all();
  },

  async getGhost(spriteId: string): Promise<GhostToken | null> {
    return (await getManager())?.get_ghost(spriteId) ?? null;
  },

  async getGhosts(): Promise<GhostToken[]> {
    return (await getManager())?.get_ghosts() ?? [];
  },

  async movementRange(sx: number, sy: number, speedFt: number, diagonal5105 = false): Promise<MovementRange> {
    const m = await getManager();
    if (!m) return { normal: [], dash: [], blocked: [] };
    return m.movement_range(sx, sy, speedFt, diagonal5105) as MovementRange;
  },

  async measureFt(x1: number, y1: number, x2: number, y2: number): Promise<number> {
    return (await getManager())?.measure_ft(x1, y1, x2, y2) ?? 0;
  },

  async hasLos(x1: number, y1: number, x2: number, y2: number): Promise<boolean> {
    return (await getManager())?.has_los(x1, y1, x2, y2) ?? true;
  },

  async setAoeSphere(cx: number, cy: number, radius: number) {
    (await getManager())?.set_aoe_sphere(cx, cy, radius);
  },

  async setAoeCone(ox: number, oy: number, angle: number, length: number) {
    (await getManager())?.set_aoe_cone(ox, oy, angle, length);
  },

  async clearAoe() {
    (await getManager())?.clear_aoe();
  },

  async tokensInAoe(positionsFlat: Float32Array): Promise<string[]> {
    return (await getManager())?.tokens_in_aoe(positionsFlat) ?? [];
  },

  /** Reset singleton (e.g., on session change) */
  reset() {
    manager?.free?.();
    manager = null;
  },
};
