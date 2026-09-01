import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assetIntegrationService } from '../assetIntegration.service';

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
});

afterEach(() => {
  assetIntegrationService.dispose();
  vi.unstubAllGlobals();
});

describe('AssetIntegrationService', () => {
  describe('initialize / dispose', () => {
    it('adds asset event listeners on initialize', () => {
      const spy = vi.spyOn(window, 'addEventListener');
      assetIntegrationService.initialize();
      const calls = spy.mock.calls.map(c => c[0]);
      expect(calls).toContain('asset-list-updated');
      expect(calls).toContain('asset-upload-response');
      expect(calls).toContain('asset-uploaded');
      expect(calls).toContain('asset-upload-completed');
    });

    it('dispose removes all registered listeners', () => {
      const spy = vi.spyOn(window, 'removeEventListener');
      assetIntegrationService.setProtocol({ sendMessage: vi.fn() } as never);
      assetIntegrationService.initialize();
      assetIntegrationService.dispose();
      expect((assetIntegrationService as Svc)['eventListeners']).toHaveLength(0);
      expect((assetIntegrationService as Svc)['protocol']).toBeNull();
      expect(spy).toHaveBeenCalledTimes(4);
    });

    it('dispose is safe when called without initialize', () => {
      expect(() => assetIntegrationService.dispose()).not.toThrow();
    });

    it('does not register duplicate listeners when initialized twice', () => {
      assetIntegrationService.initialize();
      assetIntegrationService.initialize();
      const refreshed: CustomEvent[] = [];
      window.addEventListener('asset-manager-refresh', e => refreshed.push(e as CustomEvent), {
        once: true,
      });

      dispatch('asset-list-updated', { success: true, assets: [] });

      expect(refreshed).toHaveLength(1);
      expect((assetIntegrationService as Svc)['eventListeners']).toHaveLength(4);
    });
  });

  describe('setProtocol', () => {
    it('stores the protocol reference', () => {
      const proto = { sendMessage: vi.fn() };
      assetIntegrationService.setProtocol(proto as never);
      expect((assetIntegrationService as Svc)['protocol']).toBe(proto);
    });

    it('clears a disconnected protocol reference', () => {
      assetIntegrationService.setProtocol({ sendMessage: vi.fn() } as never);
      assetIntegrationService.setProtocol(null);
      expect((assetIntegrationService as Svc)['protocol']).toBeNull();
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
      expect(d.content_type).toBe('image/png');
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

    it('dispatches asset-upload-ready from canonical asset-uploaded event with upload_url', () => {
      assetIntegrationService.initialize();
      const ready: CustomEvent[] = [];
      window.addEventListener('asset-upload-ready', e => ready.push(e as CustomEvent));
      dispatch('asset-uploaded', { success: true, asset_id: 'a1', upload_url: 'https://s3.example/upload' });
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

    it('confirms failed uploads so the server can release their reservation', () => {
      assetIntegrationService.initialize();
      const proto = { sendMessage: vi.fn() };
      assetIntegrationService.setProtocol(proto as never);
      dispatch('asset-upload-completed', { asset_id: 'a2', success: false, error: 'upload error' });
      expect(proto.sendMessage).toHaveBeenCalledTimes(1);
      expect(proto.sendMessage.mock.calls[0][0].data).toMatchObject({
        asset_id: 'a2',
        success: false,
        error: 'upload error',
      });
    });

    it('does not throw when protocol is null and upload succeeds', () => {
      assetIntegrationService.initialize();
      expect(() => dispatch('asset-upload-completed', { asset_id: 'a3', success: true })).not.toThrow();
    });
  });

});
