import initWasm from './generated/ttrpg_rust_core';

let wasmInitPromise: Promise<void> | null = null;

export function initializeWasmCore(): Promise<void> {
  if (!wasmInitPromise) {
    const attempt = initWasm({
      module_or_path: new URL('./generated/ttrpg_rust_core_bg.wasm', import.meta.url),
    }).then(() => undefined);
    wasmInitPromise = attempt.catch(error => {
      wasmInitPromise = null;
      throw error;
    });
  }

  return wasmInitPromise;
}
