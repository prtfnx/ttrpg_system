import { useMemo } from 'react';
import { useGameStore } from '@/store';

interface CanvasInputHandlers {
  mouseDown(event: MouseEvent): void;
  mouseMove(event: MouseEvent): void;
  mouseUp(event: MouseEvent): void;
  keyDown(event: KeyboardEvent): void;
}

// Stable listener identity keeps tool changes out of the renderer's attach lifecycle.
export function usePaintInputRouting({ mouseDown, mouseMove, mouseUp, keyDown }: CanvasInputHandlers) {
  return useMemo(() => ({
    routedMouseDown(event: MouseEvent) {
      if (useGameStore.getState().activeTool === 'paint' && event.button === 0) return;
      mouseDown(event);
    },
    routedMouseMove(event: MouseEvent) {
      if (useGameStore.getState().activeTool === 'paint' && (event.buttons & 1) !== 0) return;
      mouseMove(event);
    },
    routedMouseUp(event: MouseEvent) {
      if (useGameStore.getState().activeTool === 'paint' && event.button === 0) return;
      mouseUp(event);
    },
    routedKeyDown(event: KeyboardEvent) {
      if (useGameStore.getState().activeTool === 'paint'
        && ['Delete', 'Backspace', 'Escape'].includes(event.key)) return;
      keyDown(event);
    },
  }), [mouseDown, mouseMove, mouseUp, keyDown]);
}
