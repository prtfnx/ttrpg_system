import initWasm from './generated/ttrpg_rust_core';

let wasmInitPromise: Promise<void> | null = null;

export function initializeWasmCore(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = initWasm(
      new URL('./generated/ttrpg_rust_core_bg.wasm', import.meta.url),
    ).then(() => undefined);
  }

  return wasmInitPromise;
}
