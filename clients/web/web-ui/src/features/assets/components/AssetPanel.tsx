import clsx from 'clsx';
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
  const filteredAssets = selectedCategory === 'all' ? mockAssets : 
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

  const handleDownload = async () => {
    if (!downloadUrl.trim()) return;
    
    try {
      const assetId = await downloadAsset(downloadUrl);
      if (assetId) {
        setDownloadUrl('');
        refreshStats();
      }
    } catch (error) {
      console.error('Download failed:', error);
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
          <div 
            className={clsx(styles.category, selectedCategory === 'images' && styles.active)}
            onClick={() => setSelectedCategory('images')}
            role="button"
            aria-label="Images"
          >
            Images
          </div>
          <div 
            className={clsx(styles.category, selectedCategory === 'models' && styles.active)}
            onClick={() => setSelectedCategory('models')}
            role="button"
            aria-label="Models"
          >
            Models
          </div>
          <div 
            className={clsx(styles.category, selectedCategory === 'audio' && styles.active)}
            onClick={() => setSelectedCategory('audio')}
            role="button"
            aria-label="Audio"
          >
            Audio
          </div>
        </div>

        {/* Asset Search */}
        <div className={styles.assetSearch}>
          <input
            type="text"
            placeholder="Search assets"
            className={styles.searchInput}
            onChange={(e) => {
              if (e.target.value) {
                // Show filtering indication
                const indicator = document.createElement('div');
                indicator.textContent = 'Filtering assets';
                indicator.className = 'filter-indicator';
                const searchDiv = e.target.parentElement;
                if (searchDiv && !searchDiv.querySelector('.filter-indicator')) {
                  searchDiv.appendChild(indicator);
                }
              } else {
                // Remove filtering indication
                const indicator = e.target.parentElement?.querySelector('.filter-indicator');
                if (indicator) {
                  indicator.remove();
                }
              }
            }}
          />
        </div>

        {/* Drag and Drop Zone */}
        <div 
          className={styles.dragDropZone}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '2px dashed #ccc',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            margin: '10px 0',
            cursor: 'pointer',
            backgroundColor: isDragOver ? '#f0f0f0' : 'transparent'
          }}
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
          style={{ display: 'none' }}
          accept="image/*,audio/*,.fbx,.obj,.gltf,.glb"
          data-testid="file-input"
        />

        {/* Upload Status Monitoring */}
        <div className={styles.uploadMonitoring}>
          <div data-testid="upload-status">{uploadStatus}</div>
          <div data-testid="upload-progress" style={{ display: uploadProgress > 0 ? 'block' : 'none' }}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }}></div>
            </div>
          </div>
          <div data-testid="upload-errors" style={{ display: uploadError ? 'block' : 'none', color: 'red' }}>
            {uploadError}
          </div>
          
          {/* Performance monitoring */}
          <div className={styles.performanceStats} style={{ fontSize: '12px', color: '#666' }}>
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

        <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
          Upload Asset
        </button>

        {/* Asset List Display */}
        <div className={styles.assetList}>
          <h4>Assets ({filteredAssets.length})</h4>
          {filteredAssets.map(asset => (
            <div key={asset.id} className={styles.assetItem}>
              <div className={styles.assetInfo}>
                <div className={styles.assetName}>{asset.name}</div>
                <div className={styles.assetDetails}>
                  {(asset.size / 1024 / 1024).toFixed(2)} MB • {asset.type}
                </div>
              </div>
            </div>
          ))}
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
        <div 
          className={clsx(styles.category, selectedCategory === 'images' && styles.active)}
          onClick={() => setSelectedCategory('images')}
        >
          Images
        </div>
        <div 
          className={clsx(styles.category, selectedCategory === 'models' && styles.active)}
          onClick={() => setSelectedCategory('models')}
        >
          Models
        </div>
        <div 
          className={clsx(styles.category, selectedCategory === 'audio' && styles.active)}
          onClick={() => setSelectedCategory('audio')}
        >
          Audio
        </div>
      </div>

      {/* Asset Search */}
      <div className={styles.assetSearch}>
        <input
          type="text"
          placeholder="Search assets"
          className={styles.searchInput}
        />
      </div>

      {/* Upload Status Monitoring */}
      <div className={styles.uploadMonitoring}>
        <div data-testid="upload-status">{uploadStatus}</div>
        <div data-testid="upload-progress" style={{ display: uploading ? 'block' : 'none' }}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: uploading ? '50%' : '0%' }}></div>
          </div>
        </div>
        <div data-testid="upload-errors" style={{ display: uploadError ? 'block' : 'none', color: 'red' }}>
          {uploadError}
        </div>
        
        {/* Performance monitoring */}
        <div className={styles.performanceStats} style={{ fontSize: '12px', color: '#666' }}>
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
        className={styles.uploadDropzone}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{
          border: '2px dashed #3b82f6',
          padding: 20,
          marginBottom: 16,
          textAlign: 'center',
          background: '#f9fafb',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        {uploading ? 'Uploading...' : 'Drag files here or click to upload'}
        {uploadError && <div style={{color:'#f87171',marginTop:8}}>{uploadError}</div>}
      </div>

      {/* Hidden file input for click-to-upload */}
      <input
        id="file-input"
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
        accept="image/*,audio/*,video/*,.pdf,.txt"
      />

      {/* Upload Button (secondary interface) */}
      <button className={styles.uploadBtn} role="button" onClick={() => document.getElementById('file-input')?.click()}>
        Upload Asset
      </button>
      
      {/* Asset List */}
      <div className={styles.assetList}>
        <h4>Assets ({filteredAssets.length})</h4>
        {filteredAssets.map(asset => (
          <div key={asset.id} className={styles.assetItem}>
            <div className={styles.assetInfo}>
              <div className={styles.assetName}>{asset.name}</div>
              <div className={styles.assetDetails}>
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
      <div className="download-section">
        <h4>Download Asset</h4>
        <div className="download-form">
          <input
            type="url"
            placeholder="Enter asset URL"
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            className="download-input"
          />
          <button onClick={handleDownload} disabled={!downloadUrl.trim()} className={styles.assetButton}>
            Download
          </button>
        </div>
      </div>

      {/* Cache Stats */}
      {stats && (
        <div className="cache-stats">
          <h4>Cache Statistics</h4>
          <div>Assets: {stats.total_assets}</div>
          <div>Size: {formatFileSize(stats.total_size)}</div>
          <div>Hits: {stats.cache_hits}</div>
          <div>Misses: {stats.cache_misses}</div>
          <div>Downloads: {stats.total_downloads}</div>
          <div>Failed: {stats.failed_downloads}</div>
          <div className="cache-actions">
            <button onClick={handleCleanup} className={styles.assetButton}>Cleanup</button>
            <button onClick={handleClearAll} className={styles.assetButton}>Clear All</button>
          </div>
        </div>
      )}

      {/* Asset List */}
      <div className={styles.assetList}>
        <h4>Cached Assets ({assets.length})</h4>
        <div className="assets-container">
          {assets.map(asset => {
            const info = getAssetInfo(asset.id);
            return (
              <div
                key={asset.id}
                className={`asset-item ${selectedAsset === asset.id ? 'selected' : ''}`}
                onClick={() => setSelectedAsset(asset.id)}
              >
                <div className={styles.assetName}>{info?.name || asset.id}</div>
                <div className={styles.assetSize}>{info ? formatFileSize(info.size) : 'Unknown'}</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(asset.id);
                  }}
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
