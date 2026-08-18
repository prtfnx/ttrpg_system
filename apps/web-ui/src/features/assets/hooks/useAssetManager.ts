import { useWasmRuntime, type AssetCacheStats, type AssetInfo } from '@lib/wasm/runtime';
import { logger } from '@shared/utils/logger';
import { useCallback, useEffect, useRef, useState } from 'react';

export type CacheStats = AssetCacheStats;
export type { AssetInfo };

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
  const runtime = useWasmRuntime();
  const initializationRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);
  const [state, setState] = useState<AssetManagerState>({
    stats: null,
    isInitialized: false,
    error: null,
    isLoading: false,
  });
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({});

  const safeSetState = useCallback((updater: React.SetStateAction<AssetManagerState>) => {
    if (isMountedRef.current) setState(updater);
  }, []);

  const safeSetUploadProgress = useCallback((updater: React.SetStateAction<UploadProgress>) => {
    if (isMountedRef.current) setUploadProgress(updater);
  }, []);

  const refreshStats = useCallback((): void => {
    try {
      safeSetState(previous => ({ ...previous, stats: runtime.getAssetCacheStats() }));
    } catch {
      // Initialization owns the visible error state; pre-init reads are harmless.
    }
  }, [runtime, safeSetState]);

  const initialize = useCallback(async () => {
    if (initializationRef.current) return initializationRef.current;

    safeSetState(previous => ({ ...previous, isLoading: true }));
    const pending = (async () => {
      try {
        await runtime.initialize();
        runtime.configureAssetCache({
          maxCacheBytes: config?.maxCacheSizeMB
            ? config.maxCacheSizeMB * 1024 * 1024
            : undefined,
          maxAgeMs: config?.maxAgeHours
            ? config.maxAgeHours * 60 * 60 * 1000
            : undefined,
        });
        if (config?.autoCleanup) runtime.cleanupAssetCache();
        safeSetState({
          stats: runtime.getAssetCacheStats(),
          isInitialized: true,
          error: null,
          isLoading: false,
        });
      } catch (error) {
        logger.error('Failed to initialize browser asset cache', error);
        safeSetState(previous => ({
          ...previous,
          isInitialized: false,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
        throw error;
      }
    })();
    initializationRef.current = pending;
    try {
      await pending;
    } finally {
      initializationRef.current = null;
    }
  }, [config?.autoCleanup, config?.maxAgeHours, config?.maxCacheSizeMB, runtime, safeSetState]);

  const downloadAsset = useCallback(async (
    url: string,
    expectedHash?: string,
  ): Promise<string | null> => {
    try {
      const assetId = await runtime.downloadAsset(url, expectedHash);
      refreshStats();
      return assetId;
    } catch (error) {
      logger.error('Failed to download asset', error);
      safeSetState(previous => ({
        ...previous,
        error: error instanceof Error ? error.message : 'Download failed',
      }));
      refreshStats();
      return null;
    }
  }, [refreshStats, runtime, safeSetState]);

  const getAssetInfo = useCallback((assetId: string): AssetInfo | null => {
    try {
      const info = runtime.getAssetInfo(assetId);
      refreshStats();
      return info;
    } catch (error) {
      logger.error('Failed to get asset info', error);
      return null;
    }
  }, [refreshStats, runtime]);

  const hasAsset = useCallback((assetId: string): boolean => {
    try {
      return runtime.hasAsset(assetId);
    } catch {
      return false;
    }
  }, [runtime]);

  const hasAssetByHash = useCallback((xxhash: string): boolean => {
    try {
      return runtime.hasAssetByHash(xxhash);
    } catch {
      return false;
    }
  }, [runtime]);

  const getAssetByHash = useCallback((xxhash: string): string | null => {
    try {
      const assetId = runtime.getAssetByHash(xxhash);
      refreshStats();
      return assetId;
    } catch {
      return null;
    }
  }, [refreshStats, runtime]);

  const removeAsset = useCallback((assetId: string): boolean => {
    try {
      const removed = runtime.removeAsset(assetId);
      refreshStats();
      return removed;
    } catch (error) {
      logger.error('Failed to remove asset', error);
      return false;
    }
  }, [refreshStats, runtime]);

  const cleanupCache = useCallback(async (): Promise<void> => {
    runtime.cleanupAssetCache();
    refreshStats();
  }, [refreshStats, runtime]);

  const clearCache = useCallback(async (): Promise<void> => {
    runtime.clearAssetCache();
    refreshStats();
  }, [refreshStats, runtime]);

  const listAssets = useCallback((): AssetInfo[] => {
    try {
      return runtime.listAssets();
    } catch {
      return [];
    }
  }, [runtime]);

  const setCacheSize = useCallback((sizeBytes: number): void => {
    runtime.configureAssetCache({ maxCacheBytes: sizeBytes });
    refreshStats();
  }, [refreshStats, runtime]);

  const setMaxAge = useCallback((ageMs: number): void => {
    runtime.configureAssetCache({ maxAgeMs: ageMs });
    refreshStats();
  }, [refreshStats, runtime]);

  const calculateHash = useCallback((data: Uint8Array): string => {
    try {
      return runtime.calculateAssetHash(data);
    } catch (error) {
      logger.error('Failed to calculate asset hash', error);
      return '';
    }
  }, [runtime]);

  useEffect(() => {
    isMountedRef.current = true;
    void initialize().catch(() => undefined);
    return () => {
      isMountedRef.current = false;
    };
  }, [initialize]);

  const performCleanup = useCallback(async (): Promise<void> => {
    await cleanupCache();
  }, [cleanupCache]);

  const getAssetList = useCallback((): string[] => (
    listAssets().map(asset => asset.id)
  ), [listAssets]);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const unit = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const index = Math.floor(Math.log(bytes) / Math.log(unit));
    return `${parseFloat((bytes / unit ** index).toFixed(1))} ${sizes[index]}`;
  }, []);

  const getCacheUsagePercentage = useCallback((): number => {
    if (!state.stats || !config?.maxCacheSizeMB) return 0;
    const maxSize = config.maxCacheSizeMB * 1024 * 1024;
    return Math.round((state.stats.total_size / maxSize) * 100);
  }, [config?.maxCacheSizeMB, state.stats]);

  const uploadAsset = useCallback(async (
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<string | null> => {
    const fileId = `${file.name}-${Date.now()}`;
    safeSetUploadProgress(previous => ({
      ...previous,
      [fileId]: { progress: 0, status: 'uploading' },
    }));
    try {
      onProgress?.(25);
      const data = new Uint8Array(await file.arrayBuffer());
      onProgress?.(75);
      const assetId = runtime.cacheAssetBytes(data, {
        name: file.name,
        mimeType: file.type,
      });
      safeSetUploadProgress(previous => ({
        ...previous,
        [fileId]: { progress: 100, status: 'completed' },
      }));
      onProgress?.(100);
      refreshStats();
      return assetId;
    } catch (error) {
      safeSetUploadProgress(previous => ({
        ...previous,
        [fileId]: { progress: 0, status: 'failed' },
      }));
      logger.error('Failed to cache local asset', error);
      return null;
    }
  }, [refreshStats, runtime, safeSetUploadProgress]);

  const cancelUpload = useCallback((fileId: string): void => {
    safeSetUploadProgress(previous => {
      const next = { ...previous };
      delete next[fileId];
      return next;
    });
  }, [safeSetUploadProgress]);

  return {
    ...state,
    uploadProgress,
    initialize,
    downloadAsset,
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
    performCleanup,
    getAssetList,
    formatFileSize,
    getCacheUsagePercentage,
    uploadAsset,
    cancelUpload,
  };
};

export default useAssetManager;
