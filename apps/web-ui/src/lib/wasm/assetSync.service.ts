/**
 * Asset synchronization service.
 * Owns texture loading state and asset download/upload lifecycle.
 * No dependencies on other WASM sub-services.
 */

import type { RenderEngine } from '@lib/wasm/wasm';

interface AssetPayload {
  asset_id?: string;
  url?: string;
  download_url?: string;
  success?: boolean;
  instructions?: string;
  status?: string;
  message?: string;
}

export class AssetSyncService {
  // Texture IDs already loaded into WASM — skip redundant server downloads
  private loadedTextureIds = new Set<string>();
  // Assets we're still waiting for upload confirmation before requesting download
  private pendingAssetRetries = new Set<string>();
  // Sprites waiting for a specific asset upload to complete
  private pendingSpritesForAssets = new Map<string, string[]>();

  private eventCleanups: Array<() => void> = [];
  private readonly getEngine: () => RenderEngine | null;

  constructor(getEngine: () => RenderEngine | null) {
    this.getEngine = getEngine;
  }

  init(): void {
    const on = <T>(type: string, handler: (detail: T) => void) => {
      const listener = (e: Event) => handler((e as CustomEvent<T>).detail);
      window.addEventListener(type, listener);
      this.eventCleanups.push(() => window.removeEventListener(type, listener));
    };

    on('asset-downloaded', (d: AssetPayload) => this.handleAssetDownloaded(d));
    on('asset-uploaded', (d: AssetPayload) => this.handleAssetUploaded(d));
    on('asset-upload-started', (d: AssetPayload) => {
      if (d?.asset_id) this.pendingAssetRetries.add(d.asset_id);
    });
    on('protocol-success', (d: AssetPayload) => this.handleProtocolSuccess(d));
    on('local-texture-ready', (d: AssetPayload) => this.handleLocalTextureReady(d));
  }

  dispose(): void {
    this.eventCleanups.forEach(fn => fn());
    this.eventCleanups = [];
  }

  isAssetPending(assetId: string): boolean {
    return this.pendingAssetRetries.has(assetId);
  }

  trackPendingSprite(assetId: string, spriteId: string): void {
    const list = this.pendingSpritesForAssets.get(assetId) ?? [];
    list.push(spriteId);
    this.pendingSpritesForAssets.set(assetId, list);
  }

  requestAssetDownloadLink(assetId: string, _spriteId: string): void {
    if (this.loadedTextureIds.has(assetId)) return;
    window.dispatchEvent(new CustomEvent('request-asset-download', { detail: { asset_id: assetId } }));
  }

  async loadTextureFromUrl(assetId: string, url: string): Promise<void> {
    const engine = this.getEngine();
    if (!engine) return;

    const image = new Image();
    if (!url.startsWith('blob:')) image.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      image.onload = () => {
        try {
          engine.load_texture(assetId, image);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      image.onerror = reject;
      image.src = url;
    });
  }

  private handleLocalTextureReady(data: AssetPayload): void {
    const { asset_id, url } = data ?? {};
    if (!asset_id || !url) return;
    this.loadTextureFromUrl(asset_id, url)
      .then(() => {
        this.loadedTextureIds.add(asset_id);
        this.pendingAssetRetries.delete(asset_id);
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      })
      .catch(() => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      });
  }

  private handleAssetDownloaded(data: AssetPayload): void {
    if (!data?.success || !data.download_url || !data.asset_id) {
      if (data?.instructions?.includes('upload') && data?.asset_id) {
        this.pendingAssetRetries.add(data.asset_id);
      }
      return;
    }
    const { asset_id, download_url } = data;
    if (this.loadedTextureIds.has(asset_id)) {
      this.pendingAssetRetries.delete(asset_id);
      return;
    }
    this.loadTextureFromUrl(asset_id, download_url)
      .then(() => this.loadedTextureIds.add(asset_id))
      .catch(() => {});
    this.pendingAssetRetries.delete(asset_id);
  }

  private handleAssetUploaded(data: AssetPayload): void {
    if (!data?.asset_id) return;
    const assetId = data.asset_id;
    if (this.pendingAssetRetries.has(assetId)) {
      this.pendingAssetRetries.delete(assetId);
      setTimeout(() => this.requestAssetDownloadLink(assetId, `sprite_for_${assetId}`), 100);
    }
    const pending = this.pendingSpritesForAssets.get(assetId);
    if (pending?.length) {
      setTimeout(() => {
        pending.forEach(sid => this.requestAssetDownloadLink(assetId, sid));
        this.pendingSpritesForAssets.delete(assetId);
      }, 150);
    }
  }

  private handleProtocolSuccess(data: AssetPayload): void {
    if (data?.asset_id && (data.message?.includes('Upload confirmed') || data.status === 'uploaded')) {
      this.handleAssetUploaded(data);
    }
  }
}
