import React, { useRef, useState } from 'react';
import { useAssetManager } from '../hooks/useAssetManager';
import './AssetPanel.css';

export const AssetPanel: React.FC = () => {
  const {
    isInitialized,
    cacheStats,
    assets,
    cacheAsset,
    getAsset,
    getAssetInfo,
    removeAsset,
    cleanupCache,
    clearCache,
    setCacheLimits,
    loadAssetFromUrl,
    refreshStats
  } = useAssetManager();

  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [uploadId, setUploadId] = useState('');
  const [maxSizeMB, setMaxSizeMB] = useState(100);
  const [maxAgeHours, setMaxAgeHours] = useState(24);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      const assetInfo = {
        id: uploadId || `file_${Date.now()}`,
        name: uploadName || file.name,
        url: '', // Local file
        size: data.length,
        mime_type: file.type || 'application/octet-stream'
      };

      const success = await cacheAsset(assetInfo, data);
      if (success) {
        setUploadId('');
        setUploadName('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        alert('Asset uploaded successfully!');
      } else {
        alert('Failed to upload asset');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload asset');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUrlUpload = async () => {
    if (!uploadUrl || !uploadId || !uploadName) {
      alert('Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    try {
      const success = await loadAssetFromUrl(uploadId, uploadName, uploadUrl);
      if (success) {
        setUploadUrl('');
        setUploadId('');
        setUploadName('');
        alert('Asset loaded successfully!');
      } else {
        alert('Failed to load asset from URL');
      }
    } catch (error) {
      console.error('URL upload error:', error);
      alert('Failed to load asset from URL');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadAsset = (assetId: string) => {
    const data = getAsset(assetId);
    const info = getAssetInfo(assetId);
    
    if (!data || !info) {
      alert('Asset not found');
      return;
    }

    const blob = new Blob([new Uint8Array(data)], { type: info.mime_type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = info.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRemoveAsset = (assetId: string) => {
    if (confirm('Are you sure you want to remove this asset?')) {
      const success = removeAsset(assetId);
      if (success) {
        if (selectedAsset === assetId) {
          setSelectedAsset(null);
        }
      } else {
        alert('Failed to remove asset');
      }
    }
  };

  const handleClearCache = () => {
    if (confirm('Are you sure you want to clear all cached assets?')) {
      clearCache();
      setSelectedAsset(null);
    }
  };

  const handleSetLimits = () => {
    setCacheLimits(maxSizeMB, maxAgeHours);
    alert('Cache limits updated');
  };

  if (!isInitialized) {
    return <div className="asset-panel loading">Initializing Asset Manager...</div>;
  }

  const selectedAssetInfo = selectedAsset ? getAssetInfo(selectedAsset) : null;

  return (
    <div className="asset-panel">
      <h3>Asset Manager</h3>
      
      {/* Cache Statistics */}
      <div className="stats-section">
        <h4>Cache Statistics</h4>
        {cacheStats && (
          <div className="stats-grid">
            <div>Assets: {cacheStats.total_assets}</div>
            <div>Size: {formatFileSize(cacheStats.total_size)}</div>
            <div>Hits: {cacheStats.cache_hits}</div>
            <div>Misses: {cacheStats.cache_misses}</div>
          </div>
        )}
        <div className="stats-controls">
          <button onClick={refreshStats}>Refresh</button>
          <button onClick={cleanupCache}>Cleanup</button>
          <button onClick={handleClearCache} className="danger">Clear All</button>
        </div>
      </div>

      {/* Cache Settings */}
      <div className="settings-section">
        <h4>Cache Settings</h4>
        <div className="settings-grid">
          <label>
            Max Size (MB):
            <input
              type="number"
              value={maxSizeMB}
              onChange={(e) => setMaxSizeMB(Number(e.target.value))}
              min="1"
              max="1000"
            />
          </label>
          <label>
            Max Age (hours):
            <input
              type="number"
              value={maxAgeHours}
              onChange={(e) => setMaxAgeHours(Number(e.target.value))}
              min="1"
              max="168"
            />
          </label>
        </div>
        <button onClick={handleSetLimits}>Update Limits</button>
      </div>

      {/* Upload Section */}
      <div className="upload-section">
        <h4>Upload Assets</h4>
        
        {/* File Upload */}
        <div className="upload-method">
          <h5>Upload File</h5>
          <div className="upload-form">
            <input
              type="text"
              placeholder="Asset ID (optional)"
              value={uploadId}
              onChange={(e) => setUploadId(e.target.value)}
            />
            <input
              type="text"
              placeholder="Asset Name (optional)"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
            />
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* URL Upload */}
        <div className="upload-method">
          <h5>Load from URL</h5>
          <div className="upload-form">
            <input
              type="text"
              placeholder="Asset ID *"
              value={uploadId}
              onChange={(e) => setUploadId(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Asset Name *"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              required
            />
            <input
              type="url"
              placeholder="Asset URL *"
              value={uploadUrl}
              onChange={(e) => setUploadUrl(e.target.value)}
              required
            />
            <button 
              onClick={handleUrlUpload} 
              disabled={isLoading || !uploadUrl || !uploadId || !uploadName}
            >
              {isLoading ? 'Loading...' : 'Load Asset'}
            </button>
          </div>
        </div>
      </div>

      {/* Asset List */}
      <div className="asset-list-section">
        <h4>Cached Assets ({assets.length})</h4>
        <div className="asset-list">
          {assets.map(assetId => {
            const info = getAssetInfo(assetId);
            return (
              <div
                key={assetId}
                className={`asset-item ${selectedAsset === assetId ? 'selected' : ''}`}
                onClick={() => setSelectedAsset(assetId)}
              >
                <div className="asset-name">{info?.name || assetId}</div>
                <div className="asset-size">{info ? formatFileSize(info.size) : 'Unknown'}</div>
                <div className="asset-actions">
                  <button onClick={(e) => { e.stopPropagation(); handleDownloadAsset(assetId); }}>
                    Download
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleRemoveAsset(assetId); }}
                    className="danger"
                  >
                    Remove
                  </button>
                </div>
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
        <div className="asset-details-section">
          <h4>Asset Details</h4>
          <div className="asset-details">
            <div><strong>ID:</strong> {selectedAssetInfo.id}</div>
            <div><strong>Name:</strong> {selectedAssetInfo.name}</div>
            <div><strong>Size:</strong> {formatFileSize(selectedAssetInfo.size)}</div>
            <div><strong>Type:</strong> {selectedAssetInfo.mime_type}</div>
            <div><strong>Hash:</strong> {selectedAssetInfo.hash}</div>
            <div><strong>Cached:</strong> {new Date(selectedAssetInfo.cached_at).toLocaleString()}</div>
            <div><strong>Last Accessed:</strong> {new Date(selectedAssetInfo.last_accessed).toLocaleString()}</div>
            {selectedAssetInfo.url && (
              <div><strong>URL:</strong> <a href={selectedAssetInfo.url} target="_blank" rel="noopener noreferrer">{selectedAssetInfo.url}</a></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
