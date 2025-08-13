import { useCallback, useEffect, useRef, useState } from 'react';
import init, { AssetManager } from '../../pkg/ttrpg_rust_core';

export interface AssetInfo {
  id: string;
  name: string;
  url: string;
  hash: string;
  size: number;
  mime_type: string;
  cached_at: number;
  last_accessed: number;
}

export interface CacheStats {
  total_assets: number;
  total_size: number;
  cache_hits: number;
  cache_misses: number;
  last_cleanup: number;
}

export const useAssetManager = () => {
  const [assetManager, setAssetManager] = useState<AssetManager | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [assets, setAssets] = useState<string[]>([]);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initializeAssetManager = async () => {
      try {
        await init();
        const manager = new AssetManager();
        manager.initialize();
        setAssetManager(manager);
        setIsInitialized(true);
        console.log('Asset Manager initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Asset Manager:', error);
      }
    };

    initializeAssetManager();
  }, []);

  const refreshStats = useCallback(() => {
    if (!assetManager) return;
    
    try {
      const statsJson = assetManager.get_cache_stats();
      const stats = JSON.parse(statsJson) as CacheStats;
      setCacheStats(stats);
      
      const assetList = assetManager.list_assets();
      setAssets(assetList);
    } catch (error) {
      console.error('Failed to refresh asset stats:', error);
    }
  }, [assetManager]);

  useEffect(() => {
    if (isInitialized) {
      refreshStats();
    }
  }, [isInitialized, refreshStats]);

  const cacheAsset = useCallback(async (
    assetInfo: Omit<AssetInfo, 'hash' | 'cached_at' | 'last_accessed'>,
    data: Uint8Array
  ): Promise<boolean> => {
    if (!assetManager) return false;

    try {
      const fullAssetInfo: AssetInfo = {
        ...assetInfo,
        hash: '', // Will be computed by Rust
        cached_at: Date.now(),
        last_accessed: Date.now()
      };

      assetManager.cache_asset(JSON.stringify(fullAssetInfo), data);
      refreshStats();
      return true;
    } catch (error) {
      console.error('Failed to cache asset:', error);
      return false;
    }
  }, [assetManager, refreshStats]);

  const getAsset = useCallback((assetId: string): Uint8Array | null => {
    if (!assetManager) return null;

    try {
      const data = assetManager.get_asset_data(assetId);
      refreshStats(); // Update stats for cache hit/miss
      return data || null;
    } catch (error) {
      console.error('Failed to get asset:', error);
      return null;
    }
  }, [assetManager, refreshStats]);

  const getAssetInfo = useCallback((assetId: string): AssetInfo | null => {
    if (!assetManager) return null;

    try {
      const infoJson = assetManager.get_asset_info(assetId);
      return infoJson ? JSON.parse(infoJson) : null;
    } catch (error) {
      console.error('Failed to get asset info:', error);
      return null;
    }
  }, [assetManager]);

  const hasAsset = useCallback((assetId: string): boolean => {
    if (!assetManager) return false;
    return assetManager.has_asset(assetId);
  }, [assetManager]);

  const removeAsset = useCallback((assetId: string): boolean => {
    if (!assetManager) return false;

    try {
      const success = assetManager.remove_asset(assetId);
      if (success) {
        refreshStats();
      }
      return success;
    } catch (error) {
      console.error('Failed to remove asset:', error);
      return false;
    }
  }, [assetManager, refreshStats]);

  const cleanupCache = useCallback((): boolean => {
    if (!assetManager) return false;

    try {
      assetManager.cleanup_cache();
      refreshStats();
      return true;
    } catch (error) {
      console.error('Failed to cleanup cache:', error);
      return false;
    }
  }, [assetManager, refreshStats]);

  const clearCache = useCallback(() => {
    if (!assetManager) return;

    try {
      assetManager.clear_cache();
      refreshStats();
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }, [assetManager, refreshStats]);

  const setCacheLimits = useCallback((maxSizeMB: number, maxAgeHours: number) => {
    if (!assetManager) return;

    try {
      assetManager.set_cache_limits(maxSizeMB, maxAgeHours);
    } catch (error) {
      console.error('Failed to set cache limits:', error);
    }
  }, [assetManager]);

  // Helper for loading assets from URLs
  const loadAssetFromUrl = useCallback(async (
    id: string,
    name: string,
    url: string,
    mimeType?: string
  ): Promise<boolean> => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch asset: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      const assetInfo = {
        id,
        name,
        url,
        size: data.length,
        mime_type: mimeType || response.headers.get('content-type') || 'application/octet-stream'
      };

      return await cacheAsset(assetInfo, data);
    } catch (error) {
      console.error('Failed to load asset from URL:', error);
      return false;
    }
  }, [cacheAsset]);

  return {
    isInitialized,
    cacheStats,
    assets,
    cacheAsset,
    getAsset,
    getAssetInfo,
    hasAsset,
    removeAsset,
    cleanupCache,
    clearCache,
    setCacheLimits,
    loadAssetFromUrl,
    refreshStats
  };
};
