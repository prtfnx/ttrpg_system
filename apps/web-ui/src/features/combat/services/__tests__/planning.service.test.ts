import { useGameStore } from '@/store';
import { DEFAULT_RULES, useSessionRulesStore } from '../../stores/sessionRulesStore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMock = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  getPlanningManager: vi.fn(),
}));

vi.mock('@lib/wasm/runtime', () => ({
  getCurrentWasmRuntime: vi.fn(() => runtimeMock),
}));

import { planningService } from '../planning.service';

const mockManager = {
  configure: vi.fn().mockReturnValue(true),
  set_walls: vi.fn(),
  set_obstacles: vi.fn(),
  start_ghost: vi.fn().mockReturnValue(10),
  clear_ghost: vi.fn(),
  clear_all: vi.fn(),
  get_ghost: vi.fn().mockReturnValue({ x: 1, y: 2 }),
  get_ghosts: vi.fn().mockReturnValue([]),
  movement_range: vi.fn().mockReturnValue({ normal: [], dash: [], blocked: [] }),
  measure_ft: vi.fn().mockReturnValue(30),
  has_los: vi.fn().mockReturnValue(true),
  set_aoe_sphere: vi.fn(),
  set_aoe_cone: vi.fn(),
  clear_aoe: vi.fn(),
  tokens_in_aoe: vi.fn().mockReturnValue([]),
  free: vi.fn(),
  PlanningManager: undefined as unknown,
};

beforeEach(async () => {
  vi.clearAllMocks();
  runtimeMock.initialize.mockResolvedValue(undefined);
  runtimeMock.getPlanningManager.mockReturnValue(mockManager);
  mockManager.start_ghost.mockReturnValue(10);
  mockManager.get_ghost.mockReturnValue({ x: 1, y: 2 });
  mockManager.get_ghosts.mockReturnValue([]);
  mockManager.movement_range.mockReturnValue({ normal: [], dash: [], blocked: [] });
  mockManager.measure_ft.mockReturnValue(30);
  mockManager.has_los.mockReturnValue(true);
  mockManager.tokens_in_aoe.mockReturnValue([]);
  // Reset singleton manager and clear lastCell cache
  useGameStore.setState({ activeTableId: 'table', gridCellPx: 50, cellDistance: 5, distanceUnit: 'ft',
    sessionRole: 'player', tables: [{ table_id: 'table', table_name: 'Planning', width: 1000, height: 1000 }],
    planningGeometry: { tableId: 'table', valid: true, shapes: [], terrain: [] }, walls: [],
  });
  useSessionRulesStore.setState({ rules: null });
  mockManager.configure.mockReturnValue(true);
  planningService.reset();
  await planningService.clearAll(); // clears module-level lastCell map
});

describe('planningService', () => {
  it('configures active table units and refreshes changed walls in the same cell', async () => {
    useGameStore.setState({ gridCellPx: 100, cellDistance: 2, distanceUnit: 'm' });
    await planningService.startGhost('s1', 25, 25, 110, 110, 30);
    const config = JSON.parse(mockManager.configure.mock.calls.at(-1)![0]);
    expect(config).toMatchObject({ grid_size: 100, snap_to_cell: true, bounds: [1000, 1000] });
    expect(config.ft_per_unit).toBeCloseTo(2 / 0.3048 / 100);
    useGameStore.setState({ walls: [{ table_id: 'table', x1: 90, y1: 0, x2: 90, y2: 500,
      blocks_movement: true, is_door: false, door_state: 'closed' } as never] });
    await planningService.startGhost('s1', 25, 25, 110, 110, 30);
    expect(mockManager.start_ghost).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockManager.set_walls.mock.calls.at(-1)![0])).toEqual([
      { x1: 90, y1: 0, x2: 90, y2: 500, is_door: false, door_open: false },
    ]);
  });

  it('sends closed private boundaries to collision without sprite identities', async () => {
    useGameStore.setState({ planningGeometry: { tableId: 'table', valid: true, terrain: [],
      shapes: [{ closed: true, vertices: [[10, 20], [30, 20], [30, 60]] }] } });
    await planningService.startGhost('s1', 0, 0, 110, 110, 30);
    expect(JSON.parse(mockManager.set_obstacles.mock.calls.at(-1)![0])).toEqual([
      { id: 'boundary-0', obstacle_type: 'polygon', x: 20, y: 40, width: 20, height: 40,
        radius: 0, vertices: [[10, 20], [30, 20], [30, 60]] },
    ]);
  });

  it('disables movement when active table geometry is missing or belongs elsewhere', async () => {
    useGameStore.setState({ planningGeometry: null });
    expect(await planningService.startGhost('s1', 0, 0, 100, 100, 30)).toBe(Infinity);
    expect(mockManager.start_ghost).not.toHaveBeenCalled();
  });

  it('preserves exact server coordinates across the float32 WASM boundary', async () => {
    useGameStore.setState({ tables: [{ table_id: 'table', table_name: 'Planning', width: 2000, height: 2000 }] });
    useSessionRulesStore.setState({ rules: { session_id: 'test', ...DEFAULT_RULES, movement_mode: 'free' } });
    const source = 1000.123456789, target = 1100.333333333;
    mockManager.get_ghost.mockReturnValue({ sprite_id: 's1', real_x: Math.fround(source), real_y: 25,
      preview_x: Math.fround(target), preview_y: 75, path: [[Math.fround(source), 25], [Math.fround(target), 75]],
      movement_cost_ft: 10, opacity: 0.45 });
    await planningService.startGhost('s1', source, 25, target, 75, 30);
    expect(await planningService.getGhost('s1')).toMatchObject({
      real_x: source, preview_x: target, path: [[source, 25], [target, 75]],
    });
  });

  it('does not charge movement when speed enforcement is disabled, but still rejects blocked routes', async () => {
    useSessionRulesStore.setState({ rules: { session_id: 'test', ...DEFAULT_RULES, enforce_movement_speed: false } });
    expect(await planningService.startGhost('s1', 0, 0, 110, 110, 30)).toBe(0);
    mockManager.start_ghost.mockReturnValueOnce(Infinity);
    expect(await planningService.startGhost('s1', 0, 0, 160, 160, 30)).toBe(Infinity);
  });

  it('setWalls delegates to manager', async () => {
    await planningService.setWalls('[]');
    expect(mockManager.set_walls).toHaveBeenCalledWith('[]');
  });

  it('setObstacles delegates to manager', async () => {
    await planningService.setObstacles('[]');
    expect(mockManager.set_obstacles).toHaveBeenCalledWith('[]');
  });

  it('startGhost computes cost and returns it', async () => {
    const cost = await planningService.startGhost('s1', 0, 0, 100, 100, 30);
    expect(mockManager.start_ghost).toHaveBeenCalled();
    expect(cost).toBe(10);
  });

  it('startGhost returns cached cost when cell unchanged', async () => {
    await planningService.startGhost('s1', 0, 0, 100, 100, 30);
    mockManager.start_ghost.mockReturnValue(99);
    const cost = await planningService.startGhost('s1', 0, 0, 100, 100, 30);
    // Same cell → returns cached, not 99
    expect(cost).toBe(10);
    expect(mockManager.start_ghost).toHaveBeenCalledTimes(1);
  });

  it('clearGhost removes cache and calls manager', async () => {
    await planningService.startGhost('s1', 0, 0, 100, 100, 30);
    await planningService.clearGhost('s1');
    expect(mockManager.clear_ghost).toHaveBeenCalledWith('s1');
    // After clear, next startGhost should re-compute
    mockManager.start_ghost.mockReturnValue(20);
    const cost = await planningService.startGhost('s1', 0, 0, 100, 100, 30);
    expect(cost).toBe(20);
  });

  it('clearAll clears cache and calls an initialized manager', async () => {
    await planningService.setWalls('[]');
    await planningService.clearAll();
    expect(mockManager.clear_all).toHaveBeenCalled();
  });

  it('getGhost returns ghost from manager', async () => {
    const ghost = await planningService.getGhost('s1');
    expect(ghost).toEqual({ x: 1, y: 2 });
  });

  it('getGhosts returns array from manager', async () => {
    const ghosts = await planningService.getGhosts();
    expect(ghosts).toEqual([]);
  });

  it('movementRange returns range from manager', async () => {
    const range = await planningService.movementRange(0, 0, 30);
    expect(range).toEqual({ normal: [], dash: [], blocked: [] });
  });

  it('measureFt returns distance from manager', async () => {
    const ft = await planningService.measureFt(0, 0, 64, 64);
    expect(ft).toBe(30);
  });

  it('hasLos returns bool from manager', async () => {
    const los = await planningService.hasLos(0, 0, 100, 100);
    expect(los).toBe(true);
  });

  it('setAoeSphere delegates to manager', async () => {
    await planningService.setAoeSphere(64, 64, 20);
    expect(mockManager.set_aoe_sphere).toHaveBeenCalledWith(64, 64, 20);
  });

  it('setAoeCone delegates to manager', async () => {
    await planningService.setAoeCone(0, 0, 45, 30);
    expect(mockManager.set_aoe_cone).toHaveBeenCalledWith(0, 0, 45, 30);
  });

  it('clearAoe delegates to manager', async () => {
    await planningService.clearAoe();
    expect(mockManager.clear_aoe).toHaveBeenCalled();
  });

  it('tokensInAoe returns tokens from manager', async () => {
    const positions = new Float32Array([0, 0, 64, 64]);
    const tokens = await planningService.tokensInAoe(positions);
    expect(tokens).toEqual([]);
  });

  describe('when WASM is unavailable', () => {
    beforeEach(() => {
      planningService.reset();
      runtimeMock.getPlanningManager.mockReturnValue(null);
    });

    it('startGhost cannot offer a move with no manager', async () => {
      const cost = await planningService.startGhost('s1', 0, 0, 100, 100, 30);
      expect(cost).toBe(Infinity);
    });

    it('movementRange returns empty ranges', async () => {
      const range = await planningService.movementRange(0, 0, 30);
      expect(range).toEqual({ normal: [], dash: [], blocked: [] });
    });

    it('measureFt returns 0', async () => {
      const ft = await planningService.measureFt(0, 0, 64, 64);
      expect(ft).toBe(0);
    });

    it('hasLos fails closed without geometry', async () => {
      const los = await planningService.hasLos(0, 0, 100, 100);
      expect(los).toBe(false);
    });
  });

  it('reset leaves manager lifetime with its runtime owner', async () => {
    await planningService.setWalls('[]'); // initializes manager
    planningService.reset();
    expect(mockManager.free).not.toHaveBeenCalled();
  });
});
