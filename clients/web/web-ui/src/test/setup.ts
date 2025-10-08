import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
(globalThis as any).ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
(globalThis as any).IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock window.requestAnimationFrame and cancelAnimationFrame
(globalThis as any).requestAnimationFrame = vi.fn(cb => setTimeout(cb, 0));
(globalThis as any).cancelAnimationFrame = vi.fn(id => clearTimeout(id));

// Mock HTMLCanvasElement getContext method
(HTMLCanvasElement.prototype.getContext as any) = vi.fn((contextType: string) => {
  if (contextType === '2d') {
    return {
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ 
        data: new Uint8ClampedArray(4),
        width: 1,
        height: 1,
        colorSpace: 'srgb' as PredefinedColorSpace
      })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => ({ 
        data: new Uint8ClampedArray(4), 
        width: 1, 
        height: 1,
        colorSpace: 'srgb' as PredefinedColorSpace
      })),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, fontBoundingBoxAscent: 0, fontBoundingBoxDescent: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0, emHeightAscent: 0, emHeightDescent: 0, hangingBaseline: 0, alphabeticBaseline: 0, ideographicBaseline: 0 })),
      transform: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      canvas: {} as HTMLCanvasElement,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      // Add other minimal required 2D properties
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;
  }
  
  if (contextType === 'webgl' || contextType === 'webgl2') {
    return {
      getExtension: vi.fn(),
      getParameter: vi.fn(),
      createShader: vi.fn(),
      createProgram: vi.fn(),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      useProgram: vi.fn(),
      createBuffer: vi.fn(),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      vertexAttribPointer: vi.fn(),
      enableVertexAttribArray: vi.fn(),
      drawArrays: vi.fn(),
      viewport: vi.fn(),
      clearColor: vi.fn(),
      clear: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      blendFunc: vi.fn(),
      canvas: {} as HTMLCanvasElement,
    } as unknown as WebGLRenderingContext;
  }
  
  return null;
});

// Mock performance API
Object.assign(performance, {
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByName: vi.fn(() => []),
  getEntriesByType: vi.fn(() => []),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn(),
});

// Mock CSS custom property support for JSDOM
// JSDOM has issues with CSS variables, so we'll provide fallback values
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = function(element: Element, pseudoElement?: string | null): CSSStyleDeclaration {
  const style = originalGetComputedStyle.call(this, element, pseudoElement);
  
  // Create a proxy to handle CSS variable fallbacks
  return new Proxy(style, {
    get(target, property) {
      const value = target[property as keyof CSSStyleDeclaration];
      
      // Handle CSS variable resolution for common cases
      if (typeof value === 'string' && value.includes('var(--')) {
        // Replace common CSS variables with fallback values for testing
        return value
          .replace(/var\(--border-primary\)/g, '#404040')
          .replace(/var\(--bg-primary\)/g, '#0a0a0a')
          .replace(/var\(--bg-secondary\)/g, '#1a1a1a')
          .replace(/var\(--text-primary\)/g, '#ffffff')
          .replace(/var\(--accent-primary\)/g, '#646cff')
          .replace(/var\(--spacing-[a-z]+\)/g, '8px')
          .replace(/var\(--radius-[a-z]+\)/g, '4px');
      }
      
      return value;
    }
  });
};

// Override CSS processing in JSDOM to handle CSS variables
// Patch the CSS module to prevent parsing errors with CSS variables
const originalCreateStyleSheet = (Document.prototype as any).createStyleSheet;
if (originalCreateStyleSheet) {
  (Document.prototype as any).createStyleSheet = function(...args: any[]) {
    return originalCreateStyleSheet.apply(this, args);
  };
}

// Mock CSSStyleSheet and CSS rule handling for JSDOM
const mockCSSStyleSheet = {
  insertRule: vi.fn(() => 0),
  deleteRule: vi.fn(),
  cssRules: [],
  ownerRule: null,
  rules: [],
  addRule: vi.fn(),
  removeRule: vi.fn()
};

// Override document.styleSheets to handle CSS variable issues
Object.defineProperty(document, 'styleSheets', {
  value: [mockCSSStyleSheet],
  writable: true
});

// Create a safer CSS property setter that handles CSS variables
const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
CSSStyleDeclaration.prototype.setProperty = function(property: string, value: string, priority?: string) {
  // Handle CSS variables by converting them to static values for testing
  let processedValue = value;
  if (typeof value === 'string' && value.includes('var(--')) {
    processedValue = value
      .replace(/var\(--border-primary\)/g, '#404040')
      .replace(/var\(--bg-primary\)/g, '#0a0a0a')
      .replace(/var\(--bg-secondary\)/g, '#1a1a1a')
      .replace(/var\(--text-primary\)/g, '#ffffff')
      .replace(/var\(--accent-primary\)/g, '#646cff')
      .replace(/var\(--spacing-[a-z]+\)/g, '8px')
      .replace(/var\(--radius-[a-z]+\)/g, '4px');
  }
  
  // For border shorthand specifically, parse it safely
  if (property === 'border' && typeof processedValue === 'string') {
    // Split border shorthand into components to avoid JSDOM parsing errors
    const borderParts = processedValue.split(' ');
    if (borderParts.length >= 3) {
      try {
        originalSetProperty.call(this, 'border-width', borderParts[0], priority);
        originalSetProperty.call(this, 'border-style', borderParts[1], priority);
        originalSetProperty.call(this, 'border-color', borderParts[2], priority);
        return;
      } catch (e) {
        // If individual properties fail, try the original
      }
    }
  }
  
  try {
    return originalSetProperty.call(this, property, processedValue, priority);
  } catch (e) {
    // Silently fail for CSS property setting errors in tests
    console.debug(`CSS property setting failed in test: ${property}=${processedValue}`, e);
  }
};

// Mock window.rustRenderManager for useRenderEngine hook
Object.defineProperty(window, 'rustRenderManager', {
  value: {
    // GM Mode and Status
    setGmMode: vi.fn(),
    setStatusMessage: vi.fn(),
    clearStatusMessage: vi.fn(),
    getGmMode: vi.fn(() => false),
    set_gm_mode: vi.fn(),
    
    // Fog Draw Mode
    is_in_fog_draw_mode: vi.fn(() => false),
    get_current_input_mode: vi.fn(() => 'normal'),
    set_fog_draw_mode: vi.fn(),
    set_fog_erase_mode: vi.fn(),
    
    // Fog Management
    add_fog_rectangle: vi.fn(),
    remove_fog_rectangle: vi.fn(),
    clear_fog: vi.fn(),
    get_fog_count: vi.fn(() => 0),
    
    // Lighting System
    add_light: vi.fn(),
    remove_light: vi.fn(),
    set_light_color: vi.fn(),
    set_light_intensity: vi.fn(),
    set_light_radius: vi.fn(),
    get_light_count: vi.fn(() => 0),
    
    // Paint System
    paint_set_brush_color: vi.fn(),
    paint_set_brush_size: vi.fn(),
    paint_start_stroke: vi.fn(),
    paint_continue_stroke: vi.fn(),
    paint_end_stroke: vi.fn(),
    paint_clear: vi.fn(),
    paint_save_strokes_as_sprites: vi.fn(() => []),
    paint_is_mode: vi.fn(() => false),
    paint_exit_mode: vi.fn(),
    set_input_mode_select: vi.fn(),
    set_input_mode_create_rectangle: vi.fn(),
    paint_is_drawing: vi.fn(() => false),
    paint_get_brush_color: vi.fn(() => '#000000'),
    paint_get_brush_size: vi.fn(() => 5),
    paint_undo: vi.fn(),
    paint_redo: vi.fn(),
    paint_can_undo: vi.fn(() => false),
    paint_can_redo: vi.fn(() => false),
    paint_save_template: vi.fn(() => 'template_id_123'),
    paint_load_template: vi.fn(),
    paint_get_templates: vi.fn(() => []),
    paint_delete_template: vi.fn(),
    paint_set_blend_mode: vi.fn(),
    paint_get_blend_mode: vi.fn(() => 'normal'),
    screen_to_world: vi.fn((x, y) => [x, y]),
    world_to_screen: vi.fn((x, y) => [x, y]),
    get_grid_size: vi.fn(() => 50),
    set_grid_enabled: vi.fn(),
    set_grid_size: vi.fn(),
    set_snap_to_grid: vi.fn(),
    
    // Text Sprite System
    create_text_sprite: vi.fn(() => 'text_sprite_1'),
    register_movable_entity: vi.fn(),
    add_sprite_to_layer: vi.fn(),
    enable_sprite_movement: vi.fn(),
    
    // Rendering
    render: vi.fn(),
    updateLighting: vi.fn(),
    updateFog: vi.fn()
  },
  writable: true
});

// Mock NetworkClient class for testing
class MockNetworkClient {
  // private messageHandler: ((type: string, data: any) => void) | null = null; // TODO: Use for mock message simulation
  private connectionHandler: ((state: string, error?: string) => void) | null = null;
  // private errorHandler: ((error: string) => void) | null = null; // TODO: Use for mock error simulation
  private clientId = 'test-client-' + Math.random().toString(36).substr(2, 9);

  set_message_handler(_handler: (type: string, data: any) => void) {
    // this.messageHandler = handler; // TODO: Store for mock message simulation
  }

  set_connection_handler(handler: (state: string, error?: string) => void) {
    this.connectionHandler = handler;
  }

  set_error_handler(_handler: (error: string) => void) {
    // this.errorHandler = handler; // TODO: Store for mock error simulation
  }

  get_client_id() {
    return this.clientId;
  }

  connect(_url: string) {
    // Simulate async connection
    setTimeout(() => {
      if (this.connectionHandler) {
        this.connectionHandler('connected');
      }
    }, 10);
  }

  disconnect() {
    if (this.connectionHandler) {
      this.connectionHandler('disconnected');
    }
  }

  send_message(_type: string, _data: any) {
    // Simulate message send - could trigger messageHandler in real implementation
    return Promise.resolve();
  }
}

// Mock wasmManager with proper NetworkClient
const mockWasmManager = {
  getInstance: vi.fn(() => Promise.resolve({
    initialize: vi.fn(),
    isInitialized: vi.fn(() => true)
  })),
  getNetworkClient: vi.fn(() => Promise.resolve(MockNetworkClient)), // Return the class constructor
  getRenderEngine: vi.fn(() => Promise.resolve(window.rustRenderManager)),
  getActionsClient: vi.fn(() => Promise.resolve({})),
  getAssetManager: vi.fn(() => Promise.resolve({}))
};

// Replace the wasmManager import in tests
vi.mock('../wasm/wasmManager', () => ({
  wasmManager: mockWasmManager
}));

// Mock Image so that canvas.toDataURL -> new Image() load path works in tests
class MockImage {
  public onload: ((ev: Event) => any) | null = null;
  public onerror: ((ev: Event) => any) | null = null;
  private _src = '';

  set src(value: string) {
    this._src = value;
    // Simulate async load
    setTimeout(() => {
      if (typeof this.onload === 'function') {
        try { this.onload(new Event('load')); } catch {};
      }
    }, 0);
  }

  get src() {
    return this._src;
  }
}

(window as any).Image = MockImage;