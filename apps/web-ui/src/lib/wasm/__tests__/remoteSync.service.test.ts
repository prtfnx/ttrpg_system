import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteSyncService } from '../remoteSync.service';

const store = vi.hoisted(() => ({ activeTableId: 't1', sprites: [{ id: 's1', tableId: 't1',
  x: 0, y: 0, width: 50, height: 50, rotation: 0 }] }));
vi.mock('@/store', () => ({ useGameStore: { getState: () => store } }));

const mockSpriteSync = {
  updateSpritePosition: vi.fn(),
  resizeSpriteInWasm: vi.fn(),
  updateSpriteRotation: vi.fn(),
};

function makeService() {
  return new RemoteSyncService(mockSpriteSync as never);
}

function dispatch(type: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(type, { detail: { table_id: 't1', ...(detail as object) } }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => { store.activeTableId = 't1'; vi.useRealTimers(); });

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

  it('ignores malformed coordinates', () => {
    const svc = makeService();
    svc.init();
    dispatch('sprite-drag-preview-remote', { id: 's1' });
    expect(mockSpriteSync.updateSpritePosition).not.toHaveBeenCalled();
    svc.dispose();
  });

  it('stops handling events after dispose', () => {
    const svc = makeService();
    svc.init();
    svc.dispose();
    dispatch('sprite-drag-preview-remote', { id: 's1', x: 10, y: 10 });
    expect(mockSpriteSync.updateSpritePosition).not.toHaveBeenCalled();
  });

  it('does not register duplicate listeners when initialized twice', () => {
    const svc = makeService();
    svc.init();
    svc.init();

    dispatch('sprite-drag-preview-remote', { id: 's1', x: 10, y: 20 });

    expect(mockSpriteSync.updateSpritePosition).toHaveBeenCalledOnce();
    svc.dispose();
  });

  it('drops expired, older-sequence and wrong-table samples, then restores the current store baseline', () => {
    vi.useFakeTimers();
    const svc = makeService(); svc.init();
    const sample = { id: 's1', x: 100, y: 200, sequence: 2, expires_at: Date.now() + 1500, source_client_id: 'peer' };
    dispatch('sprite-drag-preview-remote', sample);
    dispatch('sprite-drag-preview-remote', { ...sample, x: 300, sequence: 1 });
    dispatch('sprite-drag-preview-remote', { ...sample, x: 400, sequence: 3, expires_at: Date.now() - 1 });
    dispatch('sprite-drag-preview-remote', { ...sample, x: 500, sequence: 3, table_id: 't2' });
    expect(mockSpriteSync.updateSpritePosition).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1500);
    expect(mockSpriteSync.updateSpritePosition).toHaveBeenLastCalledWith('s1', { x: 0, y: 0 });
    svc.dispose();
  });

  it('cancels a completed property lease while another property still expires', () => {
    vi.useFakeTimers();
    const svc = makeService(); svc.init();
    dispatch('sprite-drag-preview-remote', { id: 's1', x: 100, y: 200 });
    dispatch('sprite-rotate-preview-remote', { id: 's1', rotation: 90 });
    dispatch('sprite-moved', { sprite_id: 's1' });
    vi.advanceTimersByTime(1500);
    expect(mockSpriteSync.updateSpritePosition).toHaveBeenCalledTimes(1);
    expect(mockSpriteSync.updateSpriteRotation).toHaveBeenLastCalledWith('s1', 0);
    svc.dispose();
  });

  it('cannot restore a preview into another active table', () => {
    vi.useFakeTimers();
    const svc = makeService(); svc.init();
    dispatch('sprite-drag-preview-remote', { id: 's1', x: 100, y: 200 });
    store.activeTableId = 't2';
    vi.advanceTimersByTime(1500);
    expect(mockSpriteSync.updateSpritePosition).toHaveBeenCalledTimes(1);
    svc.dispose();
  });

  it('fences a delayed first preview after a canonical commit', () => {
    vi.useFakeTimers();
    const svc = makeService(); svc.init();
    dispatch('sprite-moved', { sprite_id: 's1' });
    dispatch('sprite-drag-preview-remote', { id: 's1', x: 100, y: 200, sequence: 1 });
    expect(mockSpriteSync.updateSpritePosition).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    dispatch('sprite-drag-preview-remote', { id: 's1', x: 300, y: 400, sequence: 2 });
    expect(mockSpriteSync.updateSpritePosition).toHaveBeenCalledWith('s1', { x: 300, y: 400 });
    svc.dispose();
  });

  it('fences a completed gesture while immediately accepting the next gesture with a relative lease', () => {
    vi.useFakeTimers();
    const svc = makeService(); svc.init();
    dispatch('sprite-moved', { sprite_id: 's1', preview_id: 'old', source_client_id: 'peer' });
    const sample = { id: 's1', x: 100, y: 200, sequence: 1, preview_id: 'old',
      source_client_id: 'peer', ttl_ms: 1500, expires_at: Date.now() - 100_000 };
    dispatch('sprite-drag-preview-remote', sample);
    expect(mockSpriteSync.updateSpritePosition).not.toHaveBeenCalled();
    dispatch('sprite-drag-preview-remote', { ...sample, preview_id: 'next' });
    expect(mockSpriteSync.updateSpritePosition).toHaveBeenCalledWith('s1', { x: 100, y: 200 });
    vi.advanceTimersByTime(1500);
    expect(mockSpriteSync.updateSpritePosition).toHaveBeenCalledTimes(2);
    svc.dispose();
  });
});
