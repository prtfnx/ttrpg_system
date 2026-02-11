/**
 * Canvas event handlers hook
 * Manages mouse, wheel, and keyboard events for canvas interaction
 */
import type { RenderEngine } from '@lib/wasm/wasm';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { getRelativeCoords } from './canvasUtils';

interface LightPlacementMode {
  active: boolean;
  preset: any;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  spriteId?: string;
  copiedSprite?: string;
  showLayerSubmenu?: boolean;
}

interface UseCanvasEventsProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  rustRenderManagerRef: RefObject<RenderEngine | null>;
  lightPlacementMode: LightPlacementMode | null;
  setLightPlacementMode: (mode: LightPlacementMode | null) => void;
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
  showPerformanceMonitor: boolean;
  togglePerformanceMonitor: () => void;
}

export const useCanvasEvents = ({
  canvasRef,
  rustRenderManagerRef,
  lightPlacementMode,
  setLightPlacementMode,
  setContextMenu,
  showPerformanceMonitor,
  togglePerformanceMonitor,
}: UseCanvasEventsProps) => {
  // Refs for mouse handlers to prevent WASM reinitialization
  const handleMouseDownRef = useRef<((e: MouseEvent) => void) | null>(null);
  const handleMouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const handleMouseUpRef = useRef<((e: MouseEvent) => void) | null>(null);
  const handleWheelRef = useRef<((e: WheelEvent) => void) | null>(null);
  const handleRightClickRef = useRef<((e: MouseEvent) => void) | null>(null);
  const handleKeyDownRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Check if we're in light placement mode
      if (lightPlacementMode?.active && rustRenderManagerRef.current) {
        const { x, y } = getRelativeCoords(e, canvas);

        // Convert screen coordinates to world coordinates
        const worldCoords = rustRenderManagerRef.current.screen_to_world(x, y);
        if (worldCoords && worldCoords.length === 2) {
          // Dispatch event to LightingPanel with world coordinates
          window.dispatchEvent(
            new CustomEvent('lightPlaced', {
              detail: {
                x: worldCoords[0],
                y: worldCoords[1],
                preset: lightPlacementMode.preset,
              },
            })
          );

          // Exit placement mode
          setLightPlacementMode(null);
          canvas.style.cursor = 'grab';
        } else {
          console.warn('[MOUSE] Failed to get valid world coords');
        }
        return; // Don't process other mouse events
      }

      if (rustRenderManagerRef.current) {
        const { x, y } = getRelativeCoords(e, canvas);
        // Check if we have the new Ctrl-aware method
        const renderManager = rustRenderManagerRef.current as any;
        if (renderManager.handle_mouse_down_with_ctrl) {
          renderManager.handle_mouse_down_with_ctrl(x, y, e.ctrlKey);
        } else {
          // Fallback to original method
          renderManager.handle_mouse_down(x, y);
        }
      }
    },
    [canvasRef, rustRenderManagerRef, lightPlacementMode, setLightPlacementMode]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !rustRenderManagerRef.current) return;

      const { x, y } = getRelativeCoords(e, canvas);
      rustRenderManagerRef.current.handle_mouse_move(x, y);

      // Update cursor based on what's under the mouse
      if (rustRenderManagerRef.current.get_cursor_type) {
        const cursorType = rustRenderManagerRef.current.get_cursor_type(x, y);
        canvas.style.cursor = cursorType;
      }
    },
    [canvasRef, rustRenderManagerRef]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !rustRenderManagerRef.current) return;

      const { x, y } = getRelativeCoords(e, canvas);
      rustRenderManagerRef.current.handle_mouse_up(x, y);

      // Update cursor after mouse up
      if (rustRenderManagerRef.current.get_cursor_type) {
        const cursorType = rustRenderManagerRef.current.get_cursor_type(x, y);
        canvas.style.cursor = cursorType;
      }
    },
    [canvasRef, rustRenderManagerRef]
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !rustRenderManagerRef.current) return;

      e.preventDefault();
      const { x, y } = getRelativeCoords(e, canvas);
      console.log('[WHEEL] Wheel event:', e.deltaY, 'at coords:', x, y);
      rustRenderManagerRef.current.handle_wheel(x, y, e.deltaY);
    },
    [canvasRef, rustRenderManagerRef]
  );

  const handleRightClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas || !rustRenderManagerRef.current) return;

      const { x, y } = getRelativeCoords(e, canvas);
      const spriteId = rustRenderManagerRef.current.handle_right_click(x, y);

      setContextMenu((prev) => ({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        spriteId: spriteId || undefined,
        copiedSprite: prev.copiedSprite, // Preserve copiedSprite
        showLayerSubmenu: false,
      }));
    },
    [canvasRef, rustRenderManagerRef, setContextMenu]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Toggle performance monitor with F3 key
      if (e.key === 'F3') {
        e.preventDefault();
        togglePerformanceMonitor();
      }
      // Toggle performance monitor with Ctrl+Shift+P
      else if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        togglePerformanceMonitor();
      }
    },
    [showPerformanceMonitor, togglePerformanceMonitor]
  );

  // Update handler refs whenever handlers change
  useEffect(() => {
    handleMouseDownRef.current = handleMouseDown;
    handleMouseMoveRef.current = handleMouseMove;
    handleMouseUpRef.current = handleMouseUp;
    handleWheelRef.current = handleWheel;
    handleRightClickRef.current = handleRightClick;
    handleKeyDownRef.current = handleKeyDown;
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleRightClick, handleKeyDown]);

  // Stable wrapper functions for event listeners (don't change, preventing WASM reinit)
  const stableMouseDown = useCallback((e: MouseEvent) => {
    handleMouseDownRef.current?.(e);
  }, []);

  const stableMouseMove = useCallback((e: MouseEvent) => {
    handleMouseMoveRef.current?.(e);
  }, []);

  const stableMouseUp = useCallback((e: MouseEvent) => {
    handleMouseUpRef.current?.(e);
  }, []);

  const stableWheel = useCallback((e: WheelEvent) => {
    handleWheelRef.current?.(e);
  }, []);

  const stableRightClick = useCallback((e: MouseEvent) => {
    handleRightClickRef.current?.(e);
  }, []);

  const stableKeyDown = useCallback((e: KeyboardEvent) => {
    handleKeyDownRef.current?.(e);
  }, []);

  return {
    stableMouseDown,
    stableMouseMove,
    stableMouseUp,
    stableWheel,
    stableRightClick,
    stableKeyDown,
  };
};
