
// All member variables and methods are now inside the WebClientProtocol class body below.
/**
 * Protocol-compliant WebSocket client that integrates with existing server architecture
 * Handles all message types defined in protocol.py with proper authentication
 */

import { useAssetCharacterCache } from '../assetCharacterCache';
import type { Message, MessageHandler } from './message';
import { MessageType, createMessage, parseMessage } from './message';


export class WebClientProtocol {
  private handlers = new Map<string, MessageHandler>();
  private websocket: WebSocket | null = null;
  private messageQueue: Message[] = [];
  private pingInterval: number | null = null;
  private sessionCode: string;

  // --- Performance Optimization: Message Batching & Delta Updates ---
  private batchQueue: Message[] = [];
  private batchTimer: number | null = null;
  private sequenceNumber: number = 0;

  /** Queue message for batching, flush after short delay or if batch is large */
  queueMessage(msg: Message) {
    this.batchQueue.push(msg);
    if (!this.batchTimer) {
      this.batchTimer = window.setTimeout(() => this.sendBatch(), 20);
    }
    if (this.batchQueue.length > 20) this.sendBatch();
  }

  /** Send all batched messages as a single batch */
  sendBatch() {
    if (this.batchQueue.length === 0) return;
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'batch',
        messages: this.batchQueue,
        seq: ++this.sequenceNumber
      }));
      this.batchQueue = [];
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
    }
  }

  /** Send only changed fields (delta) for updates */
  sendDelta(type: MessageType, id: string, changes: Record<string, any>) {
    const msg: Message = {
      type,
      data: { id, changes },
      priority: 1,
      version: "1"
    };
    this.queueMessage(msg);
  }

  /** Override sendMessage to use batching for non-critical messages */
  sendMessage(message: Message): void {
    // Critical messages (table, actions, player) sent immediately
    const critical = [
      'table_data', 'table_update', 'sprite_create', 'sprite_remove',
      'player_kick_request', 'player_ban_request', 'player_list_request',
      'character_save', 'character_load', 'asset_upload', 'asset_download'
    ];
    if (critical.includes(message.type)) {
      if (this.websocket?.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify(message));
      } else {
        this.messageQueue.push(message);
      }
    } else {
      this.queueMessage(message);
    }
  }

  constructor(sessionCode: string) {
    this.sessionCode = sessionCode;
    this.registerBuiltInHandlers();
    this.setupProtocolMessageSender();
  }

  // Compendium helpers
  addCompendiumSprite(tableId: string, spriteData: Record<string, unknown>): void {
    this.sendMessage(createMessage(MessageType.COMPENDIUM_SPRITE_ADD, {
      table_id: tableId,
      sprite_data: spriteData,
      session_code: this.sessionCode
    }, 2));
  }

  private setupProtocolMessageSender(): void {
    // Listen for requests to send protocol messages
    const handleProtocolSendMessage = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.type && customEvent.detail.data) {
        this.sendMessage(createMessage(
          customEvent.detail.type,
          customEvent.detail.data,
          5
        ));
      }
    };
    
    window.addEventListener('protocol-send-message', handleProtocolSendMessage);
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
    this.registerHandler(MessageType.TABLE_RESPONSE, this.handleTableResponse.bind(this));
    this.registerHandler(MessageType.TABLE_LIST_RESPONSE, this.handleTableListResponse.bind(this));
    this.registerHandler(MessageType.NEW_TABLE_RESPONSE, this.handleNewTableResponse.bind(this));

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

  // Compendium handlers
  this.registerHandler(MessageType.COMPENDIUM_SPRITE_ADD, async (m) => { window.dispatchEvent(new CustomEvent('compendium-sprite-added', { detail: m.data })); });
  this.registerHandler(MessageType.COMPENDIUM_SPRITE_UPDATE, async (m) => { window.dispatchEvent(new CustomEvent('compendium-sprite-updated', { detail: m.data })); });
  this.registerHandler(MessageType.COMPENDIUM_SPRITE_REMOVE, async (m) => { window.dispatchEvent(new CustomEvent('compendium-sprite-removed', { detail: m.data })); });

    // Character management
    this.registerHandler(MessageType.CHARACTER_LOAD_RESPONSE, this.handleCharacterLoadResponse.bind(this));
    this.registerHandler(MessageType.CHARACTER_SAVE_RESPONSE, this.handleCharacterSaveResponse.bind(this));
    this.registerHandler(MessageType.CHARACTER_LIST_RESPONSE, this.handleCharacterListResponse.bind(this));
  }

  registerHandler(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  async connect(): Promise<void> {
    // Use dynamic WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
  const wsUrl = `${protocol}//${host}/ws/game/${this.sessionCode}`;
  // Debug: report the exact session code the browser will use for the WS connect
  try { console.debug('[WS] Connecting to session code:', this.sessionCode, 'wsUrl:', wsUrl); } catch(e) {}

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
          if (event.code === 1008) {
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

  // ...existing code...

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
    
    // Check if this is a table-related success message
    if (message.data && message.data.table_id) {
      window.dispatchEvent(new CustomEvent('table-deleted', { detail: message.data }));
    }
    
    window.dispatchEvent(new CustomEvent('protocol-success', { detail: message.data }));
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

  private async handleNewTableResponse(message: Message): Promise<void> {
    console.log('New table created:', message.data);
    window.dispatchEvent(new CustomEvent('new-table-response', { detail: message.data }));
  }

  private async handleTableResponse(message: Message): Promise<void> {
    console.log('Table response received:', message.data);
    window.dispatchEvent(new CustomEvent('table-response', { detail: message.data }));
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
    // Upsert asset into cache
    if (message.data && typeof message.data.id === 'string') {
      useAssetCharacterCache.getState().upsertAsset({
        id: String(message.data.id),
        name: typeof message.data.name === 'string' ? message.data.name : '',
        url: typeof message.data.url === 'string' ? message.data.url : '',
        hash: typeof message.data.hash === 'string' ? message.data.hash : undefined,
        type: typeof message.data.type === 'string' ? message.data.type : undefined,
      });
    }
    window.dispatchEvent(new CustomEvent('asset-downloaded', { detail: message.data }));
  }


  private async handleAssetListResponse(message: Message): Promise<void> {
    console.log('Asset list response:', message.data);
    // Bulk load assets into cache
    if (Array.isArray(message.data?.assets)) {
      const validAssets = message.data.assets.filter(
        (a: any) => a && typeof a.id === 'string'
      ).map((a: any) => ({
        id: String(a.id),
        name: typeof a.name === 'string' ? a.name : '',
        url: typeof a.url === 'string' ? a.url : '',
        hash: typeof a.hash === 'string' ? a.hash : undefined,
        type: typeof a.type === 'string' ? a.type : undefined,
      }));
      useAssetCharacterCache.getState().bulkLoadAssets(validAssets);
    }
    window.dispatchEvent(new CustomEvent('asset-list-updated', { detail: message.data }));
  }

  private async handleAssetUploadResponse(message: Message): Promise<void> {
    console.log('Asset upload response:', message.data);
    window.dispatchEvent(new CustomEvent('asset-uploaded', { detail: message.data }));
  }

  // Character management handlers

  private async handleCharacterLoadResponse(message: Message): Promise<void> {
    console.log('Character loaded:', message.data);
    // Upsert character into cache
    if (message.data && typeof message.data.id === 'string') {
      useAssetCharacterCache.getState().upsertCharacter({
        id: String(message.data.id),
        name: typeof message.data.name === 'string' ? message.data.name : '',
        data: message.data,
      });
    }
    window.dispatchEvent(new CustomEvent('character-loaded', { detail: message.data }));
  }

  private async handleCharacterSaveResponse(message: Message): Promise<void> {
    console.log('Character saved:', message.data);
    window.dispatchEvent(new CustomEvent('character-saved', { detail: message.data }));
  }


  private async handleCharacterListResponse(message: Message): Promise<void> {
    console.log('Character list received:', message.data);
    // Bulk load characters into cache
    if (Array.isArray(message.data?.characters)) {
      const validChars = message.data.characters.filter(
        (c: any) => c && typeof c.id === 'string'
      ).map((c: any) => ({
        id: String(c.id),
        name: typeof c.name === 'string' ? c.name : '',
        data: c,
      }));
      useAssetCharacterCache.getState().bulkLoadCharacters(validChars);
    }
    window.dispatchEvent(new CustomEvent('character-list-updated', { detail: message.data }));
  }

  // Public API methods for sending requests
  requestTableList(): void {
    this.sendMessage(createMessage(MessageType.TABLE_LIST_REQUEST));
  }

  createNewTable(name: string, width: number, height: number): void {
    this.sendMessage(createMessage(MessageType.NEW_TABLE_REQUEST, {
      table_name: name,
      width,
      height
    }));
  }

  deleteTable(tableId: string): void {
    this.sendMessage(createMessage(MessageType.TABLE_DELETE, {
      table_id: tableId
    }));
  }

  requestTableData(tableId: string): void {
    this.sendMessage(createMessage(MessageType.TABLE_REQUEST, {
      table_id: tableId
    }));
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
