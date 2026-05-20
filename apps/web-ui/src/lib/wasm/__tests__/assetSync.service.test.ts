import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetSyncService } from '../assetSync.service';

const mockEngine = {
  load_texture: vi.fn(),
};

function makeService(engine = mockEngine as unknown) {
  return new AssetSyncService(() => engine as never);
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
  });

  describe('handleAssetDownloaded', () => {
    it('adds to pending when instructions include upload', () => {
      const svc = makeService();
      svc.init();
      dispatch('asset-downloaded', { success: false, asset_id: 'a1', instructions: 'please upload first' });
      expect(svc.isAssetPending('a1')).toBe(true);
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
    it('triggers upload handling when status is uploaded', () => {
      vi.useFakeTimers();
      const svc = makeService();
      svc.init();
      dispatch('asset-upload-started', { asset_id: 'a1' });
      dispatch('protocol-success', { asset_id: 'a1', status: 'uploaded' });
      vi.runAllTimers();
      expect(svc.isAssetPending('a1')).toBe(false);
      vi.useRealTimers();
      svc.dispose();
    });
  });

  describe('trackPendingSprite', () => {
    it('queues sprite retry on asset upload', () => {
      vi.useFakeTimers();
      const requestSpy = vi.spyOn(AssetSyncService.prototype, 'requestAssetDownloadLink');
      const svc = makeService();
      svc.init();
      svc.trackPendingSprite('a1', 's1');
      dispatch('asset-uploaded', { asset_id: 'a1' });
      vi.runAllTimers();
      expect(requestSpy).toHaveBeenCalledWith('a1', 's1');
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

  describe('handleAssetDownloaded - success path', () => {
    it('calls loadTextureFromUrl for new asset', async () => {
      const svc = makeService();
      const loadSpy = vi.spyOn(svc, 'loadTextureFromUrl').mockResolvedValue(undefined);
      svc.init();
      dispatch('asset-downloaded', { success: true, asset_id: 'a2', download_url: 'http://x/a2.png' });
      await new Promise(r => setTimeout(r, 0));
      expect(loadSpy).toHaveBeenCalledWith('a2', 'http://x/a2.png');
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
      expect(loadSpy).toHaveBeenCalledWith('a4', 'blob:http://x/a4');
      svc.dispose();
    });
  });
});
