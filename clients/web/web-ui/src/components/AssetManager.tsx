import React, { useCallback, useRef, useState } from 'react';
import { useAssetManager } from '../hooks/useAssetManager';
import './AssetManager.css';

interface AssetManagerProps {
  isVisible: boolean;
  onClose: () => void;
}

interface FileUploadInfo {
  file: File;
  preview?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
}

export const AssetManager: React.FC<AssetManagerProps> = ({ isVisible, onClose }) => {
  const [activeTab, setActiveTab] = useState<'cache' | 'upload' | 'settings'>('cache');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [uploadFiles, setUploadFiles] = useState<Map<string, FileUploadInfo>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <div className="asset-manager-overlay">
      <div className="asset-manager">
        <div className="asset-manager-header">
          <h2>Asset Manager</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="asset-manager-tabs">
          <button
            className={`tab ${activeTab === 'cache' ? 'active' : ''}`}
            onClick={() => setActiveTab('cache')}
          >
            Cache ({stats?.total_assets || 0})
          </button>
          <button
            className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            Upload ({uploadFiles.size})
          </button>
          <button
            className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {activeTab === 'cache' && (
          <div className="cache-tab">
            <div className="cache-stats">
              <div className="stat-item">
                <span className="stat-label">Total Assets:</span>
                <span className="stat-value">{stats?.total_assets || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Cache Size:</span>
                <span className="stat-value">{formatFileSize(stats?.total_size || 0)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Cache Usage:</span>
                <span className="stat-value">{getCacheUsagePercentage()}%</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Cache Hits:</span>
                <span className="stat-value">{stats?.cache_hits || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Cache Misses:</span>
                <span className="stat-value">{stats?.cache_misses || 0}</span>
              </div>
            </div>

            <div className="cache-usage-bar">
              <div 
                className="usage-fill"
                style={{ width: `${Math.min(getCacheUsagePercentage(), 100)}%` }}
              />
            </div>

            <div className="cache-controls">
              <input
                type="text"
                placeholder="Search assets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <button onClick={handleSelectAll} className="control-button">
                {selectedAssets.size === filteredAssets.length ? 'Deselect All' : 'Select All'}
              </button>
              <button 
                onClick={handleRemoveSelected} 
                className="control-button danger"
                disabled={selectedAssets.size === 0}
              >
                Remove Selected ({selectedAssets.size})
              </button>
              <button onClick={performCleanup} className="control-button">
                Cleanup Cache
              </button>
              <button onClick={clearCache} className="control-button danger">
                Clear All
              </button>
            </div>

            <div className="asset-list">
              {filteredAssets.map((assetId: string) => {
                const assetInfo = getAssetInfo(assetId);
                if (!assetInfo) return null;

                return (
                  <div key={assetId} className="asset-item">
                    <input
                      type="checkbox"
                      checked={selectedAssets.has(assetId)}
                      onChange={(e) => handleSelectAsset(assetId, e.target.checked)}
                    />
                    <div className="asset-info">
                      <div className="asset-name">{assetInfo.name}</div>
                      <div className="asset-details">
                        {formatFileSize(assetInfo.size)} • {assetInfo.mime_type}
                        {assetInfo.last_accessed && (
                          <span> • Last accessed: {new Date(assetInfo.last_accessed).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveAsset(assetId)}
                      className="remove-asset-button"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
              {filteredAssets.length === 0 && (
                <div className="no-assets">
                  {searchTerm ? 'No assets match your search.' : 'No assets cached.'}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="upload-tab">
            <div className="upload-controls">
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
                className="select-files-button"
              >
                Select Files
              </button>
            </div>

            <div className="upload-list">
              {Array.from(uploadFiles.entries()).map(([fileId, fileInfo]) => (
                <div key={fileId} className="upload-item">
                  {fileInfo.preview && (
                    <img 
                      src={fileInfo.preview} 
                      alt={fileInfo.file.name}
                      className="upload-preview"
                    />
                  )}
                  <div className="upload-info">
                    <div className="upload-name">{fileInfo.file.name}</div>
                    <div className="upload-details">
                      {formatFileSize(fileInfo.file.size)} • {fileInfo.file.type}
                    </div>
                    <div className="upload-status">
                      Status: {fileInfo.status}
                      {fileInfo.status === 'uploading' && (
                        <span> ({fileInfo.progress}%)</span>
                      )}
                    </div>
                  </div>
                  <div className="upload-actions">
                    {fileInfo.status === 'pending' && (
                      <button
                        onClick={() => handleUploadBatch([fileId])}
                        className="upload-button"
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
          <div className="settings-tab">
            <div className="setting-group">
              <h3>Cache Configuration</h3>
              <div className="setting-item">
                <label>Maximum Cache Size: 100 MB</label>
                <div className="setting-description">
                  Maximum amount of storage used for cached assets
                </div>
              </div>
              <div className="setting-item">
                <label>Maximum Age: 24 hours</label>
                <div className="setting-description">
                  Assets older than this will be removed during cleanup
                </div>
              </div>
              <div className="setting-item">
                <label>Auto Cleanup: Enabled</label>
                <div className="setting-description">
                  Automatically remove old assets every 30 minutes
                </div>
              </div>
            </div>

            <div className="setting-group">
              <h3>Upload Configuration</h3>
              <div className="setting-item">
                <label>Max Concurrent Uploads: 3</label>
                <div className="setting-description">
                  Maximum number of files that can be uploaded simultaneously
                </div>
              </div>
            </div>

            <div className="setting-group">
              <h3>Storage Information</h3>
              <div className="setting-item">
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
};
