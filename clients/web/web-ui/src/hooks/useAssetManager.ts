import { useCallback, useEffect, useRef, useState } from 'react';

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

export interface UploadProgress {
  asset_id: string;
  progress: number;
  status: 'uploading' | 'completed' | 'failed' | 'cancelled';
}

export interface AssetManagerState {
  stats: CacheStats;
  uploadProgress: Map<string, UploadProgress>;
  isLoading: boolean;
  error: string | null;
}

export interface UseAssetManagerOptions {
  maxCacheSizeMB?: number;
  maxAgeHours?: number;
  autoCleanup?: boolean;
  cleanupIntervalMs?: number;
}

export function useAssetManager(options: UseAssetManagerOptions = {}) {
  const {
    maxCacheSizeMB = 100,
    maxAgeHours = 24,
    autoCleanup = true,
    cleanupIntervalMs = 30 * 60 * 1000, // 30 minutes
  } = options;

  const [state, setState] = useState<AssetManagerState>({
    stats: {
      total_assets: 0,
      total_size: 0,
      cache_hits: 0,
      cache_misses: 0,
      last_cleanup: Date.now(),
    },
    uploadProgress: new Map(),
    isLoading: false,
    error: null,
  });

  const assetManagerRef = useRef<any>(null);
  const uploaderRef = useRef<any>(null);
  const cleanupIntervalRef = useRef<number | null>(null);

  // Initialize asset manager
  useEffect(() => {
    const initAssetManager = async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        // Import WASM module dynamically
        const wasmModule = await import('../wasm/ttrpg_rust_core');
        
        // Initialize asset manager
        const assetManager = new wasmModule.AssetManager();
        assetManager.set_cache_limits(BigInt(maxCacheSizeMB), maxAgeHours);
        assetManagerRef.current = assetManager;

        // Initialize uploader
        const uploader = new wasmModule.AssetUploader();
        uploaderRef.current = uploader;

        // Get initial stats
        const statsJson = assetManager.get_cache_stats();
        const stats = JSON.parse(statsJson) as CacheStats;

        setState(prev => ({
          ...prev,
          stats,
          isLoading: false,
        }));

        console.log('Asset manager initialized with cache limits:', {
          maxSizeMB: maxCacheSizeMB,
          maxAgeHours,
        });
      } catch (error) {
        console.error('Failed to initialize asset manager:', error);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to initialize asset manager',
        }));
      }
    };

    initAssetManager();

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, [maxCacheSizeMB, maxAgeHours]);

  // Auto cleanup
  useEffect(() => {
    if (autoCleanup && assetManagerRef.current) {
      cleanupIntervalRef.current = setInterval(() => {
        performCleanup();
      }, cleanupIntervalMs);

      return () => {
        if (cleanupIntervalRef.current) {
          clearInterval(cleanupIntervalRef.current);
        }
      };
    }
  }, [autoCleanup, cleanupIntervalMs]);

  // Update stats helper
  const updateStats = useCallback(() => {
    if (assetManagerRef.current) {
      try {
        const statsJson = assetManagerRef.current.get_cache_stats();
        const stats = JSON.parse(statsJson) as CacheStats;
        setState(prev => ({ ...prev, stats }));
      } catch (error) {
        console.error('Failed to update cache stats:', error);
      }
    }
  }, []);

  // Check if asset is cached
  const isAssetCached = useCallback((assetId: string): boolean => {
    if (!assetManagerRef.current) return false;
    return assetManagerRef.current.is_cached(assetId);
  }, []);

  // Get asset info
  const getAssetInfo = useCallback((assetId: string): AssetInfo | null => {
    if (!assetManagerRef.current) return null;
    
    try {
      const infoJson = assetManagerRef.current.get_asset_info(assetId);
      return infoJson ? JSON.parse(infoJson) : null;
    } catch (error) {
      console.error('Failed to get asset info:', error);
      return null;
    }
  }, []);

  // Get asset data
  const getAssetData = useCallback((assetId: string): Uint8Array | null => {
    if (!assetManagerRef.current) return null;
    
    try {
      const data = assetManagerRef.current.get_asset_data(assetId);
      updateStats();
      return data || null;
    } catch (error) {
      console.error('Failed to get asset data:', error);
      return null;
    }
  }, [updateStats]);

  // Cache asset
  const cacheAsset = useCallback(async (assetInfo: AssetInfo, data: Uint8Array): Promise<boolean> => {
    if (!assetManagerRef.current) return false;

    try {
      const assetInfoJson = JSON.stringify(assetInfo);
      await assetManagerRef.current.cache_asset(assetInfoJson, data);
      updateStats();
      return true;
    } catch (error) {
      console.error('Failed to cache asset:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to cache asset',
      }));
      return false;
    }
  }, [updateStats]);

  // Remove asset
  const removeAsset = useCallback((assetId: string): boolean => {
    if (!assetManagerRef.current) return false;

    try {
      const removed = assetManagerRef.current.remove_asset(assetId);
      if (removed) {
        updateStats();
      }
      return removed;
    } catch (error) {
      console.error('Failed to remove asset:', error);
      return false;
    }
  }, [updateStats]);

  // Perform cleanup
  const performCleanup = useCallback(async (): Promise<void> => {
    if (!assetManagerRef.current) return;

    try {
      await assetManagerRef.current.cleanup_cache();
      updateStats();
      console.log('Cache cleanup completed');
    } catch (error) {
      console.error('Failed to cleanup cache:', error);
    }
  }, [updateStats]);

  // Clear cache
  const clearCache = useCallback(async (): Promise<void> => {
    if (!assetManagerRef.current) return;

    try {
      await assetManagerRef.current.clear_cache();
      updateStats();
      console.log('Cache cleared');
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }, [updateStats]);

  // Preload assets
  const preloadAssets = useCallback(async (assetUrls: string[]): Promise<void> => {
    if (!assetManagerRef.current) return;

    try {
      setState(prev => ({ ...prev, isLoading: true }));
      await assetManagerRef.current.preload_assets(assetUrls);
      updateStats();
    } catch (error) {
      console.error('Failed to preload assets:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to preload assets',
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [updateStats]);

  // Upload asset
  const uploadAsset = useCallback(async (
    assetId: string,
    url: string,
    data: Uint8Array
  ): Promise<boolean> => {
    if (!uploaderRef.current) return false;

    try {
      // Update progress state
      setState(prev => ({
        ...prev,
        uploadProgress: new Map(prev.uploadProgress).set(assetId, {
          asset_id: assetId,
          progress: 0,
          status: 'uploading',
        }),
      }));

      await uploaderRef.current.upload_asset(assetId, url, data);

      // Update progress to completed
      setState(prev => ({
        ...prev,
        uploadProgress: new Map(prev.uploadProgress).set(assetId, {
          asset_id: assetId,
          progress: 100,
          status: 'completed',
        }),
      }));

      return true;
    } catch (error) {
      console.error('Failed to upload asset:', error);
      
      // Update progress to failed
      setState(prev => ({
        ...prev,
        uploadProgress: new Map(prev.uploadProgress).set(assetId, {
          asset_id: assetId,
          progress: 0,
          status: 'failed',
        }),
      }));

      return false;
    }
  }, []);

  // Cancel upload
  const cancelUpload = useCallback((assetId: string): boolean => {
    if (!uploaderRef.current) return false;

    try {
      const cancelled = uploaderRef.current.cancel_upload(assetId);
      if (cancelled) {
        setState(prev => ({
          ...prev,
          uploadProgress: new Map(prev.uploadProgress).set(assetId, {
            asset_id: assetId,
            progress: 0,
            status: 'cancelled',
          }),
        }));
      }
      return cancelled;
    } catch (error) {
      console.error('Failed to cancel upload:', error);
      return false;
    }
  }, []);

  // Get asset list
  const getAssetList = useCallback((): string[] => {
    if (!assetManagerRef.current) return [];
    
    try {
      return assetManagerRef.current.get_asset_list();
    } catch (error) {
      console.error('Failed to get asset list:', error);
      return [];
    }
  }, []);

  // Export cache
  const exportCache = useCallback((): string | null => {
    if (!assetManagerRef.current) return null;
    
    try {
      return assetManagerRef.current.export_cache();
    } catch (error) {
      console.error('Failed to export cache:', error);
      return null;
    }
  }, []);

  // Import cache
  const importCache = useCallback(async (cacheJson: string): Promise<boolean> => {
    if (!assetManagerRef.current) return false;

    try {
      await assetManagerRef.current.import_cache(cacheJson);
      updateStats();
      return true;
    } catch (error) {
      console.error('Failed to import cache:', error);
      return false;
    }
  }, [updateStats]);

  // Utility function to format file size
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }, []);

  // Calculate cache usage percentage
  const getCacheUsagePercentage = useCallback((): number => {
    const maxBytes = maxCacheSizeMB * 1024 * 1024;
    return Math.round((state.stats.total_size / maxBytes) * 100);
  }, [state.stats.total_size, maxCacheSizeMB]);

  return {
    // State
    stats: state.stats,
    uploadProgress: state.uploadProgress,
    isLoading: state.isLoading,
    error: state.error,

    // Asset operations
    isAssetCached,
    getAssetInfo,
    getAssetData,
    cacheAsset,
    removeAsset,
    getAssetList,

    // Cache management
    performCleanup,
    clearCache,
    preloadAssets,
    exportCache,
    importCache,

    // Upload operations
    uploadAsset,
    cancelUpload,

    // Utilities
    formatFileSize,
    getCacheUsagePercentage,
  };
}
