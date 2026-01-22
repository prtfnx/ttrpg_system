/**
 * React hook for authenticated WebSocket connection with protocol compliance
 * Manages connection state and provides protocol interface
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { WebClientProtocol } from '../protocol/clientProtocol';
import type { UserInfo } from '../services/auth.service';
import { authService } from '../services/auth.service';
import { useProtocol } from '../services/ProtocolContext';

interface UseAuthenticatedWebSocketProps {
  sessionCode: string;
  userInfo: UserInfo;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export function useAuthenticatedWebSocket({ sessionCode, userInfo }: UseAuthenticatedWebSocketProps) {
  // Prefer the centralized ProtocolContext if present
  let ctx: any = null;
  try { ctx = useProtocol(); } catch (e) { ctx = null; }

  const protocolRef = useRef<WebClientProtocol | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);

  // If ProtocolContext is available, mirror its values and return early
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

  const connect = useCallback(async () => {
    try {
      setConnectionState('connecting');
      setError(null);
      
      // Resolve sessionCode to canonical session_code if needed
      let resolvedCode = sessionCode;
      try {
        // Fetch user's sessions and try to resolve by code first, then by name
        const sessions = await authService.getUserSessions();
        const byCode = sessions.find((s: any) => s.session_code === sessionCode);
        const byName = sessions.find((s: any) => s.session_name === sessionCode);
        if (byCode) {
          resolvedCode = byCode.session_code;
        } else if (byName) {
          resolvedCode = byName.session_code;
          console.debug('[useAuthenticatedWebSocket] Resolved injected session name to code:', sessionCode, '->', resolvedCode);
        }
      } catch (e) {
        // If session resolution fails, continue with provided sessionCode but log it
        console.warn('[useAuthenticatedWebSocket] Failed to resolve sessionCode against user sessions:', e);
      }

      // If already connected, skip creating a new protocol (idempotent)
      if (protocolRef.current && protocolRef.current.isConnected()) {
        console.debug('[useAuthenticatedWebSocket] Already connected - skipping new connect for', resolvedCode);
        setConnectionState('connected');
        return;
      }

      // Create new protocol instance with the resolved canonical code
      const protocol = new WebClientProtocol(resolvedCode);
      protocolRef.current = protocol;

      // Connect to WebSocket with authentication
      await protocol.connect();

      setConnectionState('connected');
      // Log the actual resolved canonical code we connected to (not the injected candidate)
      console.log(`Connected to session ${resolvedCode} as ${userInfo.username} (${userInfo.role})`);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMessage);
      setConnectionState('error');
      console.error('WebSocket connection error:', err);
      
      // Clear protocol reference on error
      protocolRef.current = null;
    }
  }, [sessionCode, userInfo]);

  const disconnect = useCallback(() => {
    if (protocolRef.current) {
      protocolRef.current.disconnect();
      protocolRef.current = null;
    }
    setConnectionState('disconnected');
    setError(null);
  }, []);

  const getProtocol = useCallback(() => protocolRef.current, []);

  // Monitor connection state by polling the protocol
  useEffect(() => {
    if (!protocolRef.current) return;

    const checkConnection = () => {
      if (protocolRef.current) {
        const isConnected = protocolRef.current.isConnected();
        if (isConnected && connectionState !== 'connected') {
          setConnectionState('connected');
        } else if (!isConnected && connectionState === 'connected') {
          setConnectionState('disconnected');
          setError('Connection lost');
        }
      }
    };

    // Poll connection state every 1 second
    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, [connectionState]);

  // Auto-connect on mount and disconnect on unmount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Handle connection state changes
  useEffect(() => {
    if (connectionState === 'error' && error) {
  // Authentication errors should not be silently ignored; allow retry logic below
  // Auto-retry connection after 5 seconds for non-authentication errors
      
      if (!error.includes('Authentication failed')) {
        const retryTimer = setTimeout(() => connect(), 5000);
        return () => clearTimeout(retryTimer);
      }
    }
  }, [connectionState, error, connect]);

  return {
    connectionState,
    error,
    protocol: getProtocol(),
    connect,
    disconnect,
    isConnected: connectionState === 'connected'
  };
}
