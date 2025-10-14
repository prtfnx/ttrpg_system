import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store';
import type { BrushPreset } from '../types/wasm';

// Access WASM functions through the global window object - use same type as in types.ts

export interface PaintState {
  isActive: boolean;
  isDrawing: boolean;
  strokeCount: number;
  brushColor: number[];
  brushWidth: number;
  blendMode: string;
  canUndo: boolean;
  canRedo: boolean;
}

export interface PaintControls {
  enterPaintMode: (width?: number, height?: number) => void;
  exitPaintMode: () => void;
  setBrushColor: (r: number, g: number, b: number, a?: number) => void;
  setBrushWidth: (width: number) => void;
  setBlendMode: (mode: 'alpha' | 'additive' | 'modulate' | 'multiply') => void;
  clearAll: () => void;
  undoStroke: () => void;
  redoStroke: () => void;
  getStrokes: () => any[];
  getCurrentStroke: () => any | null;
  startStroke: (worldX: number, worldY: number, pressure?: number) => boolean;
  addPoint: (worldX: number, worldY: number, pressure?: number) => boolean;
  endStroke: () => boolean;
  cancelStroke: () => void;
  applyBrushPreset: (preset: BrushPreset) => void;
}

export interface PaintEvents {
  onStrokeStarted?: () => void;
  onStrokeUpdated?: () => void;
  onStrokeCompleted?: () => void;
  onStrokeCancelled?: () => void;
  onStrokeUndone?: () => void;
  onCanvasCleared?: () => void;
}

export function usePaintSystem(
  renderEngine: any,
  events?: PaintEvents
): [PaintState, PaintControls] {
  const { activeTableId } = useGameStore();
  
  const [paintState, setPaintState] = useState<PaintState>({
    isActive: false,
    isDrawing: false,
    strokeCount: 0,
    brushColor: [1.0, 1.0, 1.0, 1.0], // White
    brushWidth: 3.0,
    blendMode: 'alpha',
    canUndo: false,
    canRedo: false,
  });

  const eventsRef = useRef(events);
  eventsRef.current = events;

  // Sync active table with paint system
  useEffect(() => {
    if (!renderEngine || !activeTableId) return;
    
    if (typeof renderEngine.paint_set_current_table === 'function') {
      renderEngine.paint_set_current_table(activeTableId);
      console.log(`🎨 Paint system switched to table: ${activeTableId}`);
    } else {
      console.debug('Render engine missing paint_set_current_table()');
    }
  }, [renderEngine, activeTableId]);

  // Setup event listeners - DISABLED: paint_on_event function not working
  useEffect(() => {
    if (!renderEngine) return;

    // Event system disabled due to WASM function issues
    // Would register paint event handlers here
    
    return () => {
      // Cleanup would happen here if WASM supported removing event listeners
    };
  }, [renderEngine]);

  // Update state from engine
  useEffect(() => {
    if (!renderEngine) return;

    const updateState = () => {
      try {
        const isActive = typeof renderEngine.paint_is_mode === 'function' ? renderEngine.paint_is_mode() : false;
        const isDrawing = typeof renderEngine.paint_is_drawing === 'function' ? renderEngine.paint_is_drawing() : false;
        const strokeCount = typeof renderEngine.paint_get_stroke_count === 'function' ? renderEngine.paint_get_stroke_count() : 0;
        const brushColor = typeof renderEngine.paint_get_brush_color === 'function' ? renderEngine.paint_get_brush_color() : [1.0, 1.0, 1.0, 1.0];
        const brushWidth = typeof renderEngine.paint_get_brush_width === 'function' ? renderEngine.paint_get_brush_width() : 3.0;
        const canUndo = typeof renderEngine.can_undo === 'function' ? renderEngine.can_undo() : false;
        const canRedo = typeof renderEngine.can_redo === 'function' ? renderEngine.can_redo() : false;

        setPaintState(prev => ({
          ...prev,
          isActive,
          isDrawing,
          strokeCount,
          brushColor,
          brushWidth,
          canUndo,
          canRedo,
        }));
      } catch (error) {
        // Log but avoid spamming stack traces for missing/mocked engines
        const msg = error instanceof Error ? error.message : String(error);
        console.debug('Error updating paint state (non-fatal):', msg);
      }
    };

    const interval = setInterval(updateState, 100); // Update every 100ms
    updateState(); // Initial update

    return () => clearInterval(interval);
  }, [renderEngine]);

  const enterPaintMode = useCallback((width = 800, height = 600) => {
    if (!renderEngine) return;
    if (typeof renderEngine.paint_enter_mode === 'function') {
      renderEngine.paint_enter_mode(width, height);
    } else {
      console.debug('Render engine missing paint_enter_mode()');
    }
    setPaintState(prev => ({ ...prev, isActive: true }));
  }, [renderEngine]);

  const exitPaintMode = useCallback(() => {
    if (!renderEngine) return;
    if (typeof renderEngine.paint_exit_mode === 'function') {
      renderEngine.paint_exit_mode();
    } else {
      console.debug('Render engine missing paint_exit_mode()');
    }
    setPaintState(prev => ({ 
      ...prev, 
      isActive: false, 
      isDrawing: false 
    }));
  }, [renderEngine]);

  const setBrushColor = useCallback((r: number, g: number, b: number, a = 1.0) => {
    if (!renderEngine) return;
    if (typeof renderEngine.paint_set_brush_color === 'function') {
      renderEngine.paint_set_brush_color(r, g, b, a);
    } else {
      console.debug('Render engine missing paint_set_brush_color()');
    }
    setPaintState(prev => ({ ...prev, brushColor: [r, g, b, a] }));
  }, [renderEngine]);

  const setBrushWidth = useCallback((width: number) => {
    if (!renderEngine) return;
    if (typeof renderEngine.paint_set_brush_width === 'function') {
      renderEngine.paint_set_brush_width(width);
    } else {
      console.debug('Render engine missing paint_set_brush_width()');
    }
    setPaintState(prev => ({ ...prev, brushWidth: width }));
  }, [renderEngine]);

  const setBlendMode = useCallback((mode: 'alpha' | 'additive' | 'modulate' | 'multiply') => {
    if (!renderEngine) return;
    if (typeof renderEngine.paint_set_blend_mode === 'function') {
      renderEngine.paint_set_blend_mode(mode);
    } else {
      console.debug('Render engine missing paint_set_blend_mode()');
    }
    setPaintState(prev => ({ ...prev, blendMode: mode }));
  }, [renderEngine]);

  const clearAll = useCallback(() => {
    if (!renderEngine) return;
    if (typeof renderEngine.paint_clear_all === 'function') {
      renderEngine.paint_clear_all();
    } else {
      console.debug('Render engine missing paint_clear_all()');
    }
  }, [renderEngine]);

  const undoStroke = useCallback(() => {
    if (!renderEngine) return;
    if (typeof renderEngine.paint_undo_stroke === 'function') {
      return renderEngine.paint_undo_stroke();
    }
    console.debug('Render engine missing paint_undo_stroke()');
    return false;
  }, [renderEngine]);

  const redoStroke = useCallback(() => {
    if (!renderEngine) return false;
    if (typeof renderEngine.redo_last_stroke === 'function') {
      return renderEngine.redo_last_stroke();
    }
    console.debug('Render engine missing redo_last_stroke()');
    return false;
  }, [renderEngine]);

  const getStrokes = useCallback(() => {
    if (!renderEngine) return [];
    try {
      const strokesJson = typeof renderEngine.paint_get_strokes === 'function' ? renderEngine.paint_get_strokes() : [];
      return strokesJson ? JSON.parse(JSON.stringify(strokesJson)) : [];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.debug('Error getting strokes (non-fatal):', msg);
      return [];
    }
  }, [renderEngine]);

  const getCurrentStroke = useCallback(() => {
    if (!renderEngine) return null;
    try {
      const strokeJson = typeof renderEngine.paint_get_current_stroke === 'function' ? renderEngine.paint_get_current_stroke() : null;
      return strokeJson ? JSON.parse(JSON.stringify(strokeJson)) : null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.debug('Error getting current stroke (non-fatal):', msg);
      return null;
    }
  }, [renderEngine]);

  const startStroke = useCallback((worldX: number, worldY: number, pressure = 1.0) => {
    if (!renderEngine) return false;
    if (typeof renderEngine.paint_start_stroke === 'function') {
      return renderEngine.paint_start_stroke(worldX, worldY, pressure);
    }
    console.debug('Render engine missing paint_start_stroke()');
    return false;
  }, [renderEngine]);

  const addPoint = useCallback((worldX: number, worldY: number, pressure = 1.0) => {
    if (!renderEngine) return false;
    if (typeof renderEngine.paint_add_point === 'function') {
      return renderEngine.paint_add_point(worldX, worldY, pressure);
    }
    console.debug('Render engine missing paint_add_point()');
    return false;
  }, [renderEngine]);

  const endStroke = useCallback(() => {
    if (!renderEngine) return false;
    if (typeof renderEngine.paint_end_stroke === 'function') {
      return renderEngine.paint_end_stroke();
    }
    console.debug('Render engine missing paint_end_stroke()');
    return false;
  }, [renderEngine]);

  const cancelStroke = useCallback(() => {
    if (!renderEngine) return;
    if (typeof renderEngine.paint_cancel_stroke === 'function') {
      renderEngine.paint_cancel_stroke();
    } else {
      console.debug('Render engine missing paint_cancel_stroke()');
    }
  }, [renderEngine]);

  const applyBrushPreset = useCallback((preset: BrushPreset) => {
    if (!renderEngine) return;
    if (typeof preset.apply_to_paint_system === 'function') {
      preset.apply_to_paint_system(renderEngine);
    } else {
      console.debug('Brush preset missing apply_to_paint_system()');
    }
    
    // Update local state (guarded reads)
    const brushColor = typeof renderEngine.paint_get_brush_color === 'function' ? renderEngine.paint_get_brush_color() : [1.0, 1.0, 1.0, 1.0];
    const brushWidth = typeof renderEngine.paint_get_brush_width === 'function' ? renderEngine.paint_get_brush_width() : 3.0;
    setPaintState(prev => ({ 
      ...prev, 
      brushColor, 
      brushWidth,
      // Note: blend mode would need to be tracked separately or queried
    }));
  }, [renderEngine]);

  const controls: PaintControls = {
    enterPaintMode,
    exitPaintMode,
    setBrushColor,
    setBrushWidth,
    setBlendMode,
    clearAll,
    undoStroke,
    redoStroke,
    getStrokes,
    getCurrentStroke,
    startStroke,
    addPoint,
    endStroke,
    cancelStroke,
    applyBrushPreset,
  };

  return [paintState, controls];
}

// Utility hook for mouse-based painting interaction
export function usePaintInteraction(
  renderEngine: any,
  paintControls: PaintControls,
  paintState: PaintState
) {
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((event: React.MouseEvent, canvasElement: HTMLCanvasElement) => {
    if (!paintState.isActive || !renderEngine) return;

    const rect = canvasElement.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    
    const [worldX, worldY] = renderEngine.screen_to_world(canvasX, canvasY);
    
    setIsMouseDown(true);
    setIsDragging(false);
    
    // Start stroke
    paintControls.startStroke(worldX, worldY, 1.0);
  }, [paintState.isActive, renderEngine, paintControls]);

  const handleMouseMove = useCallback((event: React.MouseEvent, canvasElement: HTMLCanvasElement) => {
    if (!paintState.isActive || !isMouseDown || !renderEngine) return;

    const rect = canvasElement.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    
    const [worldX, worldY] = renderEngine.screen_to_world(canvasX, canvasY);
    
    setIsDragging(true);
    
    // Add point to stroke
    paintControls.addPoint(worldX, worldY, 1.0);
  }, [paintState.isActive, isMouseDown, renderEngine, paintControls]);

  const handleMouseUp = useCallback(() => {
    if (!paintState.isActive || !isMouseDown) return;

    setIsMouseDown(false);
    
    if (isDragging) {
      // Complete stroke
      paintControls.endStroke();
    } else {
      // Single click - cancel stroke
      paintControls.cancelStroke();
    }
    
    setIsDragging(false);
  }, [paintState.isActive, isMouseDown, isDragging, paintControls]);

  const handleMouseLeave = useCallback(() => {
    if (isMouseDown) {
      paintControls.cancelStroke();
      setIsMouseDown(false);
      setIsDragging(false);
    }
  }, [isMouseDown, paintControls]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    isMouseDown,
    isDragging,
  };
}

// Brush presets utility
export function useBrushPresets() {
  const [presets, setPresets] = useState<BrushPreset[]>([]);

  useEffect(() => {
    const loadPresets = async () => {
      try {
        const wasmModule = window.ttrpg_rust_core;
        if (wasmModule && typeof wasmModule.create_default_brush_presets === 'function') {
          const defaultPresets = wasmModule.create_default_brush_presets();
          setPresets(defaultPresets as BrushPreset[]);
        }
      } catch (error) {
        console.error('Error loading brush presets:', error);
      }
    };

    loadPresets();
  }, []);

  return presets;
}
