/**
 * Canvas state management hook for viewport, zoom, and debug info
 */
import { useEffect, useState, type RefObject } from 'react';
import type { RenderEngine } from '../../../../types';

interface CanvasDebugInfo {
  cssWidth: number;
  cssHeight: number;
  deviceWidth: number;
  deviceHeight: number;
  mouseCss: { x: number; y: number };
  mouseDevice: { x: number; y: number };
  world: { x: number; y: number };
}

/**
 * Hook for tracking canvas debug information
 * Monitors canvas dimensions, mouse position, and world coordinates
 */
export const useCanvasDebug = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  rustRenderManagerRef: RefObject<RenderEngine | null>,
  dprRef: RefObject<number>
): CanvasDebugInfo => {
  const [debug, setDebug] = useState<CanvasDebugInfo>({
    cssWidth: 0,
    cssHeight: 0,
    deviceWidth: 0,
    deviceHeight: 0,
    mouseCss: { x: 0, y: 0 },
    mouseDevice: { x: 0, y: 0 },
    world: { x: 0, y: 0 },
  });

  useEffect(() => {
    function update(e: MouseEvent | UIEvent | null) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = dprRef.current;
      let mouseCss = { x: 0, y: 0 },
        mouseDevice = { x: 0, y: 0 },
        world = { x: 0, y: 0 };

      if (e && 'clientX' in e && 'clientY' in e) {
        mouseCss = {
          x: (e as MouseEvent).clientX - rect.left,
          y: (e as MouseEvent).clientY - rect.top,
        };
        mouseDevice = { x: mouseCss.x * dpr, y: mouseCss.y * dpr };

        if (rustRenderManagerRef.current && rustRenderManagerRef.current.screen_to_world) {
          const w = rustRenderManagerRef.current.screen_to_world(mouseDevice.x, mouseDevice.y);
          if (Array.isArray(w) && w.length === 2) {
            world = { x: w[0], y: w[1] };
          }
        }
      }

      setDebug({
        cssWidth: rect.width,
        cssHeight: rect.height,
        deviceWidth: canvas.width,
        deviceHeight: canvas.height,
        mouseCss,
        mouseDevice,
        world,
      });
    }

    const move = (e: MouseEvent) => update(e);
    window.addEventListener('mousemove', move);
    window.addEventListener('resize', update);
    
    // Initial update
    update(null);
    
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('resize', update);
    };
  }, [canvasRef, rustRenderManagerRef, dprRef]);

  return debug;
};

/**
 * Hook for tracking FPS from the unified FPS service
 */
export const useFPS = (fpsService: { subscribe: (callback: (metrics: { current: number }) => void) => () => void }): number => {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const unsubscribe = fpsService.subscribe((metrics) => {
      setFps(metrics.current);
    });
    return unsubscribe;
  }, [fpsService]);

  return fps;
};

/**
 * Hook for performance monitor visibility toggle
 */
export const usePerformanceMonitor = (): [boolean, () => void] => {
  const [showPerformanceMonitor, setShowPerformanceMonitor] = useState(false);
  const toggleMonitor = () => setShowPerformanceMonitor(prev => !prev);
  return [showPerformanceMonitor, toggleMonitor];
};
