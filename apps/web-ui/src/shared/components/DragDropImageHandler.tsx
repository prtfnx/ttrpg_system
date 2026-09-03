import { useGameStore } from '@/store';
import { assetIntegrationService, useAssetManager } from '@features/assets';
import { spriteCreationService } from '@features/canvas/services/spriteCreation.service';
import { useProtocol } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import { logger } from '@shared/utils/logger';
import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { isSupportedAssetImage } from './assetImageValidation';
import styles from './DragDropImageHandler.module.css';
import { putFileToPresignedUrl } from './r2Upload';

interface DragDropImageHandlerProps {
  children: React.ReactNode;
}

interface UploadState {
  status: 'idle' | 'requesting' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  fileName?: string;
}

interface PendingUpload {
  file: File;
  dropPosition: { x: number; y: number };
  assetId: string;
  fileName: string;
}

export const DragDropImageHandler: React.FC<DragDropImageHandlerProps> = ({
  children
}) => {
  const _protocolCtx = useProtocol();
  const protocol = _protocolCtx?.protocol ?? null;
  const { camera, sessionId } = useGameStore();
  const { calculateHash } = useAssetManager();
  
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    message: ''
  });
  
  const [dragOver, setDragOver] = useState(false);
  const pendingUploadsRef = useRef<Map<string, PendingUpload>>(new Map());
  const activeUploadControllersRef = useRef<Set<AbortController>>(new Set());
  const resetTimersRef = useRef<Set<number>>(new Set());
  const mountedRef = useRef(true);

  const scheduleUploadReset = useCallback((delay: number) => {
    const timer = window.setTimeout(() => {
      resetTimersRef.current.delete(timer);
      if (!mountedRef.current) return;
      setUploadState({ status: 'idle', progress: 0, message: '' });
    }, delay);
    resetTimersRef.current.add(timer);
  }, []);

  // Handle asset upload response from server
  const handleAssetUploadResponse = useCallback((event: CustomEvent) => {
    const data = event.detail;
    logger.debug('Asset upload response received', data);
    
    if (data.success && data.asset_id) {
      // Look up pending upload by asset_id
      const pendingUpload = pendingUploadsRef.current.get(data.asset_id);
      
      if (pendingUpload) {
        if (data.upload_url) {
          // Case 1: New asset - need to upload to R2
          setUploadState({
            status: 'uploading',
            progress: 0,
            message: `Uploading ${pendingUpload.fileName}...`,
            fileName: pendingUpload.fileName
          });
          
          // Upload file to R2 and let server handle sprite creation
          uploadFileToR2(data.upload_url, pendingUpload)
            .then(() => {
              // Upload successful - server will create and broadcast sprite
              setUploadState({
                status: 'processing',
                progress: 100,
                message: `Processing ${pendingUpload.fileName}...`,
                fileName: pendingUpload.fileName
              });
              
              // Clean up pending upload
              pendingUploadsRef.current.delete(data.asset_id);
              
              // Server will broadcast sprite creation, so we wait for that
              // Reset UI after a delay
              scheduleUploadReset(3000);
            })
            .catch(error => {
              if (!mountedRef.current || (error instanceof DOMException && error.name === 'AbortError')) return;
              logger.error('Drag-drop upload failed', error);
              setUploadState({
                status: 'failed',
                progress: 0,
                message: `Upload failed: ${error.message}`,
                fileName: pendingUpload.fileName
              });
              pendingUploadsRef.current.delete(data.asset_id);
            });
        } else {
          // Case 2: Asset already exists - directly create sprite
          logger.debug('Asset already exists, creating sprite directly', { assetId: data.asset_id });
          
          setUploadState({
            status: 'processing',
            progress: 100,
            message: `Creating sprite from existing asset: ${pendingUpload.fileName}...`,
            fileName: pendingUpload.fileName
          });

          // No upload occurred, so don't dispatch upload completion event
          
          // Create sprite directly since asset already exists
          if (protocol) {
            const worldX = (pendingUpload.dropPosition.x - camera.x) / camera.zoom;
            const worldY = (pendingUpload.dropPosition.y - camera.y) / camera.zoom;
            
            spriteCreationService.createSprite({
              assetId: data.asset_id,
              fileName: pendingUpload.fileName,
              worldX: worldX,
              worldY: worldY,
              sessionId: sessionId || ''
            });
          }
          
          // Clean up pending upload
          pendingUploadsRef.current.delete(data.asset_id);
          
          // Reset UI after a delay
          scheduleUploadReset(2000);
        }
      } else {
        logger.error('No matching drag-drop upload request found', { assetId: data.asset_id });
        setUploadState({
          status: 'failed',
          progress: 0,
          message: 'Upload request not found',
          fileName: ''
        });
      }
    } else {
      setUploadState({
        status: 'failed',
        progress: 0,
        message: `Upload failed: ${data.error || 'Unknown error'}`,
        fileName: uploadState.fileName || ''
      });
      
      // Clear all pending uploads on error
      pendingUploadsRef.current.clear();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- known: camera props captured at call time
  }, [scheduleUploadReset, uploadState.fileName]);

  // Upload file to R2 (server-first approach - no local sprite creation)
  const uploadFileToR2 = async (
    uploadUrl: string,
    pendingUpload: PendingUpload
  ): Promise<void> => {
    const { file, assetId } = pendingUpload;
    
    // Calculate file hash for required header
    const fileBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(fileBuffer);
    const fullHash = calculateHash(fileData);
    
    if (!fullHash) {
      throw new Error('Failed to calculate file hash for upload header');
    }

    const reportFailure = (error: string) => {
      window.dispatchEvent(new CustomEvent('asset-upload-completed', {
        detail: {
          asset_id: assetId,
          success: false,
          file_size: file.size,
          content_type: file.type,
          error,
        },
      }));
    };
    
    const controller = new AbortController();
    activeUploadControllersRef.current.add(controller);
    try {
      await putFileToPresignedUrl({
        uploadUrl,
        file,
        fullHash,
        signal: controller.signal,
        onProgress: progress => {
          if (!mountedRef.current) return;
          setUploadState(prev => ({
            ...prev,
            progress,
            message: `Uploading ${file.name}... ${progress}%`,
          }));
        },
      });
      logger.info('File uploaded successfully to R2', { assetId, fileName: file.name });
      window.dispatchEvent(new CustomEvent('asset-upload-completed', {
        detail: {
          asset_id: assetId,
          success: true,
          file_size: file.size,
          content_type: file.type,
        },
      }));

      if (protocol) {
        const worldX = (pendingUpload.dropPosition.x - camera.x) / camera.zoom;
        const worldY = (pendingUpload.dropPosition.y - camera.y) / camera.zoom;
        await spriteCreationService.createSprite({
          assetId,
          fileName: pendingUpload.fileName,
          worldX,
          worldY,
          sessionId: sessionId || 'default',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      reportFailure(message);
      throw error;
    } finally {
      activeUploadControllersRef.current.delete(controller);
    }
  };

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const types = Array.from(e.dataTransfer.types);
    if (types.includes('Files') || types.includes('application/json')) {
      setDragOver(true);
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only set dragOver to false if we're leaving the container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(isSupportedAssetImage);
    
    if (imageFiles.length === 0) {
      // Handle compendium entry drops
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const entry = JSON.parse(jsonData);
          const rect = e.currentTarget.getBoundingClientRect();
          window.dispatchEvent(new CustomEvent('compendium-drop', {
            detail: { ...entry, dropX: e.clientX - rect.left, dropY: e.clientY - rect.top }
          }));
        } catch {}
      } else if (files.length > 0) {
        setUploadState({
          status: 'failed',
          progress: 0,
          message: 'Only PNG, JPEG, GIF, BMP, and WebP images are supported',
          fileName: files[0].name,
        });
      }
      return;
    }

    if (!protocol) {
      logger.error('Protocol not available for drag-drop upload');
      return;
    }

    // Get drop position relative to the container
    const rect = e.currentTarget.getBoundingClientRect();
    const dropPosition = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    // Process first image file
    const file = imageFiles[0];
    logger.debug('Processing dropped image', { fileName: file.name, dropPosition });

    try {
      setUploadState({
        status: 'requesting',
        progress: 0,
        message: `Requesting upload for ${file.name}...`,
        fileName: file.name
      });

      // Calculate file hash for server verification
      const fileBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(fileBuffer);
      const assetId = calculateHash(fileData);
      
      if (!assetId) {
        throw new Error('Failed to calculate file hash');
      }

      // Store pending upload for later processing
      const pendingUpload: PendingUpload = {
        file,
        dropPosition,
        assetId,
        fileName: file.name
      };
      
      pendingUploadsRef.current.set(assetId, pendingUpload);

      // ── Local optimistic texture load ────────────────────────────────────
      // We already have the image bytes locally, so tell WASM to load the
      // texture right now instead of waiting for the server download round-trip.
      // The object URL is revoked automatically after the image loads.
      const localObjectUrl = URL.createObjectURL(file);
      window.dispatchEvent(new CustomEvent('local-texture-ready', {
        detail: { asset_id: assetId, url: localObjectUrl }
      }));
      // ────────────────────────────────────────────────────────────────────

      // Request presigned upload URL from server
      protocol.sendMessage(createMessage(MessageType.ASSET_UPLOAD_REQUEST, {
        filename: file.name,
        file_size: file.size,
        content_type: file.type,
        xxhash: assetId,
        asset_id: assetId
      }, 2));
      
      // Notify WasmIntegration service that this asset upload is starting
      window.dispatchEvent(new CustomEvent('asset-upload-started', {
        detail: { asset_id: assetId }
      }));
      
      logger.debug('Requested upload URL for drag-drop asset', { assetId });

    } catch (error) {
      logger.error('Error handling drag-drop image upload', error);
      setUploadState({
        status: 'failed',
        progress: 0,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fileName: file.name
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- known: camera in deps covers .x/.y/.zoom
  }, [protocol, camera, sessionId, calculateHash]);

  // Listen for asset upload responses and sprite creation broadcasts
  useEffect(() => {
    // Initialize sprite creation service with protocol
    assetIntegrationService.setProtocol(protocol);
    if (protocol) {
      spriteCreationService.setProtocol(protocol);
    }
    
    window.addEventListener('asset-uploaded', handleAssetUploadResponse as EventListener);
    
    return () => {
      window.removeEventListener('asset-uploaded', handleAssetUploadResponse as EventListener);
      assetIntegrationService.setProtocol(null);
    };
  }, [handleAssetUploadResponse, protocol]);

  useEffect(() => {
    const activeControllers = activeUploadControllersRef.current;
    const pendingUploads = pendingUploadsRef.current;
    const resetTimers = resetTimersRef.current;
    return () => {
      activeControllers.forEach(controller => controller.abort());
      activeControllers.clear();
      pendingUploads.clear();
      resetTimers.forEach(timer => window.clearTimeout(timer));
      resetTimers.clear();
    };
  }, [sessionId]);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  // Prevent default browser drag-and-drop behavior
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
    };

    const preventDefaults = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Prevent default drag behaviors on document
    document.addEventListener('dragenter', preventDefaults, false);
    document.addEventListener('dragover', preventDefaults, false);
    document.addEventListener('dragleave', preventDefault, false);
    document.addEventListener('drop', preventDefaults, false);

    return () => {
      document.removeEventListener('dragenter', preventDefaults, false);
      document.removeEventListener('dragover', preventDefaults, false);
      document.removeEventListener('dragleave', preventDefault, false);
      document.removeEventListener('drop', preventDefaults, false);
    };
  }, []);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={styles.container}
    >
      {children}
      
      {/* Drag overlay */}
      {dragOver && (
        <div className={styles.dragOverlay}>
          <div className={styles.dropPrompt}>
            Drop image here to create sprite
          </div>
        </div>
      )}
      
      {/* Upload status overlay */}
      {uploadState.status !== 'idle' && (
        <div className={styles.uploadStatus}>
          <div className={styles.uploadMessage}>
            {uploadState.message}
          </div>
          {uploadState.status === 'uploading' && (
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ '--upload-progress': `${uploadState.progress}%` } as CSSProperties}
              />
            </div>
          )}
          {uploadState.status === 'completed' && (
            <div className={`${styles.result} ${styles.success}`}>
              Success!
            </div>
          )}
          {uploadState.status === 'failed' && (
            <div className={`${styles.result} ${styles.error}`}>
              Failed
            </div>
          )}
        </div>
      )}
    </div>
  );
};
