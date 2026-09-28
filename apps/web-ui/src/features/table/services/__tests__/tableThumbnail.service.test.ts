import type { WasmRuntimePort } from '@lib/wasm/runtime';
import { emitWasmEvent } from '@lib/wasm/wasmEvents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tableThumbnailService } from '../tableThumbnail.service';

const TABLE_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_TABLE_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('TableThumbnailService', () => {
  let runtime: WasmRuntimePort;

  beforeEach(() => {
    vi.useFakeTimers();
    tableThumbnailService.clearCache();
    runtime = {
      status: {
        isModuleReady: true,
        isCanvasAttached: true,
        hydratedTableId: TABLE_ID,
        frameTableId: TABLE_ID,
      },
      captureActiveTableThumbnail: vi.fn(() => ({
        data: new Uint8Array(640 * 360 * 4).fill(80),
        width: 640,
        height: 360,
      })),
    } as unknown as WasmRuntimePort;
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
      callback(new Blob(['webp'], { type: 'image/webp' }));
    });
    vi.stubGlobal('ImageData', class {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    });
    tableThumbnailService.configure(runtime, 'SESSION1');
    tableThumbnailService.setScope('SESSION1:owner:dm');
  });

  afterEach(() => {
    tableThumbnailService.clearCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('debounces capture for the active, fully framed table and persists WebP', async () => {
    tableThumbnailService.setActiveTable(TABLE_ID);
    await vi.advanceTimersByTimeAsync(750);

    expect(runtime.captureActiveTableThumbnail).toHaveBeenCalledWith(TABLE_ID, 640, 360);
    expect(tableThumbnailService.getSnapshot(TABLE_ID).source).toBe('blob:preview');
    expect(fetch).toHaveBeenCalledWith(
      '/game/api/sessions/SESSION1/tables/550e8400-e29b-41d4-a716-446655440000/preview',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
  });

  it('does not render an invalidated inactive table', async () => {
    tableThumbnailService.setActiveTable(TABLE_ID);
    tableThumbnailService.markDirty(OTHER_TABLE_ID);
    await vi.advanceTimersByTimeAsync(2000);

    expect(runtime.captureActiveTableThumbnail).toHaveBeenCalledTimes(1);
    expect(tableThumbnailService.getSnapshot(OTHER_TABLE_ID).dirty).toBe(true);
  });

  it('flushes the active preview before switching tables', async () => {
    tableThumbnailService.setActiveTable(TABLE_ID);
    await tableThumbnailService.captureBeforeSwitch(TABLE_ID);

    expect(runtime.captureActiveTableThumbnail).toHaveBeenCalledTimes(1);
    expect(tableThumbnailService.getSnapshot(TABLE_ID).source).toBe('blob:preview');
  });

  it('clears viewer-scoped object URLs when visibility changes', async () => {
    tableThumbnailService.setActiveTable(TABLE_ID);
    await tableThumbnailService.captureBeforeSwitch(TABLE_ID);

    tableThumbnailService.setScope('SESSION1:player:map,tokens');

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    expect(tableThumbnailService.getSnapshot(TABLE_ID).source).toBeNull();
  });

  it('marks a preview dirty from the renderer invalidation event', async () => {
    tableThumbnailService.setActiveTable(TABLE_ID);
    await tableThumbnailService.captureBeforeSwitch(TABLE_ID);

    emitWasmEvent('table-preview-invalidated', { table_id: TABLE_ID });

    expect(tableThumbnailService.getSnapshot(TABLE_ID).dirty).toBe(true);
  });

  it('builds persisted URLs only for known previews and keys them by ETag', () => {
    expect(tableThumbnailService.persistedSource(TABLE_ID, null)).toBeNull();
    expect(tableThumbnailService.persistedSource(TABLE_ID, 'etag value')).toBe(
      `/game/api/sessions/SESSION1/tables/${TABLE_ID}/preview?v=etag%20value`,
    );
  });
});
