import { ActionsClient } from '@lib/wasm/ttrpg_rust_core';
import React, { useEffect, useState } from 'react';
import { ActionsEngineContext } from './actionsEngineContext';
import { initializeWasmCore } from './wasmCore';

interface ActionsEngineProviderProps {
  children: React.ReactNode;
}

export function ActionsEngineProvider({ children }: ActionsEngineProviderProps) {
  const [actionsEngine, setActionsEngine] = useState<ActionsClient | null>(null);

  useEffect(() => {
    let disposed = false;
    let engine: ActionsClient | null = null;

    async function init() {
      try {
        await initializeWasmCore();

        if (disposed) return;

        engine = new ActionsClient();
        setActionsEngine(engine);
      } catch (error) {
        console.error('[ActionsEngineProvider] Failed to initialize ActionsClient', error);
        setActionsEngine(null);
      }
    }

    init();

    return () => {
      disposed = true;
      engine?.free?.();
      setActionsEngine(null);
    };
  }, []);

  return (
    <ActionsEngineContext.Provider value={actionsEngine}>
      {children}
    </ActionsEngineContext.Provider>
  );
}