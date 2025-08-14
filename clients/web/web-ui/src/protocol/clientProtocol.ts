/**
 * Protocol-compliant WebSocket client that integrates with existing server architecture
 * Handles all message types defined in protocol.py with proper authentication
 */
import type { Message, MessageHandler } from './message';
import { MessageType, createMessage, parseMessage } from './message';
import { authService } from '../services/auth.service';

export class WebClientProtocol {
  private handlers = new Map<string, MessageHandler>();
  private websocket: WebSocket | null = null;
  private messageQueue: Message[] = [];
  private pingInterval: number | null = null;
  private sessionCode: string;

  constructor(sessionCode: string) {
    this.sessionCode = sessionCode;
    this.registerBuiltInHandlers();
  }

  private registerBuiltInHandlers(): void {
    // Core message handlers
    this.registerHandler(MessageType.WELCOME, this.handleWelcome.bind(this));
    this.registerHandler(MessageType.PING, this.handlePing.bind(this));
    this.registerHandler(MessageType.PONG, this.handlePong.bind(this));
    this.registerHandler(MessageType.ERROR, this.handleError.bind(this));
    this.registerHandler(MessageType.SUCCESS, this.handleSuccess.bind(this));

    // Player management
    this.registerHandler(MessageType.PLAYER_JOINED, this.handlePlayerJoined.bind(this));
    this.registerHandler(MessageType.PLAYER_LEFT, this.handlePlayerLeft.bind(this));
    this.registerHandler(MessageType.PLAYER_LIST_RESPONSE, this.handlePlayerListResponse.bind(this));

    // Table management
    this.registerHandler(MessageType.TABLE_DATA, this.handleTableData.bind(this));
    this.registerHandler(MessageType.TABLE_UPDATE, this.handleTableUpdate.bind(this));
    this.registerHandler(MessageType.TABLE_LIST_RESPONSE, this.handleTableListResponse.bind(this));

    // Sprite management
    this.registerHandler(MessageType.SPRITE_CREATE, this.handleSpriteCreate.bind(this));
    this.registerHandler(MessageType.SPRITE_UPDATE, this.handleSpriteUpdate.bind(this));
    this.registerHandler(MessageType.SPRITE_REMOVE, this.handleSpriteRemove.bind(this));
    this.registerHandler(MessageType.SPRITE_MOVE, this.handleSpriteMove.bind(this));
    this.registerHandler(MessageType.SPRITE_SCALE, this.handleSpriteScale.bind(this));
    this.registerHandler(MessageType.SPRITE_ROTATE, this.handleSpriteRotate.bind(this));

    // Asset management
    this.registerHandler(MessageType.ASSET_DOWNLOAD_RESPONSE, this.handleAssetDownloadResponse.bind(this));
    this.registerHandler(MessageType.ASSET_LIST_RESPONSE, this.handleAssetListResponse.bind(this));
    this.registerHandler(MessageType.ASSET_UPLOAD_RESPONSE, this.handleAssetUploadResponse.bind(this));

    // Character management
    this.registerHandler(MessageType.CHARACTER_LOAD_RESPONSE, this.handleCharacterLoadResponse.bind(this));
    this.registerHandler(MessageType.CHARACTER_SAVE_RESPONSE, this.handleCharacterSaveResponse.bind(this));
    this.registerHandler(MessageType.CHARACTER_LIST_RESPONSE, this.handleCharacterListResponse.bind(this));
  }

  registerHandler(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  async connect(): Promise<void> {
    const token = authService.getToken();
    
    // In development mode, create a mock token if none exists
    let authToken = token;
    if (!authToken && import.meta.env.DEV) {
      console.log('Development mode: using mock token');
      authToken = 'dev_mock_token';
    }
    
    if (!authToken) {
      throw new Error('No authentication token available');
    }

    const wsUrl = `ws://127.0.0.1:12345/ws/game/${this.sessionCode}?token=${encodeURIComponent(authToken)}`;

    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
          console.log('WebSocket connected to authenticated session:', this.sessionCode);
          this.flushMessageQueue();
          this.startPingInterval();
          resolve();
        };

        this.websocket.onmessage = (event) => {
          this.handleIncomingMessage(event.data);
        };

        this.websocket.onclose = (event) => {
          console.log('WebSocket connection closed:', event.code, event.reason);
          this.stopPingInterval();
          if (event.code === 1008 && !import.meta.env.DEV) {
            reject(new Error('Authentication failed - invalid token'));
          }
        };

        this.websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.stopPingInterval();
          reject(new Error('WebSocket connection failed'));
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private async handleIncomingMessage(data: string): Promise<void> {
    try {
      const message = parseMessage(data);
      const handler = this.handlers.get(message.type);
      
      if (handler) {
        await handler(message);
      } else {
        console.warn('No handler for message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling incoming message:', error);
    }
  }

  sendMessage(message: Message): void {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
    } else {
      // Queue message for later if not connected
      this.messageQueue.push(message);
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.websocket?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift()!;
      this.websocket.send(JSON.stringify(message));
    }
  }

  private startPingInterval(): void {
    this.pingInterval = window.setInterval(() => {
      if (this.websocket?.readyState === WebSocket.OPEN) {
        this.sendMessage(createMessage(MessageType.PING));
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // Message handler implementations
  private async handleWelcome(message: Message): Promise<void> {
    console.log('Welcome to session:', message.data);
    // Request initial data
    this.requestTableList();
    this.requestPlayerList();
  }

  private async handlePing(message: Message): Promise<void> {
    // Respond to ping with pong
    this.sendMessage(createMessage(MessageType.PONG, message.data));
  }

  private async handlePong(_message: Message): Promise<void> {
    // Handle pong response - connection alive
    console.log('Pong received - connection alive');
  }

  private async handleError(message: Message): Promise<void> {
    console.error('Server error:', message.data);
    // Emit error event for UI handling
    window.dispatchEvent(new CustomEvent('protocol-error', { detail: message.data }));
  }

  private async handleSuccess(message: Message): Promise<void> {
    console.log('Operation successful:', message.data);
  }

  private async handlePlayerJoined(message: Message): Promise<void> {
    console.log('Player joined:', message.data);
    window.dispatchEvent(new CustomEvent('player-joined', { detail: message.data }));
  }

  private async handlePlayerLeft(message: Message): Promise<void> {
    console.log('Player left:', message.data);
    window.dispatchEvent(new CustomEvent('player-left', { detail: message.data }));
  }

  private async handlePlayerListResponse(message: Message): Promise<void> {
    console.log('Player list received:', message.data);
    window.dispatchEvent(new CustomEvent('player-list-updated', { detail: message.data }));
  }

  private async handleTableData(message: Message): Promise<void> {
    console.log('Table data received:', message.data);
    window.dispatchEvent(new CustomEvent('table-data-received', { detail: message.data }));
  }

  private async handleTableUpdate(message: Message): Promise<void> {
    console.log('Table update:', message.data);
    window.dispatchEvent(new CustomEvent('table-updated', { detail: message.data }));
  }

  private async handleTableListResponse(message: Message): Promise<void> {
    console.log('Table list received:', message.data);
    window.dispatchEvent(new CustomEvent('table-list-updated', { detail: message.data }));
  }

  // Sprite handlers - integrate with existing store/WASM
  private async handleSpriteCreate(message: Message): Promise<void> {
    console.log('Sprite created:', message.data);
    window.dispatchEvent(new CustomEvent('sprite-created', { detail: message.data }));
  }

  private async handleSpriteUpdate(message: Message): Promise<void> {
    console.log('Sprite updated:', message.data);
    window.dispatchEvent(new CustomEvent('sprite-updated', { detail: message.data }));
  }

  private async handleSpriteRemove(message: Message): Promise<void> {
    console.log('Sprite removed:', message.data);
    window.dispatchEvent(new CustomEvent('sprite-removed', { detail: message.data }));
  }

  private async handleSpriteMove(message: Message): Promise<void> {
    console.log('Sprite moved:', message.data);
    window.dispatchEvent(new CustomEvent('sprite-moved', { detail: message.data }));
  }

  private async handleSpriteScale(message: Message): Promise<void> {
    console.log('Sprite scaled:', message.data);
    window.dispatchEvent(new CustomEvent('sprite-scaled', { detail: message.data }));
  }

  private async handleSpriteRotate(message: Message): Promise<void> {
    console.log('Sprite rotated:', message.data);
    window.dispatchEvent(new CustomEvent('sprite-rotated', { detail: message.data }));
  }

  // Asset management handlers
  private async handleAssetDownloadResponse(message: Message): Promise<void> {
    console.log('Asset download response:', message.data);
    window.dispatchEvent(new CustomEvent('asset-downloaded', { detail: message.data }));
  }

  private async handleAssetListResponse(message: Message): Promise<void> {
    console.log('Asset list response:', message.data);
    window.dispatchEvent(new CustomEvent('asset-list-updated', { detail: message.data }));
  }

  private async handleAssetUploadResponse(message: Message): Promise<void> {
    console.log('Asset upload response:', message.data);
    window.dispatchEvent(new CustomEvent('asset-uploaded', { detail: message.data }));
  }

  // Character management handlers
  private async handleCharacterLoadResponse(message: Message): Promise<void> {
    console.log('Character loaded:', message.data);
    window.dispatchEvent(new CustomEvent('character-loaded', { detail: message.data }));
  }

  private async handleCharacterSaveResponse(message: Message): Promise<void> {
    console.log('Character saved:', message.data);
    window.dispatchEvent(new CustomEvent('character-saved', { detail: message.data }));
  }

  private async handleCharacterListResponse(message: Message): Promise<void> {
    console.log('Character list received:', message.data);
    window.dispatchEvent(new CustomEvent('character-list-updated', { detail: message.data }));
  }

  // Public API methods for sending requests
  requestTableList(): void {
    this.sendMessage(createMessage(MessageType.TABLE_LIST_REQUEST));
  }

  requestPlayerList(): void {
    this.sendMessage(createMessage(MessageType.PLAYER_LIST_REQUEST));
  }

  createSprite(spriteData: Record<string, unknown>): void {
    this.sendMessage(createMessage(MessageType.SPRITE_CREATE, { sprite: spriteData }, 2));
  }

  updateSprite(spriteId: string, updates: Record<string, unknown>): void {
    this.sendMessage(createMessage(MessageType.SPRITE_UPDATE, { sprite_id: spriteId, ...updates }, 2));
  }

  moveSprite(spriteId: string, x: number, y: number): void {
    this.sendMessage(createMessage(MessageType.SPRITE_MOVE, { sprite_id: spriteId, x, y }, 1));
  }

  removeSprite(spriteId: string): void {
    this.sendMessage(createMessage(MessageType.SPRITE_REMOVE, { sprite_id: spriteId }, 2));
  }

  // Asset management methods
  requestAssetList(): void {
    this.sendMessage(createMessage(MessageType.ASSET_LIST_REQUEST));
  }

  uploadAsset(assetData: Record<string, unknown>): void {
    this.sendMessage(createMessage(MessageType.ASSET_UPLOAD_REQUEST, assetData));
  }

  downloadAsset(assetId: string): void {
    this.sendMessage(createMessage(MessageType.ASSET_DOWNLOAD_REQUEST, { asset_id: assetId }));
  }

  // Character management methods
  saveCharacter(characterData: Record<string, unknown>): void {
    this.sendMessage(createMessage(MessageType.CHARACTER_SAVE_REQUEST, characterData));
  }

  loadCharacter(characterId: string): void {
    this.sendMessage(createMessage(MessageType.CHARACTER_LOAD_REQUEST, { character_id: characterId }));
  }

  requestCharacterList(): void {
    this.sendMessage(createMessage(MessageType.CHARACTER_LIST_REQUEST));
  }

  disconnect(): void {
    this.stopPingInterval();
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }

  isConnected(): boolean {
    return this.websocket?.readyState === WebSocket.OPEN;
  }
}
