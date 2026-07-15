type BrowserErrorEventType = 'error' | 'unhandled_rejection';

const release = import.meta.env.VITE_RELEASE
  || import.meta.env.VITE_RENDER_GIT_COMMIT
  || 'development';
const configuredRate = Number(import.meta.env.VITE_BROWSER_TELEMETRY_SAMPLE_RATE ?? '1');
const sampleRate = Number.isFinite(configuredRate)
  ? Math.min(1, Math.max(0, configuredRate))
  : 1;
let installed = false;

function scrub(value: string): string {
  return value
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
    .replace(/([?&](?:token|code|signature|access_token)=)[^&#\s]+/gi, '$1[REDACTED]');
}

function sendReport(eventType: BrowserErrorEventType, error: unknown): void {
  if (Math.random() > sampleRate) return;
  const normalized = error instanceof Error ? error : new Error(String(error));
  const body = JSON.stringify({
    event_type: eventType,
    message: scrub(normalized.message).slice(0, 512) || 'Unknown browser error',
    stack: normalized.stack ? scrub(normalized.stack).slice(0, 4096) : undefined,
    path: window.location.pathname.slice(0, 256) || '/',
    release: String(release).slice(0, 128),
  });
  const blob = new Blob([body], { type: 'application/json' });
  if (navigator.sendBeacon('/api/telemetry/browser-error', blob)) return;
  void fetch('/api/telemetry/browser-error', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => undefined);
}

export function installBrowserTelemetry(): void {
  if (installed || typeof window === 'undefined' || import.meta.env.DEV) return;
  installed = true;
  window.addEventListener('error', (event) => {
    sendReport('error', event.error ?? new Error(event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    sendReport('unhandled_rejection', event.reason);
  });
}
