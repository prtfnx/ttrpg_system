import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetSyncService } from '../assetSync.service';

const mockEngine = {
  load_texture: vi.fn(),
  unload_texture: vi.fn(() => true),
};

function makeService(
  engine = mockEngine as unknown,
  resolveDownloadedAsset = vi.fn(async () => 'blob:cached-asset'),
) {
  return new AssetSyncService(() => engine as never, resolveDownloadedAsset);
}

function dispatch(type: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

beforeEach(() => vi.clearAllMocks());

describe('AssetSyncService', () => {
  describe('init / dispose', () => {
    it('removes listeners after dispose', () => {
      const svc = makeService();
      svc.init();
      svc.dispose();
      dispatch('asset-downloaded', { success: true, asset_id: 'a1', download_url: 'http://x/a.png' });
      // No error thrown — handlers not called
    });
  });

  describe('isAssetPending / trackPendingSprite', () => {
    it('returns false for unknown asset', () => {
      const svc = makeService();
      expect(svc.isAssetPending('a1')).toBe(false);
    });

    it('returns true after asset-upload-started event', () => {
      const svc = makeService();
      svc.init();
      dispatch('asset-upload-started', { asset_id: 'a1' });
      expect(svc.isAssetPending('a1')).toBe(true);
      svc.dispose();
    });
  });

  describe('requestAssetDownloadLink', () => {
    it('dispatches request-asset-download event', () => {
      const svc = makeService();
      const events: string[] = [];
      window.addEventListener('request-asset-download', (e) => events.push((e as CustomEvent).detail.asset_id));
      svc.requestAssetDownloadLink('a1', 's1');
      expect(events).toContain('a1');
      window.removeEventListener('request-asset-download', () => {});
    });

    it('suppresses duplicate link requests while the first request is outstanding', () => {
      const svc = makeService();
      const listener = vi.fn();
      window.addEventListener('request-asset-download', listener);

      svc.requestAssetDownloadLink('a1', 's1');
      svc.requestAssetDownloadLink('a1', 's2');

      expect(listener).toHaveBeenCalledTimes(1);
      window.removeEventListener('request-asset-download', listener);
    });
  });

  describe('areTexturesSettled', () => {
    it('stays pending while a requested texture has no response', () => {
      const svc = makeService();

      svc.requestAssetDownloadLink('a1', 's1');

      expect(svc.areTexturesSettled(['a1'])).toBe(false);
      expect(svc.areTexturesSettled([])).toBe(true);
    });

    it('tracks a download request emitted directly by the Rust runtime', () => {
      const svc = makeService();
      svc.init();

      dispatch('request-asset-download', { asset_id: 'rust-requested' });

      expect(svc.areTexturesSettled(['rust-requested'])).toBe(false);
      svc.dispose();
    });

    it('settles download failures unless this browser started an upload', () => {
      const svc = makeService();
      svc.init();
      svc.requestAssetDownloadLink('missing', 's1');
      dispatch('asset-downloaded', {
        success: false,
        asset_id: 'missing',
        requires_upload: true,
        instructions: 'Please upload the asset first',
      });
      expect(svc.areTexturesSettled(['missing'])).toBe(true);

      svc.requestAssetDownloadLink('uploading', 's2');
      dispatch('asset-upload-started', { asset_id: 'uploading' });
      dispatch('asset-downloaded', {
        success: false,
        asset_id: 'uploading',
        requires_upload: true,
        instructions: 'Please upload the asset first',
      });
      expect(svc.areTexturesSettled(['uploading'])).toBe(false);
      svc.dispose();
    });
  });

  describe('handleAssetDownloaded', () => {
    it('does not infer a local upload lifecycle from server instructions', () => {
      const svc = makeService();
      svc.init();
      dispatch('asset-downloaded', {
        success: false,
        asset_id: 'a1',
        requires_upload: true,
        instructions: 'please upload first',
      });
      expect(svc.isAssetPending('a1')).toBe(false);
      svc.dispose();
    });

    it('skips when success is false without upload instructions', () => {
      const svc = makeService();
      svc.init();
      dispatch('asset-downloaded', { success: false, asset_id: 'a1' });
      expect(svc.isAssetPending('a1')).toBe(false);
      svc.dispose();
    });
  });

  describe('handleProtocolSuccess', () => {
    it('retries queued sprites only after the server confirms storage', () => {
      vi.useFakeTimers();
      const requestSpy = vi.spyOn(AssetSyncService.prototype, 'requestAssetDownloadLink');
      const svc = makeService();
      svc.init();
      dispatch('asset-upload-started', { asset_id: 'a1' });
      svc.trackPendingSprite('a1', 's1');
      dispatch('asset-uploaded', { asset_id: 'a1', upload_url: 'https://storage/upload' });
      dispatch('asset-upload-completed', { asset_id: 'a1', success: true });
      vi.runAllTimers();
      expect(requestSpy).not.toHaveBeenCalled();

      dispatch('protocol-success', { asset_id: 'a1', status: 'uploaded' });
      vi.runAllTimers();
      expect(svc.isAssetPending('a1')).toBe(false);
      expect(requestSpy).toHaveBeenCalledWith('a1', 's1');
      vi.useRealTimers();
      svc.dispose();
    });

    it('settles a failed upload without scheduling a download retry', () => {
      vi.useFakeTimers();
      const requestSpy = vi.spyOn(AssetSyncService.prototype, 'requestAssetDownloadLink');
      const svc = makeService();
      svc.init();
      dispatch('asset-upload-started', { asset_id: 'a1' });
      svc.trackPendingSprite('a1', 's1');
      dispatch('protocol-success', { asset_id: 'a1', status: 'failed', message: 'Upload failure recorded' });
      vi.runAllTimers();
      expect(svc.isAssetPending('a1')).toBe(false);
      expect(requestSpy).not.toHaveBeenCalled();
      vi.useRealTimers();
      svc.dispose();
    });
  });

  describe('requestAssetDownloadLink - already loaded', () => {
    it('skips dispatch when assetId already in loadedTextureIds', () => {
      const svc = makeService();
      const events: string[] = [];
      window.addEventListener('request-asset-download', (e) => events.push((e as CustomEvent).detail.asset_id));
      // Pre-load the asset
      (svc as unknown as Record<string, Set<string>>).loadedTextureIds.add('a-loaded');
      svc.requestAssetDownloadLink('a-loaded', 's1');
      expect(events).not.toContain('a-loaded');
      window.removeEventListener('request-asset-download', () => {});
    });
  });

  describe('releaseTexturesExcept', () => {
    it('unloads obsolete GPU textures and permits a later reload', () => {
      const svc = makeService();
      const loaded = (svc as unknown as Record<string, Set<string>>).loadedTextureIds;
      loaded.add('old-map');
      loaded.add('shared-token');

      svc.releaseTexturesExcept(['shared-token', 'new-map']);

      expect(mockEngine.unload_texture).toHaveBeenCalledWith('old-map');
      expect(mockEngine.unload_texture).not.toHaveBeenCalledWith('shared-token');
      expect(loaded.has('old-map')).toBe(false);
    });

    it('unloads a superseded texture that finishes after a table switch', async () => {
      let finishDownload!: (url: string) => void;
      const resolveDownloadedAsset = vi.fn(() => new Promise<string>(resolve => {
        finishDownload = resolve;
      }));
      const svc = makeService(mockEngine, resolveDownloadedAsset);
      vi.spyOn(svc, 'loadTextureFromUrl').mockResolvedValue(undefined);
      svc.init();
      dispatch('asset-downloaded', { success: true, asset_id: 'old-map', download_url: 'http://x/old.png' });

      svc.releaseTexturesExcept(['new-map']);
      finishDownload('blob:old-map');
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockEngine.unload_texture).toHaveBeenCalledWith('old-map');
      expect(svc.areTexturesSettled(['old-map'])).toBe(true);
      svc.dispose();
    });
  });

  describe('handleAssetDownloaded - success path', () => {
    it('verifies and caches a download before loading its Blob URL', async () => {
      const resolveDownloadedAsset = vi.fn(async () => 'blob:verified-a2');
      const svc = makeService(mockEngine, resolveDownloadedAsset);
      const loadSpy = vi.spyOn(svc, 'loadTextureFromUrl').mockResolvedValue(undefined);
      svc.init();
      dispatch('asset-downloaded', {
        success: true,
        asset_id: 'a2',
        download_url: 'http://x/a2.png',
        xxhash: '0123456789abcdef',
      });
      await new Promise(r => setTimeout(r, 0));
      expect(resolveDownloadedAsset).toHaveBeenCalledWith(
        'http://x/a2.png',
        '0123456789abcdef',
      );
      expect(loadSpy).toHaveBeenCalledWith('a2', 'blob:verified-a2', expect.any(Function));
      svc.dispose();
    });

    it('coalesces duplicate download responses for the same asset', async () => {
      let finishDownload!: (url: string) => void;
      const resolveDownloadedAsset = vi.fn(() => new Promise<string>(resolve => {
        finishDownload = resolve;
      }));
      const svc = makeService(mockEngine, resolveDownloadedAsset);
      vi.spyOn(svc, 'loadTextureFromUrl').mockResolvedValue(undefined);
      svc.init();

      const response = { success: true, asset_id: 'a2', download_url: 'http://x/a2.png' };
      dispatch('asset-downloaded', response);
      dispatch('asset-downloaded', response);

      expect(resolveDownloadedAsset).toHaveBeenCalledTimes(1);
      finishDownload('blob:verified-a2');
      await new Promise(r => setTimeout(r, 0));
      svc.dispose();
    });

    it('skips loadTextureFromUrl when asset already loaded', async () => {
      const svc = makeService();
      const loadSpy = vi.spyOn(svc, 'loadTextureFromUrl').mockResolvedValue(undefined);
      (svc as unknown as Record<string, Set<string>>).loadedTextureIds.add('a3');
      svc.init();
      dispatch('asset-downloaded', { success: true, asset_id: 'a3', download_url: 'http://x/a3.png' });
      await new Promise(r => setTimeout(r, 0));
      expect(loadSpy).not.toHaveBeenCalled();
      svc.dispose();
    });

    it('clears engine-scoped loaded state on dispose', () => {
      const svc = makeService();
      const listener = vi.fn();
      window.addEventListener('request-asset-download', listener);
      (svc as unknown as Record<string, Set<string>>).loadedTextureIds.add('a3');

      svc.dispose();
      svc.requestAssetDownloadLink('a3', 's1');

      expect(listener).toHaveBeenCalledOnce();
      window.removeEventListener('request-asset-download', listener);
    });
  });

  describe('loadTextureFromUrl', () => {
    it('returns early when engine is null', async () => {
      const svc = makeService(null);
      await expect(svc.loadTextureFromUrl('a1', 'http://x/a.png')).resolves.toBeUndefined();
    });

    it('calls engine.load_texture when image loads', async () => {
      const load_texture = vi.fn();
      const engine = { load_texture };
      const svc = makeService(engine);

      // Mock Image constructor — trigger onload synchronously on src set
      class MockImage {
        crossOrigin = '';
        onload: (() => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        set src(_v: string) {
          setTimeout(() => this.onload?.(), 0);
        }
      }
      vi.stubGlobal('Image', MockImage);

      await svc.loadTextureFromUrl('a1', 'http://x/a.png');
      expect(load_texture).toHaveBeenCalledWith('a1', expect.any(MockImage));
      vi.unstubAllGlobals();
    });

    it('rejects when image fails to load', async () => {
      const svc = makeService(mockEngine);

      class MockImageError {
        crossOrigin = '';
        onload: (() => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        set src(_v: string) {
          setTimeout(() => this.onerror?.(new Error('load failed')), 0);
        }
      }
      vi.stubGlobal('Image', MockImageError);

      await expect(svc.loadTextureFromUrl('a1', 'http://x/a.png')).rejects.toBeDefined();
      vi.unstubAllGlobals();
    });

    it('sets crossOrigin to anonymous for non-blob URLs', async () => {
      const svc = makeService(mockEngine);
      let capturedCrossOrigin = '';

      class MockImageCrossOrigin {
        set crossOrigin(v: string) { capturedCrossOrigin = v; }
        onload: (() => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        set src(_v: string) {
          setTimeout(() => this.onload?.(), 0);
        }
      }
      vi.stubGlobal('Image', MockImageCrossOrigin);

      await svc.loadTextureFromUrl('a1', 'http://x/a.png');
      expect(capturedCrossOrigin).toBe('anonymous');
      vi.unstubAllGlobals();
    });

    it('handles local-texture-ready event', async () => {
      const svc = makeService();
      const loadSpy = vi.spyOn(svc, 'loadTextureFromUrl').mockResolvedValue(undefined);
      svc.init();
      dispatch('local-texture-ready', { asset_id: 'a4', url: 'blob:http://x/a4' });
      await new Promise(r => setTimeout(r, 0));
      expect(loadSpy).toHaveBeenCalledWith('a4', 'blob:http://x/a4', expect.any(Function));
      svc.dispose();
    });
  });
});
