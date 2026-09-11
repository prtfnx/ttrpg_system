/**
 * React hook for authenticated WebSocket connection with protocol compliance
 * Manages connection state and provides protocol interface
 */
import { useOptionalProtocol } from '@lib/api';
import { WebClientProtocol, type ProtocolConnectionState } from '@lib/websocket';
import { logger } from '@shared/utils/logger';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserInfo } from '../services/auth.service';
import { authService } from '../services/auth.service';

interface UseAuthenticatedWebSocketProps {
  sessionCode: string;
  userInfo: UserInfo;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'reconnecting' | 'connected' | 'error';

export function useAuthenticatedWebSocket({ sessionCode, userInfo }: UseAuthenticatedWebSocketProps) {
  const ctx = useOptionalProtocol();

  const protocolRef = useRef<WebClientProtocol | null>(null);
  const connectionUnsubscribeRef = useRef<(() => void) | null>(null);
  const connectionAttemptRef = useRef(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (ctx) return; // managed by ProtocolProvider
    const attempt = ++connectionAttemptRef.current;
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
          logger.debug('Resolved session name to code', { sessionCode, resolvedCode });
        }
      } catch (e) {
        logger.warn('Failed to resolve sessionCode', e);
      }

      if (attempt !== connectionAttemptRef.current) return;

      if (protocolRef.current && protocolRef.current.isConnected()) {
        setConnectionState('connected');
        return;
      }

      const protocol = new WebClientProtocol(resolvedCode);
      protocolRef.current = protocol;
      connectionUnsubscribeRef.current?.();
      connectionUnsubscribeRef.current = protocol.onConnectionStateChange((state: ProtocolConnectionState) => {
        if (protocolRef.current !== protocol) return;
        if (state === 'connected') {
          setConnectionState('connected');
          setError(null);
        } else if (state === 'connecting' || state === 'reconnecting') {
          setConnectionState(state);
        } else if (state === 'timeout') {
          setConnectionState('error');
          setError('Connection timeout - server not responding');
        } else {
          setConnectionState('disconnected');
          setError('Connection lost');
        }
      });
      await protocol.connect();
      if (attempt !== connectionAttemptRef.current) {
        protocol.disconnect();
        if (protocolRef.current === protocol) protocolRef.current = null;
        return;
      }
      if (protocol.isConnected()) setConnectionState('connected');
      logger.info('Connected to authenticated session', {
        sessionCode: resolvedCode,
        username: userInfo.username,
      });
    } catch (err) {
      if (attempt !== connectionAttemptRef.current) return;
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      const activeProtocol = protocolRef.current;
      if (activeProtocol?.getConnectionDiagnostics().state === 'reconnecting') {
        setConnectionState('reconnecting');
        setError(null);
        return;
      }
      connectionUnsubscribeRef.current?.();
      connectionUnsubscribeRef.current = null;
      activeProtocol?.disconnect();
      protocolRef.current = null;
      setError(errorMessage);
      setConnectionState('error');
      logger.error('WebSocket connection error', err);
    }
  }, [ctx, sessionCode, userInfo]);

  const disconnect = useCallback(() => {
    if (ctx) return; // managed by ProtocolProvider
    connectionAttemptRef.current += 1;
    connectionUnsubscribeRef.current?.();
    connectionUnsubscribeRef.current = null;
    if (protocolRef.current) {
      protocolRef.current.disconnect();
      protocolRef.current = null;
    }
    setConnectionState('disconnected');
    setError(null);
  }, [ctx]);

  const getProtocol = useCallback(() => protocolRef.current, []);

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
      error: ctx.connectionError,
      protocol: ctx.protocol as WebClientProtocol | null,
      connect: ctx.connect,
      disconnect: ctx.disconnect,
      isConnected: ctx.isConnected
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
