// WebSocket service for connecting to FastAPI backend
import { protocolLogger, logger } from '../utils/logger';

export interface GameMessage {
  type: string;
  data?: Record<string, unknown>;
  client_id?: string;
  timestamp?: number;
  version?: string;
  priority?: number;
  sequence_id?: number;
}

export interface Sprite {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageUrl?: string;
  isSelected: boolean;
  isVisible: boolean;
  layer: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessageCallbacks: Set<(message: GameMessage) => void> = new Set();
  private onConnectionStateCallbacks: Set<(state: ConnectionState) => void> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  constructor(url: string = 'ws://127.0.0.1:12345/ws/game') { 
    this.url = url;
  }

  connect(): Promise<void> { 
    return new Promise((resolve, reject) => {
      try {
        this.notifyConnectionState('connecting');
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          protocolLogger.connection('WebSocket connected to FastAPI server');
          this.reconnectAttempts = 0;
          this.notifyConnectionState('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: GameMessage = JSON.parse(event.data);
            protocolLogger.message('received', message);
            this.notifyMessage(message);
          } catch (error) {
            protocolLogger.error('Error parsing WebSocket message', error);
          }
        };

        this.ws.onclose = (event) => {
          protocolLogger.connection('WebSocket connection closed', { code: event.code, reason: event.reason });
          this.notifyConnectionState('disconnected');
          
          // Attempt to reconnect
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => {
              this.connect();
            }, this.reconnectDelay * this.reconnectAttempts);
          }
        };

        this.ws.onerror = (error) => {
          protocolLogger.error('WebSocket error', error);
          this.notifyConnectionState('error');
          reject(error);
        };

      } catch (error) {
        this.notifyConnectionState('error');
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyConnectionState('disconnected');
  }

  sendMessage(message: Partial<GameMessage>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const fullMessage: GameMessage = {
        ...message,
        timestamp: Date.now() / 1000,
        version: '0.1',
        priority: message.priority || 5,
        type: message.type || 'unknown'
      };
      protocolLogger.message('sent', fullMessage);
      this.ws.send(JSON.stringify(fullMessage));
    } else {
      logger.warn('WebSocket not connected. Message not sent', message);
    }
  }

  // Specific game actions following the protocol
  joinGame(sessionId: string) {
    this.sendMessage({
      type: 'new_table_request',
      data: { session_id: sessionId }
    });
  }

  moveSprite(spriteId: string, x: number, y: number) {
    this.sendMessage({
      type: 'sprite_move',
      data: { sprite_id: spriteId, x, y },
      priority: 2 // High priority for real-time movement
    });
  }

  createSprite(sprite: Partial<Sprite>) {
    this.sendMessage({
      type: 'sprite_create',
      data: { sprite }
    });
  }

  deleteSprite(spriteId: string) {
    this.sendMessage({
      type: 'sprite_remove',
      data: { sprite_id: spriteId }
    });
  }

  updateCamera(x: number, y: number, zoom: number) {
    this.sendMessage({
      type: 'table_move',
      data: { x, y, zoom },
      priority: 3 // Medium priority for camera updates
    });
  }

  // Event subscription methods
  onMessage(callback: (message: GameMessage) => void) {
    this.onMessageCallbacks.add(callback);
    return () => this.onMessageCallbacks.delete(callback);
  }

  onConnectionStateChange(callback: (state: ConnectionState) => void) {
    this.onConnectionStateCallbacks.add(callback);
    return () => this.onConnectionStateCallbacks.delete(callback);
  }

  private notifyMessage(message: GameMessage) {
    this.onMessageCallbacks.forEach(callback => {
      try {
        callback(message);
      } catch (error) {
        console.error('Error in message callback:', error);
      }
    });
  }

  private notifyConnectionState(state: ConnectionState) {
    this.onConnectionStateCallbacks.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error('Error in connection state callback:', error);
      }
    });
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get connectionState(): ConnectionState {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'error';
    }
  }
}

// Create singleton instance
export const webSocketService = new WebSocketService();
