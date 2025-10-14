import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import mockProtocol, { defaultUseProtocol, resetMockProtocol } from './utils/mockProtocol';
import { createMockRenderEngine } from './utils/mockRenderEngine';
import mockWasmManager, { resetNetworkClientFactory } from './utils/mockWasmManager';

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

// Mock ResizeObserver with a simple class so .disconnect exists
(globalThis as any).ResizeObserver = function(this: any, cb: any) {
  this.observe = vi.fn();
  this.unobserve = vi.fn();
  this.disconnect = vi.fn();
  this.callback = cb;
};

// Mock IntersectionObserver similarly
(globalThis as any).IntersectionObserver = function(this: any, cb: any) {
  this.observe = vi.fn();
  this.unobserve = vi.fn();
  this.disconnect = vi.fn();
  this.callback = cb;
};

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

// Provide a default, stubbed render engine that tests can override per-test
(window as any).rustRenderManager = createMockRenderEngine();

// Mark that we're in a Vitest environment so production code can switch to
// non-throwing, test-friendly paths when it checks for __VITEST__.
(globalThis as any).__VITEST__ = true;

// Use the test utils mock wasmManager so tests can control the network client factory
vi.mock('../wasm/wasmManager', () => ({
  wasmManager: mockWasmManager
}));

// Provide a default test-safe implementation of useProtocol and ProtocolProvider
vi.mock('../services/ProtocolContext', async (importOriginal) => {
  const actual = await importOriginal();
  const a: any = actual;
  return {
    ...a,
    useProtocol: () => defaultUseProtocol(),
    ProtocolProvider: mockProtocol.ProtocolProviderMock
  } as any;
});

// Cleanup hooks to keep tests isolated
afterEach(() => {
  vi.restoreAllMocks();
  // unstub globals that tests may replace
  try { vi.unstubAllGlobals(); } catch (e) { /* no-op if unavailable */ }
  // reset network client factory to default
  try { resetNetworkClientFactory(); } catch (e) { /* no-op */ }
  try { resetMockProtocol(); } catch (e) { /* no-op */ }
});

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