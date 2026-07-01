import { useGameStore } from '@/store';
import { ProtocolService } from '@lib/api';
import { useWasmRuntime } from '@lib/wasm/runtime';
import type { BrushPreset, RenderEngine } from '@lib/wasm/runtime';
import { logger } from '@shared/utils/logger';
import { useCallback, useEffect, useState } from 'react';

type PaintBlendMode = 'alpha' | 'additive' | 'modulate' | 'multiply';

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
  setBlendMode: (mode: PaintBlendMode) => void;
  clearAll: () => void;
  undoStroke: () => boolean;
  redoStroke: () => boolean;
  getStrokes: () => Record<string, unknown>[];
  getCurrentStroke: () => Record<string, unknown> | null;
  startStroke: (worldX: number, worldY: number, pressure?: number) => boolean;
  addPoint: (worldX: number, worldY: number, pressure?: number) => boolean;
  endStroke: () => boolean;
  cancelStroke: () => void;
  applyBrushPreset: (preset: BrushPreset) => void;
}

export function usePaintSystem(
  renderEngine: RenderEngine | null
): [PaintState, PaintControls] {
  const { activeTableId } = useGameStore();

  const [paintState, setPaintState] = useState<PaintState>({
    isActive: false,
    isDrawing: false,
    strokeCount: 0,
    brushColor: [1.0, 1.0, 1.0, 1.0],
    brushWidth: 3.0,
    blendMode: 'alpha',
    canUndo: false,
    canRedo: false,
  });

  const readStrokes = useCallback((): Record<string, unknown>[] => {
    if (!renderEngine) return [];
    try {
      const raw = renderEngine.paint_get_strokes();
      return raw ? JSON.parse(JSON.stringify(raw)) as Record<string, unknown>[] : [];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.debug('Failed to read paint strokes', msg);
      return [];
    }
  }, [renderEngine]);

  const refreshPaintState = useCallback(() => {
    if (!renderEngine) return;
    const strokes = readStrokes();
    setPaintState(prev => ({
      ...prev,
      strokeCount: strokes.length,
      canUndo: renderEngine.paint_can_undo(),
      canRedo: renderEngine.paint_can_redo(),
    }));
  }, [readStrokes, renderEngine]);

  useEffect(() => {
    if (!renderEngine || !activeTableId) return;
    renderEngine.paint_set_current_table(activeTableId);
    refreshPaintState();
  }, [renderEngine, activeTableId, refreshPaintState]);

  useEffect(() => {
    if (!renderEngine) return;
    const interval = setInterval(refreshPaintState, 250);
    refreshPaintState();
    return () => clearInterval(interval);
  }, [refreshPaintState, renderEngine]);

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
      isDrawing: false,
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

  const setBlendMode = useCallback((mode: PaintBlendMode) => {
    if (!renderEngine) return;
    renderEngine.paint_set_blend_mode(mode);
    setPaintState(prev => ({ ...prev, blendMode: mode }));
  }, [renderEngine]);

  const clearAll = useCallback(() => {
    if (!renderEngine) return;
    renderEngine.paint_clear_all();
    if (ProtocolService.hasProtocol()) {
      ProtocolService.getProtocol().clearPaintStrokes();
    }
    setPaintState(prev => ({
      ...prev,
      isDrawing: false,
      strokeCount: 0,
      canUndo: false,
      canRedo: false,
    }));
  }, [renderEngine]);

  const undoStroke = useCallback(() => {
    if (!renderEngine) return false;

    const lastStrokeId = ProtocolService.hasProtocol()
      ? readStrokes().at(-1)?.id as string | undefined
      : undefined;
    const ok = renderEngine.paint_undo_stroke();

    if (ok && lastStrokeId && activeTableId) {
      ProtocolService.getProtocol().deletePaintStroke(lastStrokeId);
    }
    if (ok) refreshPaintState();
    return ok;
  }, [activeTableId, readStrokes, refreshPaintState, renderEngine]);

  const redoStroke = useCallback(() => {
    if (!renderEngine) return false;
    const ok = renderEngine.paint_redo_stroke();
    if (ok && ProtocolService.hasProtocol() && activeTableId) {
      const redone = readStrokes().at(-1);
      if (redone?.id) {
        ProtocolService.getProtocol().createPaintStroke(String(redone.id), JSON.stringify(redone));
      }
    }
    if (ok) refreshPaintState();
    return ok;
  }, [activeTableId, readStrokes, refreshPaintState, renderEngine]);

  const getStrokes = useCallback(() => readStrokes(), [readStrokes]);

  const getCurrentStroke = useCallback(() => null, []);

  const startStroke = useCallback((worldX: number, worldY: number, pressure = 1.0) => {
    if (!renderEngine) return false;
    const ok = renderEngine.paint_start_stroke(worldX, worldY, pressure);
    if (ok) setPaintState(prev => ({ ...prev, isDrawing: true }));
    return ok;
  }, [renderEngine]);

  const addPoint = useCallback((worldX: number, worldY: number, pressure = 1.0) => {
    if (!renderEngine) return false;
    return renderEngine.paint_add_point(worldX, worldY, pressure);
  }, [renderEngine]);

  const endStroke = useCallback(() => {
    if (!renderEngine) return false;
    const result = renderEngine.paint_end_stroke();
    setPaintState(prev => ({ ...prev, isDrawing: false }));

    if (result && ProtocolService.hasProtocol()) {
      const last = readStrokes().at(-1);
      if (last) {
        const strokeId = (last.id as string | undefined) ?? crypto.randomUUID();
        ProtocolService.getProtocol().createPaintStroke(strokeId, JSON.stringify(last));
      }
    }

    if (result) refreshPaintState();
    return result;
  }, [readStrokes, refreshPaintState, renderEngine]);

  const cancelStroke = useCallback(() => {
    if (!renderEngine) return;
    renderEngine.paint_cancel_stroke();
    setPaintState(prev => ({ ...prev, isDrawing: false }));
  }, [renderEngine]);

  const applyBrushPreset = useCallback((preset: BrushPreset) => {
    if (!renderEngine) return;
    const [r, g, b, a] = preset.color;
    const blendMode = normalizeBlendMode(preset.blend_mode);

    renderEngine.paint_set_brush_color(r, g, b, a);
    renderEngine.paint_set_brush_width(preset.width);
    renderEngine.paint_set_blend_mode(blendMode);

    setPaintState(prev => ({
      ...prev,
      brushColor: [r, g, b, a],
      brushWidth: preset.width,
      blendMode,
    }));
  }, [renderEngine]);

  return [paintState, {
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
  }];
}

export function usePaintInteraction(
  renderEngine: RenderEngine | null,
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
    paintControls.startStroke(worldX, worldY, 1.0);
  }, [paintState.isActive, renderEngine, paintControls]);

  const handleMouseMove = useCallback((event: React.MouseEvent, canvasElement: HTMLCanvasElement) => {
    if (!paintState.isActive || !isMouseDown || !renderEngine) return;

    const rect = canvasElement.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    const [worldX, worldY] = renderEngine.screen_to_world(canvasX, canvasY);

    setIsDragging(true);
    paintControls.addPoint(worldX, worldY, 1.0);
  }, [paintState.isActive, isMouseDown, renderEngine, paintControls]);

  const handleMouseUp = useCallback(() => {
    if (!paintState.isActive || !isMouseDown) return;

    setIsMouseDown(false);
    if (isDragging) {
      paintControls.endStroke();
    } else {
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

export function useBrushPresets() {
  const runtime = useWasmRuntime();
  const [presets, setPresets] = useState<BrushPreset[]>([]);

  useEffect(() => {
    const loadPresets = async () => {
      try {
        await runtime.initialize();
        setPresets(runtime.getDefaultBrushPresets());
      } catch (error) {
        logger.error('Failed to load brush presets', error);
      }
    };

    loadPresets();
  }, [runtime]);

  return presets;
}

function normalizeBlendMode(blendMode: BrushPreset['blend_mode']): PaintBlendMode {
  switch (blendMode) {
    case 'Additive':
    case 'additive':
      return 'additive';
    case 'Modulate':
    case 'modulate':
      return 'modulate';
    case 'Multiply':
    case 'multiply':
      return 'multiply';
    case 'Alpha':
    case 'alpha':
    default:
      return 'alpha';
  }
}
