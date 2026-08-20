/**
 * Asset synchronization service.
 * Owns texture loading state and asset download/upload lifecycle.
 * No dependencies on other WASM sub-services.
 */

import type { RenderEngine } from './runtime';
import { onProtocolEvent } from '@lib/websocket/protocolEvents';
import { logger } from '@shared/utils/logger';
import { emitWasmEvent, onWasmEvent } from './wasmEvents';

interface AssetPayload {
  asset_id?: string;
  url?: string;
  download_url?: string;
  xxhash?: string;
  success?: boolean;
  instructions?: string;
  status?: string;
  message?: string;
}

export type AssetDownloadResolver = (
  downloadUrl: string,
  expectedHash?: string,
) => Promise<string>;

export class AssetSyncService {
  // Texture IDs already loaded into WASM — skip redundant server downloads
  private loadedTextureIds = new Set<string>();
  // Assets with an outstanding link request or browser-cache download.
  private requestedTextureIds = new Set<string>();
  private activeTextureLoads = new Map<string, Promise<void>>();
  // Assets we're still waiting for upload confirmation before requesting download
  private pendingAssetRetries = new Set<string>();
  // Sprites waiting for a specific asset upload to complete
  private pendingSpritesForAssets = new Map<string, string[]>();
  private retryTimerIds = new Set<ReturnType<typeof setTimeout>>();
  private lifecycleVersion = 0;

  private eventCleanups: Array<() => void> = [];
  private readonly getEngine: () => RenderEngine | null;
  private readonly resolveDownloadedAsset: AssetDownloadResolver;

  constructor(
    getEngine: () => RenderEngine | null,
    resolveDownloadedAsset: AssetDownloadResolver,
  ) {
    this.getEngine = getEngine;
    this.resolveDownloadedAsset = resolveDownloadedAsset;
  }

  init(): void {
    if (this.eventCleanups.length > 0) return;
    this.lifecycleVersion += 1;
    this.eventCleanups.push(
      onProtocolEvent('asset-downloaded', d => this.handleAssetDownloaded((d ?? {}) as AssetPayload)),
      onProtocolEvent('asset-uploaded', d => this.handleAssetUploaded((d ?? {}) as AssetPayload)),
      onWasmEvent('asset-upload-started', d => {
      if (d?.asset_id) this.pendingAssetRetries.add(d.asset_id);
      }),
      onProtocolEvent('protocol-success', d => this.handleProtocolSuccess((d ?? {}) as AssetPayload)),
      onWasmEvent('local-texture-ready', d => this.handleLocalTextureReady(d)),
    );
  }

  dispose(): void {
    this.lifecycleVersion += 1;
    this.eventCleanups.forEach(fn => fn());
    this.eventCleanups = [];
    this.retryTimerIds.forEach(timerId => clearTimeout(timerId));
    this.retryTimerIds.clear();
    this.loadedTextureIds.clear();
    this.requestedTextureIds.clear();
    this.activeTextureLoads.clear();
    this.pendingAssetRetries.clear();
    this.pendingSpritesForAssets.clear();
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
    if (this.loadedTextureIds.has(assetId) || this.requestedTextureIds.has(assetId)) return;
    this.requestedTextureIds.add(assetId);
    emitWasmEvent('request-asset-download', { asset_id: assetId });
  }

  async loadTextureFromUrl(
    assetId: string,
    url: string,
    isActive: () => boolean = () => true,
  ): Promise<void> {
    if (!isActive() || !this.getEngine()) return;

    const image = new Image();
    if (!url.startsWith('blob:')) image.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      image.onload = () => {
        if (!isActive()) {
          resolve();
          return;
        }
        try {
          const engine = this.getEngine();
          if (!engine) {
            resolve();
            return;
          }
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
    const lifecycleVersion = this.lifecycleVersion;
    const isActive = () => lifecycleVersion === this.lifecycleVersion;
    this.loadTextureFromUrl(asset_id, url, isActive)
      .then(() => {
        if (!isActive()) return;
        this.loadedTextureIds.add(asset_id);
        this.requestedTextureIds.delete(asset_id);
        this.pendingAssetRetries.delete(asset_id);
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      })
      .catch(() => {
        this.requestedTextureIds.delete(asset_id);
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      });
  }

  private handleAssetDownloaded(data: AssetPayload): void {
    if (!data?.success || !data.download_url || !data.asset_id) {
      if (data?.asset_id) this.requestedTextureIds.delete(data.asset_id);
      if (data?.instructions?.includes('upload') && data?.asset_id) {
        this.pendingAssetRetries.add(data.asset_id);
      }
      return;
    }
    const { asset_id, download_url } = data;
    if (this.loadedTextureIds.has(asset_id)) {
      this.requestedTextureIds.delete(asset_id);
      this.pendingAssetRetries.delete(asset_id);
      return;
    }
    if (this.activeTextureLoads.has(asset_id)) return;

    const lifecycleVersion = this.lifecycleVersion;
    const isActive = () => lifecycleVersion === this.lifecycleVersion;
    const load = this.resolveDownloadedAsset(download_url, data.xxhash)
      .then(objectUrl => this.loadTextureFromUrl(asset_id, objectUrl, isActive))
      .then(() => {
        if (!isActive()) return;
        this.loadedTextureIds.add(asset_id);
      })
      .catch(error => {
        logger.error('Failed to download and load asset texture', { assetId: asset_id, error });
      })
      .finally(() => {
        if (this.activeTextureLoads.get(asset_id) === load) {
          this.activeTextureLoads.delete(asset_id);
        }
        if (isActive()) this.requestedTextureIds.delete(asset_id);
      });
    this.activeTextureLoads.set(asset_id, load);
    this.pendingAssetRetries.delete(asset_id);
  }

  private handleAssetUploaded(data: AssetPayload): void {
    if (!data?.asset_id) return;
    const assetId = data.asset_id;
    if (this.pendingAssetRetries.has(assetId)) {
      this.pendingAssetRetries.delete(assetId);
      this.scheduleRetry(() => this.requestAssetDownloadLink(assetId, `sprite_for_${assetId}`), 100);
    }
    const pending = this.pendingSpritesForAssets.get(assetId);
    if (pending?.length) {
      this.scheduleRetry(() => {
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

  private scheduleRetry(callback: () => void, delayMs: number): void {
    const timerId = setTimeout(() => {
      this.retryTimerIds.delete(timerId);
      callback();
    }, delayMs);
    this.retryTimerIds.add(timerId);
  }
}
