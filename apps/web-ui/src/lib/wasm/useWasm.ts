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
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    wasmManager
      .getWasmModule()
      .then(mod => {
        if (!isMountedRef.current) return;
        setApi(mod);
        setIsReady(true);
      })
      .catch(err => {
        if (!isMountedRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      });

    return () => { isMountedRef.current = false; };
  }, []);

  return { api, isReady, error };
}
