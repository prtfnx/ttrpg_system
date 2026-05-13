import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock wasmManager before importing planningService
vi.mock('@lib/wasm/wasmManager', () => ({
  wasmManager: {
    getWasmModule: vi.fn(),
  },
}));

import { planningService } from '../planning.service';
import { wasmManager } from '@lib/wasm/wasmManager';

const mockManager = {
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

const mockWasm = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PlanningManager: vi.fn(function () { return mockManager; } as any),
};

const getWasmModule = wasmManager.getWasmModule as ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.clearAllMocks();
  // Restore implementations cleared by clearAllMocks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockWasm.PlanningManager.mockImplementation(function () { return mockManager; } as any);
  mockManager.start_ghost.mockReturnValue(10);
  mockManager.get_ghost.mockReturnValue({ x: 1, y: 2 });
  mockManager.get_ghosts.mockReturnValue([]);
  mockManager.movement_range.mockReturnValue({ normal: [], dash: [], blocked: [] });
  mockManager.measure_ft.mockReturnValue(30);
  mockManager.has_los.mockReturnValue(true);
  mockManager.tokens_in_aoe.mockReturnValue([]);
  getWasmModule.mockResolvedValue(mockWasm);
  // Reset singleton manager and clear lastCell cache
  planningService.reset();
  await planningService.clearAll(); // clears module-level lastCell map
});

describe('planningService', () => {
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

  it('clearAll clears cache and calls manager', async () => {
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
      getWasmModule.mockResolvedValue(null);
    });

    it('startGhost returns 0 with no manager', async () => {
      const cost = await planningService.startGhost('s1', 0, 0, 100, 100, 30);
      expect(cost).toBe(0);
    });

    it('movementRange returns empty ranges', async () => {
      const range = await planningService.movementRange(0, 0, 30);
      expect(range).toEqual({ normal: [], dash: [], blocked: [] });
    });

    it('measureFt returns 0', async () => {
      const ft = await planningService.measureFt(0, 0, 64, 64);
      expect(ft).toBe(0);
    });

    it('hasLos returns true (permissive fallback)', async () => {
      const los = await planningService.hasLos(0, 0, 100, 100);
      expect(los).toBe(true);
    });
  });

  it('reset frees manager and clears singleton', async () => {
    await planningService.setWalls('[]'); // initializes manager
    planningService.reset();
    expect(mockManager.free).toHaveBeenCalled();
  });
});
