/**
 * Canvas utility functions for coordinate transformations and grid calculations
 */

import type { RenderEngine } from '@lib/wasm/wasm';

/**
 * Get nearest grid coordinate for snapping
 */
export const getGridCoord = (world: { x: number; y: number }, gridSize: number = 50) => {
  return {
    x: Math.round(world.x / gridSize) * gridSize,
    y: Math.round(world.y / gridSize) * gridSize,
  };
};

/**
 * Calculate relative coordinates from mouse event to canvas
 */
export const getRelativeCoords = (
  e: MouseEvent | WheelEvent,
  canvas: HTMLCanvasElement
): { x: number; y: number } => {
  const rect = canvas.getBoundingClientRect();
  
  // Calculate mouse position relative to the canvas display area
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;
  
  // Scale to canvas internal resolution (accounts for DPR scaling)
  // canvas.width/height are the internal dimensions, rect.width/height are display dimensions
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = rawX * scaleX;
  const y = rawY * scaleY;
  
  return { x, y };
};

/**
 * Resize canvas to match container size with device pixel ratio
 */
export const resizeCanvas = (
  canvas: HTMLCanvasElement,
  dprRef: React.MutableRefObject<number>,
  rustRenderManager: RenderEngine | null
): void => {
  const container = canvas.parentElement;
  if (!container) {
    console.warn('Canvas has no parent container for sizing');
    return;
  }
  
  const dpr = window.devicePixelRatio || 1;
  dprRef.current = dpr;
  const containerRect = container.getBoundingClientRect();
  
  const targetWidth = containerRect.width;
  const targetHeight = containerRect.height;
  
  const newDeviceWidth = Math.round(targetWidth * dpr);
  const newDeviceHeight = Math.round(targetHeight * dpr);
  
  if (newDeviceWidth === canvas.width && newDeviceHeight === canvas.height) {
    return;
  }

  let worldCenter: [number, number] | null = null;
  if (rustRenderManager) {
    try {
      const w = rustRenderManager.screen_to_world(canvas.width / 2, canvas.height / 2);
      if (w && w.length >= 2) {
        worldCenter = [w[0], w[1]];
      }
    } catch (err) {
      console.warn('screen_to_world before resize failed:', err);
    }
  }

  canvas.width = newDeviceWidth;
  canvas.height = newDeviceHeight;
  canvas.style.width = targetWidth + 'px';
  canvas.style.height = targetHeight + 'px';

  if (rustRenderManager) {
    try {
      rustRenderManager.resize_canvas(canvas.width, canvas.height);
    } catch (err) {
      try {
        rustRenderManager.resize(canvas.width, canvas.height);
      } catch {
        console.error('WASM resize error:', err);
      }
    }

    if (worldCenter) {
      try {
        rustRenderManager.center_camera(worldCenter[0], worldCenter[1]);
        rustRenderManager.render();
      } catch (err) {
        console.error('WASM center_camera after resize failed:', err);
      }
    }
  }
};
