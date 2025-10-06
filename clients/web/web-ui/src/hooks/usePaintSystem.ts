import { useCallback, useEffect, useRef, useState } from 'react';
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
        const isActive = renderEngine.paint_is_mode();
        const isDrawing = renderEngine.paint_is_drawing();
        const strokeCount = renderEngine.paint_get_stroke_count();
        const brushColor = renderEngine.paint_get_brush_color();
        const brushWidth = renderEngine.paint_get_brush_width();
        const canUndo = renderEngine.can_undo ? renderEngine.can_undo() : false;
        const canRedo = renderEngine.can_redo ? renderEngine.can_redo() : false;

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
        console.error('Error updating paint state:', error);
      }
    };

    const interval = setInterval(updateState, 100); // Update every 100ms
    updateState(); // Initial update

    return () => clearInterval(interval);
  }, [renderEngine]);

  const enterPaintMode = useCallback((width = 800, height = 600) => {
    if (!renderEngine) return;
    renderEngine.paint_enter_mode(width, height);
    setPaintState(prev => ({ ...prev, isActive: true }));
  }, [renderEngine]);

  const exitPaintMode = useCallback(() => {
    if (!renderEngine) return;
    renderEngine.paint_exit_mode();
    setPaintState(prev => ({ 
      ...prev, 
      isActive: false, 
      isDrawing: false 
    }));
  }, [renderEngine]);

  const setBrushColor = useCallback((r: number, g: number, b: number, a = 1.0) => {
    if (!renderEngine) return;
    renderEngine.paint_set_brush_color(r, g, b, a);
    setPaintState(prev => ({ ...prev, brushColor: [r, g, b, a] }));
  }, [renderEngine]);

  const setBrushWidth = useCallback((width: number) => {
    if (!renderEngine) return;
    renderEngine.paint_set_brush_width(width);
    setPaintState(prev => ({ ...prev, brushWidth: width }));
  }, [renderEngine]);

  const setBlendMode = useCallback((mode: 'alpha' | 'additive' | 'modulate' | 'multiply') => {
    if (!renderEngine) return;
    renderEngine.paint_set_blend_mode(mode);
    setPaintState(prev => ({ ...prev, blendMode: mode }));
  }, [renderEngine]);

  const clearAll = useCallback(() => {
    if (!renderEngine) return;
    renderEngine.paint_clear_all();
  }, [renderEngine]);

  const undoStroke = useCallback(() => {
    if (!renderEngine) return;
    return renderEngine.paint_undo_stroke();
  }, [renderEngine]);

  const redoStroke = useCallback(() => {
    if (!renderEngine) return false;
    return renderEngine.redo_last_stroke ? renderEngine.redo_last_stroke() : false;
  }, [renderEngine]);

  const getStrokes = useCallback(() => {
    if (!renderEngine) return [];
    try {
      const strokesJson = renderEngine.paint_get_strokes();
      return strokesJson ? JSON.parse(JSON.stringify(strokesJson)) : [];
    } catch (error) {
      console.error('Error getting strokes:', error);
      return [];
    }
  }, [renderEngine]);

  const getCurrentStroke = useCallback(() => {
    if (!renderEngine) return null;
    try {
      const strokeJson = renderEngine.paint_get_current_stroke();
      return strokeJson ? JSON.parse(JSON.stringify(strokeJson)) : null;
    } catch (error) {
      console.error('Error getting current stroke:', error);
      return null;
    }
  }, [renderEngine]);

  const startStroke = useCallback((worldX: number, worldY: number, pressure = 1.0) => {
    if (!renderEngine) return false;
    return renderEngine.paint_start_stroke(worldX, worldY, pressure);
  }, [renderEngine]);

  const addPoint = useCallback((worldX: number, worldY: number, pressure = 1.0) => {
    if (!renderEngine) return false;
    return renderEngine.paint_add_point(worldX, worldY, pressure);
  }, [renderEngine]);

  const endStroke = useCallback(() => {
    if (!renderEngine) return false;
    return renderEngine.paint_end_stroke();
  }, [renderEngine]);

  const cancelStroke = useCallback(() => {
    if (!renderEngine) return;
    renderEngine.paint_cancel_stroke();
  }, [renderEngine]);

  const applyBrushPreset = useCallback((preset: BrushPreset) => {
    if (!renderEngine) return;
    preset.apply_to_paint_system(renderEngine);
    
    // Update local state
    const brushColor = renderEngine.paint_get_brush_color();
    const brushWidth = renderEngine.paint_get_brush_width();
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
