/**
 * Enhanced Canvas Event Handling with InputManager Integration
 * Maintains compatibility with existing GameCanvas interface
 */

import type { RenderEngine, WallMoveUpdate } from '@lib/wasm/runtime';
import type { PaintInteractionController } from '@features/painting/controller/PaintInteractionController';
import { useCombatStore } from '@features/combat/stores/combatStore';
import type { WebClientProtocol } from '@lib/websocket/clientProtocol';
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '@/store';
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
  preset: Record<string, unknown>;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  spriteId?: string;
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
  protocol?: WebClientProtocol | null;
  editor?: Pick<PaintInteractionController, 'getState' | 'subscribe' | 'spriteSelectionCommand' | 'pasteSelection' | 'transformSprites'> | null;
}

export const useCanvasEventsEnhanced = ({ 
  canvasRef, 
  rustRenderManagerRef,
  lightPlacementMode,
  setLightPlacementMode,
  setContextMenu,
  togglePerformanceMonitor,
  protocol,
  editor
}: UseCanvasEventsEnhancedProps): CanvasEventsEnhanced => {
  const selectedSpriteIdsRef = useRef<string[]>([]);
  // Tracks where right-mousedown started (for drag detection to suppress context menu)
  const rightDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const updateInputContext = useCallback(() => {
    const engine = rustRenderManagerRef.current;
    const selectedSpriteIds = engine?.get_selected_sprites() ?? [];
    selectedSpriteIdsRef.current = selectedSpriteIds;
    const state = editor?.getState();
    inputManager.updateContext({
      selectedSpriteIds, selectedWallIds: engine?.get_selected_walls() ?? [],
      canUndo: state?.canUndo === true, canRedo: state?.canRedo === true,
      hasClipboard: state?.canPaste === true && !state.commandPending,
    });
  }, [rustRenderManagerRef, editor]);

  useEffect(() => {
    updateInputContext();
    const unsubscribe = editor?.subscribe(() => updateInputContext());
    return () => {
      unsubscribe?.();
      inputManager.updateContext({ hasClipboard: false, canUndo: false, canRedo: false,
        selectedSpriteIds: [], selectedWallIds: [], isCanvasFocused: false });
    };
  }, [editor, updateInputContext]);

  // Resolve the current renderer per action, including initial attach and recreation.
  useEffect(() => {
    const selectedIds = () => rustRenderManagerRef.current?.get_selected_sprites() ?? [];
    const moveSelectedSprites = (dx: number, dy: number) => {
      const ids = selectedIds();
      const state = useGameStore.getState();
      const combat = useCombatStore.getState().combat;
      if (ids.length === 1 && combat?.phase !== 'inactive' && combat?.table_id === state.activeTableId
        && combat?.combatants.some(member => member.entity_id === ids[0])) {
        const sprite = state.sprites.find(item => item.id === ids[0] && item.tableId === state.activeTableId);
        if (sprite && rustRenderManagerRef.current) protocol?.moveSprite(sprite.id, sprite.x + dx, sprite.y + dy);
      } else {
        editor?.transformSprites(ids, { dx, dy });
      }
    };
    const syncWallUpdates = (updates: ArrayLike<WallMoveUpdate>) => {
      Array.from(updates).forEach(update => {
        const position = { x1: update.x1, y1: update.y1, x2: update.x2, y2: update.y2 };
        useGameStore.getState().updateWall(update.wallId, position);
        protocol?.updateWall(update.wallId, position);
      });
    };
    const moveSelectedObjects = (dx: number, dy: number) => {
      moveSelectedSprites(dx, dy);
      const engine = rustRenderManagerRef.current;
      if (engine && protocol) syncWallUpdates(engine.translate_selected_walls(dx, dy));
    };
    const cellPx = () => useGameStore.getState().gridCellPx ?? 50;
    const actionHandlers = {
      delete_selected: () => {
        editor?.spriteSelectionCommand(selectedIds(), 'delete');
        const engine = rustRenderManagerRef.current;
        if (engine && protocol) {
          engine.remove_selected_walls().forEach(wallId => {
            useGameStore.getState().removeWall(wallId);
            protocol.removeWall(wallId);
          });
        }
        updateInputContext();
      },
      copy_selected: () => { editor?.spriteSelectionCommand(selectedIds(), 'copy'); },
      cut_selected: () => { editor?.spriteSelectionCommand(selectedIds(), 'cut'); },
      duplicate_selected: () => { editor?.spriteSelectionCommand(selectedIds(), 'duplicate'); },
      paste_sprites: () => { if (rustRenderManagerRef.current) editor?.pasteSelection(); },
      scale_up: () => { editor?.transformSprites(selectedIds(), { scale: 1.1 }); },
      scale_down: () => { editor?.transformSprites(selectedIds(), { scale: 0.9 }); },
      move_up: () => moveSelectedObjects(0, -cellPx()),
      move_down: () => moveSelectedObjects(0, cellPx()),
      move_left: () => moveSelectedObjects(-cellPx(), 0),
      move_right: () => moveSelectedObjects(cellPx(), 0),
      select_all: () => { rustRenderManagerRef.current?.select_all_sprites(); updateInputContext(); },
      clear_selection: () => { rustRenderManagerRef.current?.clear_selection(); updateInputContext(); },
      toggle_performance: togglePerformanceMonitor,
    };
    Object.entries(actionHandlers).forEach(([action, handler]) => inputManager.onAction(action, handler));
    updateInputContext();
    return () => {
      Object.entries(actionHandlers).forEach(([action, handler]) => inputManager.offAction(action, handler));
    };
  }, [rustRenderManagerRef, editor, protocol, togglePerformanceMonitor, updateInputContext]);

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const renderManager = rustRenderManagerRef.current;
      if (!canvas) return;

      if (lightPlacementMode?.active && renderManager) {
        const { x, y } = getRelativeCoords(e, canvas);
        const worldCoords = renderManager.screen_to_world(x, y);
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
          canvas.style.cursor = 'default';
        }
        return;
      }

      if (renderManager) {
        const { x, y } = getRelativeCoords(e, canvas);

        // Middle (1) or right (2) button — always camera pan, don't route to WASM selection logic
        if (e.button === 1 || e.button === 2) {
          if (renderManager.start_camera_pan) {
            renderManager.start_camera_pan(x, y);
          }
          if (e.button === 2) {
            rightDownPosRef.current = { x: e.clientX, y: e.clientY };
          }
          canvas.style.cursor = 'grabbing';
          return;
        }

        renderManager.handle_mouse_down_full(x, y, e.ctrlKey, e.altKey);
        const cursorType = renderManager.get_cursor_type(x, y) ?? 'default';
        canvas.style.cursor = cursorType === 'default' ? 'grabbing' : cursorType;
        setTimeout(() => updateInputContext(), 0);
      }
    },
    [canvasRef, rustRenderManagerRef, lightPlacementMode, setLightPlacementMode, updateInputContext]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const renderManager = rustRenderManagerRef.current;
      if (!canvas || !renderManager) return;

      const { x, y } = getRelativeCoords(e, canvas);
      renderManager.handle_mouse_move(x, y);

      const cursorType = renderManager.get_cursor_type(x, y) ?? 'default';
      const isDragging = (e.buttons & 7) !== 0; // any mouse button held
      canvas.style.cursor = isDragging && cursorType === 'default' ? 'grabbing' : cursorType;
    },
    [canvasRef, rustRenderManagerRef]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const renderManager = rustRenderManagerRef.current;
      if (!canvas || !renderManager) return;

      const { x, y } = getRelativeCoords(e, canvas);
      renderManager.set_alt_pressed(e.altKey);
      renderManager.handle_mouse_up(x, y);
      const cursorType = renderManager.get_cursor_type(x, y) ?? 'default';
      canvas.style.cursor = cursorType;
      setTimeout(() => updateInputContext(), 0);
    },
    [canvasRef, rustRenderManagerRef, updateInputContext]
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const canvas = canvasRef.current;
      const renderManager = rustRenderManagerRef.current;
      if (!canvas || !renderManager) return;

      const { x, y } = getRelativeCoords(e, canvas);
      renderManager.handle_wheel(x, y, e.deltaY);
    },
    [canvasRef, rustRenderManagerRef]
  );

  const handleRightClick = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const renderManager = rustRenderManagerRef.current;
      if (!canvas || !renderManager) return;

      e.preventDefault();

      // Suppress context menu if right button was dragged significantly
      if (rightDownPosRef.current) {
        const dx = e.clientX - rightDownPosRef.current.x;
        const dy = e.clientY - rightDownPosRef.current.y;
        rightDownPosRef.current = null;
        if (Math.hypot(dx, dy) > 5) return;
      }

      const { x, y } = getRelativeCoords(e, canvas);
      const clickedSpriteId = renderManager.handle_right_click(x, y);
      
      setContextMenu(prev => ({
        ...prev,
        visible: true,
        x: e.clientX,
        y: e.clientY,
        spriteId: clickedSpriteId,
        showLayerSubmenu: false,
      }));
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

  const stableKeyDown = useCallback((event: KeyboardEvent) => {
    const engine = rustRenderManagerRef.current;
    if (event.key === 'Escape' && engine?.cancel_current_operation()) {
      event.preventDefault();
      event.stopPropagation();
      updateInputContext();
      return;
    }

    if (inputManager.handleKeyDown(event)) {
      event.stopPropagation();
    }
  }, [rustRenderManagerRef, updateInputContext]);

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
