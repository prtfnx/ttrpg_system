import { useGameStore } from '@/store';
import type { Sprite } from '@/types';
import type { WasmRuntimePort } from '@lib/wasm/runtime';
import { onProtocolEvent } from '@lib/websocket/protocolEvents';
import type { PaintObject } from '../model/paintObject';
import { CanvasOptimisticState } from './CanvasOptimisticState';
import type { PaintController } from './PaintController';

export function createCanvasOptimism(runtime: WasmRuntimePort, paints: PaintController) {
  const hidden = new Map<string, { layer: string; data: unknown }>();
  const authoritative = new Map<string, Sprite>();
  const legacy = new Map<string, { spriteId: string; kind: 'remove' | 'update'; patch: Partial<Sprite> }>();
  const state = new CanvasOptimisticState({
    readSprite: id => authoritative.get(id) ?? useGameStore.getState().sprites.find(sprite => sprite.id === id),
    readPaint: id => {
      const current = paints.getState();
      return (current.visible ?? current.committed).find(object => object.id === id);
    },
    readCanonicalPaint: id => paints.getState().committed.find(object => object.id === id),
    renderPaints: objects => paints.setEditorProjection(objects),
    renderSprite: (id, sprite) => {
      const store = useGameStore.getState();
      const current = store.sprites.find(item => item.id === id);
      const tableId = sprite?.tableId ?? current?.tableId;
      if (tableId !== store.activeTableId) return;
      const engine = runtime.getRenderEngine();
      if (!sprite) {
        if (current) {
          const serialized = engine?.copy_sprite?.(id);
          if (serialized) hidden.set(id, { layer: current.layer, data: JSON.parse(serialized) });
        }
        engine?.remove_sprite(id);
        useGameStore.setState(old => ({ sprites: old.sprites.map(item => item.id === id ? { ...item, isVisible: false } : item) }));
        return;
      }
      const backup = hidden.get(id);
      if (backup) {
        engine?.add_sprite_to_layer(backup.layer, backup.data);
        hidden.delete(id);
      }
      engine?.resize_sprite(id, sprite.width ?? 50, sprite.height ?? 50);
      if (current && current.layer !== sprite.layer) engine?.move_sprite_to_layer(id, sprite.layer);
      runtime.previewSelectionSpriteTransform(id, { x: sprite.x, y: sprite.y,
        scale_x: sprite.scale.x, scale_y: sprite.scale.y, rotation: sprite.rotation });
      useGameStore.setState(old => ({ sprites: old.sprites.some(item => item.id === id)
        ? old.sprites.map(item => item.id === id ? { ...sprite } : item) : [...old.sprites, sprite] }));
    },
  });
  paints.setEditorBusy(id => state.hasPendingPaint(id));

  function connectEvents() {
    const seed = () => {
      authoritative.clear();
      for (const sprite of useGameStore.getState().sprites) authoritative.set(sprite.id, structuredClone(sprite));
    };
    seed();
    const removers = [onProtocolEvent('table-canonical-snapshot', seed),
      onProtocolEvent('optimistic-sprite-snapshot', event => {
        for (const id of event.requestIds) legacy.delete(id);
        state.resolveSnapshot(event.requestIds);
      }), onProtocolEvent('sprite-canonical-state', event => {
      if (event.tableId !== useGameStore.getState().activeTableId) return;
      const base = authoritative.get(event.spriteId) ?? useGameStore.getState().sprites.find(sprite => sprite.id === event.spriteId);
      if (!base) return;
      const sprite = { ...base, ...event.state };
      authoritative.set(event.spriteId, sprite);
      state.canonical(undefined, 'sprite', event.spriteId, sprite);
    }), onProtocolEvent('optimistic-sprite-command', event => {
      if (event.tableId !== useGameStore.getState().activeTableId) return;
      const sprite = authoritative.get(event.spriteId) ?? useGameStore.getState().sprites.find(item => item.id === event.spriteId);
      if (!sprite) return;
      const member = { kind: 'sprite' as const, id: event.spriteId, expected: { x: sprite.x, y: sprite.y,
        width: sprite.width ?? 50, height: sprite.height ?? 50, rotation: sprite.rotation,
        scale_x: sprite.scale.x, scale_y: sprite.scale.y } };
      legacy.set(event.requestId, event);
      state.stage(event.requestId, event.kind === 'remove' ? { mode: 'delete', members: [member] }
        : { mode: 'local_patch', members: [member], patch: event.patch });
      event.handled = true;
    }), onProtocolEvent('optimistic-sprite-settled', event => {
      const command = legacy.get(event.requestId);
      if (!command) return;
      legacy.delete(event.requestId);
      if (event.accepted) {
        if (command.kind === 'remove') authoritative.delete(command.spriteId);
        else {
          const base = authoritative.get(command.spriteId);
          if (base) authoritative.set(command.spriteId, { ...base, ...command.patch });
        }
      }
      state.settle(event.requestId, event.accepted);
    }), onProtocolEvent('canvas-canonical-object', event => {
      if (event.tableId !== useGameStore.getState().activeTableId) return;
      if (event.object === null) {
        hidden.delete(event.id);
        authoritative.delete(event.id);
        state.canonical(event.operationId, event.kind, event.id, null);
      } else if (event.kind === 'paint') {
        state.canonical(event.operationId, 'paint', event.id, event.object as PaintObject);
      } else {
        const raw = event.object as Record<string, unknown>;
        const current = useGameStore.getState().sprites.find(item => item.id === event.id);
        if (!current) return;
        const position = raw.position as number[] | undefined;
        const sprite: Sprite = { ...current, x: Number(position?.[0] ?? raw.x ?? current.x),
          y: Number(position?.[1] ?? raw.y ?? current.y), width: Number(raw.width ?? current.width ?? 50),
          height: Number(raw.height ?? current.height ?? 50), rotation: Number(raw.rotation ?? current.rotation),
          scale: { x: Number(raw.scale_x ?? current.scale.x), y: Number(raw.scale_y ?? current.scale.y) },
          layer: String(raw.layer ?? current.layer) };
        authoritative.set(event.id, sprite);
        state.canonical(event.operationId, 'sprite', event.id, sprite);
      }
    })];
    return () => removers.forEach(remove => remove());
  }

  return { state, connectEvents };
}
