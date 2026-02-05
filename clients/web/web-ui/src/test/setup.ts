/**
 * Vitest Test Setup
 * 
 * This file provides minimal, focused mocks for testing React components.
 * 
 * Principles:
 * 1. Mock only what's necessary (external dependencies, browser APIs)
 * 2. Don't mock React components - test them as users see them
 * 3. Keep mocks simple and predictable
 */
import '@testing-library/jest-dom';
import { afterEach, beforeAll, vi } from 'vitest';

// ============================================================================
// BROWSER API MOCKS (required for JSDOM environment)
// ============================================================================

// Fetch - always mock to prevent real HTTP calls
globalThis.fetch = vi.fn().mockImplementation((url: string) => {
  // Return sensible defaults for common endpoints
  if (typeof url === 'string' && url.includes('/auth/')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 1, username: 'testuser', role: 'dm' }),
      text: () => Promise.resolve('{}'),
    });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  });
}) as typeof fetch;

// Window APIs
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

// IntersectionObserver
globalThis.IntersectionObserver = class IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
} as unknown as typeof IntersectionObserver;

// requestAnimationFrame
globalThis.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16)) as any;
globalThis.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));

// Canvas context mock
HTMLCanvasElement.prototype.getContext = vi.fn(function(this: HTMLCanvasElement, type: string) {
  if (type === '2d') {
    const canvas = this;
    return {
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => {
        // Return ImageData with requested dimensions, not always 1x1
        const size = width * height * 4;
        return { 
          data: new Uint8ClampedArray(size), 
          width, 
          height,
          colorSpace: 'srgb' as PredefinedColorSpace
        };
      }),
      putImageData: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      canvas,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    };
  }
  if (type === 'webgl' || type === 'webgl2') {
    // WebGL constants that need to be defined as numbers
    const MAX_TEXTURE_SIZE = 34024;
    const MAX_TEXTURE_IMAGE_UNITS = 34930;
    const MAX_VERTEX_TEXTURE_IMAGE_UNITS = 35660;
    const MAX_RENDERBUFFER_SIZE = 34024;
    
    return {
      // Constants (properties)
      MAX_TEXTURE_SIZE,
      MAX_TEXTURE_IMAGE_UNITS,
      MAX_VERTEX_TEXTURE_IMAGE_UNITS,
      MAX_RENDERBUFFER_SIZE,
      TEXTURE_2D: 3553,
      TEXTURE_CUBE_MAP: 34067,
      
      // Core methods that services call during initialization
      getParameter: vi.fn((param: number) => {
        if (param === MAX_TEXTURE_SIZE || param === 34024) return 4096;
        if (param === MAX_TEXTURE_IMAGE_UNITS || param === 34930) return 16;
        if (param === MAX_VERTEX_TEXTURE_IMAGE_UNITS || param === 35660) return 8;
        return 0;
      }),
      getExtension: vi.fn(() => null),
      getSupportedExtensions: vi.fn(() => []),
      
      // Shader methods
      createShader: vi.fn(() => ({})),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn(() => true),
      getShaderInfoLog: vi.fn(() => ''),
      deleteShader: vi.fn(),
      
      // Program methods
      createProgram: vi.fn(() => ({})),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: vi.fn(() => true),
      getProgramInfoLog: vi.fn(() => ''),
      useProgram: vi.fn(),
      deleteProgram: vi.fn(),
      
      // Buffer methods
      createBuffer: vi.fn(() => ({})),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      deleteBuffer: vi.fn(),
      
      // Texture methods  
      createTexture: vi.fn(() => ({})),
      bindTexture: vi.fn(),
      texImage2D: vi.fn(),
      texParameteri: vi.fn(),
      generateMipmap: vi.fn(),
      deleteTexture: vi.fn(),
      activeTexture: vi.fn(),
      
      // Drawing methods
      viewport: vi.fn(),
      clearColor: vi.fn(),
      clear: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      blendFunc: vi.fn(),
      drawArrays: vi.fn(),
      drawElements: vi.fn(),
      
      // Uniform/attribute methods
      getUniformLocation: vi.fn(() => ({})),
      getAttribLocation: vi.fn(() => 0),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      uniform1i: vi.fn(),
      uniform1f: vi.fn(),
      uniform2f: vi.fn(),
      uniform3f: vi.fn(),
      uniform4f: vi.fn(),
      uniformMatrix4fv: vi.fn(),
      
      // State methods
      pixelStorei: vi.fn(),
      getError: vi.fn(() => 0), // NO_ERROR
      isContextLost: vi.fn(() => false),
      
      // Canvas reference
      canvas: { width: 800, height: 600 },
      drawingBufferWidth: 800,
      drawingBufferHeight: 600,
    };
  }
  return null;
}) as any;

// ============================================================================
// WASM MOCKS (for Rust/WASM integration)
// ============================================================================

// Mock the WASM module that would be loaded dynamically
const createMockWasmModule = () => ({
  default: vi.fn().mockResolvedValue(undefined), // initWasm
  RenderEngine: class MockRenderEngine {
    free = vi.fn();
    render = vi.fn();
    set_camera = vi.fn();
    add_sprite = vi.fn();
    remove_sprite = vi.fn();
  },
  AssetManager: class MockAssetManager {
    initialize = vi.fn().mockResolvedValue(undefined);
    set_max_cache_size = vi.fn((_size: bigint) => undefined);
    set_max_age = vi.fn((_age: number) => undefined);
    get_cache_stats = vi.fn(() => JSON.stringify({ 
      total_assets: 0, 
      total_size: 0,
      cache_hits: 0,
      cache_misses: 0,
      evictions: 0
    }));
    download_asset = vi.fn().mockResolvedValue('asset_id');
    has_asset = vi.fn((_id: string) => true);
    get_asset = vi.fn((_id: string) => new Uint8Array(0));
    list_assets = vi.fn(() => JSON.stringify([]));
    cleanup_cache = vi.fn().mockResolvedValue(undefined);
    clear_cache = vi.fn().mockResolvedValue(undefined);
    calculate_asset_hash = vi.fn((data: Uint8Array) => 'mock_hash_' + data.length);
    remove_asset = vi.fn((_id: string) => true);
  },
  TableManager: class MockTableManager {
    create_table = vi.fn(() => true);
    get_all_tables = vi.fn(() => '[]');
    get_active_table_id = vi.fn(() => null);
    set_active_table = vi.fn(() => true);
    remove_table = vi.fn(() => true);
  },
  NetworkClient: class MockNetworkClient {
    set_message_handler = vi.fn();
    set_connection_handler = vi.fn();
    set_error_handler = vi.fn();
    connect = vi.fn().mockResolvedValue({ connected: true });
    disconnect = vi.fn();
    send_message = vi.fn().mockResolvedValue(undefined);
    get_client_id = vi.fn(() => 'test-client-id');
  },
  LightingSystem: class MockLightingSystem {
    add_light = vi.fn();
    remove_light = vi.fn();
    set_ambient = vi.fn();
  },
  FogOfWarSystem: class MockFogOfWarSystem {
    reveal_area = vi.fn();
    hide_area = vi.fn();
    clear_fog = vi.fn();
  },
  PaintSystem: class MockPaintSystem {
    start_stroke = vi.fn();
    add_point = vi.fn();
    end_stroke = vi.fn();
    set_brush = vi.fn();
  },
  ActionsClient: class MockActionsClient {
    execute_action = vi.fn();
    queue_action = vi.fn();
    get_queue = vi.fn(() => []);
  },
});

// Set up window.ttrpg_rust_core before any tests run
beforeAll(() => {
  (window as any).ttrpg_rust_core = createMockWasmModule();
  (window as any).wasm = (window as any).ttrpg_rust_core;
  
  // Mock rustRenderManager for components that access it directly
  (window as any).rustRenderManager = {
    render: vi.fn(),
    set_camera: vi.fn(),
    get_camera: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    add_sprite: vi.fn(),
    remove_sprite: vi.fn(),
    update_sprite_position: vi.fn(),
    add_sprite_to_layer: vi.fn(),
    get_layer_sprite_count: vi.fn(() => 0),
    set_layer_visible: vi.fn(),
    set_layer_opacity: vi.fn(),
    add_light: vi.fn(),
    remove_light: vi.fn(),
    set_light_color: vi.fn(),
    set_light_intensity: vi.fn(),
    world_to_screen: vi.fn((x: number, y: number) => [x, y]),
    screen_to_world: vi.fn((x: number, y: number) => [x, y]),
    create_text_sprite: vi.fn(() => 'text_sprite_1'),
    free: vi.fn(),
    // Grid system methods
    set_grid_enabled: vi.fn(),
    get_grid_enabled: vi.fn(() => true),
    set_grid_size: vi.fn(),
    get_grid_size: vi.fn(() => 50),
    // Sprite syncing methods
    get_all_sprites_network_data: vi.fn(() => []),
    // Paint tool methods
    paint_is_mode: vi.fn(() => false),
    paint_set_mode: vi.fn(),
    paint_enter_mode: vi.fn((_width: number, _height: number) => undefined),
    paint_exit_mode: vi.fn(),
    paint_get_brush_size: vi.fn(() => 5),
    paint_set_brush_size: vi.fn(),
    paint_get_color: vi.fn(() => '#000000'),
    paint_set_color: vi.fn(),
    // Input mode methods
    set_input_mode_select: vi.fn(),
    set_input_mode_measurement: vi.fn(),
    set_input_mode_create_rectangle: vi.fn(),
    set_input_mode_create_circle: vi.fn(),
    set_input_mode_create_line: vi.fn(),
    set_input_mode_create_text: vi.fn(),
    set_input_mode_paint: vi.fn(),
  };
});

// ============================================================================
// EXTERNAL LIBRARY MOCKS
// ============================================================================

// react-toastify
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  ToastContainer: () => null,
}));

// ============================================================================
// VITEST ENVIRONMENT FLAG
// ============================================================================

(globalThis as any).__VITEST__ = true;

// ============================================================================
// CLEANUP
// ============================================================================

afterEach(() => {
  vi.clearAllMocks();
});
