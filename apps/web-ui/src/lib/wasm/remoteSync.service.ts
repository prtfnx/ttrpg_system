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
    const on = (type: string, handler: (detail: any) => void) => {
      const listener = (e: Event) => handler((e as CustomEvent).detail);
      window.addEventListener(type, listener);
      this.eventCleanups.push(() => window.removeEventListener(type, listener));
    };

    on('sprite-drag-preview-remote', ({ id, x, y }) => {
      if (id) this.spriteSync.updateSpritePosition(id, { x, y });
    });
    on('sprite-resize-preview-remote', ({ id, width, height }) => {
      if (id) this.spriteSync.resizeSpriteInWasm(id, width, height);
    });
    on('sprite-rotate-preview-remote', ({ id, rotation }) => {
      if (id) this.spriteSync.updateSpriteRotation(id, rotation);
    });
  }

  dispose(): void {
    this.eventCleanups.forEach(fn => fn());
    this.eventCleanups = [];
  }
}
