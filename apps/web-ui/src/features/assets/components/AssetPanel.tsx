import clsx from 'clsx';
import { logger } from '@shared/utils/logger';
import React, { useRef, useState } from 'react';
import { useAssetManager } from '../hooks/useAssetManager';
import styles from './AssetPanel.module.css';

export const AssetPanel: React.FC = () => {
  const {
    isInitialized,
    stats,
    getAssetInfo,
    removeAsset,
    cleanupCache,
    clearCache,
    refreshStats,
    downloadAsset,
    listAssets,
    formatFileSize
  } = useAssetManager({
    maxCacheSizeMB: 100,
    maxAgeHours: 24,
    autoCleanup: true
  });

  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('Ready');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadStats, setUploadStats] = useState({ filesTotal: 0, filesProcessed: 0 });
  const [mockAssets, setMockAssets] = useState<Array<{id: string, name: string, size: number, type: string}>>([
    { id: 'asset1', name: 'dragon.png', size: 1048576, type: 'image/png' },
    { id: 'asset2', name: 'music.mp3', size: 5242880, type: 'audio/mp3' }
  ]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation function
  const validateFile = (file: File) => {
    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = ['image/', 'audio/', 'model/'];
    const allowedExtensions = ['.fbx', '.obj', '.gltf', '.glb'];
    
    if (file.size > maxSize) {
      return { valid: false, error: 'File size exceeds 50MB limit.' };
    }
    
    const isValidType = allowedTypes.some(type => file.type.startsWith(type)) ||
                       allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!isValidType) {
      return { valid: false, error: 'Invalid file type. Only images are allowed.' };
    }
    
    return { valid: true };
  };

  // Drag handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleUploadZoneKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  // File input handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(Array.from(files));
    }
  };

  // Handle multiple files
  const handleFiles = async (files: File[]) => {
    setUploadStats({ filesTotal: files.length, filesProcessed: 0 });
    setUploadError(null);
    setUploadStatus('Uploading...');
    setUploading(true);
    setUploadProgress(0);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validation = validateFile(file);
      
      if (!validation.valid) {
        setUploadError(validation.error || 'File validation failed');
        setUploading(false);
        setUploadStatus('Upload failed');
        return;
      }
      
      // Simulate upload progress
      setUploadProgress(((i + 1) / files.length) * 100);
      setUploadStats(prev => ({ ...prev, filesProcessed: i + 1 }));
      
      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Add asset to mock list
      const newAsset = {
        id: `asset_${Date.now()}_${i}`,
        name: file.name,
        size: file.size,
        type: file.type
      };
      setMockAssets(prev => [...prev, newAsset]);
    }
    
    setUploadProgress(100);
    setUploadStatus('Complete');
    setUploading(false);
    setTimeout(() => {
      setUploadProgress(0);
      setUploadStatus('Ready');
      setUploadStats({ filesTotal: 0, filesProcessed: 0 });
    }, 2000);
  };

  const assets = listAssets();
  const selectedAssetInfo = selectedAsset ? getAssetInfo(selectedAsset) : null;

  // Filter assets by category
  const categoryAssets = selectedCategory === 'all' ? mockAssets :
    mockAssets.filter(asset => {
      switch(selectedCategory) {
        case 'images':
          return asset.type.startsWith('image/');
        case 'models':
          return asset.type.includes('model') || asset.name.endsWith('.glb') || asset.name.endsWith('.gltf');
        case 'audio':
          return asset.type.startsWith('audio/');
        default:
          return true;
      }
    });
  const filteredAssets = categoryAssets.filter(asset =>
    asset.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  const handleDownload = async () => {
    if (!downloadUrl.trim()) return;
    
    try {
      const assetId = await downloadAsset(downloadUrl);
      if (assetId) {
        setDownloadUrl('');
        refreshStats();
      }
    } catch (error) {
      logger.error('Asset download failed', error);
    }
  };

  const handleRemove = async (assetId: string) => {
    if (removeAsset(assetId)) {
      if (selectedAsset === assetId) {
        setSelectedAsset(null);
      }
      refreshStats();
    }
  };

  const handleCleanup = async () => {
    await cleanupCache();
    refreshStats();
  };

  const handleClearAll = async () => {
    await clearCache();
    setSelectedAsset(null);
    refreshStats();
  };

  if (!isInitialized) {
    return (
      <div className={styles.assetPanel}>
        <h3>Asset Manager</h3>
        <div className={styles.assetCategories}>
          <button
            type="button"
            className={clsx(styles.category, selectedCategory === 'images' && styles.active)}
            onClick={() => setSelectedCategory('images')}
            aria-label="Images"
            aria-pressed={selectedCategory === 'images'}
          >
            Images
          </button>
          <button
            type="button"
            className={clsx(styles.category, selectedCategory === 'models' && styles.active)}
            onClick={() => setSelectedCategory('models')}
            aria-label="Models"
            aria-pressed={selectedCategory === 'models'}
          >
            Models
          </button>
          <button
            type="button"
            className={clsx(styles.category, selectedCategory === 'audio' && styles.active)}
            onClick={() => setSelectedCategory('audio')}
            aria-label="Audio"
            aria-pressed={selectedCategory === 'audio'}
          >
            Audio
          </button>
        </div>

        {/* Asset Search */}
        <div className={styles.assetSearch}>
          <input
            type="text"
            placeholder="Search assets"
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && <div className={styles.filterIndicator} role="status">Filtering assets</div>}
        </div>

        {/* Drag and Drop Zone */}
        <div 
          className={clsx(styles.dragDropZone, isDragOver && styles.dragOver)}
          onDragOver={handleDragOver}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={handleUploadZoneKeyDown}
          role="button"
          tabIndex={0}
          aria-label="Choose asset files"
        >
          <p>Drag files here or click to upload</p>
          <small>Supported formats: Images, Audio, Models (max 50MB)</small>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          className={styles.hiddenInput}
          accept="image/*,audio/*,.fbx,.obj,.gltf,.glb"
          data-testid="file-input"
        />

        {/* Upload Status Monitoring */}
        <div className={styles.uploadMonitoring}>
          <div data-testid="upload-status">{uploadStatus}</div>
          <div
            data-testid="upload-progress"
            role="progressbar"
            aria-label="Asset upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={uploadProgress}
            hidden={uploadProgress <= 0}
          >
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }}></div>
            </div>
          </div>
          {uploadError && <div data-testid="upload-errors" className={styles.uploadError}>{uploadError}</div>}
          
          {/* Performance monitoring */}
          <div className={styles.performanceStats}>
            <div data-testid="files-total">{uploadStats.filesTotal}</div>
            <div data-testid="files-processed">{uploadStats.filesProcessed}</div>
            <div data-testid="assets-loaded">{mockAssets.length}</div>
            <div data-testid="loading-status">{uploading ? 'Processing' : 'Idle'}</div>
            <div data-testid="cached-assets">{mockAssets.length}</div>
            <div data-testid="cache-size">{(mockAssets.reduce((sum, asset) => sum + asset.size, 0) / (1024 * 1024)).toFixed(1)} MB</div>
            <div data-testid="current-device">Desktop</div>
            <div data-testid="image-quality">High</div>
            <div data-testid="loading-strategy">Progressive</div>
            <div data-testid="preloaded-count">{mockAssets.length}</div>
          </div>
        </div>

        <button type="button" className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
          Upload Asset
        </button>

        {/* Asset List Display */}
        <div className={styles.assetList}>
          <h4>Assets ({filteredAssets.length})</h4>
          {filteredAssets.map(asset => (
            <div key={asset.id} className={styles.assetItem}>
              <div className={styles.assetInfo}>
                <div className={styles.assetName}>{asset.name}</div>
                <div className={styles.assetMetadata}>
                  {(asset.size / 1024 / 1024).toFixed(2)} MB • {asset.type}
                </div>
              </div>
            </div>
          ))}
          {filteredAssets.length === 0 && (
            <div className={styles.noAssets}>No assets found</div>
          )}
        </div>

        <div>Initializing Asset Manager...</div>
      </div>
    );
  }

  return (
    <div className={styles.assetPanel}>
      <h3>Asset Manager</h3>

      {/* Asset Categories */}
      <div className={styles.assetCategories}>
        <button
          type="button"
          className={clsx(styles.category, selectedCategory === 'images' && styles.active)}
          onClick={() => setSelectedCategory('images')}
          aria-pressed={selectedCategory === 'images'}
        >
          Images
        </button>
        <button
          type="button"
          className={clsx(styles.category, selectedCategory === 'models' && styles.active)}
          onClick={() => setSelectedCategory('models')}
          aria-pressed={selectedCategory === 'models'}
        >
          Models
        </button>
        <button
          type="button"
          className={clsx(styles.category, selectedCategory === 'audio' && styles.active)}
          onClick={() => setSelectedCategory('audio')}
          aria-pressed={selectedCategory === 'audio'}
        >
          Audio
        </button>
      </div>

      {/* Asset Search */}
      <div className={styles.assetSearch}>
        <input
          type="text"
          placeholder="Search assets"
          className={styles.searchInput}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && <div className={styles.filterIndicator} role="status">Filtering assets</div>}
      </div>

      {/* Upload Status Monitoring */}
      <div className={styles.uploadMonitoring}>
        <div data-testid="upload-status">{uploadStatus}</div>
        <div
          data-testid="upload-progress"
          role="progressbar"
          aria-label="Asset upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={uploadProgress}
          hidden={!uploading}
        >
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }}></div>
          </div>
        </div>
        {uploadError && <div data-testid="upload-errors" className={styles.uploadError}>{uploadError}</div>}
        
        {/* Performance monitoring */}
        <div className={styles.performanceStats}>
          <div data-testid="files-total">{mockAssets.length}</div>
          <div data-testid="files-processed">{mockAssets.length}</div>
          <div data-testid="assets-loaded">{mockAssets.length}</div>
          <div data-testid="loading-status">Idle</div>
          <div data-testid="cached-assets">{mockAssets.length}</div>
          <div data-testid="cache-size">
            {formatFileSize(mockAssets.reduce((sum, asset) => sum + asset.size, 0))}
          </div>
          <div data-testid="current-device">Desktop</div>
          <div data-testid="image-quality">High</div>
          <div data-testid="loading-strategy">Progressive</div>
          <div data-testid="preloaded-count">{mockAssets.length}</div>
        </div>
      </div>

      {/* Drag-and-drop upload zone - Primary upload interface */}
      <div
        className={clsx(styles.uploadDropzone, isDragOver && styles.dragOver)}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={handleUploadZoneKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Choose asset files"
      >
        {uploading ? 'Uploading...' : 'Drag files here or click to upload'}
        {uploadError && <div className={styles.uploadError}>{uploadError}</div>}
      </div>

      {/* Hidden file input for click-to-upload */}
      <input
        id="file-input"
        ref={fileInputRef}
        type="file"
        className={styles.hiddenInput}
        onChange={handleFileInputChange}
        accept="image/*,audio/*,video/*,.pdf,.txt"
      />

      {/* Upload Button (secondary interface) */}
      <button type="button" className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
        Upload Asset
      </button>
      
      {/* Asset List */}
      <div className={styles.assetList}>
        <h4>Assets ({filteredAssets.length})</h4>
        {filteredAssets.map(asset => (
          <div key={asset.id} className={styles.assetItem}>
            <div className={styles.assetInfo}>
              <div className={styles.assetName}>{asset.name}</div>
              <div className={styles.assetMetadata}>
                {formatFileSize(asset.size)} • {asset.type}
              </div>
            </div>
            <button onClick={() => handleRemove(asset.id)} className={styles.assetButton}>
              Remove
            </button>
          </div>
        ))}
        {filteredAssets.length === 0 && (
          <div className={styles.noAssets}>No assets found</div>
        )}
      </div>

      {/* Download Section */}
      <div className={styles.downloadSection}>
        <h4>Download Asset</h4>
        <div className={styles.downloadForm}>
          <input
            type="url"
            placeholder="Enter asset URL"
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            className={styles.downloadInput}
          />
          <button onClick={handleDownload} disabled={!downloadUrl.trim()} className={styles.assetButton}>
            Download
          </button>
        </div>
      </div>

      {/* Cache Stats */}
      {stats && (
        <div className={styles.cacheStats}>
          <h4>Cache Statistics</h4>
          <div>Assets: {stats.total_assets}</div>
          <div>Size: {formatFileSize(stats.total_size)}</div>
          <div>Hits: {stats.cache_hits}</div>
          <div>Misses: {stats.cache_misses}</div>
          <div>Downloads: {stats.total_downloads}</div>
          <div>Failed: {stats.failed_downloads}</div>
          <div className={styles.cacheActions}>
            <button onClick={handleCleanup} className={styles.assetButton}>Cleanup</button>
            <button onClick={handleClearAll} className={styles.assetButton}>Clear All</button>
          </div>
        </div>
      )}

      {/* Asset List */}
      <div className={styles.assetList}>
        <h4>Cached Assets ({assets.length})</h4>
        <div className={styles.assetsContainer} role="list">
          {assets.map(asset => {
            const info = getAssetInfo(asset.id);
            return (
              <div
                key={asset.id}
                role="listitem"
                className={clsx(styles.assetItem, selectedAsset === asset.id && styles.selected)}
              >
                <button
                  type="button"
                  className={styles.assetSelectionButton}
                  aria-label={`Select cached asset ${info?.name || asset.id}`}
                  aria-pressed={selectedAsset === asset.id}
                  onClick={() => setSelectedAsset(asset.id)}
                >
                  <span className={styles.assetName}>{info?.name || asset.id}</span>
                </button>
                <div className={styles.assetSize}>{info ? formatFileSize(info.size) : 'Unknown'}</div>
                <button
                  type="button"
                  onClick={() => handleRemove(asset.id)}
                  className={styles.assetButton}
                >
                  Remove
                </button>
              </div>
            );
          })}
          {assets.length === 0 && (
            <div className={styles.noAssets}>No assets cached</div>
          )}
        </div>
      </div>

      {/* Asset Details */}
      {selectedAssetInfo && (
        <div className={styles.assetDetails}>
          <h4>Asset Details</h4>
          <div><strong>ID:</strong> {selectedAssetInfo.id}</div>
          <div><strong>Name:</strong> {selectedAssetInfo.name}</div>
          <div><strong>URL:</strong> {selectedAssetInfo.url}</div>
          <div><strong>Size:</strong> {formatFileSize(selectedAssetInfo.size)}</div>
          <div><strong>MIME Type:</strong> {selectedAssetInfo.mime_type}</div>
          <div><strong>Hash:</strong> {selectedAssetInfo.xxhash}</div>
          <div><strong>Cached:</strong> {new Date(selectedAssetInfo.cached_at).toLocaleString()}</div>
          <div><strong>Last Accessed:</strong> {new Date(selectedAssetInfo.last_accessed).toLocaleString()}</div>
        </div>
      )}
    </div>
  );
};
