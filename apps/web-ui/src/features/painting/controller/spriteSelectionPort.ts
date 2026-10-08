import { useGameStore } from '@/store';
import type { Sprite } from '@/types';
import { canInteract, isDM } from '@features/session/types/roles';
import type { WebClientProtocol } from '@lib/websocket';
import type { WasmRuntimePort } from '@lib/wasm/runtime';
import type { SpriteSelectionPort } from './PaintInteractionController';
import type { SelectionBounds } from './SelectionManager';

export function spriteSelectionBounds(sprite: Sprite): SelectionBounds {
  const width = (sprite.width ?? 50) * sprite.scale.x;
  const height = (sprite.height ?? 50) * sprite.scale.y;
  const angle = sprite.rotation * Math.PI / 180;
  const cx = sprite.x + width / 2;
  const cy = sprite.y + height / 2;
  const corners = [[-width / 2, -height / 2], [width / 2, -height / 2],
    [width / 2, height / 2], [-width / 2, height / 2]]
    .map(([x, y]) => [cx + x * Math.cos(angle) - y * Math.sin(angle), cy + x * Math.sin(angle) + y * Math.cos(angle)]);
  return [Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[1])),
    Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[1]))];
}

export function createSpriteSelectionPort(runtime: WasmRuntimePort, protocol: WebClientProtocol): SpriteSelectionPort {
  return {
    items(tableId) {
      const store = useGameStore.getState();
      return store.sprites.filter(sprite => sprite.tableId === tableId && sprite.layer === store.activeLayer
        && store.layerVisibility[sprite.layer] !== false && sprite.isVisible !== false)
        .map(sprite => ({ id: sprite.id, x: sprite.x, y: sprite.y,
          bounds: spriteSelectionBounds(sprite),
          canEdit: canInteract(store.sessionRole) && store.canControlSprite(sprite.id),
          canDelete: isDM(store.sessionRole) }));
    },
    hitTest(x, y) { return runtime.hitTestSelectionSprite(x, y); },
    select(ids) {
      if (!runtime.selectSelectionSprites(ids)) return;
      const selected = new Set(ids);
      const current = useGameStore.getState().selectedSprites;
      if (current.length === ids.length && current.every((id, index) => id === ids[index])) return;
      useGameStore.setState(state => ({ selectedSprites: [...ids],
        sprites: state.sprites.map(sprite => ({ ...sprite, isSelected: selected.has(sprite.id) })) }));
    },
    preview(id, x, y) { runtime.previewSelectionSprite(id, x, y); },
    move(tableId, id, x, y) { protocol.moveSprite(id, x, y, tableId); },
    remove(tableId, id) { protocol.removeSprite(id, tableId); },
  };
}
