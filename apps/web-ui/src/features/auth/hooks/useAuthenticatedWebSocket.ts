/**
 * React hook for authenticated WebSocket connection with protocol compliance
 * Manages connection state and provides protocol interface
 */
import { useOptionalProtocol } from '@lib/api';
import { WebClientProtocol } from '@lib/websocket';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserInfo } from '../services/auth.service';
import { authService } from '../services/auth.service';

interface UseAuthenticatedWebSocketProps {
  sessionCode: string;
  userInfo: UserInfo;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export function useAuthenticatedWebSocket({ sessionCode, userInfo }: UseAuthenticatedWebSocketProps) {
  const ctx = useOptionalProtocol();

  const protocolRef = useRef<WebClientProtocol | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (ctx) return; // managed by ProtocolProvider
    try {
      setConnectionState('connecting');
      setError(null);
      
      let resolvedCode = sessionCode;
      try {
        const sessions = await authService.getUserSessions();
        const byCode = sessions.find((s: { session_code: string; session_name: string }) => s.session_code === sessionCode);
        const byName = sessions.find((s: { session_code: string; session_name: string }) => s.session_name === sessionCode);
        if (byCode) {
          resolvedCode = byCode.session_code;
        } else if (byName) {
          resolvedCode = byName.session_code;
          console.debug('[useAuthenticatedWebSocket] Resolved session name to code:', sessionCode, '->', resolvedCode);
        }
      } catch (e) {
        console.warn('[useAuthenticatedWebSocket] Failed to resolve sessionCode:', e);
      }

      if (protocolRef.current && protocolRef.current.isConnected()) {
        setConnectionState('connected');
        return;
      }

      const protocol = new WebClientProtocol(resolvedCode);
      protocolRef.current = protocol;
      await protocol.connect();
      setConnectionState('connected');
      console.log(`Connected to session ${resolvedCode} as ${userInfo.username} (${userInfo.role})`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMessage);
      setConnectionState('error');
      console.error('WebSocket connection error:', err);
      protocolRef.current = null;
    }
  }, [ctx, sessionCode, userInfo]);

  const disconnect = useCallback(() => {
    if (ctx) return; // managed by ProtocolProvider
    if (protocolRef.current) {
      protocolRef.current.disconnect();
      protocolRef.current = null;
    }
    setConnectionState('disconnected');
    setError(null);
  }, [ctx]);

  const getProtocol = useCallback(() => protocolRef.current, []);

  useEffect(() => {
    if (ctx || !protocolRef.current) return;

    const handleConnectionStateChange = (state: 'connected' | 'disconnected' | 'timeout') => {
      if (state === 'connected') {
        setConnectionState('connected');
        setError(null);
      } else if (state === 'disconnected') {
        setConnectionState('disconnected');
        setError('Connection lost');
      } else if (state === 'timeout') {
        setConnectionState('error');
        setError('Connection timeout - server not responding');
      }
    };

    const unsubscribe = protocolRef.current.onConnectionStateChange(handleConnectionStateChange);
    return () => { unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, protocolRef.current]);

  useEffect(() => {
    if (ctx) return;
    connect();
    return () => { disconnect(); };
  }, [ctx, connect, disconnect]);

  useEffect(() => {
    if (ctx || connectionState !== 'error' || !error) return;
    if (!error.includes('Authentication failed')) {
      const retryTimer = setTimeout(() => connect(), 5000);
      return () => clearTimeout(retryTimer);
    }
  }, [ctx, connectionState, error, connect]);

  if (ctx) {
    return {
      connectionState: ctx.connectionState as ConnectionState,
      error: null,
      protocol: ctx.protocol as WebClientProtocol | null,
      connect: ctx.connect,
      disconnect: ctx.disconnect,
      isConnected: ctx.connectionState === 'connected'
    };
  }

  return {
    connectionState,
    error,
    protocol: getProtocol(),
    connect,
    disconnect,
    isConnected: connectionState === 'connected'
  };
}
