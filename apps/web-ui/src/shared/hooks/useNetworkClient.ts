import { useWasmRuntime, type WasmRuntime } from '@lib/wasm/runtime';
import { useCallback, useEffect, useRef, useState } from 'react';

type NetworkClientInstance = NonNullable<ReturnType<WasmRuntime['getNetworkClient']>>;

interface NetworkMessage {
  type: string;
  data: unknown;
  timestamp: number;
  clientId?: string;
  userId?: number;
  sessionCode?: string;
}

interface NetworkState {
  isConnected: boolean;
  connectionState: string;
  clientId: string;
  username?: string;
  sessionCode?: string;
  lastError?: string;
}

interface NetworkHookOptions {
  autoConnect?: boolean;
  serverUrl?: string;
  reconnectAttempts?: number;
  onMessage?: (message: NetworkMessage) => void;
  onConnectionChange?: (state: string, error?: string) => void;
  onError?: (error: string) => void;
}

export const useNetworkClient = (options: NetworkHookOptions = {}) => {
  const runtime = useWasmRuntime();
  const clientRef = useRef<NetworkClientInstance | null>(null);
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: false,
    connectionState: 'disconnected',
    clientId: '',
  });

  // Initialize network client
  useEffect(() => {
    if (!clientRef.current) {
      runtime.initialize().then(() => {
        const client = runtime.getNetworkClient();
        if (!client) throw new Error('NetworkClient unavailable from WASM runtime');

        try {
          client.set_message_handler((messageType: string, data: unknown) => {
            const message: NetworkMessage = {
              type: messageType,
              data,
              timestamp: Date.now(),
            };

            if (options.onMessage) {
              options.onMessage(message);
            }
          });

          client.set_connection_handler((state: string, error?: string) => {
            setNetworkState(prev => ({
              ...prev,
              connectionState: state,
              isConnected: state === 'connected',
              lastError: error,
            }));

            if (options.onConnectionChange) {
              options.onConnectionChange(state, error);
            }
          });

          client.set_error_handler((error: string) => {
            setNetworkState(prev => ({
              ...prev,
              lastError: error,
            }));

            if (options.onError) {
              options.onError(error);
            }
          });

          clientRef.current = client;

          setNetworkState(prev => ({
            ...prev,
            clientId: client.get_client_id(),
          }));

          if (options.autoConnect && options.serverUrl) {
            client.connect(options.serverUrl);
          }

        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          const errorText = `Connection failed: ${message}`;
          setNetworkState(prev => ({
            ...prev,
            connectionState: 'error',
            isConnected: false,
            lastError: errorText,
          }));

          if (options.onError) {
            options.onError(errorText);
          }
          if (options.onConnectionChange) {
            options.onConnectionChange('error', errorText);
          }

          console.error('Network client initialization failed:', e);
        }
      }).catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        const errorText = `Connection failed: ${msg}`;
        console.error('Failed to load WASM network client:', error);
        setNetworkState(prev => ({ ...prev, connectionState: 'error', isConnected: false, lastError: errorText }));
        queueMicrotask(() => {
          if (options.onError) options.onError(errorText);
          if (options.onConnectionChange) options.onConnectionChange('error', errorText);
        });
      });
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: options excluded to prevent loop
  }, [runtime, options.autoConnect, options.serverUrl, options.onMessage, options.onConnectionChange, options.onError]);

  // Connection management
  const connect = useCallback((url: string) => {
    if (clientRef.current) {
      clientRef.current.connect(url);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
  }, []);

  // Authentication
  const authenticate = useCallback((username: string, password: string) => {
    if (clientRef.current) {
      clientRef.current.authenticate(username, password);
    }
  }, []);

  const setUserInfo = useCallback((userId: number, username: string, sessionCode?: string, jwtToken?: string) => {
    if (clientRef.current) {
      clientRef.current.set_user_info(userId, username, sessionCode, jwtToken);
      setNetworkState(prev => ({
        ...prev,
        username,
        sessionCode,
      }));
    }
  }, []);

  // Session management
  const joinSession = useCallback((sessionCode: string) => {
    if (clientRef.current) {
      clientRef.current.join_session(sessionCode);
    }
  }, []);

  const requestTableList = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.request_table_list();
    }
  }, []);

  const requestPlayerList = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.request_player_list();
    }
  }, []);

  // Sprite synchronization
  const sendSpriteUpdate = useCallback((spriteData: unknown) => {
    if (clientRef.current) {
      clientRef.current.send_sprite_update(spriteData);
    }
  }, []);

  const sendSpriteCreate = useCallback((spriteData: unknown) => {
    if (clientRef.current) {
      clientRef.current.send_sprite_create(spriteData);
    }
  }, []);

  const sendSpriteRemove = useCallback((spriteId: string) => {
    if (clientRef.current) {
      clientRef.current.send_sprite_remove(spriteId);
    }
  }, []);

  const sendTableUpdate = useCallback((tableData: unknown) => {
    if (clientRef.current) {
      clientRef.current.send_table_update(tableData);
    }
  }, []);

  // Generic message sending
  const sendMessage = useCallback((messageType: string, data: unknown) => {
    if (clientRef.current) {
      clientRef.current.send_message(messageType, data);
    }
  }, []);

  const sendPing = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.send_ping();
    }
  }, []);

  // Asset management
  const requestAssetUpload = useCallback((filename: string, fileHash: string, fileSize: number) => {
    if (clientRef.current) {
      clientRef.current.request_asset_upload(filename, fileHash, BigInt(fileSize));
    }
  }, []);

  const requestAssetDownload = useCallback((assetId: string) => {
    if (clientRef.current) {
      clientRef.current.request_asset_download(assetId);
    }
  }, []);

  const confirmAssetUpload = useCallback((assetId: string, uploadSuccess: boolean) => {
    if (clientRef.current) {
      clientRef.current.confirm_asset_upload(assetId, uploadSuccess);
    }
  }, []);

  return {
    // State
    networkState,
    client: clientRef.current,
    
    // Connection management
    connect,
    disconnect,
    
    // Authentication
    authenticate,
    setUserInfo,
    
    // Session management
    joinSession,
    requestTableList,
    requestPlayerList,
    
    // Sprite synchronization
    sendSpriteUpdate,
    sendSpriteCreate,
    sendSpriteRemove,
    sendTableUpdate,
    
    // Generic messaging
    sendMessage,
    sendPing,
    
    // Asset management
    requestAssetUpload,
    requestAssetDownload,
    confirmAssetUpload,
  };
};
