/**
 * useSpriteDragSync
 * Listens for local Rust-fired drag/resize/rotate preview events and
 * throttles them to the WebSocket at ~50 ms intervals.
 */

import { createMessage, MessageType } from '@lib/websocket';
import { useEffect, useRef } from 'react';

const THROTTLE_MS = 50;

export function useSpriteDragSync(sendMessage: (msg: unknown) => void) {
  const pendingMove   = useRef<{ spriteId: string; x: number; y: number } | null>(null);
  const pendingResize = useRef<{ spriteId: string; width: number; height: number } | null>(null);
  const pendingRotate = useRef<{ spriteId: string; rotation: number } | null>(null);
  const timers = useRef<{
    move:   ReturnType<typeof setTimeout> | null;
    resize: ReturnType<typeof setTimeout> | null;
    rotate: ReturnType<typeof setTimeout> | null;
  }>({ move: null, resize: null, rotate: null });

  useEffect(() => {
    function flush(type: 'move' | 'resize' | 'rotate') {
      if (type === 'move' && pendingMove.current) {
        const { spriteId, x, y } = pendingMove.current;
        sendMessage(createMessage(MessageType.SPRITE_DRAG_PREVIEW, { id: spriteId, x, y }));
        pendingMove.current = null;
      }
      if (type === 'resize' && pendingResize.current) {
        const { spriteId, width, height } = pendingResize.current;
        sendMessage(createMessage(MessageType.SPRITE_RESIZE_PREVIEW, { id: spriteId, width, height }));
        pendingResize.current = null;
      }
      if (type === 'rotate' && pendingRotate.current) {
        const { spriteId, rotation } = pendingRotate.current;
        sendMessage(createMessage(MessageType.SPRITE_ROTATE_PREVIEW, { id: spriteId, rotation }));
        pendingRotate.current = null;
      }
      timers.current[type] = null;
    }

    function throttle(type: 'move' | 'resize' | 'rotate') {
      if (!timers.current[type]) {
        timers.current[type] = setTimeout(() => flush(type), THROTTLE_MS);
      }
    }

    const onDrag   = (e: Event) => { pendingMove.current   = (e as CustomEvent).detail; throttle('move'); };
    const onResize = (e: Event) => { pendingResize.current = (e as CustomEvent).detail; throttle('resize'); };
    const onRotate = (e: Event) => { pendingRotate.current = (e as CustomEvent).detail; throttle('rotate'); };

    window.addEventListener('sprite-drag-preview',   onDrag);
    window.addEventListener('sprite-resize-preview', onResize);
    window.addEventListener('sprite-rotate-preview', onRotate);

    return () => {
      window.removeEventListener('sprite-drag-preview',   onDrag);
      window.removeEventListener('sprite-resize-preview', onResize);
      window.removeEventListener('sprite-rotate-preview', onRotate);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- known: timers.current stable ref, captured before use
      Object.values(timers.current).forEach(t => t && clearTimeout(t));
    };
  }, [sendMessage]);
}
