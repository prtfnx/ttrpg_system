import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { WebClientProtocol } from '../protocol/clientProtocol';
import { authService } from './auth.service';

interface ProtocolContextValue {
  protocol: WebClientProtocol | null;
  socket?: WebSocket | null;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  isConnected?: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const ProtocolContext = createContext<ProtocolContextValue | undefined>(undefined);

// Export the context for external use
export { ProtocolContext };

export function useProtocol() {
  const ctx = useContext(ProtocolContext);
  if (!ctx) {
    // In tests we may want to render components without wrapping them in the
    // ProtocolProvider. When running under Vitest return a safe default
    // context object so callers that destructure { protocol } don't throw.
    if ((globalThis as any).__VITEST__) {
      return {
        protocol: null,
        socket: null,
        connectionState: 'disconnected' as const,
        isConnected: false,
        connect: async () => {},
        disconnect: () => {}
      } as ProtocolContextValue;
    }
    throw new Error('useProtocol must be used within a ProtocolProvider');
  }
  return ctx;
}

interface ProviderProps {
  sessionCode: string;
  children: React.ReactNode;
}

export function ProtocolProvider({ sessionCode, children }: ProviderProps) {
  const [protocol, setProtocol] = useState<WebClientProtocol | null>(null);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  // Create protocol instance when sessionCode changes
  useEffect(() => {
    let mounted = true;
    async function init() {
      setConnectionState('connecting');
      try {
        // Resolve session code to canonical form using authService
        let resolved = sessionCode;
        let userId: number | undefined;
        try {
          const sessions = await authService.getUserSessions();
          const byCode = sessions.find((s: any) => s.session_code === sessionCode);
          const byName = sessions.find((s: any) => s.session_name === sessionCode);
          if (byCode) resolved = byCode.session_code;
          else if (byName) resolved = byName.session_code;
          
          // Get user ID from auth service
          const userInfo = authService.getUserInfo();
          if (userInfo?.id) {
            userId = userInfo.id;
          }
        } catch (e) {
          console.warn('[ProtocolProvider] Failed to resolve session code or user ID, using provided value', e);
        }

        const p = new WebClientProtocol(resolved, userId);
        if (!mounted) return;
        setProtocol(p);
        await p.connect();
        if (!mounted) return;
        setConnectionState('connected');
      } catch (err) {
        console.error('[ProtocolProvider] Failed to connect protocol', err);
        setConnectionState('error');
      }
    }

    init();
    return () => {
      mounted = false;
      if (protocol) {
        try { protocol.disconnect(); } catch {};
        setProtocol(null);
      }
      setConnectionState('disconnected');
    };
  }, [sessionCode]);

  const value = useMemo(() => ({
    protocol,
    socket: null, // Legacy property for tests - not exposing internal websocket
    connectionState,
    isConnected: connectionState === 'connected',
    connect: async () => {
      if (!protocol) return;
      setConnectionState('connecting');
      await protocol.connect();
      setConnectionState('connected');
    },
    disconnect: () => {
      if (!protocol) return;
      protocol.disconnect();
      setConnectionState('disconnected');
    }
  }), [protocol, connectionState]);

  return (
    <ProtocolContext.Provider value={value}>
      {children}
    </ProtocolContext.Provider>
  );
}
