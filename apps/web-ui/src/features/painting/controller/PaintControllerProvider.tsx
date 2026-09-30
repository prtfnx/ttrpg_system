import { useOptionalProtocol } from '@app/providers';
import { useGameStore } from '@/store';
import { useWasmRuntime, useWasmStatus } from '@lib/wasm/runtime';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
  PaintController,
  type PaintControllerState,
  type PaintSceneRuntime,
  type PaintTransport,
} from './PaintController';

const EMPTY_STATE: PaintControllerState = Object.freeze({
  tableId: null,
  generation: 0,
  revision: 0,
  hydrating: false,
  committed: Object.freeze([]),
  pending: Object.freeze([]),
  remotePreviews: Object.freeze([]),
  lastError: null,
});

interface PaintControllerContextValue {
  controller: PaintController | null;
  state: PaintControllerState;
}

const PaintControllerContext = createContext<PaintControllerContextValue | null>(null);

interface PaintControllerProviderProps {
  children: React.ReactNode;
}

export function PaintControllerProvider({ children }: PaintControllerProviderProps) {
  const protocol = useOptionalProtocol()?.protocol ?? null;
  const runtime = useWasmRuntime();
  const runtimeStatus = useWasmStatus();
  const activeTableId = useGameStore(state => state.activeTableId);
  const controller = useMemo(() => {
    if (!protocol) return null;
    return new PaintController(
      protocol as PaintTransport,
      runtime as PaintSceneRuntime,
      { onError: message => toast.error(message) },
    );
  }, [protocol, runtime]);
  const [state, setState] = useState<PaintControllerState>(EMPTY_STATE);

  useEffect(() => {
    if (!controller) {
      setState(EMPTY_STATE);
      return;
    }
    const disconnectEvents = controller.connectEvents();
    const unsubscribe = controller.subscribe(setState);
    return () => {
      unsubscribe();
      disconnectEvents();
      controller.dispose();
      setState(EMPTY_STATE);
    };
  }, [controller]);

  useEffect(() => {
    controller?.selectTable(activeTableId);
  }, [activeTableId, controller]);

  useEffect(() => {
    if (!controller) return;
    const timer = window.setInterval(() => controller.tick(), 250);
    return () => window.clearInterval(timer);
  }, [controller]);

  useEffect(() => {
    if (controller && runtimeStatus.isCanvasAttached && !runtimeStatus.isContextLost) {
      controller.restoreRenderer();
    }
  }, [controller, runtimeStatus.isCanvasAttached, runtimeStatus.isContextLost]);

  const value = useMemo(() => ({ controller, state }), [controller, state]);
  return (
    <PaintControllerContext.Provider value={value}>
      {children}
    </PaintControllerContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePaintController(): PaintControllerContextValue {
  const value = useContext(PaintControllerContext);
  if (!value) throw new Error('usePaintController must be used inside PaintControllerProvider');
  return value;
}
