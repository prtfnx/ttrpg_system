import type { ActionsClient } from '@lib/wasm/ttrpg_rust_core';
import { createContext, useContext } from 'react';

export const ActionsEngineContext = createContext<ActionsClient | null>(null);

export function useActionsEngine(): ActionsClient | null {
  return useContext(ActionsEngineContext);
}