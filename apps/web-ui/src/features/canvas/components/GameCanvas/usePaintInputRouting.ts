import { useMemo } from 'react';
import { useGameStore } from '@/store';
import { useSelectionPreferences } from '@features/painting/controller/selectionPreferences';

function ownsSelectionInput(): boolean {
  const tool = useGameStore.getState().activeTool;
  return tool === 'paint' || (useSelectionPreferences.getState().mode === 'combined'
    && (tool === 'select' || tool === 'move'));
}

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
      if (ownsSelectionInput() && event.button === 0) return;
      mouseDown(event);
    },
    routedMouseMove(event: MouseEvent) {
      if (ownsSelectionInput() && (event.buttons & 1) !== 0) return;
      mouseMove(event);
    },
    routedMouseUp(event: MouseEvent) {
      if (ownsSelectionInput() && event.button === 0) return;
      mouseUp(event);
    },
    routedKeyDown(event: KeyboardEvent) {
      if (ownsSelectionInput()
        && ['Delete', 'Backspace', 'Escape'].includes(event.key)) return;
      keyDown(event);
    },
  }), [mouseDown, mouseMove, mouseUp, keyDown]);
}
