
// All member variables and methods are now inside the WebClientProtocol class body below.
/**
 * Protocol-compliant WebSocket client that integrates with existing server architecture
 * Handles all message types defined in protocol.py with proper authentication
 */

import { useAssetCharacterCache } from '../assetCharacterCache';
import { useGameStore } from '../store';
import { logger, protocolLogger } from '../utils/logger';
import type { Message, MessageHandler } from './message';
import { MessageType, createMessage, parseMessage } from './message';


export class WebClientProtocol {
  private handlers = new Map<string, MessageHandler>();
  private websocket: WebSocket | null = null;
  private connecting: boolean = false;
  private messageQueue: Message[] = [];
  private pingInterval: number | null = null;
  private sessionCode: string;

  // --- Performance Optimization: Message Batching & Delta Updates ---
  private batchQueue: Message[] = [];
  private batchTimer: number | null = null;
  private readonly BATCH_DELAY_MS = 30; // Optimal delay for responsiveness vs efficiency
  private readonly MAX_BATCH_SIZE = 15; // Reasonable limit to prevent large payloads

  /** Queue message for batching, flush after short delay or if batch is large */
  queueMessage(msg: Message) {
    // Skip batching if connection is not stable
    if (this.websocket?.readyState !== WebSocket.OPEN) {
      console.log('⚠️ Protocol: WebSocket not open, cannot queue message. State:', this.websocket?.readyState);
      return;
    }

    console.log('📦 Protocol: Adding message to batch queue:', { type: msg.type, queueLength: this.batchQueue.length + 1 });
    this.batchQueue.push(msg);
    
    // Start timer if not already running
    if (!this.batchTimer) {
      console.log(`⏰ Protocol: Starting batch timer (${this.BATCH_DELAY_MS}ms)`);
      this.batchTimer = window.setTimeout(() => this.sendBatch(), this.BATCH_DELAY_MS);
    }
    
    // Send immediately if batch is getting large
    if (this.batchQueue.length >= this.MAX_BATCH_SIZE) {
      console.log('🚀 Protocol: Batch queue full, sending immediately');
      this.sendBatch();
    }
  }

  /** Send all batched messages as a single batch */
  sendBatch() {
    console.log('📨 Protocol: sendBatch called, queue length:', this.batchQueue.length);
    
    // Clear timer first
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    if (this.batchQueue.length === 0) {
      console.log('📭 Protocol: Batch queue empty, nothing to send');
      return;
    }
    
    // Check connection state before attempting to send
    if (this.websocket?.readyState !== WebSocket.OPEN) {
      console.log('❌ Protocol: WebSocket not open, cannot send batch. State:', this.websocket?.readyState);
      // Keep messages in queue for retry when connection is restored
      return;
    }

    // Create batch message with proper structure
    const batchMessage = createMessage(MessageType.BATCH, {
      messages: [...this.batchQueue]  // Copy the array to avoid mutation issues
    }, 1);
    
    console.log('🚀 Protocol: Sending batch with', this.batchQueue.length, 'messages:', this.batchQueue.map(m => m.type));
    
    try {
      this.websocket.send(JSON.stringify(batchMessage));
      // Only clear queue after successful send
      this.batchQueue = [];
      console.log('✅ Protocol: Batch sent successfully');
    } catch (error) {
      console.error('❌ Protocol: Failed to send batch:', error);
      // Keep messages in queue for retry
    }
  }

  /** Flush any pending batched messages when connection is restored */
  flushPendingBatches() {
    if (this.batchQueue.length > 0) {
      console.log('🔄 Protocol: Flushing pending batch messages on connection restore');
      this.sendBatch();
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
    console.log('📡 Protocol: sendMessage called with:', { type: message.type, websocketState: this.websocket?.readyState });
    
    // Critical messages (table, actions, player, assets) sent immediately
    const critical = [
      'table_data', 'table_update', 'table_list_request', 'table_request', 'new_table_request', 'table_delete',
      'sprite_create', 'sprite_remove', 'player_kick_request', 'player_ban_request', 'player_list_request',
      'character_save', 'character_load', 
      'asset_upload_request', 'asset_download_request', 'asset_list_request', 'asset_delete_request', 'asset_hash_check'
    ];
    
    console.log('🔍 Protocol: Checking if message is critical:', { 
      type: message.type, 
      isCritical: critical.includes(message.type),
      criticalList: critical
    });
    
    if (critical.includes(message.type)) {
      console.log('🔥 Protocol: Critical message, sending immediately');
      if (this.websocket?.readyState === WebSocket.OPEN) {
        console.log('✅ Protocol: WebSocket open, sending message');
        this.websocket.send(JSON.stringify(message));
      } else {
        console.log('⏳ Protocol: WebSocket not open, queueing message');
        this.messageQueue.push(message);
      }
    } else {
      console.log('📦 Protocol: Non-critical message, using batch queue');
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
      console.log('🔧 Protocol: Received protocol-send-message event', customEvent.detail);
      if (customEvent.detail && customEvent.detail.type && customEvent.detail.data) {
        console.log('🚀 Protocol: Sending message via WebSocket:', {
          type: customEvent.detail.type,
          websocketState: this.websocket?.readyState,
          isConnected: this.websocket?.readyState === WebSocket.OPEN
        });
        this.sendMessage(createMessage(
          customEvent.detail.type,
          customEvent.detail.data,
          5
        ));
      } else {
        console.warn('⚠️ Protocol: Invalid protocol-send-message event detail', customEvent.detail);
      }
    };
    
    window.addEventListener('protocol-send-message', handleProtocolSendMessage);
    console.log('✅ Protocol: Registered protocol-send-message event listener');
  }

  private registerBuiltInHandlers(): void {
    // Core message handlers
    this.registerHandler(MessageType.WELCOME, this.handleWelcome.bind(this));
    this.registerHandler(MessageType.PING, this.handlePing.bind(this));
    this.registerHandler(MessageType.PONG, this.handlePong.bind(this));
    this.registerHandler(MessageType.ERROR, this.handleError.bind(this));
    this.registerHandler(MessageType.SUCCESS, this.handleSuccess.bind(this));
    this.registerHandler(MessageType.TEST, this.handleTest.bind(this));
    this.registerHandler(MessageType.BATCH, this.handleBatch.bind(this));

    // Authentication handlers
    this.registerHandler(MessageType.AUTH_STATUS, this.handleAuthStatus.bind(this));
    
    // Player management
    this.registerHandler(MessageType.PLAYER_JOINED, this.handlePlayerJoined.bind(this));
    this.registerHandler(MessageType.PLAYER_LEFT, this.handlePlayerLeft.bind(this));
    this.registerHandler(MessageType.PLAYER_LIST_RESPONSE, this.handlePlayerListResponse.bind(this));
    this.registerHandler(MessageType.PLAYER_ACTION_RESPONSE, this.handlePlayerActionResponse.bind(this));
    this.registerHandler(MessageType.PLAYER_ACTION_UPDATE, this.handlePlayerActionUpdate.bind(this));
    this.registerHandler(MessageType.PLAYER_STATUS, this.handlePlayerStatus.bind(this));
    this.registerHandler(MessageType.PLAYER_KICK_RESPONSE, this.handlePlayerKickResponse.bind(this));
    this.registerHandler(MessageType.PLAYER_BAN_RESPONSE, this.handlePlayerBanResponse.bind(this));
    this.registerHandler(MessageType.CONNECTION_STATUS_RESPONSE, this.handleConnectionStatusResponse.bind(this));

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
    this.registerHandler(MessageType.SPRITE_RESPONSE, this.handleSpriteResponse.bind(this));
    this.registerHandler(MessageType.SPRITE_DATA, this.handleSpriteData.bind(this));

    // File transfer
    this.registerHandler(MessageType.FILE_DATA, this.handleFileData.bind(this));
    
    // Asset management
    this.registerHandler(MessageType.ASSET_DOWNLOAD_RESPONSE, this.handleAssetDownloadResponse.bind(this));
    this.registerHandler(MessageType.ASSET_LIST_RESPONSE, this.handleAssetListResponse.bind(this));
    this.registerHandler(MessageType.ASSET_UPLOAD_RESPONSE, this.handleAssetUploadResponse.bind(this));
    this.registerHandler(MessageType.ASSET_DELETE_RESPONSE, this.handleAssetDeleteResponse.bind(this));
    this.registerHandler(MessageType.ASSET_HASH_CHECK, this.handleAssetHashCheck.bind(this));

    // Compendium handlers
    this.registerHandler(MessageType.COMPENDIUM_SPRITE_ADD, async (m) => { window.dispatchEvent(new CustomEvent('compendium-sprite-added', { detail: m.data })); });
    this.registerHandler(MessageType.COMPENDIUM_SPRITE_UPDATE, async (m) => { window.dispatchEvent(new CustomEvent('compendium-sprite-updated', { detail: m.data })); });
    this.registerHandler(MessageType.COMPENDIUM_SPRITE_REMOVE, async (m) => { window.dispatchEvent(new CustomEvent('compendium-sprite-removed', { detail: m.data })); });

    // Character management
    this.registerHandler(MessageType.CHARACTER_LOAD_RESPONSE, this.handleCharacterLoadResponse.bind(this));
    this.registerHandler(MessageType.CHARACTER_SAVE_RESPONSE, this.handleCharacterSaveResponse.bind(this));
    this.registerHandler(MessageType.CHARACTER_LIST_RESPONSE, this.handleCharacterListResponse.bind(this));
    this.registerHandler(MessageType.CHARACTER_DELETE_RESPONSE, this.handleCharacterDeleteResponse.bind(this));
  }

  registerHandler(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  // Allow consumers to unregister handlers when they unmount
  unregisterHandler(type: string): void {
    this.handlers.delete(type);
  }

  async connect(): Promise<void> {
    // Use dynamic WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    protocolLogger.connection('WebSocket URL', `${protocol}//${host}/ws/game/${this.sessionCode}`);
    const wsUrl = `${protocol}//${host}/ws/game/${this.sessionCode}`;
    // Debug: report the exact session code the browser will use for the WS connect
    protocolLogger.connection('Connecting to session code', this.sessionCode);

    return new Promise((resolve, reject) => {
      try {
        if (this.connecting) {
          logger.debug('connect() called but already connecting for', this.sessionCode);
          return reject(new Error('Already connecting'));
        }
        this.connecting = true;
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
          protocolLogger.connection('WebSocket connected to authenticated session', this.sessionCode);
          this.flushMessageQueue();
          this.flushPendingBatches(); // Flush any batched messages that were queued during disconnection
          this.startPingInterval();
          this.connecting = false;
          resolve();
        };

        this.websocket.onmessage = (event) => {
          this.handleIncomingMessage(event.data);
        };

        this.websocket.onclose = (event) => {
          protocolLogger.connection('WebSocket connection closed', { code: event.code, reason: event.reason });
          this.stopPingInterval();
          this.connecting = false;
          if (event.code === 1008) {
            reject(new Error('Authentication failed - invalid token'));
          }
        };

        this.websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.stopPingInterval();
          this.connecting = false;
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
    protocolLogger.message('received', { type: 'welcome', data: message.data });
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
    protocolLogger.connection('Pong received - connection alive');
  }

  private async handleError(message: Message): Promise<void> {
    logger.error('Server error', message.data);
    // Emit error event for UI handling
    window.dispatchEvent(new CustomEvent('protocol-error', { detail: message.data }));
  }

  private async handleSuccess(message: Message): Promise<void> {
    protocolLogger.message('received', { type: 'success', data: message.data });
    
    // Check if this is a table-related success message
    if (message.data && message.data.table_id) {
      window.dispatchEvent(new CustomEvent('table-deleted', { detail: message.data }));
    }
    
    window.dispatchEvent(new CustomEvent('protocol-success', { detail: message.data }));
  }

  private async handleBatch(message: Message): Promise<void> {
    console.log('📦 Protocol: Received batch response:', message.data);
    
    if (message.data && Array.isArray(message.data.messages)) {
      // Process each message in the batch response
      for (const msgData of message.data.messages) {
        try {
          // Handle each message individually
          const handler = this.handlers.get(msgData.type);
          if (handler) {
            await handler(msgData);
          } else {
            console.warn('No handler for batched message type:', msgData.type);
          }
        } catch (error) {
          console.error('Error processing batched message:', error);
        }
      }
    }
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
    const activeTableId = useGameStore.getState().activeTableId;
    if (!activeTableId) {
      console.error('[Protocol] No active table ID available for sprite create');
      return;
    }
    this.sendMessage(createMessage(MessageType.SPRITE_CREATE, { sprite: spriteData, table_id: activeTableId }, 2));
  }

  updateSprite(spriteId: string, updates: Record<string, unknown>): void {
    const activeTableId = useGameStore.getState().activeTableId;
    if (!activeTableId) {
      console.error('[Protocol] No active table ID available for sprite update');
      return;
    }
    this.sendMessage(createMessage(MessageType.SPRITE_UPDATE, { sprite_id: spriteId, table_id: activeTableId, ...updates }, 2));
  }

  moveSprite(spriteId: string, x: number, y: number): void {
    const activeTableId = useGameStore.getState().activeTableId;
    if (!activeTableId) {
      console.error('[Protocol] No active table ID available for sprite move');
      return;
    }
    this.sendMessage(createMessage(MessageType.SPRITE_MOVE, { sprite_id: spriteId, x, y, table_id: activeTableId }, 1));
  }

  removeSprite(spriteId: string): void {
    const activeTableId = useGameStore.getState().activeTableId;
    if (!activeTableId) {
      console.error('[Protocol] No active table ID available for sprite remove');
      return;
    }
    this.sendMessage(createMessage(MessageType.SPRITE_REMOVE, { sprite_id: spriteId, table_id: activeTableId }, 2));
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

  // =========================================================================
  // MISSING MESSAGE HANDLERS IMPLEMENTATION
  // =========================================================================

  private async handleTest(message: Message): Promise<void> {
    console.log('🧪 Protocol: Test message received:', message.data);
    window.dispatchEvent(new CustomEvent('protocol-test-received', { detail: message.data }));
  }

  // Authentication handlers
  private async handleAuthStatus(message: Message): Promise<void> {
    console.log('🔐 Protocol: Auth status received:', message.data);
    window.dispatchEvent(new CustomEvent('auth-status-changed', { detail: message.data }));
  }

  // Player action handlers
  private async handlePlayerActionResponse(message: Message): Promise<void> {
    console.log('👤 Protocol: Player action response:', message.data);
    window.dispatchEvent(new CustomEvent('player-action-response', { detail: message.data }));
  }

  private async handlePlayerActionUpdate(message: Message): Promise<void> {
    console.log('👤 Protocol: Player action update:', message.data);
    window.dispatchEvent(new CustomEvent('player-action-update', { detail: message.data }));
  }

  private async handlePlayerStatus(message: Message): Promise<void> {
    console.log('👤 Protocol: Player status:', message.data);
    window.dispatchEvent(new CustomEvent('player-status-changed', { detail: message.data }));
  }

  private async handlePlayerKickResponse(message: Message): Promise<void> {
    console.log('👤 Protocol: Player kick response:', message.data);
    window.dispatchEvent(new CustomEvent('player-kick-response', { detail: message.data }));
  }

  private async handlePlayerBanResponse(message: Message): Promise<void> {
    console.log('👤 Protocol: Player ban response:', message.data);
    window.dispatchEvent(new CustomEvent('player-ban-response', { detail: message.data }));
  }

  private async handleConnectionStatusResponse(message: Message): Promise<void> {
    console.log('🔗 Protocol: Connection status response:', message.data);
    window.dispatchEvent(new CustomEvent('connection-status-response', { detail: message.data }));
  }

  // Sprite data handlers
  private async handleSpriteResponse(message: Message): Promise<void> {
    console.log('🎭 Protocol: Sprite response:', message.data);
    window.dispatchEvent(new CustomEvent('sprite-response', { detail: message.data }));
  }

  private async handleSpriteData(message: Message): Promise<void> {
    console.log('🎭 Protocol: Sprite data received:', message.data);
    window.dispatchEvent(new CustomEvent('sprite-data-received', { detail: message.data }));
  }

  // File transfer handlers
  private async handleFileData(message: Message): Promise<void> {
    console.log('📁 Protocol: File data received:', message.data);
    window.dispatchEvent(new CustomEvent('file-data-received', { detail: message.data }));
  }

  // Asset management handlers
  private async handleAssetDeleteResponse(message: Message): Promise<void> {
    console.log('💾 Protocol: Asset delete response:', message.data);
    window.dispatchEvent(new CustomEvent('asset-delete-response', { detail: message.data }));
  }

  private async handleAssetHashCheck(message: Message): Promise<void> {
    console.log('💾 Protocol: Asset hash check:', message.data);
    window.dispatchEvent(new CustomEvent('asset-hash-check', { detail: message.data }));
  }

  // Character management handlers
  private async handleCharacterDeleteResponse(message: Message): Promise<void> {
    console.log('👤 Protocol: Character delete response:', message.data);
    window.dispatchEvent(new CustomEvent('character-delete-response', { detail: message.data }));
  }

  // Public API methods for new message types
  requestPlayerStatus(clientId?: string): void {
    this.sendMessage(createMessage(MessageType.PLAYER_STATUS, { client_id: clientId }));
  }

  sendPlayerAction(actionType: string, actionData: Record<string, unknown>): void {
    this.sendMessage(createMessage(MessageType.PLAYER_ACTION, {
      action_type: actionType,
      action_data: actionData
    }));
  }

  setPlayerReady(): void {
    this.sendMessage(createMessage(MessageType.PLAYER_READY));
  }

  setPlayerUnready(): void {
    this.sendMessage(createMessage(MessageType.PLAYER_UNREADY));
  }

  kickPlayer(playerId: string): void {
    this.sendMessage(createMessage(MessageType.PLAYER_KICK_REQUEST, { player_id: playerId }));
  }

  banPlayer(playerId: string): void {
    this.sendMessage(createMessage(MessageType.PLAYER_BAN_REQUEST, { player_id: playerId }));
  }

  requestConnectionStatus(): void {
    this.sendMessage(createMessage(MessageType.CONNECTION_STATUS_REQUEST));
  }

  requestSpriteData(spriteId: string, tableId: string): void {
    this.sendMessage(createMessage(MessageType.SPRITE_REQUEST, {
      sprite_id: spriteId,
      table_id: tableId
    }));
  }

  sendFileData(fileId: string, chunkData: string, chunkIndex: number, totalChunks: number): void {
    this.sendMessage(createMessage(MessageType.FILE_DATA, {
      file_id: fileId,
      chunk_data: chunkData,
      chunk_index: chunkIndex,
      total_chunks: totalChunks
    }));
  }

  checkAssetHash(assetId: string, hash: string): void {
    this.sendMessage(createMessage(MessageType.ASSET_HASH_CHECK, {
      asset_id: assetId,
      hash: hash
    }));
  }

  deleteAsset(assetId: string): void {
    this.sendMessage(createMessage(MessageType.ASSET_DELETE_REQUEST, { asset_id: assetId }));
  }

  deleteCharacter(characterId: string): void {
    this.sendMessage(createMessage(MessageType.CHARACTER_DELETE_REQUEST, { character_id: characterId }));
  }

  scaleTable(tableId: string, scale: number): void {
    this.sendMessage(createMessage(MessageType.TABLE_SCALE, {
      table_id: tableId,
      scale: scale
    }));
  }

  moveTable(tableId: string, xMoved: number, yMoved: number): void {
    this.sendMessage(createMessage(MessageType.TABLE_MOVE, {
      table_id: tableId,
      x_moved: xMoved,
      y_moved: yMoved
    }));
  }

  sendTestMessage(data: Record<string, unknown>): void {
    this.sendMessage(createMessage(MessageType.TEST, data));
  }
}
