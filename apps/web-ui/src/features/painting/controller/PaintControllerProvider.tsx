import { useOptionalProtocol } from '@app/providers';
import { useGameStore } from '@/store';
import { useWasmRuntime, useWasmStatus } from '@lib/wasm/runtime';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { isDM } from '@features/session/types/roles';
import {
  PaintController,
  type PaintControllerState,
  type PaintSceneRuntime,
  type PaintTransport,
} from './PaintController';
import {
  PaintInteractionController,
  type PaintInteractionState,
} from './PaintInteractionController';

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

const EMPTY_INTERACTION_STATE: PaintInteractionState = Object.freeze({
  enabled: false,
  ready: false,
  tool: 'draw',
  style: Object.freeze({
    stroke_rgba: Object.freeze([1, 0, 0, 1]) as unknown as [number, number, number, number],
    width: 4,
    fill_rgba: null,
  }),
  gestureActive: false,
  selected: null,
  canEditSelected: false,
});

interface PaintControllerContextValue {
  controller: PaintController | null;
  state: PaintControllerState;
  interaction: PaintInteractionController | null;
  interactionState: PaintInteractionState;
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
  const activeTool = useGameStore(state => state.activeTool);
  const actorId = useGameStore(state => state.userId);
  const sessionRole = useGameStore(state => state.sessionRole);
  const controller = useMemo(() => {
    if (!protocol) return null;
    return new PaintController(
      protocol as PaintTransport,
      runtime as PaintSceneRuntime,
      { onError: message => toast.error(message) },
    );
  }, [protocol, runtime]);
  const interaction = useMemo(() => (
    controller ? new PaintInteractionController(controller, runtime) : null
  ), [controller, runtime]);
  const [state, setState] = useState<PaintControllerState>(EMPTY_STATE);
  const [interactionState, setInteractionState] = useState<PaintInteractionState>(
    EMPTY_INTERACTION_STATE,
  );

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
    if (!interaction) {
      setInteractionState(EMPTY_INTERACTION_STATE);
      return;
    }
    const unsubscribe = interaction.subscribe(setInteractionState);
    return () => {
      unsubscribe();
      interaction.dispose();
      setInteractionState(EMPTY_INTERACTION_STATE);
    };
  }, [interaction]);

  useEffect(() => {
    interaction?.setActor(actorId, isDM(sessionRole));
  }, [actorId, interaction, sessionRole]);

  useEffect(() => {
    interaction?.setEnabled(activeTool === 'paint');
  }, [activeTool, interaction]);

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
      if (controller.restoreRenderer()) interaction?.restoreRenderer();
    }
  }, [controller, interaction, runtimeStatus.isCanvasAttached, runtimeStatus.isContextLost]);

  const value = useMemo(
    () => ({ controller, state, interaction, interactionState }),
    [controller, interaction, interactionState, state],
  );
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

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalPaintController(): PaintControllerContextValue | null {
  return useContext(PaintControllerContext);
}
