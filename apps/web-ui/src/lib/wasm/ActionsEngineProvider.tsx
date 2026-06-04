import { ActionsClient } from '@lib/wasm/ttrpg_rust_core';
import React, { useEffect, useMemo } from 'react';
import { ActionsEngineContext } from './actionsEngineContext';

interface ActionsEngineProviderProps {
  children: React.ReactNode;
}

export function ActionsEngineProvider({ children }: ActionsEngineProviderProps) {
  const actionsEngine = useMemo(() => new ActionsClient(), []);

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