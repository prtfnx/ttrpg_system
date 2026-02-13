/**
 * Enhanced Canvas Event Handling with InputManager Integration
 * Maintains compatibility with existing GameCanvas interface
 */

import { RefObject, useCallback, useEffect, useRef } from 'react';
import { inputManager } from '../../services/InputManager';
import { MultiSelectManager, SelectionStrategy } from '../../services/MultiSelectManager';
import type { RenderEngine } from '@lib/wasm/wasm';

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
  showPerformanceMonitor: boolean;
  togglePerformanceMonitor: () => void;
  protocol?: any; // Network protocol service
}

export const useCanvasEventsEnhanced = ({ 
  canvasRef, 
  rustRenderManagerRef,
  lightPlacementMode,
  setLightPlacementMode,
  setContextMenu,
  showPerformanceMonitor,
  togglePerformanceMonitor,
  protocol
}: UseCanvasEventsEnhancedProps): CanvasEventsEnhanced => {
  const multiSelectRef = useRef<MultiSelectManager | null>(null);
  const selectedSpriteIdsRef = useRef<string[]>([]);

  // Initialize MultiSelectManager with WASM module
  useEffect(() => {
    const wasmModule = rustRenderManagerRef.current;
    if (wasmModule && canvasRef.current) {
      multiSelectRef.current = new MultiSelectManager(wasmModule as any, canvasRef.current);
    }
    return () => {
      multiSelectRef.current?.destroy();
    };
  }, [rustRenderManagerRef.current, canvasRef]);

  // Update input context when selection changes
  const updateInputContext = useCallback((selectedIds: string[]) => {
    selectedSpriteIdsRef.current = selectedIds;
    inputManager.updateContext({
      selectedSpriteIds: selectedIds,
      hasClipboard: false, // TODO: Implement clipboard system
      canUndo: false, // TODO: Connect to history system
      canRedo: false, // TODO: Connect to history system
      isCanvasFocused: true
    });
  }, []);

  // Setup input action handlers
  useEffect(() => {
    const wasmModule = rustRenderManagerRef.current;
    if (!wasmModule) return;

    const handleDeleteSelected = () => {
      if (selectedSpriteIdsRef.current.length > 0) {
        // Delete sprites in WASM
        selectedSpriteIdsRef.current.forEach(id => {
          (wasmModule as any).delete_sprite?.(id);
        });
        
        // Network sync 
        if (protocol?.sendGameAction) {
          protocol.sendGameAction({
            type: 'sprites_deleted',
            spriteIds: selectedSpriteIdsRef.current
          });
        }
        
        updateInputContext([]);
      }
    };

    const handleMoveUp = () => {
      if (selectedSpriteIdsRef.current.length > 0) {
        selectedSpriteIdsRef.current.forEach(id => {
          (wasmModule as any).move_sprite?.(id, 0, -32); // Grid snap movement
        });
        
        if (protocol?.sendGameAction) {
          protocol.sendGameAction({
            type: 'sprites_moved',
            spriteIds: selectedSpriteIdsRef.current,
            delta: { x: 0, y: -32 }
          });
        }
      }
    };

    const handleMoveDown = () => {
      if (selectedSpriteIdsRef.current.length > 0) {
        selectedSpriteIdsRef.current.forEach(id => {
          (wasmModule as any).move_sprite?.(id, 0, 32);
        });
        
        if (protocol?.sendGameAction) {
          protocol.sendGameAction({
            type: 'sprites_moved',
            spriteIds: selectedSpriteIdsRef.current,
            delta: { x: 0, y: 32 }
          });
        }
      }
    };

    const handleMoveLeft = () => {
      if (selectedSpriteIdsRef.current.length > 0) {
        selectedSpriteIdsRef.current.forEach(id => {
          (wasmModule as any).move_sprite?.(id, -32, 0);
        });
        
        if (protocol?.sendGameAction) {
          protocol.sendGameAction({
            type: 'sprites_moved',
            spriteIds: selectedSpriteIdsRef.current,
            delta: { x: -32, y: 0 }
          });
        }
      }
    };

    const handleMoveRight = () => {
      if (selectedSpriteIdsRef.current.length > 0) {
        selectedSpriteIdsRef.current.forEach(id => {
          (wasmModule as any).move_sprite?.(id, 32, 0);
        });
        
        if (protocol?.sendGameAction) {
          protocol.sendGameAction({
            type: 'sprites_moved',
            spriteIds: selectedSpriteIdsRef.current,
            delta: { x: 32, y: 0 }
          });
        }
      }
    };

    const handleScaleUp = () => {
      if (selectedSpriteIdsRef.current.length > 0) {
        selectedSpriteIdsRef.current.forEach(id => {
          (wasmModule as any).scale_sprite?.(id, 1.1);
        });
        
        if (protocol?.sendGameAction) {
          protocol.sendGameAction({
            type: 'sprites_scaled',
            spriteIds: selectedSpriteIdsRef.current,
            scaleFactor: 1.1
          });
        }
      }
    };

    const handleScaleDown = () => {
      if (selectedSpriteIdsRef.current.length > 0) {
        selectedSpriteIdsRef.current.forEach(id => {
          (wasmModule as any).scale_sprite?.(id, 0.9);
        });
        
        if (protocol?.sendGameAction) {
          protocol.sendGameAction({
            type: 'sprites_scaled',
            spriteIds: selectedSpriteIdsRef.current,
            scaleFactor: 0.9
          });
        }
      }
    };

    const handleSelectAll = () => {
      // Get all sprite IDs from WASM
      const allIds = (wasmModule as any).get_all_sprite_ids?.() || [];
      updateInputContext(allIds);
      multiSelectRef.current?.setSelectedSprites(allIds);
    };

    const handleClearSelection = () => {
      updateInputContext([]);
      multiSelectRef.current?.clearSelection();
    };

    const handleCopySelected = () => {
      // TODO: Implement clipboard system
      console.log('Copy not yet implemented');
    };

    const handlePasteSprites = () => {
      // TODO: Implement clipboard system
      console.log('Paste not yet implemented');
    };

    const handleTogglePerformance = () => {
      togglePerformanceMonitor();
    };

    // Register all action handlers
    inputManager.onAction('delete_selected', handleDeleteSelected);
    inputManager.onAction('move_up', handleMoveUp);
    inputManager.onAction('move_down', handleMoveDown);
    inputManager.onAction('move_left', handleMoveLeft);
    inputManager.onAction('move_right', handleMoveRight);
    inputManager.onAction('scale_up', handleScaleUp);
    inputManager.onAction('scale_down', handleScaleDown);
    inputManager.onAction('select_all', handleSelectAll);
    inputManager.onAction('clear_selection', handleClearSelection);
    inputManager.onAction('copy_selected', handleCopySelected);
    inputManager.onAction('paste_sprites', handlePasteSprites);
    inputManager.onAction('toggle_performance', handleTogglePerformance);

    // Cleanup on unmount
    return () => {
      inputManager.offAction('delete_selected', handleDeleteSelected);
      inputManager.offAction('move_up', handleMoveUp);
      inputManager.offAction('move_down', handleMoveDown);
      inputManager.offAction('move_left', handleMoveLeft);
      inputManager.offAction('move_right', handleMoveRight);
      inputManager.offAction('scale_up', handleScaleUp);
      inputManager.offAction('scale_down', handleScaleDown);
      inputManager.offAction('select_all', handleSelectAll);
      inputManager.offAction('clear_selection', handleClearSelection);
      inputManager.offAction('copy_selected', handleCopySelected);
      inputManager.offAction('paste_sprites', handlePasteSprites);
      inputManager.offAction('toggle_performance', handleTogglePerformance);
    };
  }, [rustRenderManagerRef.current, protocol, updateInputContext, togglePerformanceMonitor]);

  // Canvas focus/blur handlers
  const handleCanvasFocus = useCallback(() => {
    inputManager.updateContext({ isCanvasFocused: true });
  }, []);

  const handleCanvasBlur = useCallback(() => {
    inputManager.updateContext({ isCanvasFocused: false });
  }, []);

  // Stable mouse handlers
  const stableMouseDown = useCallback((event: MouseEvent) => {
    const wasmModule = rustRenderManagerRef.current;
    if (!wasmModule || !multiSelectRef.current) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Handle light placement mode first
    if (lightPlacementMode?.active) {
      // Place light and exit placement mode
      const preset = lightPlacementMode.preset;
      if (preset) {
        (wasmModule as any).place_light?.(x, y, preset.radius, preset.intensity);
        setLightPlacementMode(null);
      }
      return;
    }

    // Determine selection strategy
    let strategy: SelectionStrategy;
    if (event.ctrlKey) {
      strategy = SelectionStrategy.CTRL_CLICK;
    } else if (event.shiftKey) {
      strategy = SelectionStrategy.SHIFT_DRAG;
    } else {
      strategy = SelectionStrategy.SINGLE_SELECT;
    }

    const result = multiSelectRef.current.handleMouseDown(x, y, strategy);
    if (result.selectionChanged) {
      updateInputContext(result.selectedSpriteIds);
      
      // Send network update if needed
      if (result.networkUpdate && protocol?.sendGameAction) {
        protocol.sendGameAction({
          type: 'sprite_selection_changed',
          spriteIds: result.selectedSpriteIds
        });
      }
    }
  }, [rustRenderManagerRef.current, canvasRef, lightPlacementMode, setLightPlacementMode, updateInputContext, protocol]);

  const stableMouseUp = useCallback((event: MouseEvent) => {
    if (!multiSelectRef.current) return;

    const result = multiSelectRef.current.handleMouseUp();
    if (result.selectionChanged) {
      updateInputContext(result.selectedSpriteIds);
      
      if (result.networkUpdate && protocol?.sendGameAction) {
        protocol.sendGameAction({
          type: 'sprite_selection_changed', 
          spriteIds: result.selectedSpriteIds
        });
      }
    }
  }, [updateInputContext, protocol]);

  const stableMouseMove = useCallback((event: MouseEvent) => {
    if (!multiSelectRef.current) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    multiSelectRef.current.handleMouseMove(x, y);
  }, [canvasRef]);

  const stableKeyDown = useCallback((event: KeyboardEvent) => {
    // Let InputManager handle all keyboard shortcuts
    const handled = inputManager.handleKeyDown(event);
    if (handled) {
      event.preventDefault();
    }
  }, []);

  const stableWheel = useCallback((event: WheelEvent) => {
    const wasmModule = rustRenderManagerRef.current;
    if (!wasmModule) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Zoom with wheel
    const zoomDelta = event.deltaY > 0 ? 0.9 : 1.1;
    (wasmModule as any).zoom_at_point?.(x, y, zoomDelta);

    event.preventDefault();
  }, [rustRenderManagerRef.current, canvasRef]);

  const stableRightClick = useCallback((event: MouseEvent) => {
    event.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if clicked on a sprite for context menu
    const wasmModule = rustRenderManagerRef.current;
    const clickedSpriteId = (wasmModule as any).get_sprite_at_position?.(x, y);
    
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      spriteId: clickedSpriteId || undefined,
      copiedSprite: undefined, // TODO: Get from clipboard
      showLayerSubmenu: false
    });
  }, [canvasRef, rustRenderManagerRef, setContextMenu]);

  return {
    stableMouseDown,
    stableMouseUp,
    stableMouseMove,
    stableKeyDown,
    stableWheel,
    stableRightClick,
    handleCanvasFocus,
    handleCanvasBlur,
    selectedSpriteIds: selectedSpriteIdsRef.current
  };
};
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