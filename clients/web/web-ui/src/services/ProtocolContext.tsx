import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { WebClientProtocol } from '../protocol/clientProtocol';
import { ProtocolService } from './ProtocolService';
import { authService } from './auth.service';

interface ProtocolContextValue {
  protocol: WebClientProtocol | null;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const ProtocolContext = createContext<ProtocolContextValue | undefined>(undefined);

export { ProtocolContext };

export function useProtocol() {
  const ctx = useContext(ProtocolContext);
  if (!ctx && (globalThis as any).__VITEST__) {
    return {
      protocol: null,
      connectionState: 'disconnected' as const,
      isConnected: false,
      connect: async () => {},
      disconnect: () => {}
    } as ProtocolContextValue;
  }
  if (!ctx) throw new Error('useProtocol must be used within ProtocolProvider');
  return ctx;
}

interface ProviderProps {
  sessionCode: string;
  children: React.ReactNode;
}

export function ProtocolProvider({ sessionCode, children }: ProviderProps) {
  const [protocol, setProtocol] = useState<WebClientProtocol | null>(null);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  useEffect(() => {
    let mounted = true;
    
    async function init() {
      setConnectionState('connecting');
      
      try {
        let resolved = sessionCode;
        let userId: number | undefined;
        
        try {
          const sessions = await authService.getUserSessions();
          const byCode = sessions.find((s: any) => s.session_code === sessionCode);
          const byName = sessions.find((s: any) => s.session_name === sessionCode);
          if (byCode) resolved = byCode.session_code;
          else if (byName) resolved = byName.session_code;
          
          const userInfo = authService.getUserInfo();
          if (userInfo?.id) userId = userInfo.id;
        } catch (e) {
          console.warn('[ProtocolProvider] Failed to resolve session', e);
        }

        const p = new WebClientProtocol(resolved, userId);
        if (!mounted) return;
        
        ProtocolService.setProtocol(p);
        setProtocol(p);
        
        await p.connect();
        if (!mounted) return;
        setConnectionState('connected');
      } catch (err) {
        console.error('[ProtocolProvider] Connection failed', err);
        setConnectionState('error');
      }
    }

    init();
    
    return () => {
      mounted = false;
      if (protocol) {
        protocol.disconnect();
      }
      ProtocolService.clearProtocol();
      setProtocol(null);
      setConnectionState('disconnected');
    };
  }, [sessionCode]);

  const value = useMemo(() => ({
    protocol,
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
