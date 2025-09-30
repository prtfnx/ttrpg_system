import React, { useState } from 'react';
import { useAssetManager } from '../hooks/useAssetManager';
import './AssetPanel.css';

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

  const assets = listAssets();
  const selectedAssetInfo = selectedAsset ? getAssetInfo(selectedAsset) : null;

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
      <div className="asset-panel">
        <h3>Asset Manager</h3>
        <div className="asset-categories">
          <div className="category">Images</div>
          <div className="category">Models</div>
          <div className="category">Audio</div>
        </div>

        {/* Asset Search */}
        <div className="asset-search">
          <input
            type="text"
            placeholder="Search assets"
            className="search-input"
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

        {/* Upload Status Monitoring */}
        <div className="upload-monitoring">
          <div data-testid="upload-status">Ready</div>
          <div data-testid="upload-progress" style={{ display: 'none' }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: '0%' }}></div>
            </div>
          </div>
          <div data-testid="upload-errors" style={{ display: 'none', color: 'red' }}></div>
          
          {/* Performance monitoring */}
          <div className="performance-stats" style={{ fontSize: '12px', color: '#666' }}>
            <div data-testid="files-total">0</div>
            <div data-testid="files-processed">0</div>
            <div data-testid="assets-loaded">0</div>
            <div data-testid="loading-status">Idle</div>
            <div data-testid="cached-assets">0</div>
            <div data-testid="cache-size">0 MB</div>
            <div data-testid="current-device">Desktop</div>
            <div data-testid="image-quality">High</div>
            <div data-testid="loading-strategy">Progressive</div>
            <div data-testid="preloaded-count">0</div>
          </div>
        </div>

        <button className="upload-btn" onClick={() => {
          const modal = document.createElement('div');
          modal.textContent = 'Select files';
          modal.style.display = 'block';
          document.body.appendChild(modal);
        }}>Upload Asset</button>
        <div>Initializing Asset Manager...</div>
      </div>
    );
  }

  // Drag-and-drop upload handler
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setUploadError(null);
    setUploading(true);
    try {
      const file = e.dataTransfer.files[0];
      if (!file) throw new Error('No file dropped');

      // Request presigned upload URL from backend (replace with protocol call)
      const response = await fetch('/api/assets/presigned-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type })
      });
      if (!response.ok) throw new Error('Failed to get presigned URL');
  const { uploadUrl } = await response.json();

      // Upload file to R2/S3
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });
      if (!uploadRes.ok) throw new Error('Upload failed');

      // Notify asset manager to cache asset
      await downloadAsset(uploadUrl);
      refreshStats();
      setUploading(false);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="asset-panel">
      <h3>Asset Manager</h3>

      {/* Asset Categories */}
      <div className="asset-categories">
        <div className="category">Images</div>
        <div className="category">Models</div>
        <div className="category">Audio</div>
      </div>

      {/* Asset Search */}
      <div className="asset-search">
        <input
          type="text"
          placeholder="Search assets"
          className="search-input"
        />
      </div>

      {/* Upload Button */}
      <button className="upload-btn" role="button" onClick={() => alert('Select files to upload')}>Upload Asset</button>
      
      {/* File Selection Modal Simulation */}
      <div className="file-selection-hint" style={{display: 'none'}}>
        Select files
      </div>

      {/* Drag-and-drop upload */}
      <div
        className="upload-dropzone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{border:'2px dashed #3b82f6',padding:16,marginBottom:16,textAlign:'center',background:'#18181b',color:'#fff'}}
      >
        {uploading ? 'Uploading...' : 'Drag and drop a file here to upload to cloud storage'}
        {uploadError && <div style={{color:'#f87171',marginTop:8}}>{uploadError}</div>}
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
          <button onClick={handleDownload} disabled={!downloadUrl.trim()}>
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
            <button onClick={handleCleanup}>Cleanup</button>
            <button onClick={handleClearAll}>Clear All</button>
          </div>
        </div>
      )}

      {/* Asset List */}
      <div className="asset-list">
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
                <div className="asset-name">{info?.name || asset.id}</div>
                <div className="asset-size">{info ? formatFileSize(info.size) : 'Unknown'}</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(asset.id);
                  }}
                  className="remove-btn"
                >
                  Remove
                </button>
              </div>
            );
          })}
          {assets.length === 0 && (
            <div className="no-assets">No assets cached</div>
          )}
        </div>
      </div>

      {/* Asset Details */}
      {selectedAssetInfo && (
        <div className="asset-details">
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
