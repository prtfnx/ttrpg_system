/**
 * React hook for authenticated WebSocket connection with protocol compliance
 * Manages connection state and provides protocol interface
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { WebClientProtocol } from '../protocol/clientProtocol';
import type { UserInfo } from '../services/auth.service';
import { authService } from '../services/auth.service';

interface UseAuthenticatedWebSocketProps {
  sessionCode: string;
  userInfo: UserInfo;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export function useAuthenticatedWebSocket({ sessionCode, userInfo }: UseAuthenticatedWebSocketProps) {
  const protocolRef = useRef<WebClientProtocol | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);

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

      // Create new protocol instance with the resolved canonical code
      const protocol = new WebClientProtocol(resolvedCode);
      protocolRef.current = protocol;
      
      // Connect to WebSocket with authentication
      await protocol.connect();
      
      setConnectionState('connected');
      console.log(`Connected to session ${sessionCode} as ${userInfo.username} (${userInfo.role})`);
      
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
