import { rasterizeTextSprite, type TextSpriteDescriptor } from '@features/canvas/components/TextSprite/textSpriteModel';
import { logger } from '@shared/utils/logger';
import type { RenderEngine } from './runtime';

interface TextureEntry {
  key: string;
  engine: RenderEngine;
  signature: string;
  tableId: string;
  ready: boolean;
}

/** One derived texture per resident text sprite. No PNG or local ID is persisted. */
export class TextSpriteTextureService {
  private readonly entries = new Map<string, TextureEntry>();

  update(id: string, tableId: string, descriptor: TextSpriteDescriptor, engine: RenderEngine): string {
    const signature = JSON.stringify(descriptor);
    const existing = this.entries.get(id);
    if (existing?.signature === signature && existing.engine === engine && existing.tableId === tableId) return existing.key;
    if (existing && (existing.engine !== engine || existing.tableId !== tableId)) existing.engine.unload_texture(existing.key);
    const entry = { key: `text:${tableId}:${id}`, engine, signature, tableId, ready: false };
    this.entries.set(id, entry);
    void rasterizeTextSprite(descriptor).then(async ({ canvas }) => {
      if (this.entries.get(id) !== entry) return;
      const image = new Image();
      image.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Text texture could not be decoded.'));
        image.src = canvas.toDataURL('image/png');
      });
      if (this.entries.get(id) !== entry) return;
      engine.load_text_texture(entry.key, image);
      entry.ready = true;
      engine.render();
    }).catch((error: unknown) => {
      if (this.entries.get(id) !== entry) return;
      this.entries.delete(id);
      engine.unload_texture(entry.key);
      logger.error('[TextSpriteTextureService] Text rendering failed', { spriteId: id, error });
    });
    return entry.key;
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    this.entries.delete(id);
    if (entry) entry.engine.unload_texture(entry.key);
  }

  retain(ids: readonly string[]): void {
    const retained = new Set(ids);
    for (const id of this.entries.keys()) if (!retained.has(id)) this.remove(id);
  }

  dispose(): void { this.retain([]); }

  isReady(tableId: string): boolean {
    return [...this.entries.values()].every(entry => entry.tableId !== tableId || entry.ready);
  }
}
