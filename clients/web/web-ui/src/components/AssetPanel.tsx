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
    return <div className="asset-panel">Initializing Asset Manager...</div>;
  }

  return (
    <div className="asset-panel">
      <h3>Asset Manager</h3>
      
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
