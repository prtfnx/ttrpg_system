import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { useAssetManager } from '../hooks/useAssetManager';
import { createMessage, MessageType } from '../protocol/message';
import { assetIntegrationService } from '../services/assetIntegration.service';
import type { ExtendedMonster } from '../services/npcCharacter.service';
import { NPCCharacterService } from '../services/npcCharacter.service';
import { useProtocol } from '../services/ProtocolContext';
import { spriteCreationService } from '../services/spriteCreation.service';
import { useGameStore } from '../store';

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
  const { camera, sessionId, addCharacter, addSprite } = useGameStore();
  const { calculateHash } = useAssetManager();
  const { user } = useAuth();
  
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    message: ''
  });
  
  const [dragOver, setDragOver] = useState(false);
  const pendingUploadsRef = useRef<Map<string, PendingUpload>>(new Map());

  // Handle asset upload response from server
  const handleAssetUploadResponse = useCallback((event: CustomEvent) => {
    const data = event.detail;
    console.log('🔄 DragDrop: Asset upload response received:', data);
    
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
              setTimeout(() => {
                setUploadState({
                  status: 'idle',
                  progress: 0,
                  message: ''
                });
              }, 3000);
            })
            .catch(error => {
              console.error('Upload failed:', error);
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
          console.log('📦 DragDrop: Asset already exists, creating sprite directly');
          
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
          setTimeout(() => {
            setUploadState({
              status: 'idle',
              progress: 0,
              message: ''
            });
          }, 2000);
        }
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
        fileName: uploadState.fileName || ''
      });
      
      // Clear all pending uploads on error
      pendingUploadsRef.current.clear();
    }
  }, [uploadState.fileName]);

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
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
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

      xhr.onload = () => {
        console.log('📤 Upload response status:', xhr.status);
        console.log('📤 Upload response headers:', xhr.getAllResponseHeaders());
        
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('✅ File uploaded successfully to R2');        
         
          // Dispatch upload completion event for AssetIntegrationService to handle
          window.dispatchEvent(new CustomEvent('asset-upload-completed', {
            detail: {
              asset_id: assetId,
              success: true,
              file_size: file.size,
              content_type: file.type
            }
          }));
          
          // Send sprite creation request to server with asset reference
          if (protocol) {
            const worldX = (pendingUpload.dropPosition.x - camera.x) / camera.zoom;
            const worldY = (pendingUpload.dropPosition.y - camera.y) / camera.zoom;
            
            spriteCreationService.createSprite({
              assetId: assetId,
              fileName: pendingUpload.fileName,
              worldX: worldX,
              worldY: worldY,
              sessionId: sessionId || 'default'
            }).catch(error => {
              console.error('❌ DragDrop: Failed to create sprite:', error);
            });
          }
          
          resolve();
        } else {
          console.error('❌ Upload failed with status:', xhr.status, xhr.statusText);
          reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        console.error('❌ Upload network error');
        reject(new Error('Upload failed due to network error'));
      };
      
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.setRequestHeader('x-amz-meta-xxhash', fullHash);
      xhr.setRequestHeader('x-amz-meta-upload-timestamp', Math.floor(Date.now() / 1000).toString());
      
      console.log('📤 Starting upload to R2:', {
        file: file.name,
        size: file.size,
        type: file.type,
        assetId: assetId
      });
      
      xhr.send(file);
    });
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

    // Get drop position relative to the container
    const rect = e.currentTarget.getBoundingClientRect();
    const dropX = e.clientX - rect.left;
    const dropY = e.clientY - rect.top;
    
    // Convert screen coordinates to world coordinates accounting for camera
    const worldX = (dropX / camera.zoom) + camera.x;
    const worldY = (dropY / camera.zoom) + camera.y;

    console.log('🎯 Drop at screen:', { dropX, dropY }, 'world:', { worldX, worldY });

    // Check for compendium monster drop
    const compendiumData = e.dataTransfer.getData('compendium/monster');
    if (compendiumData) {
      console.log('📚 Compendium monster drop detected');
      try {
        const { monster, name } = JSON.parse(compendiumData);
        
        if (!user) {
          console.error('Cannot create NPC: No authenticated user');
          return;
        }
        
        // Create NPC character
        const npcCharacter = NPCCharacterService.createNPCFromMonster(
          monster as ExtendedMonster,
          {
            userId: user.id,
            sessionId: sessionId || 'default-session',
            position: { x: worldX, y: worldY }
          }
        );
        
        // Add character to store
        addCharacter(npcCharacter);
        
        // Sync character to server
        if (protocol) {
          try {
            protocol.saveCharacter(npcCharacter as any, user.id);
            console.log('📡 Synced NPC character to server:', npcCharacter.id);
          } catch (error) {
            console.error('Failed to sync character to server:', error);
          }
        }
        
        // SSoT: Ensure table is loaded with auto-recovery
        let tableId: string;
        try {
          tableId = await useGameStore.getState().ensureTableLoaded();
          console.log(`✅ Table ready: '${tableId}'`);
        } catch (error) {
          console.error('❌ Cannot create sprite:', error);
          return;
        }
        
        // Create sprite/token for the NPC
        const spriteId = `sprite-${npcCharacter.id}`;
        const sprite = {
          id: spriteId,
          name: name,
          tableId: tableId,
          x: worldX,
          y: worldY,
          characterId: npcCharacter.id,
          // Use simple data URL for default NPC token (gray circle)
          texture: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjAiIGZpbGw9IiM2NjY2NjYiIHN0cm9rZT0iIzMzMzMzMyIgc3Ryb2tlLXdpZHRoPSIyIi8+PHRleHQgeD0iMjUiIHk9IjMwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjAiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4/PC90ZXh0Pjwvc3ZnPg==',
          scale: { x: 1, y: 1 },
          rotation: 0,
          layer: 'tokens',
          hp: monster.hp || 1,
          maxHp: monster.hp || 1,
          ac: monster.ac || 10,
          controlledBy: [String(user.id)],
          auraRadius: 0
        };  
        
        addSprite(sprite);
        
        // Sync sprite to server via protocol
        // tableId already declared above, using activeTableId (actual table UUID) instead of sessionId (session code)
        if (protocol && tableId) {
          try {
            protocol.sendMessage(createMessage(MessageType.SPRITE_CREATE, {
              table_id: tableId,
              character_id: npcCharacter.id,
              sprite_data: {
                id: spriteId,
                name: name,
                table_id: tableId,
                x: worldX,
                y: worldY,
                character_id: npcCharacter.id,
                texture: sprite.texture,
                scale_x: sprite.scale.x,
                scale_y: sprite.scale.y,
                rotation: sprite.rotation,
                layer: sprite.layer,
                hp: sprite.hp,
                max_hp: sprite.maxHp,
                ac: sprite.ac,
                controlled_by: sprite.controlledBy,
                aura_radius: sprite.auraRadius
              }
            }));
            console.log('📡 Synced sprite to server:', spriteId);
          } catch (error) {
            console.error('Failed to sync sprite to server:', error);
          }
        }
        
        console.log('✅ Created NPC character and token:', { character: npcCharacter, sprite });
        
        // Show success notification
        setUploadState({
          status: 'completed',
          progress: 100,
          message: `Created NPC: ${name}`,
          fileName: name
        });
        
        setTimeout(() => {
          setUploadState({ status: 'idle', progress: 0, message: '' });
        }, 3000);
        
        return;
      } catch (error) {
        console.error('Failed to create NPC from compendium monster:', error);
        setUploadState({
          status: 'failed',
          progress: 0,
          message: 'Failed to create NPC character'
        });
        return;
      }
    }

    // Handle image file drops
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

    const dropPosition = { x: worldX, y: worldY };

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

      // Request presigned upload URL from server
      protocol.sendMessage(createMessage(MessageType.ASSET_UPLOAD_REQUEST, {
        filename: file.name,
        file_size: file.size,
        content_type: file.type,
        xxhash: assetId,
        asset_id: assetId,
        session_code: sessionId || ''
      }, 2));
      
      // Notify WasmIntegration service that this asset upload is starting
      window.dispatchEvent(new CustomEvent('asset-upload-started', {
        detail: { asset_id: assetId }
      }));
      
      console.log('📡 DragDrop: Requested upload URL for asset:', assetId);

    } catch (error) {
      console.error('Error handling drop:', error);
      setUploadState({
        status: 'failed',
        progress: 0,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fileName: file.name
      });
    }
  }, [protocol, camera, sessionId, calculateHash, user, addCharacter, addSprite]);

  // Listen for asset upload responses and sprite creation broadcasts
  useEffect(() => {
    // Initialize sprite creation service with protocol
    if (protocol) {
      spriteCreationService.setProtocol(protocol);
      assetIntegrationService.setProtocol(protocol);
    }
    
    window.addEventListener('asset-uploaded', handleAssetUploadResponse as EventListener);
    
    return () => {
      window.removeEventListener('asset-uploaded', handleAssetUploadResponse as EventListener);
    };
  }, [handleAssetUploadResponse, protocol]);

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
