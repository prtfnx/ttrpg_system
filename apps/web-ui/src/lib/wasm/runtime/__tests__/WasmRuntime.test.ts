import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitWasmEvent } from '../../wasmEvents';
import { WasmRuntime } from '../WasmRuntime';

const mocks = vi.hoisted(() => {
  const renderEngine = {
    render: vi.fn(),
    free: vi.fn(),
    set_camera: vi.fn(),
    set_current_user_id: vi.fn(),
    set_gm_mode: vi.fn(),
    set_active_layer: vi.fn(),
    set_runtime_operation_handler: vi.fn(),
    set_runtime_event_handler: vi.fn(),
    clear_runtime_operation_handler: vi.fn(),
    clear_runtime_event_handler: vi.fn(),
    set_shape_style: vi.fn(),
  };

  return {
    initializeWasmCore: vi.fn(),
    initGameRenderer: vi.fn(),
    version: vi.fn(() => '1.2.3-test'),
    computeVisibilityPolygon: vi.fn(() => [{ x: 1, y: 2 }]),
    createDefaultBrushPresets: vi.fn(() => [{ id: 'round' }]),
    renderEngine,
    actionsFree: vi.fn(),
    assetFree: vi.fn(),
    networkFree: vi.fn(),
    planningFree: vi.fn(),
    tableFree: vi.fn(),
    tableSyncFree: vi.fn(),
    bridgeInit: vi.fn(),
    bridgeCleanup: vi.fn(),
    bridgeSetProtocol: vi.fn(),
    integrationInitialize: vi.fn(),
    integrationDispose: vi.fn(),
    assetIntegrationInitialize: vi.fn(),
    assetIntegrationDispose: vi.fn(),
  };
});

vi.mock('../../wasmCore', () => ({
  initializeWasmCore: mocks.initializeWasmCore,
}));

vi.mock('../../generated/ttrpg_rust_core', () => ({
  ActionsClient: vi.fn(function () { return { free: mocks.actionsFree }; }),
  AssetManager: vi.fn(function () { return { free: mocks.assetFree }; }),
  NetworkClient: vi.fn(function () { return { free: mocks.networkFree }; }),
  PlanningManager: vi.fn(function () { return { free: mocks.planningFree }; }),
  TableManager: vi.fn(function () { return { free: mocks.tableFree }; }),
  TableSync: vi.fn(function () { return { free: mocks.tableSyncFree }; }),
  create_default_brush_presets: mocks.createDefaultBrushPresets,
  compute_visibility_polygon: mocks.computeVisibilityPolygon,
  init_game_renderer: mocks.initGameRenderer,
  version: mocks.version,
}));

vi.mock('../../wasmBridge', () => ({
  wasmBridgeService: {
    init: mocks.bridgeInit,
    cleanup: mocks.bridgeCleanup,
    setProtocol: mocks.bridgeSetProtocol,
  },
}));

vi.mock('../../wasmEvents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../wasmEvents')>();
  return {
    ...actual,
    emitWasmEvent: vi.fn(actual.emitWasmEvent),
  };
});

vi.mock('../WasmSyncCoordinator', () => ({
  WasmSyncCoordinator: vi.fn(function () {
    return {
    initialize: mocks.integrationInitialize,
    dispose: mocks.integrationDispose,
    };
  }),
}));

vi.mock('@features/assets', () => ({
  assetIntegrationService: {
    initialize: mocks.assetIntegrationInitialize,
    dispose: mocks.assetIntegrationDispose,
  },
}));

describe('WasmRuntime', () => {
  let runtime: WasmRuntime;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.initializeWasmCore.mockResolvedValue(undefined);
    mocks.initGameRenderer.mockReturnValue(mocks.renderEngine);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 17));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    runtime = new WasmRuntime();
    canvas = document.createElement('canvas');
  });

  afterEach(() => {
    runtime.dispose();
    vi.unstubAllGlobals();
  });

  it('initializes the wasm module and owned clients once', async () => {
    await runtime.initialize();
    await runtime.initialize();

    expect(mocks.initializeWasmCore).toHaveBeenCalledTimes(1);
    expect(runtime.status).toMatchObject({
      isModuleReady: true,
      isCanvasAttached: false,
      error: null,
      version: '1.2.3-test',
    });
    expect(runtime.getActionsEngine()).not.toBeNull();
    expect(runtime.getTableSync()).not.toBeNull();
    expect(runtime.getDefaultBrushPresets()).toEqual([{ id: 'round' }]);
  });

  it('attaches a canvas, wires side-effect services, and starts the render loop', async () => {
    const engine = await runtime.attachCanvas(canvas, {
      userId: 42,
      role: 'owner',
      activeLayer: 'tokens',
    });

    expect(engine).toBe(mocks.renderEngine);
    expect(mocks.initGameRenderer).toHaveBeenCalledWith(canvas);
    expect(mocks.renderEngine.set_camera).toHaveBeenCalledWith(0, 0, 1);
    expect(mocks.renderEngine.set_current_user_id).toHaveBeenCalledWith(42);
    expect(mocks.renderEngine.set_gm_mode).toHaveBeenCalledWith(true);
    expect(mocks.renderEngine.set_active_layer).toHaveBeenCalledWith('tokens');
    expect(mocks.renderEngine.set_runtime_operation_handler).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.renderEngine.set_runtime_event_handler).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.bridgeInit).toHaveBeenCalled();
    expect(mocks.integrationInitialize).toHaveBeenCalledWith(mocks.renderEngine);
    expect(mocks.assetIntegrationInitialize).toHaveBeenCalled();
    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(runtime.status.isCanvasAttached).toBe(true);
  });

  it('reuses an attached engine while updating mutable canvas context', async () => {
    await runtime.attachCanvas(canvas, { userId: 1, role: 'player', activeLayer: 'map' });
    const second = await runtime.attachCanvas(canvas, { userId: 2, role: 'owner', activeLayer: 'light' });

    expect(second).toBe(mocks.renderEngine);
    expect(mocks.initGameRenderer).toHaveBeenCalledTimes(1);
    expect(mocks.renderEngine.set_current_user_id).toHaveBeenLastCalledWith(2);
    expect(mocks.renderEngine.set_gm_mode).toHaveBeenLastCalledWith(true);
    expect(mocks.renderEngine.set_active_layer).toHaveBeenLastCalledWith('light');
  });

  it('routes shape style through the generated render contract', async () => {
    await runtime.attachCanvas(canvas, { userId: null, role: null, activeLayer: 'map' });

    runtime.setShapeStyle('#ff8800', 0.75, true);

    expect(mocks.renderEngine.set_shape_style).toHaveBeenCalledWith('#ff8800', 0.75, true);
  });

  it('computes visibility polygons through the generated runtime boundary', async () => {
    const obstacles = new Float32Array([1, 2, 3, 4]);

    const result = runtime.computeVisibilityPolygon(10, 20, obstacles, 120);

    expect(result).toEqual([{ x: 1, y: 2 }]);
    expect(mocks.computeVisibilityPolygon).toHaveBeenCalledWith(10, 20, obstacles, 120);
  });

  it('detaches the canvas and cleans up renderer-owned services', async () => {
    await runtime.attachCanvas(canvas, { userId: null, role: null, activeLayer: 'map' });

    runtime.detachCanvas();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(17);
    expect(mocks.integrationDispose).toHaveBeenCalled();
    expect(mocks.assetIntegrationDispose).toHaveBeenCalled();
    expect(mocks.renderEngine.clear_runtime_operation_handler).toHaveBeenCalled();
    expect(mocks.renderEngine.clear_runtime_event_handler).toHaveBeenCalled();
    expect(mocks.renderEngine.free).toHaveBeenCalled();
    expect(runtime.getRenderEngine()).toBeNull();
    expect(runtime.status.isCanvasAttached).toBe(false);
  });

  it('routes Rust sprite create operations through the attached protocol', async () => {
    const protocol = { createSprite: vi.fn() };
    runtime.setProtocol(protocol);
    await runtime.attachCanvas(canvas, { userId: null, role: null, activeLayer: 'map' });

    const callback = mocks.renderEngine.set_runtime_operation_handler.mock.calls[0][0];
    callback({
      type: 'spriteCreateRequested',
      data: { sprite_id: 'shape-1', x: 10, y: 12, obstacle_type: 'rectangle' },
    });

    expect(protocol.createSprite).toHaveBeenCalledWith({
      sprite_id: 'shape-1',
      x: 10,
      y: 12,
      obstacle_type: 'rectangle',
    });
  });

  it('bridges Rust spriteAdded runtime events to existing browser listeners', async () => {
    const listener = vi.fn();
    window.addEventListener('spriteAdded', listener);
    await runtime.attachCanvas(canvas, { userId: null, role: null, activeLayer: 'map' });

    const callback = mocks.renderEngine.set_runtime_event_handler.mock.calls[0][0];
    callback({ type: 'spriteAdded', data: {} });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(emitWasmEvent).toHaveBeenCalledWith('spriteAdded', {});
    window.removeEventListener('spriteAdded', listener);
  });

  it('bridges Rust preview and movement runtime events to existing browser listeners', async () => {
    const received: Array<[string, unknown]> = [];
    const recordEvent = (type: string): EventListener => (event: Event) => {
      received.push([type, (event as CustomEvent).detail]);
    };
    const subscriptions: Array<[string, EventListener]> = [
      ['sprite-drag-preview', recordEvent('sprite-drag-preview')],
      ['sprite-resize-preview', recordEvent('sprite-resize-preview')],
      ['sprite-rotate-preview', recordEvent('sprite-rotate-preview')],
      ['wasm-light-moved', recordEvent('wasm-light-moved')],
      ['wasm-wall-moved', recordEvent('wasm-wall-moved')],
      ['wasm-tool-mode-changed', recordEvent('wasm-tool-mode-changed')],
      ['wasm-cursor-hint', recordEvent('wasm-cursor-hint')],
      ['wallDrawn', recordEvent('wallDrawn')],
      ['polygonCreated', recordEvent('polygonCreated')],
      ['tokenDoubleClick', recordEvent('tokenDoubleClick')],
      ['measurementComplete', recordEvent('measurementComplete')],
      ['textSpriteClick', recordEvent('textSpriteClick')],
      ['wasm-sprite-operation', recordEvent('wasm-sprite-operation')],
      ['request-asset-download', recordEvent('request-asset-download')],
    ];
    subscriptions.forEach(([type, listener]) => window.addEventListener(type, listener));
    await runtime.attachCanvas(canvas, { userId: null, role: null, activeLayer: 'map' });

    const callback = mocks.renderEngine.set_runtime_event_handler.mock.calls[0][0];
    callback({ type: 'spriteDragPreview', data: { spriteId: 's1', x: 10, y: 20 } });
    callback({ type: 'spriteResizePreview', data: { spriteId: 's1', width: 30, height: 40 } });
    callback({ type: 'spriteRotatePreview', data: { spriteId: 's1', rotation: 45 } });
    callback({ type: 'lightMoved', data: { lightId: 'l1', x: 50, y: 60 } });
    callback({ type: 'wallMoved', data: { wallId: 'w1', x1: 1, y1: 2, x2: 3, y2: 4 } });
    callback({ type: 'toolModeChanged', data: { mode: 'move' } });
    callback({ type: 'cursorHint', data: { cursor: 'pointer' } });
    callback({ type: 'wallDrawn', data: { x1: 5, y1: 6, x2: 7, y2: 8 } });
    callback({ type: 'polygonCreated', data: { vertices: [{ x: 1, y: 2 }] } });
    callback({ type: 'tokenDoubleClick', data: { spriteId: 's1' } });
    callback({ type: 'measurementComplete', data: { distance: 10, gameUnits: 5, gridUnits: 5 } });
    callback({ type: 'textSpriteClick', data: { x: 15, y: 20 } });
    callback({ type: 'spriteOperationCompleted', data: { spriteId: 's1', operation: 'move', data: { x: 1, y: 2 } } });
    callback({ type: 'assetDownloadRequested', data: { asset_id: 'asset-1' } });

    expect(received).toEqual([
      ['sprite-drag-preview', { spriteId: 's1', x: 10, y: 20 }],
      ['sprite-resize-preview', { spriteId: 's1', width: 30, height: 40 }],
      ['sprite-rotate-preview', { spriteId: 's1', rotation: 45 }],
      ['wasm-light-moved', { lightId: 'l1', x: 50, y: 60 }],
      ['wasm-wall-moved', { wallId: 'w1', x1: 1, y1: 2, x2: 3, y2: 4 }],
      ['wasm-tool-mode-changed', { mode: 'move' }],
      ['wasm-cursor-hint', { cursor: 'pointer' }],
      ['wallDrawn', { x1: 5, y1: 6, x2: 7, y2: 8 }],
      ['polygonCreated', { vertices: [{ x: 1, y: 2 }] }],
      ['tokenDoubleClick', { spriteId: 's1' }],
      ['measurementComplete', { distance: 10, gameUnits: 5, gridUnits: 5 }],
      ['textSpriteClick', { x: 15, y: 20 }],
      ['wasm-sprite-operation', { spriteId: 's1', operation: 'move', data: { x: 1, y: 2 } }],
      ['request-asset-download', { asset_id: 'asset-1' }],
    ]);

    subscriptions.forEach(([type, listener]) => window.removeEventListener(type, listener));
  });

  it('records initialization errors and allows a later retry', async () => {
    const error = new Error('boom');
    mocks.initializeWasmCore.mockRejectedValueOnce(error);

    await expect(runtime.initialize()).rejects.toThrow('boom');

    expect(runtime.status).toMatchObject({
      isModuleReady: false,
      error,
    });

    await runtime.initialize();

    expect(mocks.initializeWasmCore).toHaveBeenCalledTimes(2);
    expect(runtime.status.error).toBeNull();
    expect(runtime.status.isModuleReady).toBe(true);
  });

  it('propagates attachCanvas initialization errors without attaching a canvas', async () => {
    const error = new Error('init failed');
    mocks.initializeWasmCore.mockRejectedValueOnce(error);

    await expect(
      runtime.attachCanvas(canvas, { userId: null, role: null, activeLayer: 'map' }),
    ).rejects.toThrow('init failed');

    expect(mocks.initGameRenderer).not.toHaveBeenCalled();
    expect(runtime.status.error).toBe(error);
    expect(runtime.status.isModuleReady).toBe(false);
    expect(runtime.status.isCanvasAttached).toBe(false);
  });
});
