import type { WasmRuntimePort } from './WasmRuntimePort';

let currentRuntime: WasmRuntimePort | null = null;

export function setCurrentWasmRuntime(runtime: WasmRuntimePort | null): void {
  currentRuntime = runtime;
}

export function getCurrentWasmRuntime(): WasmRuntimePort | null {
  return currentRuntime;
}

