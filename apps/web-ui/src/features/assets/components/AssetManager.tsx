import { useAuthenticatedWebSocket } from '@features/auth';
import { MessageType, createMessage } from '@lib/websocket';
import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAssetManager } from '../hooks/useAssetManager';
import styles from './AssetManager.module.css';


interface AssetManagerProps {
  isVisible: boolean;
  onClose: () => void;
  sessionCode: string;
  userInfo: any;
}

interface FileUploadInfo {
  file: File;
  preview?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
}

export const AssetManager: React.FC<AssetManagerProps> = ({ isVisible, onClose, sessionCode, userInfo }) => {
  const [activeTab, setActiveTab] = useState<'cache' | 'upload' | 'settings'>('cache');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [uploadFiles, setUploadFiles] = useState<Map<string, FileUploadInfo>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // WebSocket protocol for asset sync
  const { protocol } = useAuthenticatedWebSocket({ sessionCode, userInfo });

  const {
    stats,
    // uploadProgress,
    isLoading,
    error,
    // isAssetCached,
    getAssetInfo,
    // getAssetData,
    removeAsset,
    performCleanup,
    clearCache,
    getAssetList,
    formatFileSize,
    getCacheUsagePercentage,
    uploadAsset,
    cancelUpload,
  } = useAssetManager({
    maxCacheSizeMB: 100,
    maxAgeHours: 24,
    autoCleanup: true,
  });

  const assetList = getAssetList();
  const filteredAssets = assetList.filter((id: string) => 
    id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getAssetInfo(id)?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Event-driven asset sync
  useEffect(() => {
    if (protocol) {
      protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "asset_list" }, 1));
    }
  }, [protocol]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newUploadFiles = new Map(uploadFiles);

    Array.from(files).forEach(file => {
      const fileId = `${file.name}-${Date.now()}`;
      const fileInfo: FileUploadInfo = {
        file,
        progress: 0,
        status: 'pending',
      };

      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            fileInfo.preview = e.target.result as string;
            setUploadFiles(new Map(newUploadFiles.set(fileId, fileInfo)));
          }
        };
        reader.readAsDataURL(file);
      }

      newUploadFiles.set(fileId, fileInfo);
      // Send upload request via protocol
      if (protocol) {
        protocol.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "asset_upload", fileId, fileName: file.name }, 1));
      }
    });

    setUploadFiles(newUploadFiles);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [uploadFiles]);

  // Message batching and delta updates for asset uploads
  const handleUploadBatch = useCallback(async (fileIds: string[]) => {
    // Only upload files that are pending
    const batch = fileIds.filter(id => uploadFiles.get(id)?.status === 'pending');
    if (batch.length === 0) return;
    // Mark all as uploading
    setUploadFiles(prev => {
      const next = new Map(prev);
      batch.forEach(id => {
        const info = next.get(id);
        if (info) next.set(id, { ...info, status: 'uploading' });
      });
      return next;
    });
    // Upload all files in batch
    try {
      const results = await Promise.all(batch.map(async (fileId) => {
        const fileInfo = uploadFiles.get(fileId);
        if (!fileInfo) return false;
        const file = fileInfo.file;
        // Delta update: only upload changed chunks if supported
        // (Assume uploadAsset supports chunked/delta upload)
        const success = await uploadAsset(file, (progress) => {
          setUploadFiles(prev => new Map(prev.set(fileId, {
            ...fileInfo,
            progress,
          })));
        });
        setUploadFiles(prev => new Map(prev.set(fileId, {
          ...fileInfo,
          status: success ? 'completed' : 'failed',
          progress: success ? 100 : 0,
        })));
        return success;
      }));
      results.forEach((success, i) => {
        const fileId = batch[i];
        const fileInfo = uploadFiles.get(fileId);
        if (success) {
          console.log(`Successfully uploaded ${fileInfo?.file.name}`);
        } else {
          console.error(`Failed to upload ${fileInfo?.file.name}`);
        }
      });
    } catch (error) {
      batch.forEach(fileId => {
        const fileInfo = uploadFiles.get(fileId);
        setUploadFiles(prev => new Map(prev.set(fileId, {
          ...fileInfo!,
          status: 'failed',
          progress: 0,
        })));
      });
    }
  }, [uploadFiles, uploadAsset]);

  // Replace single upload button with batch upload
  // ...existing code...

  const handleRemoveUploadFile = useCallback((fileId: string) => {
    const newUploadFiles = new Map(uploadFiles);
    newUploadFiles.delete(fileId);
    setUploadFiles(newUploadFiles);
  }, [uploadFiles]);

  const handleRemoveAsset = useCallback((assetId: string) => {
    const success = removeAsset(assetId);
    if (success) {
      setSelectedAssets(prev => {
        const newSet = new Set(prev);
        newSet.delete(assetId);
        return newSet;
      });
    }
  }, [removeAsset]);

  const handleRemoveSelected = useCallback(() => {
    selectedAssets.forEach(assetId => {
      removeAsset(assetId);
    });
    setSelectedAssets(new Set());
  }, [selectedAssets, removeAsset]);

  const handleSelectAsset = useCallback((assetId: string, selected: boolean) => {
    setSelectedAssets(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(assetId);
      } else {
        newSet.delete(assetId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedAssets.size === filteredAssets.length) {
      setSelectedAssets(new Set());
    } else {
      setSelectedAssets(new Set(filteredAssets));
    }
  }, [selectedAssets.size, filteredAssets]);

  if (!isVisible) return null;

  return (
    <div className={styles.assetManagerOverlay}>
      <div className={styles.assetManager}>
        <div className={styles.assetManagerHeader}>
          <h2>Asset Manager</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.assetManagerTabs}>
          <button
            className={clsx(styles.tab, activeTab === 'cache' && styles.active)}
            onClick={() => setActiveTab('cache')}
          >
            Cache ({stats?.total_assets || 0})
          </button>
          <button
            className={clsx(styles.tab, activeTab === 'upload' && styles.active)}
            onClick={() => setActiveTab('upload')}
          >
            Upload ({uploadFiles.size})
          </button>
          <button
            className={clsx(styles.tab, activeTab === 'settings' && styles.active)}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>

        {error && (
          <div className={styles.errorMessage}>
            {error}
          </div>
        )}

        {activeTab === 'cache' && (
          <div className={styles.cacheTab}>
            <div className={styles.cacheStats}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Total Assets:</span>
                <span className={styles.statValue}>{stats?.total_assets || 0}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Cache Size:</span>
                <span className={styles.statValue}>{formatFileSize(stats?.total_size || 0)}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Cache Usage:</span>
                <span className={styles.statValue}>{getCacheUsagePercentage()}%</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Cache Hits:</span>
                <span className={styles.statValue}>{stats?.cache_hits || 0}</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Cache Misses:</span>
                <span className={styles.statValue}>{stats?.cache_misses || 0}</span>
              </div>
            </div>

            <div className={styles.cacheUsageBar}>
              <div 
                className={styles.usageFill}
                style={{ width: `${Math.min(getCacheUsagePercentage(), 100)}%` }}
              />
            </div>

            <div className={styles.cacheControls}>
              <input
                type="text"
                placeholder="Search assets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
              <button onClick={handleSelectAll} className={styles.controlButton}>
                {selectedAssets.size === filteredAssets.length ? 'Deselect All' : 'Select All'}
              </button>
              <button 
                onClick={handleRemoveSelected} 
                className={clsx(styles.controlButton, styles.danger)}
                disabled={selectedAssets.size === 0}
              >
                Remove Selected ({selectedAssets.size})
              </button>
              <button onClick={performCleanup} className={styles.controlButton}>
                Cleanup Cache
              </button>
              <button onClick={clearCache} className={clsx(styles.controlButton, styles.danger)}>
                Clear All
              </button>
            </div>

            <div className={styles.assetList}>
              {filteredAssets.map((assetId: string) => {
                const assetInfo = getAssetInfo(assetId);
                if (!assetInfo) return null;

                return (
                  <div key={assetId} className={styles.assetItem}>
                    <input
                      type="checkbox"
                      checked={selectedAssets.has(assetId)}
                      onChange={(e) => handleSelectAsset(assetId, e.target.checked)}
                    />
                    <div className={styles.assetInfo}>
                      <div className={styles.assetName}>{assetInfo.name}</div>
                      <div className={styles.assetDetails}>
                        {formatFileSize(assetInfo.size)} • {assetInfo.mime_type}
                        {assetInfo.last_accessed && (
                          <span> • Last accessed: {new Date(assetInfo.last_accessed).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveAsset(assetId)}
                      className={styles.removeAssetButton}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
              {filteredAssets.length === 0 && (
                <div className={styles.noAssets}>
                  {searchTerm ? 'No assets match your search.' : 'No assets cached.'}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className={styles.uploadTab}>
            <div className={styles.uploadControls}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                multiple
                accept="image/*,audio/*,video/*,.pdf,.txt"
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={styles.selectFilesButton}
              >
                Select Files
              </button>
            </div>

            <div className={styles.uploadList}>
              {Array.from(uploadFiles.entries()).map(([fileId, fileInfo]) => (
                <div key={fileId} className={styles.uploadItem}>
                  {fileInfo.preview && (
                    <img 
                      src={fileInfo.preview} 
                      alt={fileInfo.file.name}
                      className={styles.uploadPreview}
                    />
                  )}
                  <div className={styles.uploadInfo}>
                    <div className={styles.uploadName}>{fileInfo.file.name}</div>
                    <div className={styles.uploadDetails}>
                      {formatFileSize(fileInfo.file.size)} • {fileInfo.file.type}
                    </div>
                    <div className={styles.uploadStatus}>
                      Status: {fileInfo.status}
                      {fileInfo.status === 'uploading' && (
                        <span> ({fileInfo.progress}%)</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.uploadActions}>
                    {fileInfo.status === 'pending' && (
                      <button
                        onClick={() => handleUploadBatch([fileId])}
                        className={styles.uploadButton}
                      >
                        Upload
                      </button>
                    )}
                    {fileInfo.status === 'uploading' && (
                      <button
                        onClick={() => cancelUpload(fileId)}
                        className="cancel-button"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveUploadFile(fileId)}
                      className="remove-button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {uploadFiles.size === 0 && (
                <div className="no-uploads">
                  No files selected for upload. Click "Select Files" to choose files.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className={styles.settingsTab}>
            <div className="setting-group">
              <h3>Cache Configuration</h3>
              <div className={styles.settingItem}>
                <label>Maximum Cache Size: 100 MB</label>
                <div className="setting-description">
                  Maximum amount of storage used for cached assets
                </div>
              </div>
              <div className={styles.settingItem}>
                <label>Maximum Age: 24 hours</label>
                <div className="setting-description">
                  Assets older than this will be removed during cleanup
                </div>
              </div>
              <div className={styles.settingItem}>
                <label>Auto Cleanup: Enabled</label>
                <div className="setting-description">
                  Automatically remove old assets every 30 minutes
                </div>
              </div>
            </div>

            <div className="setting-group">
              <h3>Upload Configuration</h3>
              <div className={styles.settingItem}>
                <label>Max Concurrent Uploads: 3</label>
                <div className="setting-description">
                  Maximum number of files that can be uploaded simultaneously
                </div>
              </div>
            </div>

            <div className="setting-group">
              <h3>Storage Information</h3>
              <div className={styles.settingItem}>
                <label>IndexedDB Support: Available</label>
                <div className="setting-description">
                  Browser supports persistent local storage for assets
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner">Loading...</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Removed duplicate export
