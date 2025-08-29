import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { WebClientProtocol } from '../protocol/clientProtocol';
import { authService } from './auth.service';

interface ProtocolContextValue {
  protocol: WebClientProtocol | null;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  connect: () => Promise<void>;
  disconnect: () => void;
}

const ProtocolContext = createContext<ProtocolContextValue | undefined>(undefined);

export function useProtocol() {
  const ctx = useContext(ProtocolContext);
  if (!ctx) throw new Error('useProtocol must be used within a ProtocolProvider');
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
        try {
          const sessions = await authService.getUserSessions();
          const byCode = sessions.find((s: any) => s.session_code === sessionCode);
          const byName = sessions.find((s: any) => s.session_name === sessionCode);
          if (byCode) resolved = byCode.session_code;
          else if (byName) resolved = byName.session_code;
        } catch (e) {
          console.warn('[ProtocolProvider] Failed to resolve session code, using provided value', e);
        }

        const p = new WebClientProtocol(resolved);
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
    connectionState,
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
