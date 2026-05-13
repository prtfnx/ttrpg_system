import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteSyncService } from '../remoteSync.service';

const mockSpriteSync = {
  updateSpritePosition: vi.fn(),
  resizeSpriteInWasm: vi.fn(),
  updateSpriteRotation: vi.fn(),
};

function makeService() {
  return new RemoteSyncService(mockSpriteSync as never);
}

function dispatch(type: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

beforeEach(() => vi.clearAllMocks());

describe('RemoteSyncService', () => {
  it('handles sprite-drag-preview-remote', () => {
    const svc = makeService();
    svc.init();
    dispatch('sprite-drag-preview-remote', { id: 's1', x: 100, y: 200 });
    expect(mockSpriteSync.updateSpritePosition).toHaveBeenCalledWith('s1', { x: 100, y: 200 });
    svc.dispose();
  });

  it('ignores drag events without id', () => {
    const svc = makeService();
    svc.init();
    dispatch('sprite-drag-preview-remote', { x: 100, y: 200 });
    expect(mockSpriteSync.updateSpritePosition).not.toHaveBeenCalled();
    svc.dispose();
  });

  it('handles sprite-resize-preview-remote', () => {
    const svc = makeService();
    svc.init();
    dispatch('sprite-resize-preview-remote', { id: 's1', width: 64, height: 64 });
    expect(mockSpriteSync.resizeSpriteInWasm).toHaveBeenCalledWith('s1', 64, 64);
    svc.dispose();
  });

  it('handles sprite-rotate-preview-remote', () => {
    const svc = makeService();
    svc.init();
    dispatch('sprite-rotate-preview-remote', { id: 's1', rotation: 1.57 });
    expect(mockSpriteSync.updateSpriteRotation).toHaveBeenCalledWith('s1', 1.57);
    svc.dispose();
  });

  it('uses default 0 for missing x/y on drag', () => {
    const svc = makeService();
    svc.init();
    dispatch('sprite-drag-preview-remote', { id: 's1' });
    expect(mockSpriteSync.updateSpritePosition).toHaveBeenCalledWith('s1', { x: 0, y: 0 });
    svc.dispose();
  });

  it('stops handling events after dispose', () => {
    const svc = makeService();
    svc.init();
    svc.dispose();
    dispatch('sprite-drag-preview-remote', { id: 's1', x: 10, y: 10 });
    expect(mockSpriteSync.updateSpritePosition).not.toHaveBeenCalled();
  });
});
