// Centralized type-safe event bus for WASM ↔ React communication.
// Replaces raw window.dispatchEvent(new CustomEvent(...)) with typed helpers.
// Migration: replace raw addEventListener/dispatchEvent calls incrementally.

// Shared data shapes
interface SpriteData {
  sprite_id?: string;
  id?: string;
  layer?: string;
  table_id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  asset_id?: string;
  texture_path?: string;
  controlled_by?: number[] | string;
  [key: string]: unknown;
}

interface TableData {
  table_id: string;
  table_name?: string;
  sprites?: SpriteData[];
  background?: string | null;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

// Full event map — all events crossing the WASM ↔ React boundary
export type WasmEventMap = {
  // Table lifecycle
  'table-data-received': TableData;
  'table-response': TableData;
  'new-table-response': TableData;
  'table-updated': { table_id: string; changes: Partial<TableData> };
  'table-sprites-loaded': { table_id: string; count: number };

  // Sprite CRUD (from server protocol → WASM)
  'sprite-created': SpriteData;
  'sprite-updated': SpriteData;
  'sprite-removed': { sprite_id: string; table_id?: string };
  'sprite-response': SpriteData;
  'compendium-sprite-added': SpriteData;
  'compendium-sprite-updated': SpriteData;
  'compendium-sprite-removed': { sprite_id: string };
  'compendium-insert': { spriteData: SpriteData };
  'compendium-drop': { spriteData: SpriteData; x: number; y: number };

  // Sprite local operations (immediate/optimistic)
  'sprite-moved': { sprite_id?: string; id?: string; x: number; y: number };
  'sprite-scaled': { sprite_id?: string; id?: string; width: number; height: number };
  'sprite-rotated': { sprite_id?: string; id?: string; rotation: number };
  'optimistic-sprite-create': SpriteData;

  // Remote client previews (broadcast from other clients via server)
  'sprite-drag-preview-remote': { id: string; x: number; y: number };
  'sprite-resize-preview-remote': { id: string; width: number; height: number };
  'sprite-rotate-preview-remote': { id: string; rotation: number };

  // Optimistic rollback
  'sprite-revert': {
    spriteId: string;
    operation: 'move' | 'resize' | 'rotate';
    originalState: Record<string, number>;
    reason: string;
  };

  // WASM → Protocol bridge events
  'wasm-sprite-operation': {
    spriteId: string;
    operation: string;
    state: Record<string, number>;
  };
  'wasm-light-moved': { lightId: string; x: number; y: number };
  'wasm-wall-moved': { wallId: string; points: number[] };

  // Protocol → WASM confirmations
  'sprite-action-confirmed': { action_id: string };
  'sprite-action-rejected': { action_id: string; reason: string };

  // Assets
  'asset-downloaded': { asset_id: string; data: ArrayBuffer };
  'asset-uploaded': { asset_id: string; url?: string };
  'asset-upload-started': { asset_id: string; filename?: string };
  'local-texture-ready': { asset_id: string; element: HTMLImageElement };
  'request-asset-download': { asset_id: string; url?: string };

  // Protocol bridge
  'protocol-send-message': { type: string; data: unknown };
  'protocol-success': { action: string; data?: unknown };
  'protocol-error': { action: string; error: string };

  // WASM lifecycle
  'wasm-ready': { timestamp: number; module: unknown };
  'render-manager-ready': Record<string, never>;
};

export function emitWasmEvent<K extends keyof WasmEventMap>(
  type: K,
  detail: WasmEventMap[K]
): void {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

export function onWasmEvent<K extends keyof WasmEventMap>(
  type: K,
  handler: (detail: WasmEventMap[K]) => void
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<WasmEventMap[K]>).detail);
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
}

// Convenience: register multiple events and get a single cleanup function
export function onWasmEvents(
  subscriptions: Array<[keyof WasmEventMap, (detail: unknown) => void]>
): () => void {
  const cleanups = subscriptions.map(([type, handler]) =>
    onWasmEvent(type as keyof WasmEventMap, handler as (detail: WasmEventMap[typeof type]) => void)
  );
  return () => cleanups.forEach(c => c());
}

// Type helper for declaring typed WASM event handler props
export type WasmEventHandler<K extends keyof WasmEventMap> = (
  detail: WasmEventMap[K]
) => void;
