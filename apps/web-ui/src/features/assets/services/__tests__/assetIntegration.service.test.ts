import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assetIntegrationService } from '../assetIntegration.service';

const mockGetCurrentWasmRuntime = vi.hoisted(() => vi.fn());

vi.mock('@lib/wasm/runtime', () => ({
  getCurrentWasmRuntime: mockGetCurrentWasmRuntime,
}));

type Svc = typeof assetIntegrationService & Record<string, unknown>;

function resetSvc() {
  const s = assetIntegrationService as Svc;
  s['protocol'] = null;
  s['eventListeners'] = [];
}

function dispatch(type: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

beforeEach(() => {
  resetSvc();
  vi.clearAllMocks();
  mockGetCurrentWasmRuntime.mockReturnValue(null);
});

afterEach(() => {
  assetIntegrationService.dispose();
  vi.unstubAllGlobals();
});

describe('AssetIntegrationService', () => {
  describe('initialize / dispose', () => {
    it('adds 4 event listeners on initialize', () => {
      const spy = vi.spyOn(window, 'addEventListener');
      assetIntegrationService.initialize();
      const calls = spy.mock.calls.map(c => c[0]);
      expect(calls).toContain('asset-downloaded');
      expect(calls).toContain('asset-list-updated');
      expect(calls).toContain('asset-upload-response');
      expect(calls).toContain('asset-upload-completed');
    });

    it('dispose removes all registered listeners', () => {
      const spy = vi.spyOn(window, 'removeEventListener');
      assetIntegrationService.initialize();
      assetIntegrationService.dispose();
      expect((assetIntegrationService as Svc)['eventListeners']).toHaveLength(0);
      expect(spy).toHaveBeenCalledTimes(4);
    });

    it('dispose is safe when called without initialize', () => {
      expect(() => assetIntegrationService.dispose()).not.toThrow();
    });
  });

  describe('setProtocol', () => {
    it('stores the protocol reference', () => {
      const proto = { sendMessage: vi.fn() };
      assetIntegrationService.setProtocol(proto as never);
      expect((assetIntegrationService as Svc)['protocol']).toBe(proto);
    });
  });

  describe('requestAssetDownload', () => {
    it('dispatches protocol-send-message with ASSET_DOWNLOAD_REQUEST', () => {
      const received: CustomEvent[] = [];
      window.addEventListener('protocol-send-message', e => received.push(e as CustomEvent));
      assetIntegrationService.requestAssetDownload('asset-abc');
      expect(received).toHaveLength(1);
      expect(received[0].detail.type).toBe('ASSET_DOWNLOAD_REQUEST');
      expect(received[0].detail.data.asset_id).toBe('asset-abc');
    });
  });

  describe('requestAssetUpload', () => {
    it('dispatches protocol-send-message with ASSET_UPLOAD_REQUEST', () => {
      const received: CustomEvent[] = [];
      window.addEventListener('protocol-send-message', e => received.push(e as CustomEvent));
      assetIntegrationService.requestAssetUpload('sprite.png', 2048, 'image/png');
      expect(received).toHaveLength(1);
      expect(received[0].detail.type).toBe('ASSET_UPLOAD_REQUEST');
      const d = received[0].detail.data;
      expect(d.filename).toBe('sprite.png');
      expect(d.file_size).toBe(2048);
      expect(d.file_type).toBe('image/png');
    });
  });

  describe('requestAssetList', () => {
    it('dispatches protocol-send-message with ASSET_LIST_REQUEST', () => {
      const received: CustomEvent[] = [];
      window.addEventListener('protocol-send-message', e => received.push(e as CustomEvent));
      assetIntegrationService.requestAssetList();
      expect(received).toHaveLength(1);
      expect(received[0].detail.type).toBe('ASSET_LIST_REQUEST');
    });
  });

  describe('handleAssetListUpdated (via event)', () => {
    it('dispatches asset-manager-refresh when success=true with assets', () => {
      assetIntegrationService.initialize();
      const refreshed: CustomEvent[] = [];
      window.addEventListener('asset-manager-refresh', e => refreshed.push(e as CustomEvent));
      dispatch('asset-list-updated', { success: true, assets: [{ id: '1', name: 'img.png', size: 100, type: 'image/png', created_at: '' }] });
      expect(refreshed).toHaveLength(1);
      expect(refreshed[0].detail.assets).toHaveLength(1);
    });

    it('does not dispatch asset-manager-refresh when success=false', () => {
      assetIntegrationService.initialize();
      const refreshed: CustomEvent[] = [];
      window.addEventListener('asset-manager-refresh', e => refreshed.push(e as CustomEvent));
      dispatch('asset-list-updated', { success: false, error: 'not found' });
      expect(refreshed).toHaveLength(0);
    });

    it('does not dispatch asset-manager-refresh when assets array is absent', () => {
      assetIntegrationService.initialize();
      const refreshed: CustomEvent[] = [];
      window.addEventListener('asset-manager-refresh', e => refreshed.push(e as CustomEvent));
      dispatch('asset-list-updated', { success: true });
      expect(refreshed).toHaveLength(0);
    });
  });

  describe('handleAssetUploadResponse (via event)', () => {
    it('dispatches asset-upload-ready when success=true with presigned_url', () => {
      assetIntegrationService.initialize();
      const ready: CustomEvent[] = [];
      window.addEventListener('asset-upload-ready', e => ready.push(e as CustomEvent));
      dispatch('asset-upload-response', { success: true, asset_id: 'a1', presigned_url: 'https://s3.example/upload' });
      expect(ready).toHaveLength(1);
      expect(ready[0].detail.asset_id).toBe('a1');
      expect(ready[0].detail.upload_url).toBe('https://s3.example/upload');
    });

    it('dispatches asset-upload-failed when success=false', () => {
      assetIntegrationService.initialize();
      const failed: CustomEvent[] = [];
      window.addEventListener('asset-upload-failed', e => failed.push(e as CustomEvent));
      dispatch('asset-upload-response', { success: false, error: 'denied' });
      expect(failed).toHaveLength(1);
      expect(failed[0].detail.error).toBe('denied');
    });

    it('does not dispatch asset-upload-ready when presigned_url is missing', () => {
      assetIntegrationService.initialize();
      const ready: CustomEvent[] = [];
      window.addEventListener('asset-upload-ready', e => ready.push(e as CustomEvent));
      dispatch('asset-upload-response', { success: true, asset_id: 'a1' });
      expect(ready).toHaveLength(0);
    });
  });

  describe('handleAssetUploadCompleted (via event)', () => {
    it('sends ASSET_UPLOAD_CONFIRM via protocol when success=true', () => {
      assetIntegrationService.initialize();
      const proto = { sendMessage: vi.fn() };
      assetIntegrationService.setProtocol(proto as never);
      dispatch('asset-upload-completed', { asset_id: 'a2', success: true, file_size: 1024, content_type: 'image/png' });
      expect(proto.sendMessage).toHaveBeenCalledTimes(1);
      const msg = proto.sendMessage.mock.calls[0][0];
      expect(msg.data.asset_id).toBe('a2');
      expect(msg.data.success).toBe(true);
    });

    it('does not call protocol when success=false', () => {
      assetIntegrationService.initialize();
      const proto = { sendMessage: vi.fn() };
      assetIntegrationService.setProtocol(proto as never);
      dispatch('asset-upload-completed', { asset_id: 'a2', success: false, error: 'upload error' });
      expect(proto.sendMessage).not.toHaveBeenCalled();
    });

    it('does not throw when protocol is null and upload succeeds', () => {
      assetIntegrationService.initialize();
      expect(() => dispatch('asset-upload-completed', { asset_id: 'a3', success: true })).not.toThrow();
    });
  });

  describe('handleAssetDownloaded (via event)', () => {
    it('calls fetch when download_url + asset_id are provided', async () => {
      assetIntegrationService.initialize();

      const mockBlob = new Blob(['img'], { type: 'image/png' });
      const mockResponse = { ok: true, blob: vi.fn().mockResolvedValue(mockBlob) };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as never);

      // Mock URL.createObjectURL
      const urlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');

      dispatch('asset-downloaded', { success: true, asset_id: 'img1', download_url: 'https://cdn.example/img1.png' });

      // Flush microtasks so the async handler reaches fetch()
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchSpy).toHaveBeenCalledWith('https://cdn.example/img1.png');
      urlSpy.mockRestore();
      fetchSpy.mockRestore();
    });

    it('does not fetch when success=false', async () => {
      assetIntegrationService.initialize();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, blob: vi.fn() } as never);

      dispatch('asset-downloaded', { success: false, error: 'not found' });
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('handles fetch failure gracefully', async () => {
      assetIntegrationService.initialize();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

      expect(() => dispatch('asset-downloaded', { success: true, asset_id: 'x', download_url: 'https://bad.url' })).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();

      fetchSpy.mockRestore();
    });

    it('handles asset_data path (base64) without fetch', async () => {
      assetIntegrationService.initialize();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('should not be called'));
      const urlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');

      dispatch('asset-downloaded', { success: true, asset_id: 'b64asset', asset_data: 'iVBORw0KGgo=' });
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchSpy).not.toHaveBeenCalled();
      urlSpy.mockRestore();
      fetchSpy.mockRestore();
    });

    it('loads downloaded asset data into the attached render engine texture cache', async () => {
      const loadTexture = vi.fn();
      mockGetCurrentWasmRuntime.mockReturnValue({
        getRenderEngine: vi.fn(() => ({ load_texture: loadTexture })),
      });
      vi.stubGlobal('Image', class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_: string) {
          setTimeout(() => this.onload?.(), 0);
        }
      });
      assetIntegrationService.initialize();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('should not be called'));
      const urlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');

      dispatch('asset-downloaded', { success: true, asset_id: 'b64asset', asset_data: 'iVBORw0KGgo=' });
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(loadTexture).toHaveBeenCalledWith('b64asset', expect.any(Image));
      urlSpy.mockRestore();
      fetchSpy.mockRestore();
    });
  });

  describe('base64ToBlob (private, via cacheAssetData path)', () => {
    it('handles base64 with data URL prefix gracefully', async () => {
      assetIntegrationService.initialize();
      const urlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');

      dispatch('asset-downloaded', {
        success: true,
        asset_id: 'b64prefixed',
        asset_data: 'data:image/png;base64,iVBORw0KGgo='
      });
      await Promise.resolve();
      await Promise.resolve();

      urlSpy.mockRestore();
    });
  });
});
