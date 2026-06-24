import { useGameStore } from '@/store';
import type { RenderEngine } from '@lib/wasm/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visionService } from '../vision.service';

const runtimeMock = vi.hoisted(() => ({
  getRenderEngine: vi.fn(),
  computeVisibilityPolygon: vi.fn().mockReturnValue([]),
}));

vi.mock('@lib/wasm/runtime', () => ({
  getCurrentWasmRuntime: vi.fn(() => runtimeMock),
}));

// ---- WASM render manager mock ----
const rm = {
  set_dynamic_lighting_enabled: vi.fn(),
  set_gm_mode: vi.fn(),
  get_obstacle_segments_flat: vi.fn().mockReturnValue(new Float32Array()),
  add_fog_polygon: vi.fn(),
  remove_fog_polygon: vi.fn(),
};

function baseStore(overrides: Record<string, unknown> = {}) {
  return {
    sprites: [],
    userId: 1,
    dynamicLightingEnabled: true,
    fogExplorationMode: 'none',
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  runtimeMock.getRenderEngine.mockReturnValue(rm as unknown as RenderEngine);
  runtimeMock.computeVisibilityPolygon.mockReturnValue([]);
  rm.get_obstacle_segments_flat.mockReturnValue(new Float32Array());
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
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledWith(200, 400, expect.any(Float32Array), 150);
  });

  it('handles camelCase controlledBy and visionRadius fields', () => {
    useGameStore.setState({
      sprites: [makeSprite({ controlledBy: [1], visionRadius: 120 })],
      userId: 1,
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledWith(200, 400, expect.any(Float32Array), 120);
  });

  it('adds darkvision polygon when has_darkvision is true', () => {
    useGameStore.setState({
      sprites: [makeSprite({ controlled_by: [1], vision_radius: 150, has_darkvision: true, darkvision_radius: 60 })],
      userId: 1,
    } as unknown as Parameters<typeof useGameStore.setState>[0]);
    visionService.start();
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledTimes(2);
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

describe('buildObstacles (via recompute)', () => {
  it('uses render-engine obstacle segments for visibility computation', () => {
    const obstacleSegments = new Float32Array([1, 2, 3, 4]);
    rm.get_obstacle_segments_flat.mockReturnValue(obstacleSegments);
    useGameStore.setState({
      sprites: [makeSprite({ controlled_by: [1], vision_radius: 150 })],
    } as unknown as Parameters<typeof useGameStore.setState>[0]);

    visionService.start();

    expect(rm.get_obstacle_segments_flat).toHaveBeenCalled();
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledWith(200, 400, obstacleSegments, 150);
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
    expect(runtimeMock.computeVisibilityPolygon).toHaveBeenCalledWith(200, 400, expect.any(Float32Array), 200);
  });

  it('stops dm preview and disables lighting', () => {
    visionService.startDmPreview(5);
    visionService.stopDmPreview();
    expect(rm.set_dynamic_lighting_enabled).toHaveBeenLastCalledWith(false);
    expect(rm.set_gm_mode).toHaveBeenCalledWith(true);
  });
});

