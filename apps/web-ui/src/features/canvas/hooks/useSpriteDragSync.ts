/**
 * useSpriteDragSync
 * Listens for local Rust-fired drag/resize/rotate preview events and
 * throttles them to the WebSocket at ~50 ms intervals.
 */

import { createMessage, MessageType } from '@lib/websocket';
import { useGameStore } from '@/store';
import { useEffect, useRef } from 'react';

const THROTTLE_MS = 50;

export function useSpriteDragSync(sendMessage: (msg: unknown) => void) {
  const pendingMove   = useRef<{ spriteId: string; x: number; y: number } | null>(null);
  const pendingResize = useRef<{ spriteId: string; width: number; height: number } | null>(null);
  const pendingRotate = useRef<{ spriteId: string; rotation: number } | null>(null);
  const scopes = useRef<Partial<Record<'move' | 'resize' | 'rotate', { tableId: string; expires_at: number; sequence: number }>>>({});
  const sequence = useRef(0);
  const timers = useRef<{
    move:   ReturnType<typeof setTimeout> | null;
    resize: ReturnType<typeof setTimeout> | null;
    rotate: ReturnType<typeof setTimeout> | null;
  }>({ move: null, resize: null, rotate: null });

  useEffect(() => {
    function flush(type: 'move' | 'resize' | 'rotate') {
      const tableId = useGameStore.getState().activeTableId;
      const scope = scopes.current[type];
      delete scopes.current[type];
      if (!tableId || scope?.tableId !== tableId || scope.expires_at <= Date.now()) {
        pendingMove.current = null;
        pendingResize.current = null;
        pendingRotate.current = null;
        timers.current[type] = null;
        return;
      }
      if (type === 'move' && pendingMove.current) {
        const { spriteId, x, y } = pendingMove.current;
        sendMessage(createMessage(MessageType.SPRITE_DRAG_PREVIEW, { id: spriteId, x, y, table_id: tableId, expires_at: scope.expires_at, sequence: scope.sequence }));
        pendingMove.current = null;
      }
      if (type === 'resize' && pendingResize.current) {
        const { spriteId, width, height } = pendingResize.current;
        sendMessage(createMessage(MessageType.SPRITE_RESIZE_PREVIEW, { id: spriteId, width, height, table_id: tableId, expires_at: scope.expires_at, sequence: scope.sequence }));
        pendingResize.current = null;
      }
      if (type === 'rotate' && pendingRotate.current) {
        const { spriteId, rotation } = pendingRotate.current;
        sendMessage(createMessage(MessageType.SPRITE_ROTATE_PREVIEW, { id: spriteId, rotation, table_id: tableId, expires_at: scope.expires_at, sequence: scope.sequence }));
        pendingRotate.current = null;
      }
      timers.current[type] = null;
    }

    function throttle(type: 'move' | 'resize' | 'rotate') {
      const tableId = useGameStore.getState().activeTableId;
      if (!tableId) return;
      scopes.current[type] = { tableId, expires_at: Date.now() + 1500, sequence: ++sequence.current };
      if (!timers.current[type]) {
        timers.current[type] = setTimeout(() => flush(type), THROTTLE_MS);
      }
    }

    const onDrag   = (e: Event) => { pendingMove.current   = (e as CustomEvent).detail; throttle('move'); };
    const onResize = (e: Event) => { pendingResize.current = (e as CustomEvent).detail; throttle('resize'); };
    const onRotate = (e: Event) => { pendingRotate.current = (e as CustomEvent).detail; throttle('rotate'); };
    const onCommit = (event: Event) => {
      const { operation } = (event as CustomEvent).detail;
      const type = operation === 'resize' ? 'resize' : operation === 'rotate' ? 'rotate' : 'move';
      const timer = timers.current[type];
      if (timer) clearTimeout(timer);
      timers.current[type] = null;
      delete scopes.current[type];
      if (type === 'move') pendingMove.current = null;
      if (type === 'resize') pendingResize.current = null;
      if (type === 'rotate') pendingRotate.current = null;
    };

    window.addEventListener('sprite-drag-preview',   onDrag);
    window.addEventListener('sprite-resize-preview', onResize);
    window.addEventListener('sprite-rotate-preview', onRotate);
    window.addEventListener('wasm-sprite-operation', onCommit);

    return () => {
      window.removeEventListener('sprite-drag-preview',   onDrag);
      window.removeEventListener('sprite-resize-preview', onResize);
      window.removeEventListener('sprite-rotate-preview', onRotate);
      window.removeEventListener('wasm-sprite-operation', onCommit);
      Object.values(timers.current).forEach(t => t && clearTimeout(t));
      timers.current = { move: null, resize: null, rotate: null };
      scopes.current = {};
      pendingMove.current = null;
      pendingResize.current = null;
      pendingRotate.current = null;
    };
  }, [sendMessage]);
}
