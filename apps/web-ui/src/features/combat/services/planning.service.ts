import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { DEFAULT_RULES, useSessionRulesStore } from '../stores/sessionRulesStore';
import type { PlanningGhost } from '@lib/wasm/runtime/types';
import type { PlanningManager } from '@lib/wasm/runtime';
import { getCurrentWasmRuntime } from '@lib/wasm/runtime';

interface MovementRange {
  normal: unknown[];
  dash: unknown[];
  blocked: unknown[];
}

let manager: PlanningManager | null = null;
let ownerRuntime: ReturnType<typeof getCurrentWasmRuntime> = null;
let sceneKey = '';
let gridSize = 50;
let snapToGrid = true;
const lastCell = new Map<string, { key: string; cost: number }>();
const requests = new Map<string, { realX: number; realY: number; x: number; y: number }>();

async function getManager(): Promise<PlanningManager | null> {
  const runtime = getCurrentWasmRuntime();
  if (!runtime) return null;
  if (ownerRuntime !== runtime) {
    manager = null; ownerRuntime = runtime; sceneKey = ''; lastCell.clear(); requests.clear();
  }
  try {
    if (!manager) {
      await runtime.initialize();
      if (ownerRuntime !== runtime || runtime !== getCurrentWasmRuntime()) return null;
      manager = runtime.getPlanningManager();
    }
    if (!manager || ownerRuntime !== getCurrentWasmRuntime()) return null;
    const state = useGameStore.getState();
    const rules = useSessionRulesStore.getState().rules ?? DEFAULT_RULES;
    const geometry = state.planningGeometry;
    const table = state.tables.find((item) => item.table_id === state.activeTableId);
    if (!table || !geometry || geometry.tableId !== state.activeTableId
      || (rules.obstacles_block_movement && !geometry.valid)) return null;
    gridSize = state.gridCellPx;
    snapToGrid = rules.movement_mode === 'cell';
    const feetPerCell = state.cellDistance * (state.distanceUnit === 'm' ? 1 / 0.3048 : 1);
    const unrestricted = rules.out_of_bounds_movement === 'all'
      || rules.out_of_bounds_movement === 'dm_only' && isDM(state.sessionRole);
    const config = { grid_size: gridSize, ft_per_unit: feetPerCell / gridSize,
      snap_to_cell: snapToGrid, diagonal_rule: rules.diagonal_movement_rule,
      bounds: unrestricted ? null : [table.width, table.height],
      difficult_cells: rules.enforce_difficult_terrain ? geometry.terrain : [],
    };
    const walls = rules.walls_block_movement ? state.walls
      .filter((wall) => wall.table_id === state.activeTableId && wall.blocks_movement)
      .map((wall) => ({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2,
        is_door: wall.is_door, door_open: wall.door_state === 'open' })) : [];
    const obstacles = rules.obstacles_block_movement ? geometry.shapes.map((shape, index) => {
      const xs = shape.vertices.map((point) => point[0]), ys = shape.vertices.map((point) => point[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      return { id: `boundary-${index}`, obstacle_type: shape.closed ? 'polygon' : 'line',
        x: (minX + maxX) / 2, y: (minY + maxY) / 2, width: maxX - minX, height: maxY - minY,
        radius: 0, vertices: shape.vertices };
    }) : [];
    const key = JSON.stringify([state.activeTableId, config, walls, obstacles, rules.enforce_movement_speed]);
    if (key !== sceneKey) {
      if (!manager.configure(JSON.stringify(config))) return null;
      manager.set_walls(JSON.stringify(walls)); manager.set_obstacles(JSON.stringify(obstacles));
      sceneKey = key; lastCell.clear(); requests.clear();
    }
    return manager;
  } catch { return null; }
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
    if (!m) return Infinity;
    const x = snapToGrid ? Math.floor(previewX / gridSize) : previewX;
    const y = snapToGrid ? Math.floor(previewY / gridSize) : previewY;
    const key = JSON.stringify([x, y, realX, realY, speedFt]);
    const previous = lastCell.get(spriteId);
    if (previous?.key === key) return previous.cost;
    const estimate = m.start_ghost(spriteId, realX, realY, previewX, previewY, speedFt);
    const enforceSpeed = useSessionRulesStore.getState().rules?.enforce_movement_speed ?? DEFAULT_RULES.enforce_movement_speed;
    const cost = Number.isFinite(estimate) && !enforceSpeed ? 0 : estimate;
    lastCell.set(spriteId, { key, cost });
    requests.set(spriteId, { realX, realY, x: snapToGrid ? x * gridSize + gridSize / 2 : previewX,
      y: snapToGrid ? y * gridSize + gridSize / 2 : previewY });
    return cost;
  },

  async clearGhost(spriteId: string) {
    lastCell.delete(spriteId); requests.delete(spriteId);
    manager?.clear_ghost(spriteId);
  },

  async clearAll() {
    lastCell.clear(); requests.clear();
    manager?.clear_all();
  },

  async getGhost(spriteId: string): Promise<PlanningGhost | null> {
    const ghost = (await getManager())?.get_ghost(spriteId) ?? null;
    const request = requests.get(spriteId);
    if (!ghost || !request || ghost.path.length < 2) return ghost;
    const path = [...ghost.path];
    path[0] = [request.realX, request.realY]; path[path.length - 1] = [request.x, request.y];
    return { ...ghost, real_x: request.realX, real_y: request.realY, preview_x: request.x, preview_y: request.y, path };
  },

  async getGhosts(): Promise<PlanningGhost[]> {
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
    return (await getManager())?.has_los(x1, y1, x2, y2) ?? false;
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
    manager = null; ownerRuntime = null; sceneKey = ''; lastCell.clear(); requests.clear();
  },
};
