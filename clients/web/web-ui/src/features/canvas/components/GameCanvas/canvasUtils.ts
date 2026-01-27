/**
 * Canvas utility functions for coordinate transformations and grid calculations
 */

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
  rustRenderManager: any
): void => {
  // Get size from container instead of canvas element to avoid timing issues
  const container = canvas.parentElement;
  if (!container) {
    console.warn('Canvas has no parent container for sizing');
    return;
  }
  
  const dpr = window.devicePixelRatio || 1;
  dprRef.current = dpr;
  const containerRect = container.getBoundingClientRect();
  
  // Use container dimensions for the canvas size
  const targetWidth = containerRect.width;
  const targetHeight = containerRect.height;
  
  // Check if the size has actually changed
  const newDeviceWidth = Math.round(targetWidth * dpr);
  const newDeviceHeight = Math.round(targetHeight * dpr);
  const currentDeviceWidth = canvas.width;
  const currentDeviceHeight = canvas.height;
  
  if (newDeviceWidth === currentDeviceWidth && newDeviceHeight === currentDeviceHeight) {
    return;
  }

  // Compute world coordinate at canvas center before changing internal size.
  let worldCenter: number[] | null = null;
  try {
    const rm: any = rustRenderManager;
    if (rm && typeof rm.screen_to_world === 'function') {
      const deviceCenterX = currentDeviceWidth / 2;
      const deviceCenterY = currentDeviceHeight / 2;
      const w = rm.screen_to_world(deviceCenterX, deviceCenterY);
      if (Array.isArray(w) && w.length >= 2) {
        worldCenter = w;
      }
    }
  } catch (err) {
    console.warn('screen_to_world before resize failed:', err);
  }

  // Update canvas internal resolution
  canvas.width = newDeviceWidth;
  canvas.height = newDeviceHeight;
  canvas.style.width = targetWidth + 'px';
  canvas.style.height = targetHeight + 'px';

  // Notify WASM of resize if method exists
  try {
    const rm: any = rustRenderManager;
    if (rm) {
      let resizeSuccess = false;
      if (typeof rm.resize_canvas === 'function') {
        rm.resize_canvas(canvas.width, canvas.height);
        resizeSuccess = true;
      } else if (typeof rm.resize === 'function') {
        rm.resize(canvas.width, canvas.height);
        resizeSuccess = true;
      } else if (typeof rm.resizeCanvas === 'function') {
        rm.resizeCanvas(canvas.width, canvas.height);
        resizeSuccess = true;
      }
      if (!resizeSuccess) {
        console.warn('🦀 WASM: No resize method found on render manager');
      }
    } else {
      console.warn('🦀 WASM: No render manager available for resize');
    }
  } catch (err) {
    console.error('WASM resize error:', err);
  }

  // Re-center camera so the same world point stays under the canvas center
  try {
    const rm: any = rustRenderManager;
    if (worldCenter && rm) {
      if (typeof rm.center_camera === 'function') {
        rm.center_camera(worldCenter[0], worldCenter[1]);
      } else if (typeof rm.centerCamera === 'function') {
        rm.centerCamera(worldCenter[0], worldCenter[1]);
      }
      // Force a render immediately after resize+recenter to avoid visual lag
      if (typeof rm.render === 'function') {
        rm.render();
      }
    }
  } catch (err) {
    console.error('WASM center_camera after resize failed:', err);
  }
};
