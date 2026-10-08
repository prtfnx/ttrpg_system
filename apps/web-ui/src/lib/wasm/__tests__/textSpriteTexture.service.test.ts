import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextSpriteTextureService } from '../textSpriteTexture.service';
import { DEFAULT_TEXT, rasterizeTextSprite } from '@features/canvas/components/TextSprite/textSpriteModel';
import type { RenderEngine } from '../runtime';

vi.mock('@features/canvas/components/TextSprite/textSpriteModel', async original => ({ ...await original<object>(), rasterizeTextSprite: vi.fn() }));
const descriptor = { ...DEFAULT_TEXT, text: 'Saved text' };
function engine() { return { load_text_texture: vi.fn(), unload_texture: vi.fn(), render: vi.fn() }; }
function raster() {
  let complete!: (value: Awaited<ReturnType<typeof rasterizeTextSprite>>) => void;
  vi.mocked(rasterizeTextSprite).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  return () => complete({ canvas: { toDataURL: () => 'data:image/png;base64,AA==' } as HTMLCanvasElement, width: 100, height: 40 });
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('derived text texture lifecycle', () => {
  it('deduplicates descriptors, waits for decode, and uploads through linear text rendering', async () => {
    const decode = vi.fn();
    vi.stubGlobal('Image', class { onload?: () => void; set src(_value: string) { decode(this); } });
    const finish = raster(); const e = engine(); const service = new TextSpriteTextureService();
    const key = service.update('id', 'table', descriptor, e as unknown as RenderEngine);
    expect(service.update('id', 'table', descriptor, e as unknown as RenderEngine)).toBe(key);
    expect(service.isReady('table')).toBe(false);
    finish(); await vi.waitFor(() => expect(decode).toHaveBeenCalled());
    expect(e.load_text_texture).not.toHaveBeenCalled();
    decode.mock.calls[0][0].onload();
    await vi.waitFor(() => expect(e.load_text_texture).toHaveBeenCalledWith(key, expect.anything()));
    expect(service.isReady('table')).toBe(true);
    service.dispose(); expect(e.unload_texture).toHaveBeenCalledWith(key);
  });
  it('cannot resurrect a sprite removed or a table replaced while fonts are loading', async () => {
    const finish = raster(); const e = engine(); const service = new TextSpriteTextureService();
    service.update('id', 'old-table', descriptor, e as unknown as RenderEngine);
    service.retain([]); finish(); await Promise.resolve(); await Promise.resolve();
    expect(e.load_text_texture).not.toHaveBeenCalled(); expect(service.isReady('old-table')).toBe(true);
  });
  it('an older edit cannot upload over the newer descriptor', async () => {
    const first = raster(); const second = raster(); const e = engine(); const service = new TextSpriteTextureService();
    service.update('id', 'table', descriptor, e as unknown as RenderEngine);
    service.update('id', 'table', { ...descriptor, text: 'New' }, e as unknown as RenderEngine);
    first(); await Promise.resolve(); await Promise.resolve();
    expect(e.load_text_texture).not.toHaveBeenCalled();
    service.dispose(); second(); await Promise.resolve();
    expect(e.load_text_texture).not.toHaveBeenCalled();
  });
});
