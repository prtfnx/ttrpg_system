import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAssetManager } from '../hooks/useAssetManager';
import { createMessage, MessageType } from '../protocol/message';
import { useProtocol } from '../services/ProtocolContext';
import { useGameStore } from '../store';

interface DragDropImageHandlerProps {
  children: React.ReactNode;
  onSpriteCreated?: (spriteId: string) => void;
}

interface UploadState {
  status: 'idle' | 'requesting' | 'uploading' | 'creating' | 'completed' | 'failed';
  progress: number;
  message: string;
  fileName?: string;
}

export const DragDropImageHandler: React.FC<DragDropImageHandlerProps> = ({
  children,
  onSpriteCreated
}) => {
  const { protocol } = useProtocol();
  const { camera, sessionId } = useGameStore();
  const { calculateHash } = useAssetManager();
  
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    message: ''
  });
  
  const [dragOver, setDragOver] = useState(false);
  const uploadRequestsRef = useRef<Map<string, {
    file: File;
    dropPosition: { x: number; y: number };
    resolve: (spriteId: string | null) => void;
  }>>(new Map());

  // Handle asset upload response from server
  const handleAssetUploadResponse = useCallback((event: CustomEvent) => {
    const data = event.detail;
    console.log('🔄 DragDrop: Asset upload response received:', data);
    
    if (data.success && data.upload_url && data.asset_id) {
      // Look up request by asset_id
      const request = uploadRequestsRef.current.get(data.asset_id);
      
      if (request) {
        setUploadState({
          status: 'uploading',
          progress: 0,
          message: `Uploading ${request.file.name}...`,
          fileName: request.file.name
        });
        
        // Upload file to the presigned URL
        uploadFileToPresignedUrl(data.upload_url, request.file, request.dropPosition)
          .then(spriteId => {
            request.resolve(spriteId);
            uploadRequestsRef.current.delete(data.asset_id);
          })
          .catch(error => {
            console.error('Upload failed:', error);
            request.resolve(null);
            uploadRequestsRef.current.delete(data.asset_id);
          });
      } else {
        console.error('🚨 DragDrop: No matching upload request found for asset_id:', data.asset_id);
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
        fileName: uploadState.fileName
      });
      
      // Reject all pending requests
      uploadRequestsRef.current.forEach(request => request.resolve(null));
      uploadRequestsRef.current.clear();
    }
  }, [uploadState.fileName]);

  // Upload file to presigned URL and create sprite
  const uploadFileToPresignedUrl = async (
    uploadUrl: string,
    file: File,
    dropPosition: { x: number; y: number }
  ): Promise<string | null> => {
    try {
      // Calculate full hash for the required header
      const fileBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(fileBuffer);
      const fullHash = calculateHash(fileData);
      
      if (!fullHash) {
        throw new Error('Failed to calculate file hash for upload header');
      }
      
      // Upload file with progress tracking
      const xhr = new XMLHttpRequest();
      
      return new Promise((resolve, reject) => {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadState(prev => ({
              ...prev,
              progress,
              message: `Uploading ${file.name}... ${progress}%`
            }));
          }
        };

        xhr.onload = async () => {
          console.log('📤 Upload response status:', xhr.status);
          console.log('📤 Upload response headers:', xhr.getAllResponseHeaders());
          console.log('📤 Upload response text:', xhr.responseText);
          
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              // Upload successful, now create sprite
              setUploadState({
                status: 'creating',
                progress: 100,
                message: `Creating sprite from ${file.name}...`,
                fileName: file.name
              });

              const spriteId = await createSpriteFromAsset(dropPosition, file.name);
              
              if (spriteId) {
                setUploadState({
                  status: 'completed',
                  progress: 100,
                  message: `Sprite created successfully!`,
                  fileName: file.name
                });
                
                onSpriteCreated?.(spriteId);
                
                // Reset after delay
                setTimeout(() => {
                  setUploadState({
                    status: 'idle',
                    progress: 0,
                    message: ''
                  });
                }, 2000);
                
                resolve(spriteId);
              } else {
                throw new Error('Failed to create sprite');
              }
            } catch (error) {
              reject(error);
            }
          } else {
            console.error('❌ Upload failed with status:', xhr.status, xhr.statusText);
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => {
          console.error('❌ Upload network error');
          console.error('❌ Upload URL was:', uploadUrl);
          console.error('❌ File size:', file.size);
          console.error('❌ File type:', file.type);
          reject(new Error('Upload failed due to network error'));
        };
        
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.setRequestHeader('x-amz-meta-xxhash', fullHash);
        xhr.setRequestHeader('x-amz-meta-upload-timestamp', Math.floor(Date.now() / 1000).toString());
        
        console.log('📤 Starting upload to:', uploadUrl);
        console.log('📤 File details:', {
          name: file.name,
          size: file.size,
          type: file.type
        });
        console.log('📤 Headers:', {
          'Content-Type': file.type,
          'x-amz-meta-xxhash': fullHash,
          'x-amz-meta-upload-timestamp': Math.floor(Date.now() / 1000).toString()
        });
        
        xhr.send(file);
      });
      
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadState({
        status: 'failed',
        progress: 0,
        message: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fileName: file.name
      });
      return null;
    }
  };

  // Create sprite from uploaded asset
  const createSpriteFromAsset = async (
    dropPosition: { x: number; y: number },
    fileName: string
  ): Promise<string | null> => {
    try {
      // Convert screen coordinates to world coordinates
      const worldX = (dropPosition.x - camera.x) / camera.zoom;
      const worldY = (dropPosition.y - camera.y) / camera.zoom;

      const spriteId = `sprite_${Date.now()}`;
      const spriteData = {
        id: spriteId,
        name: fileName.replace(/\.[^/.]+$/, ''), // Remove extension
        texture_path: fileName, // Use original filename for now
        x: worldX,
        y: worldY,
        width: 64,
        height: 64,
        scale_x: 1.0,
        scale_y: 1.0,
        rotation: 0,
        layer: 'tokens',
        color: '#FFFFFF',
        visible: true
      };

      console.log('🎭 DragDrop: Creating sprite from asset:', spriteData);

      // Send sprite creation to server via protocol
      if (protocol) {
        protocol.sendMessage(createMessage(MessageType.SPRITE_CREATE, { sprite_data: spriteData }, 2));
        console.log('📡 DragDrop: Sent sprite_create to server via protocol');
      }

      // Also create locally via gameAPI for immediate visual feedback
      if (window.gameAPI && window.gameAPI.sendMessage) {
        window.gameAPI.sendMessage('sprite_create', spriteData);
        console.log('🎮 DragDrop: Sent sprite_create to local renderer');
        
        // Trigger sprite sync event
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('spriteAdded'));
        }, 500);
      } else {
        console.warn('🚨 DragDrop: window.gameAPI.sendMessage not available');
      }
      
      return spriteId;
    } catch (error) {
      console.error('Error creating sprite:', error);
      return null;
    }
  };

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if dragged items contain files
    const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
    if (hasFiles) {
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
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      console.log('No image files in drop');
      return;
    }

    if (!protocol) {
      console.error('Protocol not available for upload');
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
    console.log(`🎯 DragDrop: Processing dropped image: ${file.name} at position:`, dropPosition);

    try {
      setUploadState({
        status: 'requesting',
        progress: 0,
        message: `Requesting upload for ${file.name}...`,
        fileName: file.name
      });

      // Calculate file hash for server verification using AssetManager
      const fileBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(fileBuffer);
      const hashHex = calculateHash(fileData);
      
      if (!hashHex) {
        throw new Error('Failed to calculate file hash');
      }

      // Create upload request promise
      const uploadPromise = new Promise<string | null>((resolve) => {
        // Use hashHex (asset_id) as the key for easier lookup in response handler
        uploadRequestsRef.current.set(hashHex, {
          file,
          dropPosition,
          resolve
        });

        // Request presigned upload URL from server
        protocol.sendMessage(createMessage(MessageType.ASSET_UPLOAD_REQUEST, {
          filename: file.name,
          file_size: file.size,
          content_type: file.type,
          xxhash: hashHex,
          asset_id: hashHex, // asset_id is identical to xxhash
          session_code: sessionId || ''
        }, 2));
      });

      const spriteId = await uploadPromise;
      
      if (!spriteId) {
        throw new Error('Upload cancelled or failed');
      }

    } catch (error) {
      console.error('Error handling drop:', error);
      setUploadState({
        status: 'failed',
        progress: 0,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fileName: file.name
      });
    }
  }, [protocol, camera, onSpriteCreated]);

  // Listen for asset upload responses
  useEffect(() => {
    window.addEventListener('asset-uploaded', handleAssetUploadResponse as EventListener);
    
    return () => {
      window.removeEventListener('asset-uploaded', handleAssetUploadResponse as EventListener);
    };
  }, [handleAssetUploadResponse]);

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
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
      }}
    >
      {children}
      
      {/* Drag overlay */}
      {dragOver && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '2px dashed #3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              padding: '20px',
              borderRadius: '8px',
              textAlign: 'center',
              fontSize: '18px',
              fontWeight: 'bold',
            }}
          >
            🎯 Drop image here to create sprite
          </div>
        </div>
      )}
      
      {/* Upload status overlay */}
      {uploadState.status !== 'idle' && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '8px',
            zIndex: 1001,
            minWidth: '200px',
          }}
        >
          <div style={{ marginBottom: '8px', fontSize: '14px' }}>
            {uploadState.message}
          </div>
          {uploadState.status === 'uploading' && (
            <div
              style={{
                width: '100%',
                height: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${uploadState.progress}%`,
                  height: '100%',
                  backgroundColor: '#3b82f6',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          )}
          {uploadState.status === 'completed' && (
            <div style={{ color: '#10b981', fontSize: '12px' }}>
              ✅ Success!
            </div>
          )}
          {uploadState.status === 'failed' && (
            <div style={{ color: '#f87171', fontSize: '12px' }}>
              ❌ Failed
            </div>
          )}
        </div>
      )}
    </div>
  );
};
