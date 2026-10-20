/**
 * Remote preview synchronization service.
 * Applies real-time drag/resize/rotate previews broadcast from other clients.
 */

import type { SpriteSyncService } from './spriteSync.service';
import { useGameStore } from '@/store';

type Operation = 'move' | 'resize' | 'rotate';

export class RemoteSyncService {
  private eventCleanups: Array<() => void> = [];
  private readonly spriteSync: SpriteSyncService;
  private leases = new Map<string, ReturnType<typeof setTimeout>>();
  private sequences = new Map<string, number>();
  private grace = new Map<string, number>();

  constructor(spriteSync: SpriteSyncService) {
    this.spriteSync = spriteSync;
  }

  init(): void {
    if (this.eventCleanups.length > 0) return;

    const on = (type: string, handler: (detail: Record<string, unknown>) => void) => {
      const listener = (e: Event) => handler((e as CustomEvent).detail);
      window.addEventListener(type, listener);
      this.eventCleanups.push(() => window.removeEventListener(type, listener));
    };

    on('sprite-drag-preview-remote', e => this.preview('move', e));
    on('sprite-resize-preview-remote', e => this.preview('resize', e));
    on('sprite-rotate-preview-remote', e => this.preview('rotate', e));
    for (const [type, operations] of [['sprite-moved', ['move']], ['sprite-scaled', ['resize']],
      ['sprite-rotated', ['rotate']], ['sprite-removed', ['move', 'resize', 'rotate']],
      ['sprite-updated', ['move', 'resize', 'rotate']]] as const) {
      on(type, data => {
        if (type === 'sprite-updated' && !data.sprite_data) return;
        const id = data.sprite_id ?? data.id;
        if (typeof id === 'string') for (const operation of operations) {
          const key = JSON.stringify([data.table_id, id, operation]);
          this.cancel(key);
          this.grace.set(key, Date.now() + 2000);
          if (this.grace.size > 1024) this.grace.delete(this.grace.keys().next().value!);
        }
      });
    }
    on('table-sprites-loaded', () => this.clear());
  }

  dispose(): void {
    this.eventCleanups.forEach(fn => fn());
    this.eventCleanups = [];
    this.clear();
  }

  private preview(operation: Operation, data: Record<string, unknown>): void {
    const tableId = useGameStore.getState().activeTableId;
    if (!tableId || data.table_id !== tableId || typeof data.id !== 'string') return;
    const expires = data.expires_at ?? Date.now() + 1500;
    if (typeof expires !== 'number' || !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 2000) return;
    const fields = operation === 'move' ? ['x', 'y'] : operation === 'resize' ? ['width', 'height'] : ['rotation'];
    if (fields.some(field => typeof data[field] !== 'number' || !Number.isFinite(data[field]))) return;
    if (operation === 'resize' && (Number(data.width) <= 0 || Number(data.height) <= 0)) return;
    const key = JSON.stringify([tableId, data.id, operation]);
    if ((this.grace.get(key) ?? 0) > Date.now()) return;
    const sequenceKey = JSON.stringify([tableId, data.id, operation, data.source_client_id]);
    if (data.sequence !== undefined) {
      if (!Number.isSafeInteger(data.sequence) || Number(data.sequence) <= (this.sequences.get(sequenceKey) ?? -1)) return;
      this.sequences.set(sequenceKey, Number(data.sequence));
      if (this.sequences.size > 1024) this.sequences.delete(this.sequences.keys().next().value!);
    }
    this.cancel(key);
    if (this.leases.size >= 100) return;
    const spriteId = data.id;
    this.leases.set(key, setTimeout(() => {
      this.leases.delete(key);
      const store = useGameStore.getState();
      if (store.activeTableId !== tableId) return;
      const sprite = store.sprites.find(item => item.id === spriteId && item.tableId === tableId);
      if (!sprite) return;
      if (operation === 'move') this.spriteSync.updateSpritePosition(spriteId, { x: sprite.x, y: sprite.y });
      if (operation === 'resize') this.spriteSync.resizeSpriteInWasm(spriteId, sprite.width ?? 50, sprite.height ?? 50);
      if (operation === 'rotate') this.spriteSync.updateSpriteRotation(spriteId, sprite.rotation);
    }, expires - Date.now()));
    if (operation === 'move') this.spriteSync.updateSpritePosition(spriteId, { x: Number(data.x), y: Number(data.y) });
    if (operation === 'resize') this.spriteSync.resizeSpriteInWasm(spriteId, Number(data.width), Number(data.height));
    if (operation === 'rotate') this.spriteSync.updateSpriteRotation(spriteId, Number(data.rotation));
  }

  private cancel(key: string): void {
    const timer = this.leases.get(key);
    if (timer !== undefined) clearTimeout(timer);
    this.leases.delete(key);
  }

  private clear(): void {
    for (const key of this.leases.keys()) this.cancel(key);
    this.sequences.clear();
    this.grace.clear();
  }
}
