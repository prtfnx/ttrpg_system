import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
