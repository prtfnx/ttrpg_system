import { useRef, useCallback, useEffect, useState } from 'react';
import { AssetManager } from '../wasm/ttrpg_rust_core';

export interface AssetInfo {
  id: string;
  name: string;
  url: string;
  xxhash: string;
  size: number;
  mime_type: string;
  cached_at: number;
  last_accessed: number;
  download_progress: number;
}

export interface CacheStats {
  total_assets: number;
  total_size: number;
  cache_hits: number;
  cache_misses: number;
  last_cleanup: number;
  download_queue_size: number;
  total_downloads: number;
  failed_downloads: number;
  hash_verifications: number;
  hash_failures: number;
}

export interface AssetManagerState {
  stats: CacheStats | null;
  isInitialized: boolean;
  error: string | null;
  isLoading: boolean;
}

export interface AssetManagerConfig {
  maxCacheSizeMB?: number;
  maxAgeHours?: number;
  autoCleanup?: boolean;
}

export interface UploadProgress {
  [fileId: string]: {
    progress: number;
    status: 'uploading' | 'completed' | 'failed';
  };
}

export const useAssetManager = (config?: AssetManagerConfig) => {
  const assetManagerRef = useRef<AssetManager | null>(null);
  const [state, setState] = useState<AssetManagerState>({
    stats: null,
    isInitialized: false,
    error: null,
    isLoading: false,
  });
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({});

  // Initialize the asset manager
  const initialize = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      console.log('Initializing Enhanced Asset Manager...');
      const manager = new AssetManager();
      await manager.initialize();
      
      // Apply configuration if provided
      if (config?.maxCacheSizeMB) {
        manager.set_max_cache_size(BigInt(config.maxCacheSizeMB * 1024 * 1024));
      }
      if (config?.maxAgeHours) {
        manager.set_max_age(config.maxAgeHours * 60 * 60 * 1000);
      }
      
      assetManagerRef.current = manager;
      
      // Get initial stats
      const stats = JSON.parse(manager.get_cache_stats()) as CacheStats;
      
      setState({
        stats,
        isInitialized: true,
        error: null,
        isLoading: false,
      });
      
      console.log('Enhanced Asset Manager initialized successfully', stats);
      
      // Auto cleanup if enabled
      if (config?.autoCleanup) {
        await manager.cleanup_cache();
        const updatedStats = JSON.parse(manager.get_cache_stats()) as CacheStats;
        setState(prev => ({ ...prev, stats: updatedStats }));
      }
    } catch (error) {
      console.error('Failed to initialize Enhanced Asset Manager:', error);
      setState(prev => ({
        ...prev,
        isInitialized: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [config]);

  // Download asset with hash verification
  const downloadAsset = useCallback(async (
    url: string, 
    expectedHash?: string
  ): Promise<string | null> => {
    const manager = assetManagerRef.current;
    if (!manager) {
      console.error('Enhanced Asset Manager not initialized');
      return null;
    }

    try {
      console.log(`Downloading asset: ${url}${expectedHash ? ` (expected hash: ${expectedHash})` : ''}`);
      const assetId = await manager.download_asset(url, expectedHash || undefined);
      
      // Update stats
      const stats = JSON.parse(manager.get_cache_stats()) as CacheStats;
      setState(prev => ({ ...prev, stats }));
      
      console.log(`Asset downloaded successfully: ${assetId}`);
      return assetId;
    } catch (error) {
      console.error('Failed to download asset:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Download failed',
      }));
      return null;
    }
  }, []);

  // Get asset data
  const getAssetData = useCallback((assetId: string): Uint8Array | null => {
    const manager = assetManagerRef.current;
    if (!manager) return null;

    try {
      const data = manager.get_asset_data(assetId);
      if (data) {
        // Update stats after cache hit/miss
        const stats = JSON.parse(manager.get_cache_stats()) as CacheStats;
        setState(prev => ({ ...prev, stats }));
        return data;
      }
      return null;
    } catch (error) {
      console.error('Failed to get asset data:', error);
      return null;
    }
  }, []);

  // Get asset info
  const getAssetInfo = useCallback((assetId: string): AssetInfo | null => {
    const manager = assetManagerRef.current;
    if (!manager) return null;

    try {
      const infoJson = manager.get_asset_info(assetId);
      return infoJson ? JSON.parse(infoJson) as AssetInfo : null;
    } catch (error) {
      console.error('Failed to get asset info:', error);
      return null;
    }
  }, []);

  // Check if asset exists
  const hasAsset = useCallback((assetId: string): boolean => {
    const manager = assetManagerRef.current;
    return manager ? manager.has_asset(assetId) : false;
  }, []);

  // Check if asset exists by hash
  const hasAssetByHash = useCallback((xxhash: string): boolean => {
    const manager = assetManagerRef.current;
    return manager ? manager.has_asset_by_hash(xxhash) : false;
  }, []);

  // Get asset by hash
  const getAssetByHash = useCallback((xxhash: string): string | null => {
    const manager = assetManagerRef.current;
    if (!manager) return null;

    try {
      const assetId = manager.get_asset_by_hash(xxhash);
      if (assetId) {
        // Update stats after cache hit/miss
        const stats = JSON.parse(manager.get_cache_stats()) as CacheStats;
        setState(prev => ({ ...prev, stats }));
        return assetId;
      }
      return null;
    } catch (error) {
      console.error('Failed to get asset by hash:', error);
      return null;
    }
  }, []);

  // Remove asset
  const removeAsset = useCallback((assetId: string): boolean => {
    const manager = assetManagerRef.current;
    if (!manager) return false;

    try {
      const removed = manager.remove_asset(assetId);
      if (removed) {
        // Update stats
        const stats = JSON.parse(manager.get_cache_stats()) as CacheStats;
        setState(prev => ({ ...prev, stats }));
      }
      return removed;
    } catch (error) {
      console.error('Failed to remove asset:', error);
      return false;
    }
  }, []);

  // Cleanup cache
  const cleanupCache = useCallback(async (): Promise<void> => {
    const manager = assetManagerRef.current;
    if (!manager) return;

    try {
      await manager.cleanup_cache();
      
      // Update stats
      const stats = JSON.parse(manager.get_cache_stats()) as CacheStats;
      setState(prev => ({ ...prev, stats }));
      
      console.log('Cache cleanup completed');
    } catch (error) {
      console.error('Failed to cleanup cache:', error);
    }
  }, []);

  // Clear entire cache
  const clearCache = useCallback(async (): Promise<void> => {
    const manager = assetManagerRef.current;
    if (!manager) return;

    try {
      await manager.clear_cache();
      
      // Update stats
      const stats = JSON.parse(manager.get_cache_stats()) as CacheStats;
      setState(prev => ({ ...prev, stats }));
      
      console.log('Cache cleared successfully');
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }, []);

  // List all assets
  const listAssets = useCallback((): AssetInfo[] => {
    const manager = assetManagerRef.current;
    if (!manager) return [];

    try {
      const assetsJson = manager.list_assets();
      return JSON.parse(assetsJson) as AssetInfo[];
    } catch (error) {
      console.error('Failed to list assets:', error);
      return [];
    }
  }, []);

  // Set cache limits
  const setCacheSize = useCallback((sizeBytes: number): void => {
    const manager = assetManagerRef.current;
    if (manager) {
      manager.set_max_cache_size(BigInt(sizeBytes));
    }
  }, []);

  const setMaxAge = useCallback((ageMs: number): void => {
    const manager = assetManagerRef.current;
    if (manager) {
      manager.set_max_age(ageMs);
    }
  }, []);

  // Calculate hash for data
  const calculateHash = useCallback((data: Uint8Array): string => {
    const manager = assetManagerRef.current;
    if (!manager) return '';

    try {
      return manager.calculate_asset_hash(data);
    } catch (error) {
      console.error('Failed to calculate hash:', error);
      return '';
    }
  }, []);

  // Get stats
  const refreshStats = useCallback((): void => {
    const manager = assetManagerRef.current;
    if (!manager) return;

    try {
      const stats = JSON.parse(manager.get_cache_stats()) as CacheStats;
      setState(prev => ({ ...prev, stats }));
    } catch (error) {
      console.error('Failed to refresh stats:', error);
    }
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Additional methods expected by AssetManager component
  const performCleanup = useCallback(async (): Promise<void> => {
    await cleanupCache();
  }, [cleanupCache]);

  const getAssetList = useCallback((): string[] => {
    const assets = listAssets();
    return assets.map(asset => asset.id);
  }, [listAssets]);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  const getCacheUsagePercentage = useCallback((): number => {
    if (!state.stats || !config?.maxCacheSizeMB) return 0;
    const maxSize = config.maxCacheSizeMB * 1024 * 1024;
    return Math.round((state.stats.total_size / maxSize) * 100);
  }, [state.stats, config?.maxCacheSizeMB]);

  const uploadAsset = useCallback(async (
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<string | null> => {
    const fileId = `${file.name}-${Date.now()}`;
    
    setUploadProgress(prev => ({
      ...prev,
      [fileId]: { progress: 0, status: 'uploading' }
    }));

    try {
      // Convert file to URL for download
      const objectUrl = URL.createObjectURL(file);
      
      // Update progress callback
      const progressHandler = (progress: number) => {
        setUploadProgress(prev => ({
          ...prev,
          [fileId]: { progress, status: 'uploading' }
        }));
        onProgress?.(progress);
      };

      // Simulate progress for now (in real implementation this would be handled by download_asset)
      progressHandler(50);
      
      const assetId = await downloadAsset(objectUrl);
      
      if (assetId) {
        setUploadProgress(prev => ({
          ...prev,
          [fileId]: { progress: 100, status: 'completed' }
        }));
        
        // Clean up object URL
        URL.revokeObjectURL(objectUrl);
        
        // Remove from upload progress after a delay
        setTimeout(() => {
          setUploadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[fileId];
            return newProgress;
          });
        }, 3000);
        
        return assetId;
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      setUploadProgress(prev => ({
        ...prev,
        [fileId]: { progress: 0, status: 'failed' }
      }));
      console.error('Failed to upload asset:', error);
      return null;
    }
  }, [downloadAsset]);

  const cancelUpload = useCallback((fileId: string): void => {
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[fileId];
      return newProgress;
    });
  }, []);

  return {
    // State
    ...state,
    uploadProgress,
    
    // Methods
    initialize,
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
    calculateHash,
    refreshStats,
    
    // Enhanced methods for AssetManager component
    performCleanup,
    getAssetList,
    formatFileSize,
    getCacheUsagePercentage,
    uploadAsset,
    cancelUpload,
    
    // Direct access to manager (use carefully)
    assetManager: assetManagerRef.current,
  };
};

export default useAssetManager;
