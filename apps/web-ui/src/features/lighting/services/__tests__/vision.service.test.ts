import { useGameStore } from '@/store';
import type { RenderEngine } from '@lib/wasm/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visionService } from '../vision.service';

const runtimeMock = vi.hoisted(() => {
  const computeVisibilityPolygon = vi.fn().mockReturnValue([]);
  const computeVisibilityPolygons = (sources: Float32Array) => {
    const polygons = [];
    for (let index = 0; index + 2 < sources.length; index += 3) {
      polygons.push(computeVisibilityPolygon(
        sources[index],
        sources[index + 1],
        sources[index + 2],
      ));
    }
    return polygons;
  };
  return {
    getRenderEngine: vi.fn(),
    getOcclusionRevision: vi.fn(() => 1),
    computeVisibilityPolygon,
    computeSightVisibilityPolygons: vi.fn(computeVisibilityPolygons),
    computeLightVisibilityPolygons: vi.fn(computeVisibilityPolygons),
  };
});

vi.mock('@lib/wasm/runtime', () => ({
  getCurrentWasmRuntime: vi.fn(() => runtimeMock),
}));

// ---- WASM render manager mock ----
const rm = {
  set_dynamic_lighting_enabled: vi.fn(),
  set_gm_mode: vi.fn(),
  add_fog_polygon: vi.fn(),
  remove_fog_polygon: vi.fn(),
  clear_vision_polygons: vi.fn(),
};

function baseStore(overrides: Record<string, unknown> = {}) {
  return {
    sprites: [],
    walls: [],
    userId: 1,
    dynamicLightingEnabled: true,
    fogExplorationMode: 'none',
    gridCellPx: 50,
    cellDistance: 5,
    distanceUnit: 'ft',
    activeTableId: 'table-1',
    ...overrides,
  };
}

function makeSprite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hero_1',
    x: 200,
    y: 400,
    width: 0,
    height: 0,
    layer: 'tokens',
    tableId: 'table-1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  runtimeMock.getRenderEngine.mockReturnValue(rm as unknown as RenderEngine);
  runtimeMock.getOcclusionRevision.mockReturnValue(1);
  runtimeMock.computeVisibilityPolygon.mockReturnValue([]);
  useGameStore.setState(baseStore() as unknown as Parameters<typeof useGameStore.setState>[0]);
});

afterEach(() => {
  visionService.stop();
});

describe('VisionService.start()', () => {
  it('calls set_dynamic_lighting_enabled(true) on start', () => {
    visionService.start();
    expect(rm.set_dynamic_lighting_enabled).toHaveBeenCalledWith(true);
  });

  it('does not run twice if already started', () => {
    visionService.start();
    visionService.start();
    expect(rm.set_dynamic_lighting_enabled).toHaveBeenCalledTimes(1);
  });

  it('calls set_dynamic_lighting_enabled(false) on stop', () => {
    visionService.start();
    visionService.stop();
    expect(rm.set_dynamic_lighting_enabled).toHaveBeenCalledWith(false);
  });

  it('waits for dynamicLightingEnabled before registering', () => {
    useGameStore.setState({ dynamicLightingEnabled: false } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(rm.set_dynamic_lighting_enabled).not.toHaveBeenCalled();
  });

  it('coalesces rapid store changes into one animation-frame recompute', async () => {
    useGameStore.setState({
      sprites: [makeSprite({ controlled_by: [1], vision_radius: 150 })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledTimes(1);

    useGameStore.setState({ sprites: [makeSprite({ id: 'hero-2', controlled_by: [1], vision_radius: 150 })] } as unknown as Parameters<typeof useGameStore.setState>[0]);
    useGameStore.setState({ walls: [{ wall_id: 'wall-1' }] } as unknown as Parameters<typeof useGameStore.setState>[0]);
    useGameStore.setState({ gridCellPx: 60 } as unknown as Parameters<typeof useGameStore.setState>[0]);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledTimes(2);
  });

  it('cancels a queued recompute when stopped', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    useGameStore.setState({
      sprites: [makeSprite({ controlled_by: [1], vision_radius: 150 })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();

    useGameStore.setState({ walls: [{ wall_id: 'wall-1' }] } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.stop();

    expect(cancel).toHaveBeenCalledOnce();
    cancel.mockRestore();
  });
});

describe('getVisionSources (via recompute)', () => {
  it('excludes sprites without vision_radius', () => {
    useGameStore.setState({ sprites: [makeSprite({ controlled_by: [1] })] } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).not.toHaveBeenCalled();
  });

  it('excludes sprites with vision_radius=0', () => {
    useGameStore.setState({ sprites: [makeSprite({ controlled_by: [1], vision_radius: 0 })] } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).not.toHaveBeenCalled();
  });

  it('excludes sprites with no controlled_by array', () => {
    useGameStore.setState({ sprites: [makeSprite({ vision_radius: 150 })] } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).not.toHaveBeenCalled();
  });

  it('excludes sprites controlled by other users', () => {
    useGameStore.setState({
      sprites: [makeSprite({ controlled_by: [99], vision_radius: 150 })],
      userId: 1,
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).not.toHaveBeenCalled();
  });

  it('includes sprite controlled by current userId', () => {
    useGameStore.setState({
      sprites: [makeSprite({ controlled_by: [1], vision_radius: 150 })],
      userId: 1,
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledOnce();
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledWith(200, 400, 150);
  });

  it('handles camelCase controlledBy and visionRadius fields', () => {
    useGameStore.setState({
      sprites: [makeSprite({ controlledBy: [1], visionRadius: 120 })],
      userId: 1,
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledWith(200, 400, 120);
  });

  it('adds darkvision polygon when has_darkvision is true', () => {
    useGameStore.setState({
      sprites: [makeSprite({ controlled_by: [1], vision_radius: 150, has_darkvision: true, darkvision_radius: 60 })],
      userId: 1,
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledTimes(2);
    expect(runtimeMock.computeSightVisibilityPolygons).toHaveBeenCalledOnce();
    // vision + darkvision
    expect(rm.add_fog_polygon).toHaveBeenCalledTimes(2);
  });

  it('skips darkvision when darkvision_radius is 0', () => {
    useGameStore.setState({
      sprites: [makeSprite({ controlled_by: [1], vision_radius: 150, has_darkvision: true, darkvision_radius: 0 })],
      userId: 1,
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledTimes(1);
  });
});

describe('renderer-owned occlusion (via recompute)', () => {
  it('sends only packed sight sources to the renderer-owned index', () => {
    useGameStore.setState({
      sprites: [makeSprite({ controlled_by: [1], vision_radius: 150 })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);

    visionService.start();

    expect(runtimeMock.computeSightVisibilityPolygons).toHaveBeenCalledWith(
      new Float32Array([200, 400, 150]),
    );
  });

  it('excludes vision sources owned by another table', () => {
    useGameStore.setState({
      sprites: [makeSprite({ tableId: 'table-2', controlled_by: [1], vision_radius: 150 })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).not.toHaveBeenCalled();
  });

  it('clears caches and rebuilds when the active table changes', async () => {
    useGameStore.setState({
      sprites: [makeSprite({ controlled_by: [1], vision_radius: 150 })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();

    useGameStore.setState({
      activeTableId: 'table-2',
      sprites: [makeSprite({ tableId: 'table-2', controlled_by: [1], vision_radius: 150 })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    expect(rm.clear_vision_polygons).toHaveBeenCalled();
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledTimes(2);
  });

  it('uses the renderer-owned light index for light visibility polygons', () => {
    useGameStore.setState({
      sprites: [makeSprite({ layer: 'light', metadata: JSON.stringify({ radius: 100 }) })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);

    visionService.start();

    expect(runtimeMock.computeLightVisibilityPolygons).toHaveBeenCalledWith(
      new Float32Array([200, 400, 100]),
    );
  });

  it('recomputes all sources when the renderer occlusion revision changes', async () => {
    useGameStore.setState({
      sprites: [makeSprite({ controlled_by: [1], vision_radius: 150 })],
      walls: [],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);

    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledTimes(1);

    runtimeMock.getOcclusionRevision.mockReturnValue(2);
    useGameStore.setState({ walls: [{ wall_id: 'wall-5' }] } as unknown as Parameters<typeof useGameStore.setState>[0]);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledTimes(2);
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenLastCalledWith(200, 400, 150);
  });
});

describe('light visibility sources', () => {
  it('excludes lights owned by another table', () => {
    useGameStore.setState({
      sprites: [makeSprite({ tableId: 'table-2', layer: 'light', metadata: '{}' })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).not.toHaveBeenCalled();
  });

  it('uses safe defaults when persisted light metadata is null', () => {
    useGameStore.setState({
      sprites: [makeSprite({ layer: 'light', metadata: 'null', x: Number.NaN })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);

    expect(() => visionService.start()).not.toThrow();
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledWith(
      0,
      400,
      expect.any(Number),
    );
  });

  it('prefers a persisted game-unit radius over the legacy pixel radius', () => {
    useGameStore.setState({
      sprites: [makeSprite({
        layer: 'light',
        metadata: JSON.stringify({ radius_units: 20, radius: 999 }),
      })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);

    visionService.start();

    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledWith(
      200,
      400,
      200,
    );
  });
});

describe('persist_dimmed exploration', () => {
  it('keeps distinct prior visibility footprints as a token moves', async () => {
    runtimeMock.computeVisibilityPolygon.mockImplementation((x: number, y: number) => [
      { x: x + 10, y },
    ]);
    useGameStore.setState({
      fogExplorationMode: 'persist_dimmed',
      sprites: [makeSprite({ controlled_by: [1], vision_radius: 150 })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();

    useGameStore.setState({
      sprites: [makeSprite({ x: 250, controlled_by: [1], vision_radius: 150 })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    useGameStore.setState({
      sprites: [makeSprite({ x: 300, controlled_by: [1], vision_radius: 150 })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    expect(rm.add_fog_polygon).toHaveBeenCalledWith('explored_hero_1_1', [
      { x: 200, y: 400 }, { x: 210, y: 400 },
    ]);
    expect(rm.add_fog_polygon).toHaveBeenCalledWith('explored_hero_1_2', [
      { x: 250, y: 400 }, { x: 260, y: 400 },
    ]);
    expect(rm.remove_fog_polygon).not.toHaveBeenCalledWith('explored_hero_1_1');
  });

  it('clears cumulative footprints when exploration mode changes', async () => {
    useGameStore.setState({
      fogExplorationMode: 'persist_dimmed',
      sprites: [makeSprite({ controlled_by: [1], vision_radius: 150 })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    useGameStore.setState({
      sprites: [makeSprite({ x: 250, controlled_by: [1], vision_radius: 150 })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    useGameStore.setState({ fogExplorationMode: 'none' } as unknown as Parameters<typeof useGameStore.setState>[0]);

    expect(rm.remove_fog_polygon).toHaveBeenCalledWith('explored_hero_1_1');
  });
});

describe('DM preview mode', () => {
  it('uses dmPreviewUserId instead of store userId', () => {
    useGameStore.setState({
      sprites: [makeSprite({ controlled_by: [42], vision_radius: 200 })],
      userId: 1,
      dynamicLightingEnabled: false,
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.startDmPreview(42);
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledWith(200, 400, 200);
  });

  it('stops dm preview and disables lighting', () => {
    visionService.startDmPreview(5);
    visionService.stopDmPreview();
    expect(rm.set_dynamic_lighting_enabled).toHaveBeenLastCalledWith(false);
    expect(rm.set_gm_mode).toHaveBeenCalledWith(true);
  });
});

