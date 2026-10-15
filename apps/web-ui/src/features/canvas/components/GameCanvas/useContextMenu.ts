/**
 * Context menu and light placement state management
 */
import type { WebClientProtocol } from '@lib/websocket';
import type { RenderEngine } from '@lib/wasm/runtime';
import type { PaintInteractionController } from '@features/painting/controller/PaintInteractionController';
import { useCallback, useEffect, useState, type RefObject } from 'react';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  spriteId?: string;
  showLayerSubmenu?: boolean;
}

interface LightPreset {
  name: string;
  color: { r: number; g: number; b: number; a: number };
  radius?: number;
  radiusFt?: number;
  intensity: number;
  isMoving?: boolean;
  existingLightId?: string;
  [key: string]: unknown;
}

interface LightPlacementMode {
  active: boolean;
  preset: LightPreset;
}

interface UseContextMenuProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  rustRenderManagerRef: RefObject<RenderEngine | null>;
  protocol: WebClientProtocol | null;
  editor?: Pick<PaintInteractionController, 'getState' | 'subscribe' | 'selectionCommand' | 'spriteSelectionCommand' | 'pasteSelection' | 'editSprites'> | null;
}

const CLOSED_MENU: ContextMenuState = { visible: false, x: 0, y: 0, showLayerSubmenu: false };

/** Renderer input identifies a target; the shared owner confirms every durable edit. */
export const useContextMenu = ({ rustRenderManagerRef, editor }: UseContextMenuProps) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(CLOSED_MENU);
  const [canPaste, setCanPaste] = useState(false);
  useEffect(() => {
    setContextMenu(CLOSED_MENU);
    setCanPaste(false);
    return editor?.subscribe(state => setCanPaste(state.canPaste === true && !state.commandPending));
  }, [editor]);

  const handleContextMenuAction = useCallback((action: string) => {
    const engine = rustRenderManagerRef.current;
    const { spriteId } = contextMenu;
    if (editor && engine) {
      switch (action) {
        case 'copy':
        case 'delete': {
          if (!spriteId) break;
          const state = editor.getState();
          if (state.selectedSpriteIds?.includes(spriteId)) {
            editor.selectionCommand(action);
          } else {
            const selected = engine.get_selected_sprites();
            editor.spriteSelectionCommand(selected.includes(spriteId) ? selected : [spriteId], action);
          }
          break;
        }
        case 'paste':
          editor.pasteSelection();
          break;
        case 'resize': {
          if (!spriteId) break;
          const size = prompt('Enter new size (width,height):', '64,64');
          if (size === null) break;
          const parts = size.split(',');
          const [width, height] = parts.map(value => Number(value.trim()));
          editor.editSprites([spriteId], { width: parts.length === 2 ? width : NaN, height });
          break;
        }
        case 'rotate': {
          if (!spriteId) break;
          const angle = prompt('Enter rotation angle (degrees):', '0');
          if (angle === null || !angle.trim()) break;
          const degrees = Number(angle.trim());
          editor.editSprites([spriteId], { rotation: ((degrees + 180) % 360 + 360) % 360 - 180 });
          break;
        }
      }
    }
    if (action !== 'show_layer_submenu') setContextMenu(CLOSED_MENU);
  }, [contextMenu, editor, rustRenderManagerRef]);

  const handleMoveToLayer = useCallback((layer: string) => {
    if (contextMenu.spriteId && rustRenderManagerRef.current) editor?.editSprites([contextMenu.spriteId], { layer });
    setContextMenu(CLOSED_MENU);
  }, [contextMenu.spriteId, editor, rustRenderManagerRef]);

  useEffect(() => {
    if (!contextMenu.visible) return;
    const close = () => setContextMenu(CLOSED_MENU);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu.visible]);

  return { contextMenu, setContextMenu, canPaste, handleContextMenuAction, handleMoveToLayer };
};

export const useLightPlacement = (canvasRef: RefObject<HTMLCanvasElement>) => {
 const [lightPlacementMode, setLightPlacementMode] = useState<LightPlacementMode | null>(null);

  // Listen for light placement events from LightingPanel
  useEffect(() => {
    const handleStartPlacement = (e: Event) => {
      const customEvent = e as CustomEvent;
      setLightPlacementMode({
        active: true,
        preset: customEvent.detail.preset,
      });
      // Change cursor to indicate placement mode
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = 'crosshair';
      }
    };

    const handleCancelPlacement = () => {
      setLightPlacementMode(null);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = 'grab';
      }
    };

    window.addEventListener('startLightPlacement', handleStartPlacement);
    window.addEventListener('cancelLightPlacement', handleCancelPlacement);

    return () => {
      window.removeEventListener('startLightPlacement', handleStartPlacement);
      window.removeEventListener('cancelLightPlacement', handleCancelPlacement);
    };
 }, [canvasRef]);

  return {
    lightPlacementMode,
    setLightPlacementMode,
  };
};
