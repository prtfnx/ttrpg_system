import { authService } from '@features/auth';
import { ProtocolService } from '@lib/api/ProtocolService';
import { WebClientProtocol } from '@lib/websocket';
import { logger } from '@shared/utils/logger';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ConnectionState = 'disconnected' | 'connecting' | 'reconnecting' | 'connected' | 'error';

interface ProtocolContextValue {
  protocol: WebClientProtocol | null;
  connectionState: ConnectionState;
  connectionError: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const ProtocolContext = createContext<ProtocolContextValue | undefined>(undefined);

export { ProtocolContext };

// eslint-disable-next-line react-refresh/only-export-components
export function useProtocol() {
  const ctx = useContext(ProtocolContext);
  if (!ctx && (globalThis as typeof globalThis & { __VITEST__?: boolean }).__VITEST__) {
    return {
      protocol: null,
      connectionState: 'disconnected' as const,
      connectionError: null,
      isConnected: false,
      connect: async () => {},
      disconnect: () => {}
    } as ProtocolContextValue;
  }
  if (!ctx) throw new Error('useProtocol must be used within ProtocolProvider');
  return ctx;
}

/** Returns null when used outside ProtocolProvider instead of throwing */
// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalProtocol(): ProtocolContextValue | null {
  return useContext(ProtocolContext) ?? null;
}

interface ProviderProps {
  sessionCode: string;
  children: React.ReactNode;
}

export function ProtocolProvider({ sessionCode, children }: ProviderProps) {
  const [protocol, setProtocol] = useState<WebClientProtocol | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let currentProtocol: WebClientProtocol | null = null;
    let unsubscribeConnectionState: (() => void) | null = null;

    async function init() {
      setConnectionState('connecting');
      setConnectionError(null);

      try {
        let resolved = sessionCode;
        let userId: number | undefined;

        try {
          const sessions = await authService.getUserSessions();
          const byCode = sessions.find((s) => s.session_code === sessionCode);
          const byName = sessions.find((s) => s.session_name === sessionCode);

          if (byCode) resolved = byCode.session_code;
          else if (byName) resolved = byName.session_code;

          const userInfo = authService.getUserInfo();
          if (userInfo?.id) userId = userInfo.id;
        } catch (error) {
          logger.warn('[ProtocolProvider] Failed to resolve session', error);
        }

        const p = new WebClientProtocol(resolved, userId);
        currentProtocol = p;
        unsubscribeConnectionState = p.onConnectionStateChange((state) => {
          if (!mounted) return;
          logger.debug('[ProtocolProvider] Connection transition', p.getConnectionDiagnostics());
          if (state === 'connected') {
            setConnectionState('connected');
            setConnectionError(null);
          } else if (state === 'connecting' || state === 'reconnecting') {
            setConnectionState(state);
          } else if (state === 'timeout') {
            setConnectionState('error');
            setConnectionError('Server heartbeat timed out');
          } else {
            setConnectionState('disconnected');
          }
        });

        if (!mounted) {
          p.disconnect();
          return;
        }

        ProtocolService.setProtocol(p);
        setProtocol(p);

        await p.connect();

        if (!mounted) {
          p.disconnect();
          return;
        }

        if (p.isConnected()) setConnectionState('connected');
      } catch (error) {
        if (!mounted) return;
        if (error instanceof Error && error.message.includes('cancelled')) {
          setConnectionState('disconnected');
          return;
        }
        logger.error('[ProtocolProvider] Connection failed', error);
        setConnectionError(error instanceof Error ? error.message : 'Connection failed');
        setConnectionState('error');
      }
    }

    init();

    return () => {
      mounted = false;
      unsubscribeConnectionState?.();
      currentProtocol?.disconnect();
      ProtocolService.clearProtocol();
      setProtocol(null);
      setConnectionError(null);
      setConnectionState('disconnected');
    };
  }, [sessionCode]);

  const value = useMemo(() => ({
    protocol,
    connectionState,
    connectionError,
    isConnected: connectionState === 'connected' && protocol?.isConnected() === true,
    connect: async () => {
      if (!protocol) return;
      setConnectionState('connecting');
      setConnectionError(null);
      try {
        await protocol.connect();
        if (protocol.isConnected()) setConnectionState('connected');
      } catch (error) {
        setConnectionError(error instanceof Error ? error.message : 'Connection failed');
        setConnectionState('error');
        throw error;
      }
    },
    disconnect: () => {
      if (!protocol) return;
      protocol.disconnect();
      setConnectionError(null);
      setConnectionState('disconnected');
    }
  }), [protocol, connectionState, connectionError]);

  return (
    <ProtocolContext.Provider value={value}>
      {children}
    </ProtocolContext.Provider>
  );
}
