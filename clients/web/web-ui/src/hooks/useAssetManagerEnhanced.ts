import { useCallback, useEffect, useRef, useState } from 'react';
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
}

export const useAssetManagerEnhanced = () => {
  const assetManagerRef = useRef<AssetManager | null>(null);
  const [state, setState] = useState<AssetManagerState>({
    stats: null,
    isInitialized: false,
    error: null,
  });

  // Initialize the asset manager
  const initialize = useCallback(async () => {
    try {
      console.log('Initializing Enhanced Asset Manager...');
      const manager = new AssetManager();
      await manager.initialize();
      
      assetManagerRef.current = manager;
      
      // Get initial stats
      const stats = JSON.parse(manager.get_cache_stats()) as CacheStats;
      
      setState({
        stats,
        isInitialized: true,
        error: null,
      });
      
      console.log('Enhanced Asset Manager initialized successfully', stats);
    } catch (error) {
      console.error('Failed to initialize Enhanced Asset Manager:', error);
      setState(prev => ({
        ...prev,
        isInitialized: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, []);

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

  return {
    // State
    ...state,
    
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
    
    // Direct access to manager (use carefully)
    assetManager: assetManagerRef.current,
  };
};

export default useAssetManagerEnhanced;
