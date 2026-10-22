/** Opt-in production timing samples. No payloads, table names or user text. */
export interface CommandTiming {
  message_type: string;
  message_id: string;
  queue_ms: number;
  acknowledgement_ms: number;
}

let windowStarted = 0;
let samples = 0;

export function reportCommandTiming(timing: CommandTiming): void {
  try {
    const rate = Number(import.meta.env.VITE_COMMAND_TIMING_SAMPLE_RATE ?? '0');
    if (!import.meta.env.PROD || !Number.isFinite(rate) || rate <= 0 || Math.random() >= Math.min(1, rate)) return;
    const now = Date.now();
    if (now - windowStarted >= 60_000) { windowStarted = now; samples = 0; }
    if (samples >= 16) return;
    samples++;
    const body = JSON.stringify({ ...timing, release: String(import.meta.env.VITE_RELEASE ?? 'unknown').slice(0, 128) });
    try {
      if (navigator.sendBeacon?.('/api/telemetry/command-timing', new Blob([body], { type: 'application/json' }))) return;
    } catch { /* Fall back to the same-origin transport. */ }
    void fetch('/api/telemetry/command-timing', { method: 'POST', body,
      headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', keepalive: true }).catch(() => undefined);
  } catch { /* Timing collection must never break reconciliation. */ }
}
