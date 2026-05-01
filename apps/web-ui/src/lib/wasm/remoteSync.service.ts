/**
 * Remote preview synchronization service.
 * Applies real-time drag/resize/rotate previews broadcast from other clients.
 */

import type { SpriteSyncService } from './spriteSync.service';

export class RemoteSyncService {
  private eventCleanups: Array<() => void> = [];
  private readonly spriteSync: SpriteSyncService;

  constructor(spriteSync: SpriteSyncService) {
    this.spriteSync = spriteSync;
  }

  init(): void {
    const on = (type: string, handler: (detail: Record<string, unknown>) => void) => {
      const listener = (e: Event) => handler((e as CustomEvent).detail);
      window.addEventListener(type, listener);
      this.eventCleanups.push(() => window.removeEventListener(type, listener));
    };

    on('sprite-drag-preview-remote', (e: { id?: string; x?: number; y?: number }) => {
      if (e.id) this.spriteSync.updateSpritePosition(e.id, { x: e.x ?? 0, y: e.y ?? 0 });
    });
    on('sprite-resize-preview-remote', (e: { id?: string; width?: number; height?: number }) => {
      if (e.id) this.spriteSync.resizeSpriteInWasm(e.id, e.width ?? 0, e.height ?? 0);
    });
    on('sprite-rotate-preview-remote', (e: { id?: string; rotation?: number }) => {
      if (e.id) this.spriteSync.updateSpriteRotation(e.id, e.rotation ?? 0);
    });
  }

  dispose(): void {
    this.eventCleanups.forEach(fn => fn());
    this.eventCleanups = [];
  }
}
