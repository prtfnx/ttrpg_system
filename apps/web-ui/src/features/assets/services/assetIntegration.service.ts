/**
 * Asset Integration Service - bridges protocol asset messages with existing AssetManager
 * Handles asset upload/download requests and integrates with the WASM texture system
 */

import type { WebClientProtocol } from '@lib/websocket';
import { getCurrentWasmRuntime } from '@lib/wasm/runtime';
import { createMessage, MessageType } from '@lib/websocket';
import { emitProtocolEvent } from '@lib/websocket/protocolEvents';
import { logger } from '@shared/utils/logger';

interface AssetUploadResponse {
  success: boolean;
  asset_id?: string;
  upload_url?: string;
  presigned_url?: string;
  error?: string;
}

interface AssetUploadCompleted {
  asset_id: string;
  success: boolean;
  file_size?: number;
  content_type?: string;
  error?: string;
}

interface AssetDownloadResponse {
  success: boolean;
  asset_id?: string;
  download_url?: string;
  asset_data?: string;
  xxhash?: string;
  content_type?: string;
  error?: string;
}

interface AssetListResponse {
  success: boolean;
  assets?: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    created_at: string;
  }>;
  error?: string;
}

class AssetIntegrationService {
  private eventListeners: Array<() => void> = [];
  private protocol: WebClientProtocol | null = null;

  setProtocol(protocol: WebClientProtocol): void {
    this.protocol = protocol;
  }

  /**
   * Initialize the service with event listeners
   */
  initialize(): void {
    this.setupEventListeners();
    logger.debug('Asset integration service initialized');
  }

  /**
   * Clean up event listeners
   */
  dispose(): void {
    this.eventListeners.forEach(cleanup => cleanup());
    this.eventListeners = [];
  }

  private setupEventListeners(): void {
    // Asset download events
    const handleAssetDownloaded = (event: Event) => {
      this.handleAssetDownloaded((event as CustomEvent).detail);
    };
    window.addEventListener('asset-downloaded', handleAssetDownloaded);
    this.eventListeners.push(() => window.removeEventListener('asset-downloaded', handleAssetDownloaded));

    // Asset list updates
    const handleAssetListUpdated = (event: Event) => {
      this.handleAssetListUpdated((event as CustomEvent).detail);
    };
    window.addEventListener('asset-list-updated', handleAssetListUpdated);
    this.eventListeners.push(() => window.removeEventListener('asset-list-updated', handleAssetListUpdated));

    // Asset upload responses
    const handleAssetUploadResponse = (event: Event) => {
      this.handleAssetUploadResponse((event as CustomEvent).detail);
    };
    window.addEventListener('asset-upload-response', handleAssetUploadResponse);
    window.addEventListener('asset-uploaded', handleAssetUploadResponse);
    this.eventListeners.push(() => window.removeEventListener('asset-upload-response', handleAssetUploadResponse));
    this.eventListeners.push(() => window.removeEventListener('asset-uploaded', handleAssetUploadResponse));

    // Asset upload completed (to R2)
    const handleAssetUploadCompleted = (event: Event) => {
      this.handleAssetUploadCompleted((event as CustomEvent).detail);
    };
    window.addEventListener('asset-upload-completed', handleAssetUploadCompleted);
    this.eventListeners.push(() => window.removeEventListener('asset-upload-completed', handleAssetUploadCompleted));
  }

  private async handleAssetDownloaded(data: AssetDownloadResponse): Promise<void> {
    logger.debug('Asset download response received', data);

    if (!data.success) {
      logger.error('Asset download failed', data.error);
      return;
    }

    try {
      if (data.download_url && data.asset_id) {
        await this.downloadAndCacheAsset(data.asset_id, data.download_url, data.xxhash);
      } else if (data.asset_data && data.asset_id) {
        await this.cacheAssetData(
          data.asset_id,
          data.asset_data,
          data.xxhash,
          data.content_type,
        );
      }
    } catch (error) {
      logger.error('Failed to process asset download', error);
    }
  }

  private handleAssetListUpdated(data: AssetListResponse): void {
    logger.debug('Asset list updated', data);

    if (!data.success) {
      logger.error('Asset list update failed', data.error);
      return;
    }

    if (data.assets) {
      // Update UI with new asset list
      window.dispatchEvent(new CustomEvent('asset-manager-refresh', { 
        detail: { assets: data.assets } 
      }));
    }
  }

  private async handleAssetUploadResponse(data: AssetUploadResponse): Promise<void> {
    logger.debug('Asset upload response received', data);

    if (!data.success) {
      logger.error('Asset upload failed', data.error);
      window.dispatchEvent(new CustomEvent('asset-upload-failed', { 
        detail: { error: data.error } 
      }));
      return;
    }

    const uploadUrl = data.upload_url || data.presigned_url;
    if (uploadUrl && data.asset_id) {
      // Proceed with upload to presigned URL
      window.dispatchEvent(new CustomEvent('asset-upload-ready', { 
        detail: { 
          asset_id: data.asset_id, 
          upload_url: uploadUrl
        } 
      }));
    }
  }

  private handleAssetUploadCompleted(data: AssetUploadCompleted): void {
    logger.debug('Asset upload completed', { assetId: data.asset_id });

    if (!data.success) {
      logger.error('Asset upload to R2 failed', data.error);
      return;
    }

    // Send confirmation to server that upload is complete
    if (this.protocol) {
      logger.debug('Confirming asset upload to server', { assetId: data.asset_id });
      this.protocol.sendMessage(createMessage(MessageType.ASSET_UPLOAD_CONFIRM, {
        asset_id: data.asset_id,
        success: true,
        file_size: data.file_size,
        content_type: data.content_type
      }, 2));
    } else {
      logger.error('Protocol service not available for upload confirmation');
    }
  }

  private async downloadAndCacheAsset(
    assetId: string,
    downloadUrl: string,
    expectedHash?: string,
  ): Promise<void> {
    try {
      logger.debug('Downloading authorized asset', { assetId });
      const runtime = getCurrentWasmRuntime();
      if (!runtime) throw new Error('WASM runtime is unavailable');
      const cachedAssetId = await runtime.downloadAsset(downloadUrl, expectedHash);
      const cachedAsset = runtime.getAssetInfo(cachedAssetId);
      if (!cachedAsset) throw new Error('Downloaded asset was not retained');
      await this.loadAssetIntoWasm(assetId, cachedAsset.url);

      logger.debug('Asset downloaded and cached', { assetId });

    } catch (error) {
      logger.error('Failed to download and cache asset', error);
    }
  }

  private async cacheAssetData(
    assetId: string,
    assetData: string,
    expectedHash?: string,
    contentType?: string,
  ): Promise<void> {
    try {
      const runtime = getCurrentWasmRuntime();
      if (!runtime) throw new Error('WASM runtime is unavailable');
      const cachedAssetId = runtime.cacheAssetBytes(this.base64ToBytes(assetData), {
        name: assetId,
        mimeType: contentType || 'application/octet-stream',
        expectedHash,
      });
      const cachedAsset = runtime.getAssetInfo(cachedAssetId);
      if (!cachedAsset) throw new Error('Decoded asset was not retained');
      await this.loadAssetIntoWasm(assetId, cachedAsset.url);
      
      logger.debug('Asset data cached', { assetId });

    } catch (error) {
      logger.error('Failed to cache asset data', error);
    }
  }

  private async loadAssetIntoWasm(assetId: string, objectUrl: string): Promise<void> {
    try {
      // Create an image element to load the texture
      const img = new Image();
      
      return new Promise((resolve, reject) => {
        img.onload = () => {
          try {
            const renderEngine = getCurrentWasmRuntime()?.getRenderEngine();
            if (renderEngine) {
              renderEngine.load_texture(assetId, img);
              logger.debug('Texture loaded into WASM', { assetId });
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        };

        img.onerror = () => {
          reject(new Error(`Failed to load image: ${assetId}`));
        };

        img.src = objectUrl;
      });

    } catch (error) {
      logger.error('Failed to load asset into WASM', error);
      throw error;
    }
  }

  private base64ToBytes(base64Data: string): Uint8Array {
    // Remove data URL prefix if present
    const base64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // Convert base64 to binary
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes;
  }

  /**
   * Request an asset download from the server
   */
  requestAssetDownload(assetId: string): void {
    // This would be called by the AssetManager component
    emitProtocolEvent('protocol-send-message', {
      type: 'ASSET_DOWNLOAD_REQUEST',
      data: { asset_id: assetId }
    });
  }

  /**
   * Request an asset upload to the server
   */
  requestAssetUpload(fileName: string, fileSize: number, fileType: string): void {
    // This would be called by the AssetManager component
    emitProtocolEvent('protocol-send-message', {
      type: 'ASSET_UPLOAD_REQUEST',
      data: { 
        filename: fileName,
        file_size: fileSize,
        content_type: fileType
      }
    });
  }

  /**
   * Request the asset list from the server
   */
  requestAssetList(): void {
    emitProtocolEvent('protocol-send-message', {
      type: 'ASSET_LIST_REQUEST',
      data: {}
    });
  }
}

export const assetIntegrationService = new AssetIntegrationService();
