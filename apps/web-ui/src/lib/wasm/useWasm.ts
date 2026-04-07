import { useState, useEffect, useRef } from 'react';
import { wasmManager } from './wasmManager';
import type { GlobalWasmModule } from './wasmManager';

interface UseWasmResult {
  api: GlobalWasmModule | null;
  isReady: boolean;
  error: Error | null;
}

/**
 * React hook that loads the WASM module once and exposes its API.
 *
 * Usage:
 *   const { api, isReady, error } = useWasm();
 *   if (isReady) api.create_default_brush_presets();
 */
export function useWasm(): UseWasmResult {
  const [api, setApi] = useState<GlobalWasmModule | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const initiated = useRef(false);

  useEffect(() => {
    if (initiated.current) return;
    initiated.current = true;

    wasmManager
      .getWasmModule()
      .then(mod => {
        setApi(mod);
        setIsReady(true);
      })
      .catch(err => {
        setError(err instanceof Error ? err : new Error(String(err)));
      });
  }, []);

  return { api, isReady, error };
}
