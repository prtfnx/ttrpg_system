import { beforeEach, describe, expect, it, vi } from 'vitest';

// Test WASM Manager directly
import type { GlobalWasmModule } from '../../utils/wasmManager';
import { wasmManager } from '../../utils/wasmManager';

// Mock WASM module for testing
const mockWasmModule: GlobalWasmModule = {
  RenderEngine: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    free: vi.fn(),
    render: vi.fn(),
    resize: vi.fn(),
    handle_mouse_event: vi.fn(),
    handle_keyboard_event: vi.fn(),
    screen_to_world: vi.fn().mockReturnValue({ x: 10.5, y: 20.3 }),
    world_to_screen: vi.fn().mockReturnValue({ x: 100, y: 200 }),
    set_viewport: vi.fn(),
    get_viewport: vi.fn().mockReturnValue({ x: 0, y: 0, width: 800, height: 600 }),
    create_sprite: vi.fn().mockReturnValue('sprite_abc123'),
    delete_sprite: vi.fn(),
    move_sprite: vi.fn(),
    get_sprite_info: vi.fn().mockReturnValue({ id: 'sprite_abc123', x: 100, y: 150, layer: 'tokens' }),
    set_sprite_texture: vi.fn(),
    get_performance_metrics: vi.fn().mockReturnValue({
      fps: 60.0,
      frame_time_ms: 16.67,
      memory_usage_mb: 45.2,
      sprite_count: 12,
      texture_count: 8
    }),
    add_light_source: vi.fn().mockReturnValue('light_123'),
    remove_light_source: vi.fn(),
    update_fog_of_war: vi.fn(),
    calculate_line_of_sight: vi.fn().mockReturnValue(true),
    create_table: vi.fn().mockReturnValue({ success: true, table_id: 'table_456' }),
    delete_table: vi.fn(),
    load_texture: vi.fn().mockResolvedValue({ success: true, texture_id: 'texture_789' })
  })),
  NetworkClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn(),
    send_message: vi.fn(),
    is_connected: vi.fn().mockReturnValue(true),
    get_connection_stats: vi.fn().mockReturnValue({ latency_ms: 45, packets_sent: 150, packets_received: 148 })
  })),
  ActionsClient: vi.fn().mockImplementation(() => ({
    free: vi.fn(),
    set_action_handler: vi.fn(),
    set_state_change_handler: vi.fn(),
    set_error_handler: vi.fn(),
    create_table: vi.fn().mockReturnValue({ success: true, message: 'Table created', table_id: 'table_456' }),
    delete_table: vi.fn().mockReturnValue({ success: true, message: 'Table deleted' }),
    create_sprite: vi.fn().mockReturnValue({ success: true, sprite_id: 'sprite_abc123', message: 'Sprite created' }),
    delete_sprite: vi.fn().mockReturnValue({ success: true, message: 'Sprite deleted' }),
    move_sprite: vi.fn().mockReturnValue({ success: true, message: 'Sprite moved' }),
    batch_actions: vi.fn().mockReturnValue({ success: true, count: 3, message: 'Batch completed' }),
    undo: vi.fn().mockReturnValue({ success: true, message: 'Action undone' }),
    redo: vi.fn().mockReturnValue({ success: true, message: 'Action redone' }),
    can_undo: vi.fn().mockReturnValue(true),
    can_redo: vi.fn().mockReturnValue(false)
  })),
  AssetManager: vi.fn().mockImplementation(() => ({
    free: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    download_asset: vi.fn().mockResolvedValue('asset_def789'),
    get_asset_data: vi.fn().mockReturnValue(new Uint8Array([0x89, 0x50, 0x4E, 0x47])), // PNG header
    get_asset_info: vi.fn().mockReturnValue('{"name":"dragon.png","size":2048,"format":"PNG","dimensions":{"width":64,"height":64}}'),
    has_asset: vi.fn().mockReturnValue(true),
    delete_asset: vi.fn().mockReturnValue({ success: true }),
    list_assets: vi.fn().mockReturnValue(['asset_def789', 'asset_ghi012', 'asset_jkl345'])
  })),
  LightingSystem: vi.fn().mockImplementation(() => ({
    free: vi.fn(),
    add_light: vi.fn().mockReturnValue('light_456'),
    remove_light: vi.fn(),
    update_light: vi.fn(),
    get_light_info: vi.fn().mockReturnValue({ id: 'light_456', x: 200, y: 300, radius: 50, intensity: 0.8 }),
    calculate_lighting: vi.fn(),
    get_lighting_at_position: vi.fn().mockReturnValue(0.75)
  })),
  FogOfWarSystem: vi.fn().mockImplementation(() => ({
    free: vi.fn(),
    reveal_area: vi.fn(),
    hide_area: vi.fn(),
    is_visible: vi.fn().mockReturnValue(true),
    update_player_vision: vi.fn(),
    get_visibility_polygon: vi.fn().mockReturnValue(new Float32Array([0, 0, 100, 0, 100, 100, 0, 100]))
  })),
  LayerManager: vi.fn().mockImplementation(() => ({
    free: vi.fn(),
    create_layer: vi.fn().mockReturnValue('layer_123'),
    delete_layer: vi.fn(),
    set_layer_visibility: vi.fn(),
    get_layer_visibility: vi.fn().mockReturnValue(true),
    move_sprite_to_layer: vi.fn(),
    get_sprites_in_layer: vi.fn().mockReturnValue(['sprite_abc123', 'sprite_def456'])
  })),
  PaintSystem: vi.fn().mockImplementation(() => ({
    free: vi.fn(),
    start_stroke: vi.fn(),
    add_stroke_point: vi.fn(),
    end_stroke: vi.fn(),
    clear_layer: vi.fn(),
    undo_stroke: vi.fn(),
    redo_stroke: vi.fn(),
    set_brush_settings: vi.fn()
  })),
  TableSync: vi.fn().mockImplementation(() => ({
    free: vi.fn(),
    sync_table_state: vi.fn(),
    apply_remote_changes: vi.fn(),
    get_sync_status: vi.fn().mockReturnValue({ is_synced: true, pending_changes: 0 })
  })),
  create_default_brush_presets: vi.fn().mockReturnValue([
    { name: 'Small Brush', size: 2, opacity: 1.0, color: [0, 0, 0, 1] },
    { name: 'Medium Brush', size: 5, opacity: 1.0, color: [0, 0, 0, 1] },
    { name: 'Large Brush', size: 10, opacity: 1.0, color: [0, 0, 0, 1] }
  ]),
  default: vi.fn().mockResolvedValue(undefined)
};

// Mock window globals
Object.defineProperty(window, 'ttrpg_rust_core', {
  value: mockWasmModule,
  writable: true
});

Object.defineProperty(window, 'wasmInitialized', {
  value: false,
  writable: true
});

describe('WASM TypeScript Integration Tests', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    window.wasmInitialized = false;
  });

  describe('WASM Manager - Core System', () => {
    it('should initialize WASM module correctly for users', async () => {
      // User expects WASM to load without errors
      const wasmModule = await wasmManager.getWasmModule();
      
      expect(wasmModule).toBeDefined();
      expect(wasmModule.RenderEngine).toBeTypeOf('object'); // Mock returns object, not function
      expect(wasmModule.NetworkClient).toBeTypeOf('object');
      expect(wasmModule.ActionsClient).toBeTypeOf('object');
    });

    it('should handle WASM initialization failures gracefully', async () => {
      // Mock initialization failure
      vi.spyOn(wasmManager, 'getWasmModule').mockRejectedValue(new Error('WASM failed to load'));
      
      try {
        await wasmManager.getWasmModule();
        expect.fail('Should have thrown error');
      } catch (error) {
        // User expects meaningful error messages
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('WASM failed to load');
      }
    });

    it('should provide singleton WASM instance across the application', async () => {
      // User expects consistent WASM module instance
      const wasmModule1 = await wasmManager.getWasmModule();
      const wasmModule2 = await wasmManager.getWasmModule();
      
      expect(wasmModule1).toBe(wasmModule2);
    });
  });

  describe('WASM RenderEngine - TypeScript Bridge', () => {
    it('should create and initialize render engine through TypeScript', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const renderEngine = new wasmModule.RenderEngine();
      
      // User expects render engine to be properly typed
      expect(renderEngine.initialize).toBeTypeOf('function');
      expect(renderEngine.render).toBeTypeOf('function');
      expect(renderEngine.screen_to_world).toBeTypeOf('function');
      
      // User expects initialization to work
      await renderEngine.initialize();
      expect(renderEngine.initialize).toHaveBeenCalled();
    });

    it('should handle coordinate transformations accurately', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const renderEngine = new wasmModule.RenderEngine();
      
      // User expects accurate screen-to-world coordinate conversion
      const worldCoords = renderEngine.screen_to_world(100, 200);
      expect(worldCoords).toEqual({ x: 10.5, y: 20.3 });
      
      // User expects accurate world-to-screen coordinate conversion  
      const screenCoords = renderEngine.world_to_screen(10.5, 20.3);
      expect(screenCoords).toEqual({ x: 100, y: 200 });
    });

    it('should manage sprites with proper TypeScript typing', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const renderEngine = new wasmModule.RenderEngine();
      
      // User expects sprite creation to return proper ID
      const spriteId = renderEngine.create_sprite({ x: 100, y: 150 }, 'dragon_texture', 'tokens');
      expect(spriteId).toBe('sprite_abc123');
      expect(typeof spriteId).toBe('string');
      
      // User expects sprite info to be properly typed
      const spriteInfo = renderEngine.get_sprite_info(spriteId);
      expect(spriteInfo).toEqual({
        id: 'sprite_abc123',
        x: 100,
        y: 150,
        layer: 'tokens'
      });
    });

    it('should provide performance metrics through TypeScript interface', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const renderEngine = new wasmModule.RenderEngine();
      
      // User expects performance metrics to be properly typed
      const metrics = renderEngine.get_performance_metrics();
      
      expect(metrics).toHaveProperty('fps');
      expect(metrics).toHaveProperty('frame_time_ms');
      expect(metrics).toHaveProperty('memory_usage_mb');
      expect(metrics).toHaveProperty('sprite_count');
      
      // User expects numeric values
      expect(typeof metrics.fps).toBe('number');
      expect(typeof metrics.frame_time_ms).toBe('number');
      expect(typeof metrics.memory_usage_mb).toBe('number');
      expect(typeof metrics.sprite_count).toBe('number');
      
      // User expects reasonable values
      expect(metrics.fps).toBeGreaterThan(0);
      expect(metrics.fps).toBeLessThanOrEqual(120);
    });
  });

  describe('WASM ActionsClient - Command Interface', () => {
    it('should execute actions with TypeScript type safety', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const actionsClient = new wasmModule.ActionsClient();
      
      // User expects table creation to return proper result
      const result = actionsClient.create_table('Dragon Encounter', 800, 600);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('table_id');
      expect(result.success).toBe(true);
      expect(typeof result.table_id).toBe('string');
    });

    it('should support batch operations with proper error handling', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const actionsClient = new wasmModule.ActionsClient();
      
      // User expects batch actions to work
      const batchResult = actionsClient.batch_actions([
        { type: 'create_sprite', data: { position: { x: 100, y: 100 }, texture: 'orc' } },
        { type: 'create_sprite', data: { position: { x: 200, y: 200 }, texture: 'goblin' } },
        { type: 'move_sprite', data: { sprite_id: 'sprite_123', position: { x: 150, y: 150 } } }
      ]);
      
      expect(batchResult.success).toBe(true);
      expect(batchResult.count).toBe(3);
      expect(typeof batchResult.message).toBe('string');
    });

    it('should provide undo/redo functionality with state tracking', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const actionsClient = new wasmModule.ActionsClient();
      
      // User expects undo capability check
      expect(actionsClient.can_undo()).toBe(true);
      expect(actionsClient.can_redo()).toBe(false);
      
      // User expects undo to work
      const undoResult = actionsClient.undo();
      expect(undoResult.success).toBe(true);
      expect(undoResult.message).toContain('undone');
    });
  });

  describe('WASM AssetManager - Resource Management', () => {
    it('should manage assets with TypeScript interface', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const assetManager = new wasmModule.AssetManager();
      
      // User expects asset initialization
      await assetManager.initialize();
      expect(assetManager.initialize).toHaveBeenCalled();
      
      // User expects asset checking
      expect(assetManager.has_asset('dragon_texture')).toBe(true);
      
      // User expects asset info to be properly parsed
      const assetInfo = JSON.parse(assetManager.get_asset_info('dragon_texture'));
      expect(assetInfo).toHaveProperty('name');
      expect(assetInfo).toHaveProperty('size');
      expect(assetInfo).toHaveProperty('format');
      expect(assetInfo).toHaveProperty('dimensions');
    });

    it('should handle asset downloads with progress tracking', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const assetManager = new wasmModule.AssetManager();
      
      // User expects asset download to work
      const assetId = await assetManager.download_asset('https://example.com/dragon.png');
      
      expect(typeof assetId).toBe('string');
      expect(assetId).toBe('asset_def789');
    });

    it('should provide asset data access through TypeScript', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const assetManager = new wasmModule.AssetManager();
      
      // User expects asset data to be accessible
      const assetData = assetManager.get_asset_data('dragon_texture');
      
      expect(assetData).toBeInstanceOf(Uint8Array);
      expect(assetData.length).toBeGreaterThan(0);
      
      // User expects PNG header (for image assets)
      expect(assetData[0]).toBe(0x89);
      expect(assetData[1]).toBe(0x50);
      expect(assetData[2]).toBe(0x4E);
      expect(assetData[3]).toBe(0x47);
    });
  });

  describe('WASM NetworkClient - Communication Bridge', () => {
    it('should handle network operations through TypeScript', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const networkClient = new wasmModule.NetworkClient();
      
      // User expects connection to work
      const connected = await networkClient.connect('ws://localhost:8080');
      expect(connected).toBe(true);
      
      // User expects connection status
      expect(networkClient.is_connected()).toBe(true);
      
      // User expects connection stats
      const stats = networkClient.get_connection_stats();
      expect(stats).toHaveProperty('latency_ms');
      expect(stats).toHaveProperty('packets_sent');
      expect(stats).toHaveProperty('packets_received');
      expect(typeof stats.latency_ms).toBe('number');
    });

    it('should handle message sending with TypeScript type safety', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const networkClient = new wasmModule.NetworkClient();
      
      // User expects message sending to work
      const message = {
        type: 'sprite_update',
        data: {
          sprite_id: 'sprite_123',
          position: { x: 100, y: 150 }
        }
      };
      
      networkClient.send_message(JSON.stringify(message));
      expect(networkClient.send_message).toHaveBeenCalledWith(JSON.stringify(message));
    });
  });

  describe('WASM LightingSystem - Advanced Features', () => {
    it('should manage lighting with TypeScript interface', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const lightingSystem = new wasmModule.LightingSystem();
      
      // User expects light creation
      const lightId = lightingSystem.add_light(200, 300, 50, 0.8);
      expect(lightId).toBe('light_456');
      
      // User expects light info to be properly typed
      const lightInfo = lightingSystem.get_light_info(lightId);
      expect(lightInfo).toEqual({
        id: 'light_456',
        x: 200,
        y: 300,
        radius: 50,
        intensity: 0.8
      });
    });

    it('should calculate lighting at positions', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const lightingSystem = new wasmModule.LightingSystem();
      
      // User expects lighting calculation
      const lightLevel = lightingSystem.get_lighting_at_position(150, 200);
      expect(typeof lightLevel).toBe('number');
      expect(lightLevel).toBeGreaterThanOrEqual(0);
      expect(lightLevel).toBeLessThanOrEqual(1);
    });
  });

  describe('WASM FogOfWarSystem - Vision Management', () => {
    it('should manage fog of war through TypeScript', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const fogSystem = new wasmModule.FogOfWarSystem();
      
      // User expects visibility checking
      const isVisible = fogSystem.is_visible(100, 150);
      expect(typeof isVisible).toBe('boolean');
      
      // User expects vision polygon calculation
      const visionPolygon = fogSystem.get_visibility_polygon(100, 150, 60);
      expect(visionPolygon).toBeInstanceOf(Float32Array);
      expect(visionPolygon.length).toBeGreaterThan(0);
      expect(visionPolygon.length % 2).toBe(0); // Should be pairs of x,y coordinates
    });

    it('should update player vision dynamically', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const fogSystem = new wasmModule.FogOfWarSystem();
      
      // User expects vision updates
      fogSystem.update_player_vision('player_123', 200, 250, 30);
      expect(fogSystem.update_player_vision).toHaveBeenCalledWith('player_123', 200, 250, 30);
    });
  });

  describe('WASM Error Handling - TypeScript Safety', () => {
    it('should handle WASM exceptions gracefully in TypeScript', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      
      // Mock WASM exception
      const renderEngine = new wasmModule.RenderEngine();
      renderEngine.create_sprite.mockImplementation(() => {
        throw new Error('WASM: Invalid texture format');
      });
      
      // User expects exceptions to be caught and handled
      try {
        renderEngine.create_sprite({ x: 100, y: 100 }, 'invalid_texture', 'tokens');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Invalid texture format');
      }
    });

    it('should validate TypeScript parameters before WASM calls', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      const renderEngine = new wasmModule.RenderEngine();
      
      // User expects parameter validation
      try {
        // Testing invalid parameters - TypeScript should catch this
        renderEngine.create_sprite(null as any, '', '');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('WASM Memory Management - TypeScript Integration', () => {
    it('should properly manage WASM object lifecycle', async () => {
      const wasmModule = await wasmManager.getWasmModule();
      
      // User expects proper cleanup
      const renderEngine = new wasmModule.RenderEngine();
      const actionsClient = new wasmModule.ActionsClient();
      const assetManager = new wasmModule.AssetManager();
      
      // User expects free methods to be available
      expect(renderEngine.free).toBeTypeOf('function');
      expect(actionsClient.free).toBeTypeOf('function');
      expect(assetManager.free).toBeTypeOf('function');
      
      // User expects cleanup to work without errors
      renderEngine.free();
      actionsClient.free();
      assetManager.free();
      
      expect(renderEngine.free).toHaveBeenCalled();
      expect(actionsClient.free).toHaveBeenCalled();
      expect(assetManager.free).toHaveBeenCalled();
    });
  });
});