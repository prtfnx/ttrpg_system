export const DEFAULT_R2_UPLOAD_TIMEOUT_MS = 4 * 60 * 1000;

interface PresignedUploadOptions {
  uploadUrl: string;
  file: File;
  fullHash: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (progress: number) => void;
}

export const putFileToPresignedUrl = ({
  uploadUrl,
  file,
  fullHash,
  signal,
  timeoutMs = DEFAULT_R2_UPLOAD_TIMEOUT_MS,
  onProgress,
}: PresignedUploadOptions): Promise<void> => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  let settled = false;

  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    signal?.removeEventListener('abort', abortUpload);
    if (error) reject(error);
    else resolve();
  };
  const abortUpload = () => xhr.abort();

  xhr.upload.onprogress = event => {
    if (event.lengthComputable) {
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    }
  };
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) finish();
    else finish(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
  };
  xhr.onerror = () => finish(new Error('Upload failed due to network error'));
  xhr.ontimeout = () => finish(new Error('Upload timed out before completion'));
  xhr.onabort = () => finish(new DOMException('Upload cancelled', 'AbortError'));

  xhr.open('PUT', uploadUrl);
  xhr.timeout = timeoutMs;
  xhr.setRequestHeader('Content-Type', file.type);
  xhr.setRequestHeader('x-amz-meta-xxhash', fullHash);

  if (signal?.aborted) {
    finish(new DOMException('Upload cancelled', 'AbortError'));
    return;
  }
  signal?.addEventListener('abort', abortUpload, { once: true });
  xhr.send(file);
});
