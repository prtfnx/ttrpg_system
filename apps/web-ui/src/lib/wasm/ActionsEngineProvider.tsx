import type { ActionsClient } from '@lib/wasm/ttrpg_rust_core';
import { ActionsClient as WasmActionsClient } from '@lib/wasm/ttrpg_rust_core';
import React, { createContext, useContext, useEffect, useMemo } from 'react';

const ActionsEngineContext = createContext<ActionsClient | null>(null);

export function useActionsEngine(): ActionsClient | null {
  return useContext(ActionsEngineContext);
}

export function ActionsEngineProvider({ children }: { children: React.ReactNode }) {
  const actionsEngine = useMemo(() => new WasmActionsClient(), []);

  useEffect(() => {
    return () => {
      actionsEngine.free?.();
    };
  }, [actionsEngine]);

  return (
    <ActionsEngineContext.Provider value={actionsEngine}>
      {children}
    </ActionsEngineContext.Provider>
  );
}