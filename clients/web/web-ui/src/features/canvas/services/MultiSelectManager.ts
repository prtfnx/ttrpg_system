/**
 * Mouse Multi-Selection Strategy Implementation
 * Defines the strategy for multi-selecting sprites with mouse interactions
 */

export enum MultiSelectMode {
  /** Ctrl+Click to add/remove individual sprites */
  CTRL_CLICK = 'ctrl_click',
  /** Drag rectangle to select area */
  DRAG_RECTANGLE = 'drag_rectangle', 
  /** Ctrl+Drag rectangle to add to selection */
  CTRL_DRAG_RECTANGLE = 'ctrl_drag_rectangle',
  /** Shift+Click for range selection */
  SHIFT_CLICK = 'shift_click',
}

export interface MultiSelectStrategy {
  handleMouseDown(event: MouseEvent, worldPos: { x: number, y: number }): MultiSelectResult;
  handleMouseMove(event: MouseEvent, worldPos: { x: number, y: number }): MultiSelectResult;
  handleMouseUp(event: MouseEvent, worldPos: { x: number, y: number }): MultiSelectResult;
  getCurrentMode(): MultiSelectMode | null;
  reset(): void;
}

export interface MultiSelectResult {
  handled: boolean;
  mode?: MultiSelectMode;
  selectionRect?: { x1: number, y1: number, x2: number, y2: number };
  action?: 'start_selection' | 'update_selection' | 'end_selection' | 'toggle_sprite';
  spriteId?: string;
}

export class MouseMultiSelectStrategy implements MultiSelectStrategy {
  private currentMode: MultiSelectMode | null = null;
  private dragStartPos: { x: number, y: number } | null = null;
  private dragCurrentPos: { x: number, y: number } | null = null;

  handleMouseDown(event: MouseEvent, worldPos: { x: number, y: number }): MultiSelectResult {
    const { ctrlKey, shiftKey } = event;

    // Area selection with rectangle dragging
    if (!ctrlKey && !shiftKey) {
      this.currentMode = MultiSelectMode.DRAG_RECTANGLE;
      this.dragStartPos = worldPos;
      this.dragCurrentPos = worldPos;
      return {
        handled: true,
        mode: this.currentMode,
        action: 'start_selection',
        selectionRect: { x1: worldPos.x, y1: worldPos.y, x2: worldPos.x, y2: worldPos.y }
      };
    }

    // Ctrl+drag for additive area selection
    if (ctrlKey && !shiftKey) {
      this.currentMode = MultiSelectMode.CTRL_DRAG_RECTANGLE;
      this.dragStartPos = worldPos;
      this.dragCurrentPos = worldPos;
      return {
        handled: true,
        mode: this.currentMode,
        action: 'start_selection',
        selectionRect: { x1: worldPos.x, y1: worldPos.y, x2: worldPos.x, y2: worldPos.y }
      };
    }

    return { handled: false };
  }

  handleMouseMove(event: MouseEvent, worldPos: { x: number, y: number }): MultiSelectResult {
    if (!this.currentMode || !this.dragStartPos) {
      return { handled: false };
    }

    // Update drag rectangle
    if (this.currentMode === MultiSelectMode.DRAG_RECTANGLE || 
        this.currentMode === MultiSelectMode.CTRL_DRAG_RECTANGLE) {
      this.dragCurrentPos = worldPos;
      return {
        handled: true,
        mode: this.currentMode,
        action: 'update_selection',
        selectionRect: {
          x1: this.dragStartPos.x,
          y1: this.dragStartPos.y,
          x2: worldPos.x,
          y2: worldPos.y
        }
      };
    }

    return { handled: false };
  }

  handleMouseUp(event: MouseEvent, worldPos: { x: number, y: number }): MultiSelectResult {
    const currentMode = this.currentMode;
    
    if (!currentMode) {
      return { handled: false };
    }

    // Handle area selection completion
    if ((currentMode === MultiSelectMode.DRAG_RECTANGLE || 
         currentMode === MultiSelectMode.CTRL_DRAG_RECTANGLE) && 
        this.dragStartPos) {
      
      const result: MultiSelectResult = {
        handled: true,
        mode: currentMode,
        action: 'end_selection',
        selectionRect: {
          x1: this.dragStartPos.x,
          y1: this.dragStartPos.y,
          x2: worldPos.x,
          y2: worldPos.y
        }
      };

      this.reset();
      return result;
    }

    this.reset();
    return { handled: false };
  }

  getCurrentMode(): MultiSelectMode | null {
    return this.currentMode;
  }

  getCurrentSelectionRect(): { x1: number, y1: number, x2: number, y2: number } | null {
    if (!this.dragStartPos || !this.dragCurrentPos) return null;
    
    return {
      x1: this.dragStartPos.x,
      y1: this.dragStartPos.y, 
      x2: this.dragCurrentPos.x,
      y2: this.dragCurrentPos.y
    };
  }

  reset(): void {
    this.currentMode = null;
    this.dragStartPos = null;
    this.dragCurrentPos = null;
  }
}

/**
 * Enhanced Multi-Select Manager
 * Integrates with WASM render engine for sprite selection
 */
export class MultiSelectManager {
  private strategy: MultiSelectStrategy;
  private renderEngine: any; // RenderEngine reference
  private isActive: boolean = false;

  constructor(renderEngine: any) {
    this.renderEngine = renderEngine;
    this.strategy = new MouseMultiSelectStrategy();
  }

  setRenderEngine(engine: any) {
    this.renderEngine = engine;
  }

  handleMouseDown(event: MouseEvent, worldPos: { x: number, y: number }): boolean {
    const result = this.strategy.handleMouseDown(event, worldPos);
    
    if (result.handled) {
      this.isActive = true;
      
      if (result.action === 'start_selection' && result.mode === MultiSelectMode.DRAG_RECTANGLE) {
        // Start fresh area selection - clear existing selection
        this.renderEngine?.clear_selection?.();
      }
      
      return true;
    }

    return false;
  }

  handleMouseMove(event: MouseEvent, worldPos: { x: number, y: number }): boolean {
    if (!this.isActive) return false;

    const result = this.strategy.handleMouseMove(event, worldPos);
    
    if (result.handled && result.selectionRect) {
      // Update visual feedback for selection rectangle in WASM
      this.renderEngine?.update_selection_rect?.(result.selectionRect);
      return true;
    }

    return false;
  }

  handleMouseUp(event: MouseEvent, worldPos: { x: number, y: number }): boolean {
    if (!this.isActive) return false;

    const result = this.strategy.handleMouseUp(event, worldPos);
    
    if (result.handled && result.action === 'end_selection' && result.selectionRect) {
      // Apply final selection
      const rect = result.selectionRect;
      const addToSelection = result.mode === MultiSelectMode.CTRL_DRAG_RECTANGLE;
      
      this.renderEngine?.select_sprites_in_rect?.(
        Math.min(rect.x1, rect.x2),
        Math.min(rect.y1, rect.y2),
        Math.max(rect.x1, rect.x2),
        Math.max(rect.y1, rect.y2),
        addToSelection
      );
      
      // Clear visual selection rectangle
      this.renderEngine?.clear_selection_rect?.();
    }

    this.isActive = false;
    this.strategy.reset();
    return result.handled;
  }

  getCurrentMode(): MultiSelectMode | null {
    return this.strategy.getCurrentMode();
  }

  isSelectionActive(): boolean {
    return this.isActive;
  }
}