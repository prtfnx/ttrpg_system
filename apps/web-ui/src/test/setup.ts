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
import { afterEach, vi } from 'vitest';

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
      json: () => Promise.resolve({ id: 1, username: 'testuser' }),
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
globalThis.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16)) as unknown as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));

// Canvas context mock
HTMLCanvasElement.prototype.getContext = vi.fn(function(this: HTMLCanvasElement, type: string) {
  if (type === '2d') {
    return {
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      clearRect: vi.fn(),
      rect: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      setTransform: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
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
      canvas: this,
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
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

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

(globalThis as typeof globalThis & { __VITEST__?: boolean }).__VITEST__ = true;

// ============================================================================
// CLEANUP
// ============================================================================

afterEach(() => {
  vi.clearAllMocks();
});
