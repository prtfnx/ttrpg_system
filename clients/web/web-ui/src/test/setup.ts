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