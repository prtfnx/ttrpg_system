import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_R2_UPLOAD_TIMEOUT_MS, putFileToPresignedUrl } from '../r2Upload';

class MockXhr {
  static latest: MockXhr;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  statusText = '';
  timeout = 0;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  abort = vi.fn(() => this.onabort?.());

  constructor() {
    MockXhr.latest = this;
  }
}

describe('putFileToPresignedUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', MockXhr);
  });

  it('sets a bounded timeout and resolves successful uploads', async () => {
    const promise = putFileToPresignedUrl({
      uploadUrl: 'https://upload.example.test',
      file: new File(['image'], 'map.png', { type: 'image/png' }),
      fullHash: 'abc123',
    });
    const xhr = MockXhr.latest;
    expect(xhr.timeout).toBe(DEFAULT_R2_UPLOAD_TIMEOUT_MS);
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('x-amz-meta-xxhash', 'abc123');
    xhr.status = 200;
    xhr.onload?.();
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects and aborts when its owner is cancelled', async () => {
    const controller = new AbortController();
    const promise = putFileToPresignedUrl({
      uploadUrl: 'https://upload.example.test',
      file: new File(['image'], 'map.png', { type: 'image/png' }),
      fullHash: 'abc123',
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(MockXhr.latest.abort).toHaveBeenCalledOnce();
  });

  it('rejects stalled uploads on timeout', async () => {
    const promise = putFileToPresignedUrl({
      uploadUrl: 'https://upload.example.test',
      file: new File(['image'], 'map.png', { type: 'image/png' }),
      fullHash: 'abc123',
    });
    MockXhr.latest.ontimeout?.();
    await expect(promise).rejects.toThrow('timed out');
  });
});
