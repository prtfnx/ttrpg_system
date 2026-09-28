import type { WasmRuntimePort } from '@lib/wasm/runtime';
import { onWasmEvent } from '@lib/wasm/wasmEvents';
import { logger } from '@shared/utils/logger';

const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 360;
const DEBOUNCE_MS = 750;
const MIN_CAPTURE_INTERVAL_MS = 1500;
const MAX_MEMORY_PREVIEWS = 24;

interface PreviewEntry {
  source: string | null;
  dirty: boolean;
  generating: boolean;
  error: string | null;
  lastCapture: number;
  lastAccess: number;
  revision: number;
}

export interface TablePreviewSnapshot {
  source: string | null;
  isGenerating: boolean;
  error: string | null;
  dirty: boolean;
}

class TableThumbnailService {
  private runtime: WasmRuntimePort | null = null;
  private entries = new Map<string, PreviewEntry>();
  private listeners = new Map<string, Set<() => void>>();
  private timers = new Map<string, number>();
  private pendingDirty = new Set<string>();
  private scopeKey = 'anonymous';
  private sessionId: string | null = null;
  private activeTableId: string | null = null;
  private hoveredTableId: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      onWasmEvent('table-preview-invalidated', ({ table_id: tableId }) => {
        this.markDirty(tableId);
      });
    }
  }

  configure(runtime: WasmRuntimePort, sessionId: string | null): void {
    this.runtime = runtime;
    this.sessionId = sessionId;
  }

  setScope(scopeKey: string): void {
    if (scopeKey === this.scopeKey) return;
    this.clearCache();
    this.scopeKey = scopeKey;
  }

  setActiveTable(tableId: string | null): void {
    this.activeTableId = tableId;
    if (tableId) this.ensurePreview(tableId);
  }

  setHoveredTable(tableId: string | null): void {
    this.hoveredTableId = tableId;
    if (tableId) this.touch(tableId);
  }

  persistedSource(tableId: string, previewEtag: string | null): string | null {
    if (!this.sessionId || previewEtag === null) return null;
    const endpoint = this.previewEndpoint(tableId);
    return previewEtag ? `${endpoint}?v=${encodeURIComponent(previewEtag)}` : endpoint;
  }

  getSnapshot(tableId: string): TablePreviewSnapshot {
    const entry = this.entry(tableId);
    entry.lastAccess = Date.now();
    return {
      source: entry.source,
      isGenerating: entry.generating,
      error: entry.error,
      dirty: entry.dirty,
    };
  }

  subscribe(tableId: string, listener: () => void): () => void {
    const listeners = this.listeners.get(tableId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(tableId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(tableId);
    };
  }

  invalidateTable(tableId: string): void {
    this.markDirty(tableId);
  }

  markDirty(tableId: string): void {
    this.pendingDirty.add(tableId);
    const entry = this.entries.get(tableId);
    if (entry) {
      entry.dirty = true;
      entry.revision += 1;
      this.notify(tableId);
    }
    if (tableId === this.activeTableId) this.schedule(tableId);
  }

  ensurePreview(tableId: string): void {
    const entry = this.entry(tableId);
    if (tableId === this.activeTableId && (entry.dirty || !entry.source)) {
      this.schedule(tableId);
    }
  }

  async captureBeforeSwitch(tableId: string): Promise<void> {
    if (tableId !== this.activeTableId) return;
    const timer = this.timers.get(tableId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(tableId);
    }
    await this.capture(tableId);
  }

  clearCache(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.entries.forEach(entry => {
      if (entry.source) URL.revokeObjectURL(entry.source);
    });
    this.entries.clear();
    this.pendingDirty.clear();
  }

  private entry(tableId: string): PreviewEntry {
    let entry = this.entries.get(tableId);
    if (!entry) {
      entry = {
        source: null,
        dirty: this.pendingDirty.has(tableId),
        generating: false,
        error: null,
        lastCapture: 0,
        lastAccess: Date.now(),
        revision: 0,
      };
      this.entries.set(tableId, entry);
    }
    return entry;
  }

  private touch(tableId: string): void {
    this.entry(tableId).lastAccess = Date.now();
  }

  private schedule(tableId: string): void {
    const prior = this.timers.get(tableId);
    if (prior) clearTimeout(prior);
    const entry = this.entry(tableId);
    const throttle = Math.max(0, MIN_CAPTURE_INTERVAL_MS - (Date.now() - entry.lastCapture));
    const timer = window.setTimeout(() => {
      this.timers.delete(tableId);
      void this.capture(tableId);
    }, Math.max(DEBOUNCE_MS, throttle));
    this.timers.set(tableId, timer);
  }

  private async capture(tableId: string): Promise<void> {
    const runtime = this.runtime;
    const entry = this.entry(tableId);
    if (!runtime || tableId !== this.activeTableId || entry.generating) return;
    if (runtime.status.frameTableId !== tableId || runtime.status.hydratedTableId !== tableId) return;

    const scope = this.scopeKey;
    const revision = entry.revision;
    entry.generating = true;
    entry.error = null;
    this.notify(tableId);
    try {
      const captured = runtime.captureActiveTableThumbnail(
        tableId,
        PREVIEW_WIDTH,
        PREVIEW_HEIGHT,
      );
      if (!captured || captured.data.length !== captured.width * captured.height * 4) return;
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = captured.width;
      sourceCanvas.height = captured.height;
      const sourceContext = sourceCanvas.getContext('2d');
      if (!sourceContext) throw new Error('2D canvas is unavailable');
      sourceContext.putImageData(new ImageData(
        new Uint8ClampedArray(captured.data),
        captured.width,
        captured.height,
      ), 0, 0);
      const canvas = document.createElement('canvas');
      canvas.width = PREVIEW_WIDTH;
      canvas.height = PREVIEW_HEIGHT;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D canvas is unavailable');
      context.drawImage(sourceCanvas, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          value => value ? resolve(value) : reject(new Error('WebP encoding failed')),
          'image/webp',
          0.82,
        );
      });
      if (scope !== this.scopeKey || tableId !== this.activeTableId) return;
      if (entry.source) URL.revokeObjectURL(entry.source);
      entry.source = URL.createObjectURL(blob);
      entry.lastCapture = Date.now();
      entry.dirty = entry.revision !== revision;
      this.pendingDirty.delete(tableId);
      this.notify(tableId);
      this.prune();
      void this.persist(tableId, blob, scope);
    } catch (error) {
      entry.error = error instanceof Error ? error.message : 'Preview capture failed';
      logger.warn('[ThumbnailService] Preview capture failed', error);
    } finally {
      entry.generating = false;
      this.notify(tableId);
      if (entry.dirty && tableId === this.activeTableId) this.schedule(tableId);
    }
  }

  private async persist(tableId: string, blob: Blob, scope: string): Promise<void> {
    if (!this.sessionId || scope !== this.scopeKey) return;
    const body = new FormData();
    body.append('preview', blob, 'preview.webp');
    try {
      const response = await fetch(this.previewEndpoint(tableId), {
        method: 'POST',
        body,
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`upload returned ${response.status}`);
    } catch (error) {
      logger.warn('[ThumbnailService] Preview remains memory-only after upload failure', error);
    }
  }

  private previewEndpoint(tableId: string): string {
    return `/game/api/sessions/${encodeURIComponent(this.sessionId!)}/tables/${encodeURIComponent(tableId)}/preview`;
  }

  private prune(): void {
    const cached = [...this.entries.entries()].filter(([, entry]) => entry.source);
    if (cached.length <= MAX_MEMORY_PREVIEWS) return;
    cached.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    let remaining = cached.length;
    for (const [tableId, entry] of cached) {
      if (remaining <= MAX_MEMORY_PREVIEWS) break;
      if (tableId === this.activeTableId || tableId === this.hoveredTableId) continue;
      if (entry.source) URL.revokeObjectURL(entry.source);
      this.entries.delete(tableId);
      remaining -= 1;
    }
  }

  private notify(tableId: string): void {
    this.listeners.get(tableId)?.forEach(listener => listener());
  }
}

export const tableThumbnailService = new TableThumbnailService();
