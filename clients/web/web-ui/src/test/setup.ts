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