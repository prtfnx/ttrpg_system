import { useSyncExternalStore } from 'react';

export interface WasmRuntimeSnapshot {
  readonly isModuleReady: boolean;
  readonly isCanvasAttached: boolean;
  readonly error: Error | null;
  readonly version: string | null;
  readonly hydratedTableId: string | null;
  readonly frameTableId: string | null;
  readonly tableHydrationError: Error | null;
}

type Listener = () => void;

const initialSnapshot: WasmRuntimeSnapshot = Object.freeze({
  isModuleReady: false,
  isCanvasAttached: false,
  error: null,
  version: null,
  hydratedTableId: null,
  frameTableId: null,
  tableHydrationError: null,
});

export class WasmRuntimeStore {
  private snapshot = initialSnapshot;
  private readonly listeners = new Set<Listener>();

  getSnapshot = (): WasmRuntimeSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setSnapshot(next: Partial<WasmRuntimeSnapshot>): void {
    const snapshot = Object.freeze({ ...this.snapshot, ...next });
    if (
      snapshot.isModuleReady === this.snapshot.isModuleReady &&
      snapshot.isCanvasAttached === this.snapshot.isCanvasAttached &&
      snapshot.error === this.snapshot.error &&
      snapshot.version === this.snapshot.version
      && snapshot.hydratedTableId === this.snapshot.hydratedTableId
      && snapshot.frameTableId === this.snapshot.frameTableId
      && snapshot.tableHydrationError === this.snapshot.tableHydrationError
    ) {
      return;
    }
    this.snapshot = snapshot;
    this.listeners.forEach(listener => listener());
  }
}

export function useWasmRuntimeSnapshot(store: WasmRuntimeStore): WasmRuntimeSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
