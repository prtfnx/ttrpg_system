import { useCallback, useEffect, useRef, useState } from 'react';
import type { NetworkClient } from '../types/wasm';
import { wasmManager } from '../utils/wasmManager';

interface NetworkMessage {
  type: string;
  data: any;
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
  const clientRef = useRef<NetworkClient | null>(null);
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: false,
    connectionState: 'disconnected',
    clientId: '',
  });

  // Initialize network client
  useEffect(() => {
    if (!clientRef.current) {
      // Use global WASM manager for consistent instance
      wasmManager.getNetworkClient().then(async (NetworkClientClassOrInstance: any) => {
        // wasmManager may return either a constructor (class) or an already-instantiated client.
        let client: NetworkClient;
        if (typeof NetworkClientClassOrInstance === 'function') {
          client = new NetworkClientClassOrInstance();
        } else if (typeof NetworkClientClassOrInstance === 'object' && NetworkClientClassOrInstance !== null) {
          client = NetworkClientClassOrInstance;
        } else {
          throw new Error('Invalid NetworkClient provided by wasmManager');
        }
        
        // Set up event handlers
        client.set_message_handler((messageType: string, data: any) => {
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
        
        // Update client ID
        setNetworkState(prev => ({
          ...prev,
          clientId: client.get_client_id(),
        }));

        // Auto-connect if requested
        if (options.autoConnect && options.serverUrl) {
          client.connect(options.serverUrl);
        }
      }).catch((error) => {
        console.error('Failed to load WASM network client:', error);
        if (options.onError) {
          options.onError(`Failed to load network client: ${error.message}`);
        }
      });
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current.free();
        clientRef.current = null;
      }
    };
  }, [options.autoConnect, options.serverUrl, options.onMessage, options.onConnectionChange, options.onError]);

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
  const sendSpriteUpdate = useCallback((spriteData: any) => {
    if (clientRef.current) {
      clientRef.current.send_sprite_update(spriteData);
    }
  }, []);

  const sendSpriteCreate = useCallback((spriteData: any) => {
    if (clientRef.current) {
      clientRef.current.send_sprite_create(spriteData);
    }
  }, []);

  const sendSpriteRemove = useCallback((spriteId: string) => {
    if (clientRef.current) {
      clientRef.current.send_sprite_remove(spriteId);
    }
  }, []);

  const sendTableUpdate = useCallback((tableData: any) => {
    if (clientRef.current) {
      clientRef.current.send_table_update(tableData);
    }
  }, []);

  // Generic message sending
  const sendMessage = useCallback((messageType: string, data: any) => {
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
