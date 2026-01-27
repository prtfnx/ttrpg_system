/**
 * Context menu and light placement state management
 */
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { useGameStore } from '../../../../store';
import type { RenderEngine } from '../../../../types';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  spriteId?: string;
  copiedSprite?: string;
  showLayerSubmenu?: boolean;
}

interface LightPlacementMode {
  active: boolean;
  preset: any;
}

interface UseContextMenuProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  rustRenderManagerRef: RefObject<RenderEngine | null>;
  protocol: any;
}

export const useContextMenu = ({ canvasRef, rustRenderManagerRef, protocol }: UseContextMenuProps) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    showLayerSubmenu: false,
  });

  const handleContextMenuAction = useCallback(
    (action: string) => {
      if (!rustRenderManagerRef.current) return;

      const { spriteId, x, y } = contextMenu;

      switch (action) {
        case 'delete':
          if (spriteId && protocol) {
            console.log('🗑️ GameCanvas: Sending sprite delete request to server:', spriteId);
            try {
              protocol.removeSprite(spriteId);
              console.log('✅ GameCanvas: Sprite delete request sent to server');
            } catch (error) {
              console.error('❌ GameCanvas: Failed to send sprite delete request:', error);
            }
          } else if (spriteId) {
            console.warn('⚠️ GameCanvas: Protocol not available, deleting sprite locally only');
            rustRenderManagerRef.current.delete_sprite(spriteId);
          }
          break;
        case 'copy':
          if (spriteId) {
            const spriteData = rustRenderManagerRef.current.copy_sprite(spriteId);
            if (spriteData) {
              setContextMenu((prev) => ({ ...prev, copiedSprite: spriteData }));
            }
          }
          break;
        case 'paste':
          if (contextMenu.copiedSprite) {
            const canvas = canvasRef.current;
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              const canvasX = (x - rect.left) * (canvas.width / rect.width);
              const canvasY = (y - rect.top) * (canvas.height / rect.height);
              const worldCoords = rustRenderManagerRef.current.screen_to_world(canvasX, canvasY);
              rustRenderManagerRef.current.paste_sprite(
                'tokens',
                contextMenu.copiedSprite,
                worldCoords[0],
                worldCoords[1]
              );
            }
          }
          break;
        case 'resize':
          if (spriteId) {
            const newSize = prompt('Enter new size (width,height):', '64,64');
            if (newSize) {
              const [width, height] = newSize.split(',').map((n) => parseFloat(n.trim()));
              if (!isNaN(width) && !isNaN(height)) {
                rustRenderManagerRef.current.resize_sprite(spriteId, width, height);
              }
            }
          }
          break;
        case 'rotate':
          if (spriteId) {
            const angle = prompt('Enter rotation angle (degrees):', '0');
            if (angle) {
              const degrees = parseFloat(angle);
              if (!isNaN(degrees)) {
                rustRenderManagerRef.current.rotate_sprite(spriteId, degrees);
              }
            }
          }
          break;
      }

      // Don't close menu if showing layer submenu
      if (action !== 'show_layer_submenu') {
        setContextMenu((prev) => ({
          visible: false,
          x: 0,
          y: 0,
          showLayerSubmenu: false,
          copiedSprite: prev.copiedSprite, // Preserve copied sprite
        }));
      }
    },
    [contextMenu, protocol, canvasRef, rustRenderManagerRef]
  );

  const handleMoveToLayer = useCallback(
    (layerId: string) => {
      if (!rustRenderManagerRef.current || !contextMenu.spriteId) return;

      const { updateSprite } = useGameStore.getState();

      try {
        const renderEngine = rustRenderManagerRef.current as any;
        if (renderEngine.move_sprite_to_layer_action) {
          const result = renderEngine.move_sprite_to_layer_action(contextMenu.spriteId, layerId);
          console.log(`✅ GameCanvas: Moved sprite ${contextMenu.spriteId} to layer ${layerId}`, result);

          updateSprite(contextMenu.spriteId, { layer: layerId });
          console.log(`🔄 GameCanvas: Updated sprite ${contextMenu.spriteId} layer in store to ${layerId}`);

          window.dispatchEvent(
            new CustomEvent('spriteLayerChanged', {
              detail: { spriteId: contextMenu.spriteId, layer: layerId },
            })
          );
        } else {
          console.warn('⚠️ GameCanvas: move_sprite_to_layer_action not available in WASM');
        }
      } catch (error) {
        console.error('❌ GameCanvas: Failed to move sprite to layer:', error);
      }

      setContextMenu((prev) => ({
        visible: false,
        x: 0,
        y: 0,
        showLayerSubmenu: false,
        copiedSprite: prev.copiedSprite,
      }));
    },
    [contextMenu.spriteId, rustRenderManagerRef]
  );

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () =>
      setContextMenu((prev) => ({
        visible: false,
        x: 0,
        y: 0,
        showLayerSubmenu: false,
        copiedSprite: prev.copiedSprite,
      }));
    if (contextMenu.visible) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.visible]);

  return {
    contextMenu,
    setContextMenu,
    handleContextMenuAction,
    handleMoveToLayer,
  };
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
