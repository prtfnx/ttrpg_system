import React, { useState } from 'react';
import useAssetManager from '../hooks/useAssetManager';

export const AssetManagerDemo: React.FC = () => {
  const {
    stats,
    isInitialized,
    error,
    downloadAsset,
    getAssetData,
    getAssetInfo,
    hasAsset,
    hasAssetByHash,
    getAssetByHash,
    removeAsset,
    cleanupCache,
    clearCache,
    listAssets,
    setCacheSize,
    setMaxAge,
    refreshStats,
  } = useAssetManager();

  const [url, setUrl] = useState('');
  const [expectedHash, setExpectedHash] = useState('');
  const [assetId, setAssetId] = useState('');
  const [hashQuery, setHashQuery] = useState('');

  const handleDownload = async () => {
    if (!url) return;
    
    const result = await downloadAsset(url, expectedHash || undefined);
    if (result) {
      setAssetId(result);
    }
  };

  const handleGetData = () => {
    if (!assetId) return;
    
    const data = getAssetData(assetId);
    if (data) {
      console.log(`Asset data for ${assetId}:`, data);
      alert(`Asset data retrieved: ${data.length} bytes`);
    } else {
      alert('Asset not found');
    }
  };

  const handleGetInfo = () => {
    if (!assetId) return;
    
    const info = getAssetInfo(assetId);
    if (info) {
      console.log(`Asset info for ${assetId}:`, info);
      alert(`Asset info: ${JSON.stringify(info, null, 2)}`);
    } else {
      alert('Asset not found');
    }
  };

  const handleGetByHash = () => {
    if (!hashQuery) return;
    
    const foundAssetId = getAssetByHash(hashQuery);
    if (foundAssetId) {
      setAssetId(foundAssetId);
      alert(`Found asset: ${foundAssetId}`);
    } else {
      alert('Asset not found for hash');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isInitialized) {
    return <div className="p-4">Initializing Asset Manager...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Enhanced Asset Manager Demo</h1>
      
      {/* Stats Display */}
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-2">Cache Statistics</h2>
        {stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <strong>Total Assets:</strong> {stats.total_assets}
            </div>
            <div>
              <strong>Total Size:</strong> {formatBytes(stats.total_size)}
            </div>
            <div>
              <strong>Cache Hits:</strong> {stats.cache_hits}
            </div>
            <div>
              <strong>Cache Misses:</strong> {stats.cache_misses}
            </div>
            <div>
              <strong>Downloads:</strong> {stats.total_downloads}
            </div>
            <div>
              <strong>Failed Downloads:</strong> {stats.failed_downloads}
            </div>
            <div>
              <strong>Hash Verifications:</strong> {stats.hash_verifications}
            </div>
            <div>
              <strong>Hash Failures:</strong> {stats.hash_failures}
            </div>
          </div>
        ) : (
          <p>No stats available</p>
        )}
        <button
          onClick={refreshStats}
          className="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-sm"
        >
          Refresh Stats
        </button>
      </div>

      {/* Download Asset */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">Download Asset</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Asset URL:</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/image.png"
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Expected Hash (optional):</label>
            <input
              type="text"
              value={expectedHash}
              onChange={(e) => setExpectedHash(e.target.value)}
              placeholder="xxHash64 hex string"
              className="w-full p-2 border rounded"
            />
          </div>
          <button
            onClick={handleDownload}
            disabled={!url}
            className="px-4 py-2 bg-green-500 text-white rounded disabled:bg-gray-300"
          >
            Download Asset
          </button>
        </div>
      </div>

      {/* Asset Operations */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">Asset Operations</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Asset ID:</label>
            <input
              type="text"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              placeholder="asset_xxxxx"
              className="w-full p-2 border rounded"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleGetData}
              disabled={!assetId}
              className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              Get Data
            </button>
            <button
              onClick={handleGetInfo}
              disabled={!assetId}
              className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              Get Info
            </button>
            <button
              onClick={() => {
                if (assetId && hasAsset(assetId)) {
                  alert('Asset exists');
                } else {
                  alert('Asset does not exist');
                }
              }}
              disabled={!assetId}
              className="px-3 py-1 bg-purple-500 text-white rounded disabled:bg-gray-300"
            >
              Check Exists
            </button>
            <button
              onClick={() => {
                if (assetId && removeAsset(assetId)) {
                  alert('Asset removed');
                  setAssetId('');
                } else {
                  alert('Failed to remove asset');
                }
              }}
              disabled={!assetId}
              className="px-3 py-1 bg-red-500 text-white rounded disabled:bg-gray-300"
            >
              Remove Asset
            </button>
          </div>
        </div>
      </div>

      {/* Hash Operations */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">Hash Operations</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Hash Query:</label>
            <input
              type="text"
              value={hashQuery}
              onChange={(e) => setHashQuery(e.target.value)}
              placeholder="xxHash64 hex string"
              className="w-full p-2 border rounded"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleGetByHash}
              disabled={!hashQuery}
              className="px-3 py-1 bg-indigo-500 text-white rounded disabled:bg-gray-300"
            >
              Get Asset by Hash
            </button>
            <button
              onClick={() => {
                if (hashQuery && hasAssetByHash(hashQuery)) {
                  alert('Asset exists for this hash');
                } else {
                  alert('No asset found for this hash');
                }
              }}
              disabled={!hashQuery}
              className="px-3 py-1 bg-indigo-500 text-white rounded disabled:bg-gray-300"
            >
              Check Hash Exists
            </button>
          </div>
        </div>
      </div>

      {/* Cache Management */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <h3 className="text-lg font-semibold mb-3">Cache Management</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              const assets = listAssets();
              console.log('All assets:', assets);
              alert(`Found ${assets.length} assets - check console for details`);
            }}
            className="px-3 py-1 bg-gray-500 text-white rounded"
          >
            List Assets
          </button>
          <button
            onClick={cleanupCache}
            className="px-3 py-1 bg-yellow-500 text-white rounded"
          >
            Cleanup Cache
          </button>
          <button
            onClick={clearCache}
            className="px-3 py-1 bg-red-500 text-white rounded"
          >
            Clear Cache
          </button>
          <button
            onClick={() => setCacheSize(50 * 1024 * 1024)} // 50MB
            className="px-3 py-1 bg-blue-500 text-white rounded"
          >
            Set Cache Size (50MB)
          </button>
          <button
            onClick={() => setMaxAge(12 * 60 * 60 * 1000)} // 12 hours
            className="px-3 py-1 bg-blue-500 text-white rounded"
          >
            Set Max Age (12h)
          </button>
        </div>
      </div>

      {/* Example URLs for testing */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="text-sm font-semibold mb-2">Example URLs for testing:</h3>
        <div className="text-xs space-y-1">
          <div
            className="cursor-pointer text-blue-600 hover:underline"
            onClick={() => setUrl('https://picsum.photos/200/300')}
          >
            • https://picsum.photos/200/300 (Random image)
          </div>
          <div
            className="cursor-pointer text-blue-600 hover:underline"
            onClick={() => setUrl('https://httpbin.org/json')}
          >
            • https://httpbin.org/json (JSON data)
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetManagerDemo;
