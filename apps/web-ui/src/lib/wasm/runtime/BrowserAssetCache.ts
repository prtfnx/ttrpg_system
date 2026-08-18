export interface AssetInfo {
  id: string;
  name: string;
  url: string;
  xxhash: string;
  size: number;
  mime_type: string;
  cached_at: number;
  last_accessed: number;
  download_progress: number;
}

export interface AssetCacheStats {
  total_assets: number;
  total_size: number;
  cache_hits: number;
  cache_misses: number;
  last_cleanup: number;
  download_queue_size: number;
  total_downloads: number;
  failed_downloads: number;
  hash_verifications: number;
  hash_failures: number;
}

export interface CacheAssetOptions {
  name: string;
  mimeType: string;
  expectedHash?: string;
}

interface CacheEntry {
  info: AssetInfo;
  objectUrl: string;
}

interface BrowserAssetCacheDependencies {
  calculateHash: (data: Uint8Array) => string;
  fetch: typeof globalThis.fetch;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  now: () => number;
}

const DEFAULT_MAX_CACHE_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url, globalThis.location?.href).pathname;
    return decodeURIComponent(path.split('/').pop() || 'asset');
  } catch {
    return 'asset';
  }
}

/**
 * Browser-owned asset transport and Blob cache.
 *
 * Cached payloads stay in browser-managed Blob storage. Callers receive stable
 * object URLs and metadata, never cloned byte arrays from WASM linear memory.
 */
export class BrowserAssetCache {
  private readonly dependencies: BrowserAssetCacheDependencies;
  private readonly entries = new Map<string, CacheEntry>();
  private readonly hashLookup = new Map<string, string>();
  private readonly pendingDownloads = new Map<
    string,
    { promise: Promise<string>; controller: AbortController }
  >();
  private disposed = false;
  private maxCacheBytes = DEFAULT_MAX_CACHE_BYTES;
  private maxAgeMs = DEFAULT_MAX_AGE_MS;
  private stats: AssetCacheStats;

  constructor(dependencies: BrowserAssetCacheDependencies) {
    this.dependencies = dependencies;
    this.stats = this.emptyStats();
  }

  configure(options: { maxCacheBytes?: number; maxAgeMs?: number }): void {
    this.assertActive();
    if (options.maxCacheBytes !== undefined) {
      if (!Number.isSafeInteger(options.maxCacheBytes) || options.maxCacheBytes <= 0) {
        throw new Error('Asset cache size must be a positive safe integer');
      }
      this.maxCacheBytes = options.maxCacheBytes;
    }
    if (options.maxAgeMs !== undefined) {
      if (!Number.isFinite(options.maxAgeMs) || options.maxAgeMs <= 0) {
        throw new Error('Asset cache age must be positive');
      }
      this.maxAgeMs = options.maxAgeMs;
    }
    this.cleanup();
  }

  async download(url: string, expectedHash?: string): Promise<string> {
    this.assertActive();
    const normalizedHash = expectedHash?.toLowerCase();
    if (normalizedHash) {
      const cached = this.getByHash(normalizedHash);
      if (cached) return cached;
    }

    const pendingKey = normalizedHash ? `hash:${normalizedHash}` : `url:${url}`;
    const existing = this.pendingDownloads.get(pendingKey);
    if (existing) return existing.promise;

    const controller = new AbortController();
    const pending = this.fetchAndCache(url, normalizedHash, controller.signal);
    this.pendingDownloads.set(pendingKey, { promise: pending, controller });
    this.stats.download_queue_size = this.pendingDownloads.size;
    try {
      return await pending;
    } finally {
      this.pendingDownloads.delete(pendingKey);
      this.stats.download_queue_size = this.pendingDownloads.size;
    }
  }

  cacheBytes(data: Uint8Array, options: CacheAssetOptions): string {
    this.assertActive();
    const calculatedHash = this.dependencies.calculateHash(data).toLowerCase();
    this.stats.hash_verifications += 1;
    if (options.expectedHash && options.expectedHash.toLowerCase() !== calculatedHash) {
      this.stats.hash_failures += 1;
      throw new Error('Asset hash verification failed');
    }

    const cached = this.getByHash(calculatedHash);
    if (cached) return cached;
    if (data.byteLength > this.maxCacheBytes) {
      throw new Error('Asset exceeds the browser cache limit');
    }

    const blob = new Blob([data], { type: options.mimeType || 'application/octet-stream' });
    const objectUrl = this.dependencies.createObjectURL(blob);
    const now = this.dependencies.now();
    const assetId = `asset_${calculatedHash}`;
    const info: AssetInfo = {
      id: assetId,
      name: options.name || 'asset',
      url: objectUrl,
      xxhash: calculatedHash,
      size: blob.size,
      mime_type: blob.type || 'application/octet-stream',
      cached_at: now,
      last_accessed: now,
      download_progress: 100,
    };
    this.entries.set(assetId, { info, objectUrl });
    this.hashLookup.set(calculatedHash, assetId);
    this.stats.total_assets = this.entries.size;
    this.stats.total_size += blob.size;
    this.cleanup();
    return assetId;
  }

  calculateHash(data: Uint8Array): string {
    return this.dependencies.calculateHash(data).toLowerCase();
  }

  getInfo(assetId: string): AssetInfo | null {
    const entry = this.entries.get(assetId);
    if (!entry) {
      this.stats.cache_misses += 1;
      return null;
    }
    entry.info.last_accessed = this.dependencies.now();
    this.stats.cache_hits += 1;
    return { ...entry.info };
  }

  has(assetId: string): boolean {
    return this.entries.has(assetId);
  }

  hasHash(xxhash: string): boolean {
    return this.hashLookup.has(xxhash.toLowerCase());
  }

  getByHash(xxhash: string): string | null {
    const assetId = this.hashLookup.get(xxhash.toLowerCase());
    if (!assetId) {
      this.stats.cache_misses += 1;
      return null;
    }
    const entry = this.entries.get(assetId);
    if (!entry) {
      this.hashLookup.delete(xxhash.toLowerCase());
      this.stats.cache_misses += 1;
      return null;
    }
    entry.info.last_accessed = this.dependencies.now();
    this.stats.cache_hits += 1;
    return assetId;
  }

  remove(assetId: string): boolean {
    const entry = this.entries.get(assetId);
    if (!entry) return false;
    this.entries.delete(assetId);
    this.hashLookup.delete(entry.info.xxhash);
    this.dependencies.revokeObjectURL(entry.objectUrl);
    this.stats.total_assets = this.entries.size;
    this.stats.total_size -= entry.info.size;
    return true;
  }

  cleanup(): void {
    const now = this.dependencies.now();
    const expired = [...this.entries.values()]
      .filter(entry => now - entry.info.last_accessed > this.maxAgeMs)
      .map(entry => entry.info.id);
    expired.forEach(assetId => this.remove(assetId));

    while (this.stats.total_size > this.maxCacheBytes && this.entries.size > 0) {
      const oldest = [...this.entries.values()].reduce((left, right) =>
        left.info.last_accessed <= right.info.last_accessed ? left : right
      );
      this.remove(oldest.info.id);
    }
    this.stats.last_cleanup = now;
  }

  clear(): void {
    [...this.entries.keys()].forEach(assetId => this.remove(assetId));
    this.stats = this.emptyStats();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingDownloads.forEach(download => download.controller.abort());
    this.pendingDownloads.clear();
    this.clear();
  }

  list(): AssetInfo[] {
    return [...this.entries.values()].map(entry => ({ ...entry.info }));
  }

  getStats(): AssetCacheStats {
    return { ...this.stats };
  }

  private async fetchAndCache(
    url: string,
    expectedHash: string | undefined,
    signal: AbortSignal,
  ): Promise<string> {
    try {
      const response = await this.dependencies.fetch(url, { credentials: 'omit', signal });
      if (!response.ok) {
        throw new Error(`Asset download failed with HTTP ${response.status}`);
      }
      const declaredSize = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredSize) && declaredSize > this.maxCacheBytes) {
        throw new Error('Asset exceeds the browser cache limit');
      }
      const data = new Uint8Array(await response.arrayBuffer());
      const assetId = this.cacheBytes(data, {
        name: filenameFromUrl(url),
        mimeType: response.headers.get('content-type') || 'application/octet-stream',
        expectedHash,
      });
      this.stats.total_downloads += 1;
      return assetId;
    } catch (error) {
      if (!(signal.aborted && error instanceof DOMException && error.name === 'AbortError')) {
        this.stats.failed_downloads += 1;
      }
      throw error;
    }
  }

  private emptyStats(): AssetCacheStats {
    return {
      total_assets: 0,
      total_size: 0,
      cache_hits: 0,
      cache_misses: 0,
      last_cleanup: this.dependencies.now(),
      download_queue_size: 0,
      total_downloads: 0,
      failed_downloads: 0,
      hash_verifications: 0,
      hash_failures: 0,
    };
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Asset cache has been disposed');
  }
}

export function createBrowserAssetCache(calculateHash: (data: Uint8Array) => string): BrowserAssetCache {
  return new BrowserAssetCache({
    calculateHash,
    fetch: globalThis.fetch.bind(globalThis),
    createObjectURL: blob => URL.createObjectURL(blob),
    revokeObjectURL: url => URL.revokeObjectURL(url),
    now: () => Date.now(),
  });
}
