/**
 * Asset Integration Service - bridges protocol asset messages with existing AssetManager
 * Handles asset upload/download requests and integrates with the WASM texture system
 */

import type { WebClientProtocol } from '@lib/websocket';
import { createMessage, MessageType } from '@lib/websocket';

interface AssetUploadResponse {
  success: boolean;
  asset_id?: string;
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
    console.log('Asset Integration Service initialized');
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
    this.eventListeners.push(() => window.removeEventListener('asset-upload-response', handleAssetUploadResponse));

    // Asset upload completed (to R2)
    const handleAssetUploadCompleted = (event: Event) => {
      this.handleAssetUploadCompleted((event as CustomEvent).detail);
    };
    window.addEventListener('asset-upload-completed', handleAssetUploadCompleted);
    this.eventListeners.push(() => window.removeEventListener('asset-upload-completed', handleAssetUploadCompleted));
  }

  private async handleAssetDownloaded(data: AssetDownloadResponse): Promise<void> {
    console.log('Asset download response received:', data);

    if (!data.success) {
      console.error('Asset download failed:', data.error);
      return;
    }

    try {
      if (data.download_url && data.asset_id) {
        // Download the asset and cache it locally
        await this.downloadAndCacheAsset(data.asset_id, data.download_url);
      } else if (data.asset_data && data.asset_id) {
        // Asset data provided directly (base64 encoded)
        await this.cacheAssetData(data.asset_id, data.asset_data);
      }
    } catch (error) {
      console.error('Failed to process asset download:', error);
    }
  }

  private handleAssetListUpdated(data: AssetListResponse): void {
    console.log('Asset list updated:', data);

    if (!data.success) {
      console.error('Asset list update failed:', data.error);
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
    console.log('Asset upload response received:', data);

    if (!data.success) {
      console.error('Asset upload failed:', data.error);
      window.dispatchEvent(new CustomEvent('asset-upload-failed', { 
        detail: { error: data.error } 
      }));
      return;
    }

    if (data.presigned_url && data.asset_id) {
      // Proceed with upload to presigned URL
      window.dispatchEvent(new CustomEvent('asset-upload-ready', { 
        detail: { 
          asset_id: data.asset_id, 
          upload_url: data.presigned_url 
        } 
      }));
    }
  }

  private handleAssetUploadCompleted(data: AssetUploadCompleted): void {
    console.log('🎯 AssetIntegrationService: Upload completed for asset:', data.asset_id);

    if (!data.success) {
      console.error('Asset upload to R2 failed:', data.error);
      return;
    }

    // Send confirmation to server that upload is complete
    if (this.protocol) {
      console.log('📡 AssetIntegrationService: Confirming upload to server for asset:', data.asset_id);
      this.protocol.sendMessage(createMessage(MessageType.ASSET_UPLOAD_CONFIRM, {
        asset_id: data.asset_id,
        success: true,
        file_size: data.file_size,
        content_type: data.content_type
      }, 2));
    } else {
      console.error('Protocol service not available for upload confirmation');
    }
  }

  private async downloadAndCacheAsset(assetId: string, downloadUrl: string): Promise<void> {
    try {
      console.log('Downloading asset:', assetId, 'from:', downloadUrl);

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download asset: ${response.statusText}`);
      }

      const blob = await response.blob();
      
      // Create object URL for the asset
      const objectUrl = URL.createObjectURL(blob);
      
      // Cache the asset in the asset manager
      // Note: This would integrate with the existing useAssetManager hook
      // For now, we'll store it in a simple cache and load it into WASM
      await this.loadAssetIntoWasm(assetId, objectUrl);

      console.log('Asset downloaded and cached:', assetId);

    } catch (error) {
      console.error('Failed to download and cache asset:', error);
    }
  }

  private async cacheAssetData(assetId: string, assetData: string): Promise<void> {
    try {
      // Asset data is likely base64 encoded
      const blob = this.base64ToBlob(assetData);
      const objectUrl = URL.createObjectURL(blob);
      
      await this.loadAssetIntoWasm(assetId, objectUrl);
      
      console.log('Asset data cached:', assetId);

    } catch (error) {
      console.error('Failed to cache asset data:', error);
    }
  }

  private async loadAssetIntoWasm(assetId: string, objectUrl: string): Promise<void> {
    try {
      // Create an image element to load the texture
      const img = new Image();
      
      return new Promise((resolve, reject) => {
        img.onload = () => {
          try {
            // Load texture into WASM render engine
            if (window.rustRenderManager && window.rustRenderManager.load_texture) {
              window.rustRenderManager.load_texture(assetId, img);
              console.log('Texture loaded into WASM:', assetId);
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
      console.error('Failed to load asset into WASM:', error);
      throw error;
    }
  }

  private base64ToBlob(base64Data: string): Blob {
    // Remove data URL prefix if present
    const base64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // Convert base64 to binary
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return new Blob([bytes]);
  }

  /**
   * Request an asset download from the server
   */
  requestAssetDownload(assetId: string): void {
    // This would be called by the AssetManager component
    window.dispatchEvent(new CustomEvent('protocol-send-message', {
      detail: {
        type: 'ASSET_DOWNLOAD_REQUEST',
        data: { asset_id: assetId }
      }
    }));
  }

  /**
   * Request an asset upload to the server
   */
  requestAssetUpload(fileName: string, fileSize: number, fileType: string): void {
    // This would be called by the AssetManager component
    window.dispatchEvent(new CustomEvent('protocol-send-message', {
      detail: {
        type: 'ASSET_UPLOAD_REQUEST',
        data: { 
          filename: fileName,
          file_size: fileSize,
          file_type: fileType
        }
      }
    }));
  }

  /**
   * Request the asset list from the server
   */
  requestAssetList(): void {
    window.dispatchEvent(new CustomEvent('protocol-send-message', {
      detail: {
        type: 'ASSET_LIST_REQUEST',
        data: {}
      }
    }));
  }
}

export const assetIntegrationService = new AssetIntegrationService();
