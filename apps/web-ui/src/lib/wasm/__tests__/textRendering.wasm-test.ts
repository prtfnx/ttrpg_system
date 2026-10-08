import { beforeAll, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/store';
import { DEFAULT_TEXT, rasterizeTextSprite } from '@features/canvas/components/TextSprite/textSpriteModel';
import initWasm, { RenderEngine } from '../generated/ttrpg_rust_core';
import { SpriteSyncService } from '../spriteSync.service';
import { normalizeTableSnapshot } from '../tableSnapshot';
import type { AssetSyncService } from '../assetSync.service';

const TABLE = '550e8400-e29b-41d4-a716-446655440030';
beforeAll(async () => { await initWasm({ module_or_path: new URL('../generated/ttrpg_rust_core_bg.wasm', import.meta.url) }); });

function client() {
  const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 200;
  const engine = new RenderEngine(canvas);
  engine.handle_table_data(normalizeTableSnapshot({ table_data: { table_id: TABLE, table_name: 'Text', width: 400, height: 200,
    grid_enabled: false, scale: 1, layers: {} } }).renderer);
  engine.set_grid_enabled(false); engine.set_background_color('#000000'); engine.set_camera(0, 0, 1);
  const sync = new SpriteSyncService(() => engine, { requestAssetDownload: vi.fn() } as unknown as AssetSyncService);
  sync.init(); return { canvas, engine, sync, dispose() { sync.dispose(); engine.free(); } };
}
function coloredPixels(canvas: HTMLCanvasElement, channel: number) {
  const gl = canvas.getContext('webgl2')!; const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let count = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i + channel] > 100) count++;
  return count;
}

describe('Unicode text sprites (real browser and WebGL)', () => {
  it('uses language-aware multiline shaping with bounded textures and DPR-independent world dimensions', async () => {
    const descriptor = { ...DEFAULT_TEXT, text: 'Привіт\nمرحبا\n日本語', font_size: 48, language: 'uk', font_style: 'italic' as const };
    const result = await rasterizeTextSprite(descriptor);
    expect(result.canvas.lang).toBe('uk'); expect(result.height).toBeGreaterThan(150);
    expect(result.canvas.width).toBeLessThanOrEqual(1024); expect(result.canvas.height).toBeLessThanOrEqual(1024);
    expect(result.canvas.width * result.canvas.height).toBeLessThanOrEqual(262144);
    const ink = result.canvas.getContext('2d')!.getImageData(0, 0, result.canvas.width, result.canvas.height).data;
    expect(ink.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  });
  it('reconstructs saved text independently on two clients and applies accepted edits to both', async () => {
    useGameStore.setState({ activeTableId: TABLE, sessionRole: 'owner', userId: 1, sprites: [], selectedSprites: [] });
    const first = client(); const second = client();
    const metadata = JSON.stringify({ text_sprite: { ...DEFAULT_TEXT, text: 'Привіт مرحبا', color: '#ff0000' }, text_revision: 1 });
    const saved = { sprite_id: '550e8400-e29b-41d4-a716-446655440031', table_id: TABLE, x: 20, y: 20, width: 180, height: 45,
      layer: 'tokens', texture_path: '__TEXT__', metadata, controlled_by: [], rotation: 0 };
    try {
      first.sync.addSpriteToWasm(JSON.parse(JSON.stringify(saved))); second.sync.addSpriteToWasm(JSON.parse(JSON.stringify(saved)));
      await vi.waitFor(() => expect(first.sync.areTextTexturesReady(TABLE) && second.sync.areTextTexturesReady(TABLE)).toBe(true));
      first.engine.render(); second.engine.render();
      expect(coloredPixels(first.canvas, 0)).toBeGreaterThan(100); expect(coloredPixels(second.canvas, 0)).toBeGreaterThan(100);
      const updates = { metadata: JSON.stringify({ text_sprite: { ...DEFAULT_TEXT, text: 'Edited', color: '#00ff00' }, text_revision: 2 }), width: 160, height: 40 };
      window.dispatchEvent(new CustomEvent('sprite-updated', { detail: { sprite_id: saved.sprite_id, table_id: TABLE, operation: 'update', updates } }));
      await vi.waitFor(() => expect(first.sync.areTextTexturesReady(TABLE) && second.sync.areTextTexturesReady(TABLE)).toBe(true));
      first.engine.render(); second.engine.render();
      expect(coloredPixels(first.canvas, 1)).toBeGreaterThan(100); expect(coloredPixels(second.canvas, 1)).toBeGreaterThan(100);
      expect(useGameStore.getState().sprites.find(sprite => sprite.id === saved.sprite_id)?.metadata).toBe(updates.metadata);
    } finally { first.dispose(); second.dispose(); }
  });
});
