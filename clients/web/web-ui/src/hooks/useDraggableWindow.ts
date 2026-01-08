/**
 * Hook for making a window draggable and resizable
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseDraggableWindowOptions {
  initialX?: number;
  initialY?: number;
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export function useDraggableWindow(options: UseDraggableWindowOptions = {}) {
  const {
    initialX = 0,
    initialY = 0,
    initialWidth = 800,
    initialHeight = window.innerHeight,
    minWidth = 400,
    minHeight = 300,
    maxWidth = window.innerWidth * 0.9,
    maxHeight = window.innerHeight * 0.95,
  } = options;

  const [state, setState] = useState<WindowState>({
    x: initialX,
    y: initialY,
    width: initialWidth,
    height: initialHeight,
  });

  const dragStateRef = useRef<{
    isDragging: boolean;
    isResizing: boolean;
    resizeDirection: string | null;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startWindowX: number;
    startWindowY: number;
  }>({
    isDragging: false,
    isResizing: false,
    resizeDirection: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    startWindowX: 0,
    startWindowY: 0,
  });

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStateRef.current = {
      ...dragStateRef.current,
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startWindowX: state.x,
      startWindowY: state.y,
    };
  }, [state.x, state.y]);

  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current = {
      ...dragStateRef.current,
      isResizing: true,
      resizeDirection: direction,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: state.width,
      startHeight: state.height,
      startWindowX: state.x,
      startWindowY: state.y,
    };
  }, [state.width, state.height, state.x, state.y]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragStateRef.current;

      if (drag.isDragging) {
        const deltaX = e.clientX - drag.startX;
        const deltaY = e.clientY - drag.startY;
        setState(prev => ({
          ...prev,
          x: drag.startWindowX + deltaX,
          y: drag.startWindowY + deltaY,
        }));
      } else if (drag.isResizing && drag.resizeDirection) {
        const deltaX = e.clientX - drag.startX;
        const deltaY = e.clientY - drag.startY;

        setState(prev => {
          const newState = { ...prev };

          if (drag.resizeDirection === 'right') {
            newState.width = Math.max(minWidth, Math.min(maxWidth, drag.startWidth + deltaX));
          } else if (drag.resizeDirection === 'bottom') {
            newState.height = Math.max(minHeight, Math.min(maxHeight, drag.startHeight + deltaY));
          } else if (drag.resizeDirection === 'bottom-right') {
            newState.width = Math.max(minWidth, Math.min(maxWidth, drag.startWidth + deltaX));
            newState.height = Math.max(minHeight, Math.min(maxHeight, drag.startHeight + deltaY));
          }

          return newState;
        });
      }
    };

    const handleMouseUp = () => {
      dragStateRef.current.isDragging = false;
      dragStateRef.current.isResizing = false;
      dragStateRef.current.resizeDirection = null;
    };

    if (dragStateRef.current.isDragging || dragStateRef.current.isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = dragStateRef.current.isResizing ? 
        (dragStateRef.current.resizeDirection === 'right' ? 'ew-resize' : 
         dragStateRef.current.resizeDirection === 'bottom' ? 'ns-resize' : 'nwse-resize') : 
        'move';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [minWidth, minHeight, maxWidth, maxHeight]);

  return {
    windowState: state,
    handleDragStart,
    handleResizeStart,
  };
}
