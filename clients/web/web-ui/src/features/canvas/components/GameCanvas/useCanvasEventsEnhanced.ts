/**
 * Enhanced Canvas Event Handling with InputManager Integration
 * Maintains compatibility with existing GameCanvas interface
 */

import type { RenderEngine } from '@lib/wasm/wasm';
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { inputManager } from '../../services/InputManager';
import { getRelativeCoords } from './canvasUtils';

export interface CanvasEventsEnhanced {
  stableMouseDown: (event: MouseEvent) => void;
  stableMouseUp: (event: MouseEvent) => void;  
  stableMouseMove: (event: MouseEvent) => void;
  stableKeyDown: (event: KeyboardEvent) => void;
  stableWheel: (event: WheelEvent) => void;
  stableRightClick: (event: MouseEvent) => void;
  handleCanvasFocus: () => void;
  handleCanvasBlur: () => void;
  selectedSpriteIds: string[];
}

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

export interface UseCanvasEventsEnhancedProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  rustRenderManagerRef: RefObject<RenderEngine | null>;
  lightPlacementMode: LightPlacementMode | null;
  setLightPlacementMode: (mode: LightPlacementMode | null) => void;
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
  showPerformanceMonitor?: boolean;
  togglePerformanceMonitor: () => void;
  protocol?: any;
}

export const useCanvasEventsEnhanced = ({ 
  canvasRef, 
  rustRenderManagerRef,
  lightPlacementMode,
  setLightPlacementMode,
  setContextMenu,
  togglePerformanceMonitor,
  protocol
}: UseCanvasEventsEnhancedProps): CanvasEventsEnhanced => {
  const selectedSpriteIdsRef = useRef<string[]>([]);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Update input context when selection changes
  const updateInputContext = useCallback(() => {
    const engine = rustRenderManagerRef.current;
    if (engine) {
      const selectedSpriteIds = (engine as any).get_selected_sprites?.() || [];
      selectedSpriteIdsRef.current = selectedSpriteIds;
      inputManager.updateContext({
        selectedSpriteIds,
        canUndo: (engine as any).can_undo?.() || false,
        canRedo: (engine as any).can_redo?.() || false,
      });
    }
  }, [rustRenderManagerRef]);

  // Register input action handlers
  useEffect(() => {
    const engine = rustRenderManagerRef.current;
    if (!engine) return;

    const actionHandlers = {
      delete_selected: () => {
        const selectedSpriteIds = (engine as any).get_selected_sprites?.() || [];
        selectedSpriteIds.forEach((spriteId: string) => {
          if (protocol) {
            protocol.removeSpirte(spriteId);
          } else {
            (engine as any).delete_sprite(spriteId);
          }
        });
        updateInputContext();
      },

      copy_selected: () => {
        const selectedSpriteIds = (engine as any).get_selected_sprites?.() || [];
        if (selectedSpriteIds.length > 0) {
          const spriteData = (engine as any).copy_sprite?.(selectedSpriteIds[0]);
          if (spriteData) {
            setContextMenu(prev => ({ ...prev, copiedSprite: spriteData }));
            inputManager.updateContext({ hasClipboard: true });
          }
        }
      },

      paste_sprites: () => {
        const copiedData = null; // TODO: Implement clipboard
        if (copiedData && protocol) {
          protocol.pasteSprite(lastMousePosRef.current.x, lastMousePosRef.current.y);
        }
      },

      scale_up: () => {
        const selectedSpriteIds = (engine as any).get_selected_sprites?.() || [];
        selectedSpriteIds.forEach((spriteId: string) => {
          const currentScale = (engine as any).get_sprite_scale?.(spriteId);
          if (currentScale && Array.isArray(currentScale)) {
            const newScale = [currentScale[0] * 1.1, currentScale[1] * 1.1];
            (engine as any).set_sprite_scale?.(spriteId, newScale[0], newScale[1]);
            if (protocol) {
              protocol.updateSprite(spriteId, { scale: newScale });
            }
          }
        });
      },

      scale_down: () => {
        const selectedSpriteIds = (engine as any).get_selected_sprites?.() || [];
        selectedSpriteIds.forEach((spriteId: string) => {
          const currentScale = (engine as any).get_sprite_scale?.(spriteId);
          if (currentScale && Array.isArray(currentScale)) {
            const newScale = [currentScale[0] * 0.9, currentScale[1] * 0.9];
            (engine as any).set_sprite_scale?.(spriteId, newScale[0], newScale[1]);
            if (protocol) {
              protocol.updateSprite(spriteId, { scale: newScale });
            }
          }
        });
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
        (engine as any).select_all_sprites?.();
        updateInputContext();
      },

      clear_selection: () => {
        (engine as any).clear_selection?.();
        updateInputContext();
      },

      toggle_performance: () => {
        togglePerformanceMonitor();
      },
    };

    const moveSelectedSprites = (deltaX: number, deltaY: number) => {
      const selectedSpriteIds = (engine as any).get_selected_sprites?.() || [];
      selectedSpriteIds.forEach((spriteId: string) => {
        const currentPos = (engine as any).get_sprite_position?.(spriteId);
        if (currentPos && Array.isArray(currentPos)) {
          const newPos = [currentPos[0] + deltaX, currentPos[1] + deltaY];
          (engine as any).set_sprite_position?.(spriteId, newPos[0], newPos[1]);
          if (protocol) {
            protocol.updateSprite(spriteId, { x: newPos[0], y: newPos[1] });
          }
        }
      });
    };

    // Register all action handlers
    Object.entries(actionHandlers).forEach(([action, handler]) => {
      inputManager.onAction(action, handler);
    });

    updateInputContext();

    return () => {
      Object.entries(actionHandlers).forEach(([action, handler]) => {
        inputManager.offAction(action, handler);
      });
    };
  }, [rustRenderManagerRef, protocol, setContextMenu, togglePerformanceMonitor, updateInputContext]);

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      lastMousePosRef.current = { x: e.offsetX, y: e.offsetY };

      if (lightPlacementMode?.active && rustRenderManagerRef.current) {
        const { x, y } = getRelativeCoords(e, canvas);
        const worldCoords = (rustRenderManagerRef.current as any).screen_to_world(x, y);
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
        setTimeout(() => updateInputContext(), 0);
      }
    },
    [canvasRef, rustRenderManagerRef, lightPlacementMode, setLightPlacementMode, updateInputContext]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !rustRenderManagerRef.current) return;

      lastMousePosRef.current = { x: e.offsetX, y: e.offsetY };

      const { x, y } = getRelativeCoords(e, canvas);
      (rustRenderManagerRef.current as any).handle_mouse_move(x, y);
    },
    [canvasRef, rustRenderManagerRef]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !rustRenderManagerRef.current) return;

      const { x, y } = getRelativeCoords(e, canvas);
      (rustRenderManagerRef.current as any).handle_mouse_up(x, y);
      setTimeout(() => updateInputContext(), 0);
    },
    [canvasRef, rustRenderManagerRef, updateInputContext]
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !rustRenderManagerRef.current) return;

      const { x, y } = getRelativeCoords(e, canvas);
      (rustRenderManagerRef.current as any).handle_wheel(x, y, e.deltaY);
    },
    [canvasRef, rustRenderManagerRef]
  );

  const handleRightClick = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !rustRenderManagerRef.current) return;

      e.preventDefault();
      const { x, y } = getRelativeCoords(e, canvas);
      const clickedSpriteId = (rustRenderManagerRef.current as any).get_sprite_at_position?.(x, y);
      
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        spriteId: clickedSpriteId || undefined,
        copiedSprite: undefined,
        showLayerSubmenu: false
      });
    },
    [canvasRef, rustRenderManagerRef, setContextMenu]
  );

  // Canvas focus handlers
  const handleCanvasFocus = useCallback(() => {
    inputManager.updateContext({ isCanvasFocused: true });
  }, []);

  const handleCanvasBlur = useCallback(() => {
    inputManager.updateContext({ isCanvasFocused: false });
  },  []);

  // Stable handlers for event listeners
  const handleMouseDownRef = useRef(handleMouseDown);
  const handleMouseMoveRef = useRef(handleMouseMove);
  const handleMouseUpRef = useRef(handleMouseUp);
  const handleWheelRef = useRef(handleWheel);
  const handleRightClickRef = useRef(handleRightClick);

  useEffect(() => {
    handleMouseDownRef.current = handleMouseDown;
    handleMouseMoveRef.current = handleMouseMove;
    handleMouseUpRef.current = handleMouseUp;
    handleWheelRef.current = handleWheel;
    handleRightClickRef.current = handleRightClick;
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleRightClick]);

  const stableMouseDown = useCallback((e: MouseEvent) => {
    handleMouseDownRef.current(e);
  }, []);

  const stableMouseMove = useCallback((e: MouseEvent) => {
    handleMouseMoveRef.current(e);
  }, []);

  const stableMouseUp = useCallback((e: MouseEvent) => {
    handleMouseUpRef.current(e);
  }, []);

  const stableWheel = useCallback((e: WheelEvent) => {
    handleWheelRef.current(e);
  }, []);

  const stableRightClick = useCallback((e: MouseEvent) => {
    handleRightClickRef.current(e);
  },  []);

  const stableKeyDown = useCallback(() => {
    // Keyboard events are handled by InputManager via action handlers
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
    selectedSpriteIds: selectedSpriteIdsRef.current,
  };
};
