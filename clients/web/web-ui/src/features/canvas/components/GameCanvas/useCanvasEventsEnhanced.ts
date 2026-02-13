/**
 * Enhanced Canvas Events Hook with Integrated Input Management
 * Manages mouse, wheel, and keyboard events with proper input architecture
 */
import { inputManager } from '@features/canvas/services';
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
  protocol?: any; // Network protocol for server sync
}

export const useCanvasEvents = ({
  canvasRef,
  rustRenderManagerRef,
  lightPlacementMode,
  setLightPlacementMode,
  setContextMenu,
  showPerformanceMonitor,
  togglePerformanceMonitor,
  protocol,
}: UseCanvasEventsProps) => {
  // Refs for handlers to prevent WASM reinitialization
  const handleMouseDownRef = useRef<((e: MouseEvent) => void) | null>(null);
  const handleMouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const handleMouseUpRef = useRef<((e: MouseEvent) => void) | null>(null);
  const handleWheelRef = useRef<((e: WheelEvent) => void) | null>(null);
  const handleRightClickRef = useRef<((e: MouseEvent) => void) | null>(null);
  const handleKeyDownRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // Mouse position for paste operations
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Register input action handlers
  useEffect(() => {
    const engine = rustRenderManagerRef.current;
    if (!engine) return;

    // Register all input actions
    const actionHandlers = {
      delete_selected: () => {
        const selectedSprites = engine.get_selected_sprites?.() || [];
        selectedSprites.forEach((spriteId: string) => {
          if (protocol) {
            protocol.removeSprite(spriteId);
          } else {
            engine.delete_sprite(spriteId);
          }
        });
      },

      copy_selected: () => {
        const selectedSprites = engine.get_selected_sprites?.() || [];
        if (selectedSprites.length > 0) {
          // For simplicity, copy first selected sprite
          // TODO: Implement multi-sprite clipboard
          const spriteData = engine.copy_sprite(selectedSprites[0]);
          if (spriteData) {
            setContextMenu(prev => ({ ...prev, copiedSprite: spriteData }));
            inputManager.updateContext({ hasClipboard: true });
          }
        }
      },

      paste_sprites: (event: KeyboardEvent) => {
        setContextMenu(prev => {
          if (prev.copiedSprite) {
            const canvas = canvasRef.current;
            if (canvas) {
              // Use last mouse position or center of canvas
              const { x, y } = lastMousePosRef.current;
              const worldCoords = engine.screen_to_world(x, y);
              if (worldCoords && worldCoords.length >= 2) {
                const newSpriteId = engine.paste_sprite('tokens', prev.copiedSprite, worldCoords[0], worldCoords[1]);
                if (protocol && newSpriteId) {
                  // Sync new sprite to server
                  const spriteData = engine.get_sprite_data?.(newSpriteId);
                  if (spriteData) {
                    protocol.createSprite(spriteData);
                  }
                }
              }
            }
          }
          return prev;
        });
      },

      scale_up: () => {
        const selectedSprites = engine.get_selected_sprites?.() || [];
        selectedSprites.forEach((spriteId: string) => {
          const currentScale = engine.get_sprite_scale?.(spriteId) || { x: 1.0, y: 1.0 };
          const newScale = { x: currentScale.x * 1.1, y: currentScale.y * 1.1 };
          engine.update_sprite_scale(spriteId, newScale.x, newScale.y);
          if (protocol) {
            protocol.updateSprite(spriteId, { scale_x: newScale.x, scale_y: newScale.y });
          }
        });
      },

      scale_down: () => {
        const selectedSprites = engine.get_selected_sprites?.() || [];
        selectedSprites.forEach((spriteId: string) => {
          const currentScale = engine.get_sprite_scale?.(spriteId) || { x: 1.0, y: 1.0 };
          const newScale = { x: currentScale.x * 0.9, y: currentScale.y * 0.9 };
          engine.update_sprite_scale(spriteId, newScale.x, newScale.y);
          if (protocol) {
            protocol.updateSprite(spriteId, { scale_x: newScale.x, scale_y: newScale.y });
          }
        });
      },

      undo: () => {
        if (engine.can_undo?.()) {
          engine.undo_action?.();
        }
      },

      redo: () => {
        if (engine.can_redo?.()) {
          engine.redo_action?.();
        }
      },

      move_up: () => {
        moveSelectedSprites(0, -10);
      },

      move_down: () => {
        moveSelectedSprites(0, 10);
      },

      move_left: () => {
        moveSelectedSprites(-10, 0);
      },

      move_right: () => {
        moveSelectedSprites(10, 0);
      },

      select_all: () => {
        engine.select_all_sprites?.();
        updateInputContext();
      },

      clear_selection: () => {
        engine.clear_selection?.();
        updateInputContext();
      },

      toggle_performance: () => {
        togglePerformanceMonitor();
      },
    };

    // Helper function for sprite movement
    const moveSelectedSprites = (deltaX: number, deltaY: number) => {
      const selectedSprites = engine.get_selected_sprites?.() || [];
      selectedSprites.forEach((spriteId: string) => {
        const currentPos = engine.get_sprite_position?.(spriteId);
        if (currentPos) {
          const newPos = { x: currentPos.x + deltaX, y: currentPos.y + deltaY };
          engine.update_sprite_position(spriteId, newPos.x, newPos.y);
          if (protocol) {
            protocol.updateSprite(spriteId, { x: newPos.x, y: newPos.y });
          }
        }
      });
    };

    // Helper function to update input context
    const updateInputContext = () => {
      const selectedSprites = engine.get_selected_sprites?.() || [];
      inputManager.updateContext({
        selectedSprites,
        canUndo: engine.can_undo?.() || false,
        canRedo: engine.can_redo?.() || false,
      });
    };

    // Register all action handlers
    Object.entries(actionHandlers).forEach(([action, handler]) => {
      inputManager.onAction(action, handler);
    });

    // Update context initially
    updateInputContext();

    // Cleanup on unmount
    return () => {
      Object.entries(actionHandlers).forEach(([action, handler]) => {
        inputManager.removeAction(action, handler);
      });
    };
  }, [rustRenderManagerRef.current, protocol, canvasRef, setContextMenu, togglePerformanceMonitor]);

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Update last mouse position for paste operations
      lastMousePosRef.current = { x: e.offsetX, y: e.offsetY };

      // Check if we're in light placement mode
      if (lightPlacementMode?.active && rustRenderManagerRef.current) {
        const { x, y } = getRelativeCoords(e, canvas);
        const worldCoords = rustRenderManagerRef.current.screen_to_world(x, y);
        if (worldCoords && worldCoords.length === 2) {
          window.dispatchEvent(
            new CustomEvent('lightPlaced', {
              detail: {
                x: worldCoords[0],
                y: worldCoords[1],
                preset: lightPlacementMode.preset,
              },
            })
          );
          setLightPlacementMode(null);
          canvas.style.cursor = 'grab';
        }
        return;
      }

      if (rustRenderManagerRef.current) {
        const { x, y } = getRelativeCoords(e, canvas);
        const renderManager = rustRenderManagerRef.current as any;
        if (renderManager.handle_mouse_down_with_ctrl) {
          renderManager.handle_mouse_down_with_ctrl(x, y, e.ctrlKey);
        } else {
          renderManager.handle_mouse_down(x, y);
        }

        // Update input context after selection changes
        setTimeout(() => updateInputContext(), 0);
      }
    },
    [canvasRef, rustRenderManagerRef, lightPlacementMode, setLightPlacementMode]
  );

  const updateInputContext = useCallback(() => {
    const engine = rustRenderManagerRef.current;
    if (engine) {
      const selectedSprites = engine.get_selected_sprites?.() || [];
      inputManager.updateContext({
        selectedSprites,
        canUndo: engine.can_undo?.() || false,
        canRedo: engine.can_redo?.() || false,
      });
    }
  }, [rustRenderManagerRef]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !rustRenderManagerRef.current) return;

      // Update last mouse position
      lastMousePosRef.current = { x: e.offsetX, y: e.offsetY };

      const { x, y } = getRelativeCoords(e, canvas);
      rustRenderManagerRef.current.handle_mouse_move(x, y);
    },
    [canvasRef, rustRenderManagerRef]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !rustRenderManagerRef.current) return;

      const { x, y } = getRelativeCoords(e, canvas);
      rustRenderManagerRef.current.handle_mouse_up(x, y);
    },
    [canvasRef, rustRenderManagerRef]
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !rustRenderManagerRef.current) return;

      const { x, y } = getRelativeCoords(e, canvas);
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
        copiedSprite: prev.copiedSprite,
        showLayerSubmenu: false,
      }));
    },
    [canvasRef, rustRenderManagerRef, setContextMenu]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Let the InputManager handle the keyboard shortcuts
      const handled = inputManager.handleKeyDown(e);
      
      // Update input context after potential state changes
      if (handled) {
        setTimeout(() => updateInputContext(), 0);
      }
    },
    [updateInputContext]
  );

  // Handle canvas focus events
  const handleCanvasFocus = useCallback(() => {
    inputManager.updateContext({ isCanvasFocused: true });
  }, []);

  const handleCanvasBlur = useCallback(() => {
    inputManager.updateContext({ isCanvasFocused: false });
  }, []);

  // Update handler refs whenever handlers change
  useEffect(() => {
    handleMouseDownRef.current = handleMouseDown;
    handleMouseMoveRef.current = handleMouseMove;
    handleMouseUpRef.current = handleMouseUp;
    handleWheelRef.current = handleWheel;
    handleRightClickRef.current = handleRightClick;
    handleKeyDownRef.current = handleKeyDown;
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleRightClick, handleKeyDown]);

  // Stable wrapper functions for event listeners
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
    handleCanvasFocus,
    handleCanvasBlur,
  };
};