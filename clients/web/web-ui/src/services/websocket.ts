// WebSocket service following the protocol.py structure
export const MessageType = {
  // Core messages
  PING: "ping",
  PONG: "pong",
  ERROR: "error",
  TEST: "test",
  SUCCESS: "success",
  WELCOME: "welcome",

  // Authentication messages
  AUTH_REGISTER: "auth_register",
  AUTH_LOGIN: "auth_login",
  AUTH_LOGOUT: "auth_logout",
  AUTH_TOKEN: "auth_token",
  AUTH_STATUS: "auth_status",

  // Table sync
  NEW_TABLE_REQUEST: "new_table_request",
  NEW_TABLE_RESPONSE: "new_table_response",
  TABLE_REQUEST: "table_request",
  TABLE_RESPONSE: "table_response",
  TABLE_DATA: "table_data",
  TABLE_UPDATE: "table_update",
  TABLE_SCALE: "table_scale",
  TABLE_MOVE: "table_move",
  TABLE_LIST_REQUEST: "table_list_request",
  TABLE_LIST_RESPONSE: "table_list_response",
  TABLE_DELETE: "table_delete",

  // Player actions
  PLAYER_ACTION: "player_action",
  PLAYER_ACTION_RESPONSE: "player_action_response",
  PLAYER_ACTION_UPDATE: "player_action_update",
  PLAYER_ACTION_REMOVE: "player_action_remove",
  PLAYER_LEFT: "player_left",
  PLAYER_JOINED: "player_joined",
  PLAYER_READY: "player_ready",
  PLAYER_UNREADY: "player_unready",
  PLAYER_STATUS: "player_status",
  PLAYER_LIST_REQUEST: "player_list_request",
  PLAYER_LIST_RESPONSE: "player_list_response",
  PLAYER_KICK_REQUEST: "player_kick_request",
  PLAYER_BAN_REQUEST: "player_ban_request",
  PLAYER_KICK_RESPONSE: "player_kick_response",
  PLAYER_BAN_RESPONSE: "player_ban_response",
  CONNECTION_STATUS_REQUEST: "connection_status_request",
  CONNECTION_STATUS_RESPONSE: "connection_status_response",

  // Sprite sync
  SPRITE_REQUEST: "sprite_request",
  SPRITE_RESPONSE: "sprite_response",
  SPRITE_DATA: "sprite_data",
  SPRITE_UPDATE: "sprite_update",
  SPRITE_REMOVE: "sprite_remove",
  SPRITE_CREATE: "sprite_create",
  SPRITE_MOVE: "sprite_move",
  SPRITE_SCALE: "sprite_scale",
  SPRITE_ROTATE: "sprite_rotate",

  // Extension point
  CUSTOM: "custom"
} as const;

export type MessageType = typeof MessageType[keyof typeof MessageType];

export interface Message {
  type: MessageType;
  data?: Record<string, any>;
  client_id?: string;
  timestamp?: number;
  version?: string;
  priority?: number;
  sequence_id?: number;
}

export type MessageHandler = (message: Message) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private handlers: Map<MessageType, MessageHandler[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private isReconnecting = false;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.emit(MessageType.WELCOME, { connected: true });
          resolve();
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          this.handleDisconnection();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onmessage = (event) => {
          try {
            const message: Message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(type: MessageType, data?: Record<string, any>, priority = 5): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send message');
      return;
    }

    const message: Message = {
      type,
      data: data || {},
      timestamp: Date.now(),
      version: "0.1",
      priority,
      sequence_id: this.generateSequenceId()
    };

    this.ws.send(JSON.stringify(message));
  }

  on(type: MessageType, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  off(type: MessageType, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private handleMessage(message: Message): void {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }

    // Handle built-in message types
    switch (message.type) {
      case MessageType.PING:
        this.send(MessageType.PONG, message.data);
        break;
      case MessageType.ERROR:
        console.error('Server error:', message.data);
        break;
    }
  }

  private handleDisconnection(): void {
    this.emit(MessageType.PLAYER_LEFT, { disconnected: true });
    
    if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.isReconnecting = true;
      setTimeout(() => {
        this.reconnect();
      }, this.reconnectDelay);
    }
  }

  private async reconnect(): Promise<void> {
    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    try {
      await this.connect();
    } catch (error) {
      console.error('Reconnection failed:', error);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Max 30 seconds
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => this.reconnect(), this.reconnectDelay);
      } else {
        console.error('Max reconnection attempts reached');
        this.isReconnecting = false;
      }
    }
  }

  private emit(type: MessageType, data: Record<string, any>): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const message: Message = { type, data, timestamp: Date.now() };
      handlers.forEach(handler => handler(message));
    }
  }

  private generateSequenceId(): number {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let wsService: WebSocketService | null = null;

export const getWebSocketService = (url?: string): WebSocketService => {
  if (!wsService && url) {
    wsService = new WebSocketService(url);
  }
  return wsService!;
};
