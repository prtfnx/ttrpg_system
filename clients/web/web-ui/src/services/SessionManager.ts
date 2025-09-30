import type { UserInfo } from './auth.service';

export interface SessionInfo {
  id: string;
  code: string;
  hostUserId: string;
  name: string;
  isActive: boolean;
  participants: UserInfo[];
  createdAt: Date;
  lastActivity: Date;
}

export interface SessionCreateOptions {
  name: string;
  isPublic?: boolean;
  maxParticipants?: number;
}

export interface SessionJoinOptions {
  code: string;
  userInfo: UserInfo;
}

export class SessionManager {
  private currentSession: SessionInfo | null = null;
  private websocket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private heartbeatInterval: number | null = null;
  private eventListeners: Map<string, Function[]> = new Map();
  private baseUrl: string;

  constructor(baseUrl: string = 'ws://localhost:8000/ws') {
    this.baseUrl = baseUrl;
  }

  /**
   * Create a new session with unique code
   */
  async createSession(options: SessionCreateOptions, hostUser: UserInfo): Promise<SessionInfo> {
    const sessionCode = this.generateSessionCode();
    const session: SessionInfo = {
      id: crypto.randomUUID(),
      code: sessionCode,
      hostUserId: hostUser.id.toString(),
      name: options.name,
      isActive: true,
      participants: [hostUser],
      createdAt: new Date(),
      lastActivity: new Date()
    };

    this.currentSession = session;
    await this.connectWebSocket(session.code, hostUser);
    this.emit('sessionCreated', session);
    
    return session;
  }

  /**
   * Join existing session with code validation
   */
  async joinSession(options: SessionJoinOptions): Promise<SessionInfo> {
    if (!this.validateSessionCode(options.code)) {
      throw new Error('Invalid session code format');
    }

    await this.connectWebSocket(options.code, options.userInfo);
    
    // Send join request and wait for response
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Session join timeout'));
      }, 10000);

      this.once('sessionJoined', (session: SessionInfo) => {
        clearTimeout(timeoutId);
        this.currentSession = session;
        resolve(session);
      });

      this.once('sessionJoinError', (error: string) => {
        clearTimeout(timeoutId);
        reject(new Error(error));
      });

      this.sendMessage('join_session', {
        code: options.code,
        userInfo: options.userInfo
      });
    });
  }

  /**
   * Leave current session
   */
  async leaveSession(): Promise<void> {
    if (this.currentSession) {
      this.sendMessage('leave_session', { sessionId: this.currentSession.id });
      this.emit('sessionLeft', this.currentSession);
      this.currentSession = null;
    }
    this.disconnectWebSocket();
  }

  /**
   * Get current session info
   */
  getCurrentSession(): SessionInfo | null {
    return this.currentSession;
  }

  /**
   * Send real-time message to session participants
   */
  sendMessage(type: string, data: any): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ type, data, timestamp: Date.now() }));
    } else {
      console.warn('WebSocket not connected, message not sent:', type, data);
    }
  }

  /**
   * Broadcast token movement to all participants
   */
  broadcastTokenMovement(tokenId: string, position: { x: number; y: number }): void {
    this.sendMessage('token_movement', {
      tokenId,
      position,
      userId: this.getCurrentUserId()
    });
  }

  /**
   * Broadcast dice roll result
   */
  broadcastDiceRoll(result: any): void {
    this.sendMessage('dice_roll', {
      result,
      userId: this.getCurrentUserId(),
      timestamp: Date.now()
    });
  }

  /**
   * Send chat message
   */
  sendChatMessage(message: string): void {
    this.sendMessage('chat_message', {
      message,
      userId: this.getCurrentUserId(),
      timestamp: Date.now()
    });
  }

  /**
   * Event listener management
   */
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  once(event: string, callback: Function): void {
    const wrappedCallback = (...args: any[]) => {
      this.off(event, wrappedCallback);
      callback(...args);
    };
    this.on(event, wrappedCallback);
  }

  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(...args));
    }
  }

  /**
   * WebSocket connection management
   */
  private async connectWebSocket(sessionCode: string, userInfo: UserInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.baseUrl}/session/${sessionCode}?userId=${userInfo.id}&username=${encodeURIComponent(userInfo.username)}`;
      
      this.websocket = new WebSocket(wsUrl);
      
      this.websocket.onopen = () => {
        console.log('WebSocket connected to session:', sessionCode);
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        resolve();
      };

      this.websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.websocket.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.stopHeartbeat();
        
        if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect(sessionCode, userInfo);
        }
        
        this.emit('connectionClosed', event);
      };

      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('connectionError', error);
        reject(error);
      };

      // Connection timeout
      setTimeout(() => {
        if (this.websocket?.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  private disconnectWebSocket(): void {
    this.stopHeartbeat();
    if (this.websocket) {
      this.websocket.close(1000, 'Session ended');
      this.websocket = null;
    }
  }

  private handleWebSocketMessage(message: any): void {
    const { type, data } = message;
    
    switch (type) {
      case 'session_joined':
        this.emit('sessionJoined', data.session);
        break;
      case 'session_join_error':
        this.emit('sessionJoinError', data.error);
        break;
      case 'participant_joined':
        this.emit('participantJoined', data.participant);
        break;
      case 'participant_left':
        this.emit('participantLeft', data.participant);
        break;
      case 'token_movement':
        this.emit('tokenMoved', data);
        break;
      case 'dice_roll':
        this.emit('diceRolled', data);
        break;
      case 'chat_message':
        this.emit('chatMessage', data);
        break;
      case 'session_updated':
        if (this.currentSession) {
          this.currentSession = { ...this.currentSession, ...data.session };
          this.emit('sessionUpdated', this.currentSession);
        }
        break;
      case 'heartbeat_response':
        // Heartbeat acknowledged
        break;
      default:
        console.warn('Unknown WebSocket message type:', type);
        this.emit('unknownMessage', message);
    }
  }

  private attemptReconnect(sessionCode: string, userInfo: UserInfo): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.connectWebSocket(sessionCode, userInfo);
        this.emit('reconnected');
      } catch (error) {
        console.error('Reconnection failed:', error);
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.emit('reconnectionFailed');
        }
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.websocket?.readyState === WebSocket.OPEN) {
        this.sendMessage('heartbeat', { timestamp: Date.now() });
      }
    }, 30000); // 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private generateSessionCode(): string {
    // Generate 6-character alphanumeric code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private validateSessionCode(code: string): boolean {
    return /^[A-Z0-9]{6}$/.test(code);
  }

  private getCurrentUserId(): string {
    return this.currentSession?.participants.find(p => p.id)?.id.toString() || 'unknown';
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.websocket?.readyState === WebSocket.OPEN;
  }

  /**
   * Get session participants
   */
  getParticipants(): UserInfo[] {
    return this.currentSession?.participants || [];
  }

  /**
   * Check if current user is session host
   */
  isHost(userId: string): boolean {
    return this.currentSession?.hostUserId === userId;
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
export default SessionManager;