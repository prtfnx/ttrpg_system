import { createContext, useContext } from 'react';
import type { ActionsClient, RenderEngine } from '../ttrpg_rust_core';
import type { WasmRuntime } from './WasmRuntime';
import { useWasmRuntimeSnapshot } from './wasmStore';

export const WasmRuntimeContext = createContext<WasmRuntime | null>(null);

export function useWasmRuntime(): WasmRuntime {
  const runtime = useContext(WasmRuntimeContext);
  if (!runtime) {
    throw new Error('useWasmRuntime must be used inside WasmRuntimeProvider');
  }
  return runtime;
}

export function useRenderEngine(): RenderEngine | null {
  const runtime = useWasmRuntime();
  useWasmRuntimeSnapshot(runtime.store);
  return runtime.getRenderEngine();
}

export function useActionsEngine(): ActionsClient | null {
  const runtime = useWasmRuntime();
  useWasmRuntimeSnapshot(runtime.store);
  return runtime.getActionsEngine();
}

export function useWasmStatus() {
  const runtime = useWasmRuntime();
  return useWasmRuntimeSnapshot(runtime.store);
}
