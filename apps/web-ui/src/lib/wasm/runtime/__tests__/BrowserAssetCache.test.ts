import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserAssetCache } from '../BrowserAssetCache';

function response(bytes: number[], contentType = 'image/png'): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: vi.fn(async () => new Uint8Array(bytes).buffer),
  } as unknown as Response;
}

describe('BrowserAssetCache', () => {
  const calculateHash = vi.fn((data: Uint8Array) =>
    [...data].map(value => value.toString(16).padStart(2, '0')).join('').padEnd(16, '0')
  );
  const fetchAsset = vi.fn<typeof fetch>();
  const createObjectURL = vi.fn(() => 'blob:asset-1');
  const revokeObjectURL = vi.fn();
  let now = 1_000;
  let cache: BrowserAssetCache;

  beforeEach(() => {
    vi.clearAllMocks();
    now = 1_000;
    cache = new BrowserAssetCache({
      calculateHash,
      fetch: fetchAsset,
      createObjectURL,
      revokeObjectURL,
      now: () => now,
    });
  });

  it('owns fetch and caches one Blob URL after Rust hash verification', async () => {
    fetchAsset.mockResolvedValue(response([1, 2, 3]));

    const assetId = await cache.download('https://assets.example/maps/map.png?signature=secret');

    expect(fetchAsset).toHaveBeenCalledWith(
      'https://assets.example/maps/map.png?signature=secret',
      { credentials: 'omit', signal: expect.any(AbortSignal) },
    );
    expect(calculateHash).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(cache.getInfo(assetId)).toMatchObject({
      id: assetId,
      name: 'map.png',
      mime_type: 'image/png',
      url: 'blob:asset-1',
      size: 3,
    });
    expect(cache.getStats()).toMatchObject({
      total_assets: 1,
      total_size: 3,
      total_downloads: 1,
      hash_verifications: 1,
    });
  });

  it('fails closed on hash mismatch without retaining bytes or an object URL', async () => {
    fetchAsset.mockResolvedValue(response([1, 2, 3]));

    await expect(cache.download('https://assets.example/map.png', 'ffffffffffffffff'))
      .rejects.toThrow('Asset hash verification failed');

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(cache.list()).toEqual([]);
    expect(cache.getStats()).toMatchObject({ hash_failures: 1, failed_downloads: 1 });
  });

  it('rejects an oversized declared response before buffering its body', async () => {
    const arrayBuffer = vi.fn();
    cache.configure({ maxCacheBytes: 4 });
    fetchAsset.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '5' }),
      arrayBuffer,
    } as unknown as Response);

    await expect(cache.download('https://assets.example/large.png'))
      .rejects.toThrow('Asset exceeds the browser cache limit');

    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent transport and later hash-cache hits', async () => {
    let finishDownload: ((value: Response) => void) | undefined;
    fetchAsset.mockReturnValue(new Promise(resolve => { finishDownload = resolve; }));

    const first = cache.download('https://assets.example/map.png', '0102000000000000');
    const second = cache.download('https://assets.example/renewed-url', '0102000000000000');
    finishDownload?.(response([1, 2]));

    await expect(Promise.all([first, second])).resolves.toEqual([
      'asset_0102000000000000',
      'asset_0102000000000000',
    ]);
    await expect(cache.download('https://assets.example/renewed-url', '0102000000000000'))
      .resolves.toBe('asset_0102000000000000');
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('evicts least-recently-used Blobs and revokes their URLs', () => {
    createObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    cache.configure({ maxCacheBytes: 4 });
    const first = cache.cacheBytes(new Uint8Array([1, 2, 3]), {
      name: 'first.png',
      mimeType: 'image/png',
    });
    now += 1;
    const second = cache.cacheBytes(new Uint8Array([4, 5, 6]), {
      name: 'second.png',
      mimeType: 'image/png',
    });

    expect(cache.has(first)).toBe(false);
    expect(cache.has(second)).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');
    expect(cache.getStats()).toMatchObject({ total_assets: 1, total_size: 3 });
  });

  it('revokes every retained object URL on disposal', () => {
    createObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    cache.cacheBytes(new Uint8Array([1]), { name: 'first', mimeType: 'image/png' });
    cache.cacheBytes(new Uint8Array([2]), { name: 'second', mimeType: 'image/png' });

    cache.dispose();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second');
    expect(cache.getStats().total_assets).toBe(0);
  });

  it('aborts in-flight browser transport on disposal', async () => {
    fetchAsset.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = cache.download('https://assets.example/slow.png');

    cache.dispose();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(cache.getStats().download_queue_size).toBe(0);
  });
});
