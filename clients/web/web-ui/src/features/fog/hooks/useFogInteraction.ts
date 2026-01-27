import { useRenderEngine } from '@features/canvas';
import { useCallback, useEffect, useRef } from 'react';

interface FogInteractionState {
  isDrawing: boolean;
  currentRectId: string | null;
  mode: 'hide' | 'reveal';
}

export const useFogInteraction = (
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  fogMode: 'hide' | 'reveal' = 'hide',
  isEnabled: boolean = false,
  onFogRectangleCreated?: (rectId: string, startX: number, startY: number, endX: number, endY: number, mode: 'hide' | 'reveal') => void
) => {
  const engine = useRenderEngine();
  const stateRef = useRef<FogInteractionState>({
    isDrawing: false,
    currentRectId: null,
    mode: fogMode,
  });

  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;
    
    // This is a simplified conversion - in a real implementation,
    // you'd use the camera's inverse view matrix
    return { x: canvasX, y: canvasY };
  }, [canvasRef]);

  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (!engine || !isEnabled || event.button !== 0) return; // Only left mouse button
    
    const worldPos = screenToWorld(event.clientX, event.clientY);
    
    event.preventDefault();
    stateRef.current.isDrawing = true;
    stateRef.current.mode = fogMode;
    
    const rectId = engine.start_fog_draw(worldPos.x, worldPos.y, fogMode);
    stateRef.current.currentRectId = rectId;
    
  }, [engine, isEnabled, fogMode, screenToWorld]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!engine || !stateRef.current.isDrawing || !stateRef.current.currentRectId) return;
    
    const worldPos = screenToWorld(event.clientX, event.clientY);
    engine.update_fog_draw(stateRef.current.currentRectId, worldPos.x, worldPos.y);
  }, [engine, screenToWorld]);

  const handleMouseUp = useCallback((event: MouseEvent) => {
    if (!engine || !stateRef.current.isDrawing || !stateRef.current.currentRectId) return;
    
    const worldPos = screenToWorld(event.clientX, event.clientY);
    const rectId = stateRef.current.currentRectId;
    
    if (engine.finish_fog_draw(rectId)) {
      // Rectangle was successfully created
      const startPos = screenToWorld(event.clientX, event.clientY); // This should be the actual start position
      onFogRectangleCreated?.(rectId, startPos.x, startPos.y, worldPos.x, worldPos.y, stateRef.current.mode);
    } else {
      // Rectangle was too small or invalid
      engine.cancel_fog_draw(rectId);
    }
    
    stateRef.current.isDrawing = false;
    stateRef.current.currentRectId = null;
  }, [engine, screenToWorld, onFogRectangleCreated]);

  const cancelCurrentDraw = useCallback(() => {
    if (!engine || !stateRef.current.currentRectId) return;
    
    engine.cancel_fog_draw(stateRef.current.currentRectId);
    stateRef.current.isDrawing = false;
    stateRef.current.currentRectId = null;
  }, [engine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isEnabled) return;

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, isEnabled]);

  // Update mode when it changes
  useEffect(() => {
    stateRef.current.mode = fogMode;
  }, [fogMode]);

  return {
    isDrawing: stateRef.current.isDrawing,
    currentRectId: stateRef.current.currentRectId,
    cancelCurrentDraw,
  };
};
