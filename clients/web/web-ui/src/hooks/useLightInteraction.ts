import { useCallback, useEffect, useRef } from 'react';
import { useRenderEngine } from './useRenderEngine';

interface LightInteractionState {
  isDragging: boolean;
  draggedLightId: string | null;
}

export const useLightInteraction = (
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  onLightPositionUpdate?: (lightId: string, x: number, y: number) => void
) => {
  const engine = useRenderEngine();
  const stateRef = useRef<LightInteractionState>({
    isDragging: false,
    draggedLightId: null,
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
    if (!engine || event.button !== 0) return; // Only left mouse button
    
    const worldPos = screenToWorld(event.clientX, event.clientY);
    const lightId = engine.get_light_at_position(worldPos.x, worldPos.y);
    
    if (lightId) {
      event.preventDefault();
      stateRef.current.isDragging = true;
      stateRef.current.draggedLightId = lightId;
      
      engine.start_light_drag(lightId, worldPos.x, worldPos.y);
    }
  }, [engine, screenToWorld]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!engine || !stateRef.current.isDragging || !stateRef.current.draggedLightId) return;
    
    const worldPos = screenToWorld(event.clientX, event.clientY);
    
    if (engine.update_light_drag(worldPos.x, worldPos.y)) {
      onLightPositionUpdate?.(stateRef.current.draggedLightId, worldPos.x, worldPos.y);
    }
  }, [engine, screenToWorld, onLightPositionUpdate]);

  const handleMouseUp = useCallback((event: MouseEvent) => {
    if (!engine || !stateRef.current.isDragging) return;
    
    const draggedLightId = engine.end_light_drag();
    
    if (draggedLightId && onLightPositionUpdate) {
      const worldPos = screenToWorld(event.clientX, event.clientY);
      onLightPositionUpdate(draggedLightId, worldPos.x, worldPos.y);
    }
    
    stateRef.current.isDragging = false;
    stateRef.current.draggedLightId = null;
  }, [engine, screenToWorld, onLightPositionUpdate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  return {
    isDragging: stateRef.current.isDragging,
    draggedLightId: stateRef.current.draggedLightId,
  };
};
