/**
 * Asset Integration Service - bridges asset list and upload protocol messages.
 * Texture download orchestration belongs to AssetSyncService.
 */

import type { WebClientProtocol } from '@lib/websocket';
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

  setProtocol(protocol: WebClientProtocol | null): void {
    this.protocol = protocol;
  }

  /**
   * Initialize the service with event listeners
   */
  initialize(): void {
    if (this.eventListeners.length > 0) return;
    this.setupEventListeners();
    logger.debug('Asset integration service initialized');
  }

  /**
   * Clean up event listeners
   */
  dispose(): void {
    this.eventListeners.forEach(cleanup => cleanup());
    this.eventListeners = [];
    this.protocol = null;
  }

  private setupEventListeners(): void {
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
    logger.debug('Asset upload completed', { assetId: data.asset_id, success: data.success });

    if (!data.asset_id) {
      logger.error('Cannot confirm asset upload without an asset ID');
      return;
    }

    if (!data.success) logger.error('Asset upload to R2 failed', data.error);

    // Release the server-side reservation on failure as well as finalizing success.
    if (this.protocol) {
      logger.debug('Confirming asset upload outcome to server', {
        assetId: data.asset_id,
        success: data.success,
      });
      this.protocol.sendMessage(createMessage(MessageType.ASSET_UPLOAD_CONFIRM, {
        asset_id: data.asset_id,
        success: data.success,
        file_size: data.file_size,
        content_type: data.content_type,
        error: data.error,
      }, 2));
    } else {
      logger.error('Protocol service not available for upload confirmation');
    }
  }

  /**
   * Request an asset upload to the server
   */
  requestAssetUpload(fileName: string, fileSize: number, fileType: string): void {
    // This would be called by the AssetManager component
    emitProtocolEvent('protocol-send-message', {
      type: MessageType.ASSET_UPLOAD_REQUEST,
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
      type: MessageType.ASSET_LIST_REQUEST,
      data: {}
    });
  }
}

export const assetIntegrationService = new AssetIntegrationService();
