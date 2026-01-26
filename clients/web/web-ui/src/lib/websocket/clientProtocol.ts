
// All member variables and methods are now inside the WebClientProtocol class body below.
/**
 * Protocol-compliant WebSocket client that integrates with existing server architecture
 * Handles all message types defined in protocol.py with proper authentication
 */

import { logger, protocolLogger } from '@shared/utils/logger';
import { showToast } from '@shared/utils/toast';
import { useAssetCharacterCache } from '../../assetCharacterCache';
import { useGameStore } from '../../store';
import type { Message, MessageHandler } from './message';
import { MessageType, createMessage, parseMessage } from './message';
import { validateTableId } from './tableProtocolAdapter';


export class WebClientProtocol {
  private handlers = new Map<string, MessageHandler>();
  private websocket: WebSocket | null = null;
  private connecting: boolean = false;
  private messageQueue: Message[] = [];
  private pingInterval: number | null = null;
  private pingEnabled: boolean = false;
  private sessionCode: string;
  private userId: number | null = null;

  // Reconnection with exponential backoff
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly BASE_RECONNECT_DELAY = 1000;
  private readonly MAX_RECONNECT_DELAY = 30000;

  // Heartbeat mechanism to detect dead connections
  private lastPongReceived: number = Date.now();
  private pongTimeout: number | null = null;
  private readonly PONG_TIMEOUT_MS = 5000; // 5 seconds to receive pong
  private connectionAlive: boolean = false;
  private connectionStateListeners: Set<(state: 'connected' | 'disconnected' | 'timeout') => void> = new Set();

  // Message batching
  private batchQueue: Message[] = [];
  private batchTimer: number | null = null;
  private readonly BATCH_DELAY_MS = 30;
  private readonly MAX_BATCH_SIZE = 15;

  /** Queue message for batching, flush after short delay or if batch is large */
  queueMessage(msg: Message) {
    // Skip batching if connection is not stable
    if (this.websocket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.batchQueue.push(msg);
    
    // Start timer if not already running
    if (!this.batchTimer) {
      this.batchTimer = window.setTimeout(() => this.sendBatch(), this.BATCH_DELAY_MS);
    }
    
    // Send immediately if batch is getting large
    if (this.batchQueue.length >= this.MAX_BATCH_SIZE) {
      this.sendBatch();
    }
  }

  /** Send all batched messages as a single batch */
  sendBatch() {
    // Clear timer first
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    if (this.batchQueue.length === 0) {
      return;
    }
    
    // Check connection state before attempting to send
    if (this.websocket?.readyState !== WebSocket.OPEN) {
      // Keep messages in queue for retry when connection is restored
      return;
    }

    // Create batch message with proper structure
    const batchMessage = createMessage(MessageType.BATCH, {
      messages: [...this.batchQueue]  // Copy the array to avoid mutation issues
    }, 1);
    
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
    // Critical messages (table, actions, player, assets) sent immediately
    const critical = [
      'table_data', 'table_update', 'table_list_request', 'table_request', 'new_table_request', 'table_delete',
      'sprite_create', 'sprite_remove', 'player_kick_request', 'player_ban_request', 'player_list_request',
      'character_save', 'character_load', 
      'asset_upload_request', 'asset_download_request', 'asset_list_request', 'asset_delete_request', 'asset_hash_check'
    ];
    
    if (critical.includes(message.type)) {
      console.log('� Protocol: Sending critical message:', message.type);
      if (this.websocket?.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify(message));
      } else {
        this.messageQueue.push(message);
      }
    } else {
      this.queueMessage(message);
    }
  }

  constructor(sessionCode: string, userId?: number) {
    this.sessionCode = sessionCode;
    this.userId = userId ?? null;
    this.registerBuiltInHandlers();
    this.setupProtocolMessageSender();
  }

  /**
   * Set the user ID for this protocol instance
   * Should be called after authentication
   */
  setUserId(userId: number): void {
    this.userId = userId;
  }

  /**
   * Get the current user ID
   */
  getUserId(): number | null {
    return this.userId;
  }

  // Compendium helpers
  addCompendiumSprite(tableId: string, spriteData: Record<string, unknown>): void {
    validateTableId(tableId);
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
    // Character update handlers (delta)
    this.registerHandler(MessageType.CHARACTER_UPDATE, this.handleCharacterUpdate.bind(this));
    this.registerHandler(MessageType.CHARACTER_UPDATE_RESPONSE, this.handleCharacterUpdateResponse.bind(this));
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
          this.connectionAlive = true;
          this.lastPongReceived = Date.now();
          this.notifyConnectionState('connected');
          this.flushMessageQueue();
          this.flushPendingBatches(); // Flush any batched messages that were queued during disconnection
          // Auto-start heartbeat for connection monitoring
          this.startPing();
          this.connecting = false;
          resolve();
        };

        this.websocket.onmessage = (event) => {
          this.handleIncomingMessage(event.data);
        };

        this.websocket.onclose = (event) => {
          console.log(`[Protocol] ⚠️ WebSocket CLOSED - code: ${event.code}, reason: '${event.reason}', wasClean: ${event.wasClean}`);
          protocolLogger.connection('WebSocket connection closed', { code: event.code, reason: event.reason });
          this.connectionAlive = false;
          this.notifyConnectionState('disconnected');
          this.stopPingInterval();
          this.connecting = false;
          
          if (event.code === 1008) {
            console.log(`[Protocol] 🚫 Code 1008 detected. Reason: '${event.reason}'`);
            if (event.reason === 'Kicked from session') {
              console.warn('⚠️ KICKED FROM SESSION - NOT RECONNECTING');
              showToast.error('You have been kicked from the session');
              reject(new Error('Kicked from session'));
              return; // Prevent reconnection
            } else {
              console.warn(`⚠️ Code 1008 but different reason: '${event.reason}'`);
              reject(new Error('Authentication failed or not authorized'));
              return; // Prevent reconnection
            }
          } else if (event.code !== 1000) {
            // Abnormal closure - attempt reconnection
            console.log(`[Protocol] Abnormal closure (code ${event.code}) - attempting reconnection...`);
            this.attemptReconnect();
          } else {
            console.log('[Protocol] Clean closure (code 1000) - no reconnection');
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
      
      // Log all incoming messages for debugging
      if (message.type === 'pong') {
        console.log('[Protocol] 📨 Received PONG message from server');
      }
      
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

  /** Start sending keep-alive pings to server (30s interval) */
  public startPing(): void {
    if (this.pingInterval) {
      console.log('[Protocol] Ping already running');
      return;
    }
    
    this.pingEnabled = true;
    this.lastPongReceived = Date.now();
    this.connectionAlive = true;
    
    this.pingInterval = window.setInterval(() => {
      if (this.websocket?.readyState === WebSocket.OPEN) {
        // Send ping
        console.log('[Protocol] 🏓 Sending PING message...');
        const pingTime = Date.now();
        this.sendMessage(createMessage(MessageType.PING));
        protocolLogger.connection('Ping sent', { lastPong: new Date(this.lastPongReceived).toISOString() });
        console.log(`[Protocol] Ping sent. Time since last pong: ${pingTime - this.lastPongReceived}ms`);
        
        // Set timeout for pong response (5 seconds after sending ping)
        if (this.pongTimeout) {
          clearTimeout(this.pongTimeout);
        }
        this.pongTimeout = window.setTimeout(() => {
          // Check if pong was received AFTER we sent this ping
          const timeSincePing = Date.now() - pingTime;
          if (this.lastPongReceived < pingTime) {
            console.error(`[Protocol] ⚠️⚠️⚠️ PONG TIMEOUT! No pong received for ${timeSincePing}ms after ping (timeout: ${this.PONG_TIMEOUT_MS}ms)`);
            console.error('[Protocol] Connection appears dead - disconnecting and reconnecting...');
            this.connectionAlive = false;
            this.notifyConnectionState('timeout');
            // Attempt reconnection
            this.disconnect();
            this.attemptReconnect();
          } else {
            console.log('[Protocol] ✅ Pong received within timeout window');
          }
        }, this.PONG_TIMEOUT_MS);
      } else {
        console.warn('[Protocol] WebSocket not open, cannot send ping');
        this.connectionAlive = false;
        this.notifyConnectionState('disconnected');
      }
    }, 30000); // Ping every 30 seconds
    
    protocolLogger.connection('Ping started', { interval: '30s', timeout: `${this.PONG_TIMEOUT_MS}ms` });
  }

  /** Stop sending keep-alive pings */
  public stopPing(): void {
    this.pingEnabled = false;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
    protocolLogger.connection('Ping stopped');
  }

  /** Check if ping is currently enabled */
  public isPingEnabled(): boolean {
    return this.pingEnabled;
  }

  private stopPingInterval(): void {
    this.stopPing();
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('[Protocol] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      this.MAX_RECONNECT_DELAY
    );

    console.log(`[Protocol] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);

    window.setTimeout(async () => {
      try {
        await this.connect();
        this.reconnectAttempts = 0;
        console.log('[Protocol] Reconnection successful');
      } catch (error) {
        console.error('[Protocol] Reconnection failed:', error);
      }
    }, delay);
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
    console.log('[Protocol] 🏓 PONG received - connection alive!');
    this.lastPongReceived = Date.now();
    this.connectionAlive = true;
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
    protocolLogger.connection('Pong received - connection alive', { timestamp: new Date(this.lastPongReceived).toISOString() });
    this.notifyConnectionState('connected');
  }

  private async handleError(message: Message): Promise<void> {
    logger.error('Server error', message.data);
    // Emit error event for UI handling
    window.dispatchEvent(new CustomEvent('protocol-error', { detail: message.data }));
  }

  private async handleSuccess(message: Message): Promise<void> {
    protocolLogger.message('received', { type: 'success', data: message.data });
    
    // Only dispatch table-deleted for actual table deletion messages
    // NOT for sprite operations that happen to include table_id
    if (message.data && 
        typeof message.data.message === 'string' && 
        message.data.message.toLowerCase().includes('delet') && 
        message.data.table_id) {
      window.dispatchEvent(new CustomEvent('table-deleted', { detail: message.data }));
    }
    
    window.dispatchEvent(new CustomEvent('protocol-success', { detail: message.data }));
  }

  private async handleBatch(message: Message): Promise<void> {
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
    // Upsert character into cache (server now uses `character_id` in payloads)
    if (message.data && typeof message.data.character_id === 'string') {
      useAssetCharacterCache.getState().upsertCharacter({
        // keep internal cache keyed by `id` for legacy code paths, but source is character_id
        id: String(message.data.character_id),
        name: typeof message.data.name === 'string' ? message.data.name : '',
        data: message.data,
      });
    }
    window.dispatchEvent(new CustomEvent('character-loaded', { detail: message.data }));
  }

  private async handleCharacterSaveResponse(message: Message): Promise<void> {
    console.log('Character saved:', message.data);
    
    // Map temp ID to real ID from server
    if (message.data?.success && message.data?.character_id) {
      const realId = String(message.data.character_id);
      const version = typeof message.data.version === 'number' ? message.data.version : 1;
      
      // Find character with 'syncing' status (likely has temp ID)
      const store = useGameStore.getState();
      const tempChar = store.characters.find(c => 
        c.syncStatus === 'syncing' && c.id.startsWith('temp-')
      );
      
      if (tempChar) {
        // Update character with real ID and synced status
        store.removeCharacter(tempChar.id);
        store.addCharacter({
          ...tempChar,
          id: realId,
          version: version,
          syncStatus: 'synced'
        });
        console.log(`✅ Character synced: temp ID ${tempChar.id} → real ID ${realId}`);
      }
    } else if (message.data?.success === false) {
      // Handle save failure
      console.error('❌ Character save failed:', message.data?.error);
      
      // Find and mark character as error
      const store = useGameStore.getState();
      const failedChar = store.characters.find(c => c.syncStatus === 'syncing');
      if (failedChar) {
        store.updateCharacter(failedChar.id, { syncStatus: 'error' });
      }
    }
    
    window.dispatchEvent(new CustomEvent('character-saved', { detail: message.data }));
  }


  private async handleCharacterListResponse(message: Message): Promise<void> {
    console.log('Character list received:', message.data);
    
    // Load characters into game store
    if (Array.isArray(message.data?.characters)) {
      const store = useGameStore.getState();
      
      // Map server characters to client format
      const characters = message.data.characters
        .filter((c: any) => c && (c.character_id || c.id))
        .map((c: any) => ({
          id: String(c.character_id || c.id),
          sessionId: c.session_id || '',
          name: String(c.character_name || c.name || 'Unnamed'),
          ownerId: Number(c.owner_user_id || c.ownerId || 0),
          controlledBy: Array.isArray(c.controlledBy) ? c.controlledBy : [],
          data: c.character_data || c.data || {},
          version: Number(c.version || 1),
          createdAt: c.created_at || new Date().toISOString(),
          updatedAt: c.updated_at || new Date().toISOString(),
          syncStatus: 'synced' as const
        }));
      
      // Clear existing characters and load new ones
      // This ensures we don't have stale data
      store.characters.forEach(c => store.removeCharacter(c.id));
      characters.forEach(c => store.addCharacter(c));
      
      console.log(`✅ Loaded ${characters.length} characters from server`);
      
      // Also update asset cache for legacy compatibility
      const cacheChars = characters.map(c => ({
        id: c.id,
        name: c.name,
        data: c.data,
      }));
      useAssetCharacterCache.getState().bulkLoadCharacters(cacheChars);
    }
    
    window.dispatchEvent(new CustomEvent('character-list-updated', { detail: message.data }));
  }

  // Handle incoming character delta updates broadcast from server
  private async handleCharacterUpdate(message: Message): Promise<void> {
    console.log('Character update received:', message.data);
    const data: any = message.data || {};
    const store = useGameStore.getState();
    
    // Check for operation type
    const operation = data.operation;
    const characterId = data.character_id;
    
    if (operation === 'delete' && characterId) {
      // Handle character deletion broadcast
      store.removeCharacter(characterId);
      console.log(`🗑️ Character deleted (broadcast): ${characterId}`);
      window.dispatchEvent(new CustomEvent('character-deleted', { detail: { character_id: characterId } }));
      return;
    }
    
    if (operation === 'save' || operation === 'create') {
      // Full character update (new character or complete save)
      const characterData = data.character_data;
      if (characterData) {
        const character = {
          id: String(characterData.character_id || characterData.id || characterId),
          sessionId: characterData.session_id || characterData.sessionId || '',
          name: String(characterData.name || 'Unnamed'),
          ownerId: Number(characterData.owner_user_id || characterData.ownerId || 0),
          controlledBy: Array.isArray(characterData.controlledBy) ? characterData.controlledBy : [],
          data: characterData.data || characterData,
          version: Number(data.version || characterData.version || 1),
          createdAt: characterData.created_at || characterData.createdAt || new Date().toISOString(),
          updatedAt: characterData.updated_at || characterData.updatedAt || new Date().toISOString(),
          syncStatus: 'synced' as const
        };
        
        // Check if character exists (update) or is new (add)
        const existing = store.characters.find(c => c.id === character.id);
        if (existing) {
          store.updateCharacter(character.id, character);
          console.log(`♻️ Character updated (broadcast): ${character.name}`);
        } else {
          store.addCharacter(character);
          console.log(`➕ Character added (broadcast): ${character.name}`);
        }
        
        window.dispatchEvent(new CustomEvent('character-updated', { detail: { character_id: character.id, operation } }));
      }
      return;
    }
    
    // Delta update (partial changes)
    const updates = data.updates;
    if (characterId && updates) {
      const version = data.version;
      const updatePayload: any = { ...updates };
      if (version !== undefined) {
        updatePayload.version = version;
      }
      updatePayload.syncStatus = 'synced';
      updatePayload.updatedAt = new Date().toISOString();
      
      store.updateCharacter(characterId, updatePayload);
      console.log(`🔄 Character updated (delta): ${characterId}`, updates);
      window.dispatchEvent(new CustomEvent('character-updated', { detail: { character_id: characterId, updates } }));
    }
  }

  private async handleCharacterUpdateResponse(message: Message): Promise<void> {
    console.log('Character update response:', message.data);
    
    const success = message.data?.success;
    const characterId = String(message.data?.character_id || '');
    const version = message.data?.version;
    const error = message.data?.error;
    const currentVersion = message.data?.current_version;
    
    if (success && characterId) {
      // Update successful - update version and sync status
      const store = useGameStore.getState();
      const updatePayload: any = { syncStatus: 'synced' };
      if (version !== undefined) {
        updatePayload.version = typeof version === 'number' ? version : parseInt(String(version));
      }
      store.updateCharacter(characterId, updatePayload);
      console.log(`✅ Character update confirmed: ${characterId}, version ${version}`);
    } else if (!success && characterId) {
      // Update failed - handle version conflict or other errors
      const store = useGameStore.getState();
      
      if (error === 'Version conflict' && currentVersion !== undefined) {
        // Version conflict - auto-retry with latest version
        console.warn(`⚠️ Version conflict for character ${characterId}. Current version: ${currentVersion}`);
        showToast.warning('Character was modified by another user. Retrying with latest version...');
        
        // Fetch latest version from server
        this.loadCharacter(characterId);
        
        // Listen for load response to retry the update
        const retryListener = (event: Event) => {
          const customEvent = event as CustomEvent;
          const loadedData = customEvent.detail;
          
          if (loadedData?.character_data?.character_id === characterId) {
            console.log(`🔄 Retrying update for ${characterId} with version ${currentVersion}`);
            
            // Get the character from store with pending updates
            const character = store.characters.find(c => c.id === characterId);
            if (character && character.syncStatus === 'error') {
              // Update with the new version
              store.updateCharacter(characterId, {
                version: currentVersion,
                syncStatus: 'synced'
              } as any);
              
              showToast.success('Character synchronized with latest version');
            }
            
            // Remove listener after handling
            window.removeEventListener('character-loaded', retryListener);
          }
        };
        
        window.addEventListener('character-loaded', retryListener);
        
        // Set timeout to clean up listener if load fails
        setTimeout(() => {
          window.removeEventListener('character-loaded', retryListener);
        }, 5000);
        
      } else {
        // Other error
        console.error(`❌ Character update failed: ${error}`);
        store.updateCharacter(characterId, { syncStatus: 'error' } as any);
        showToast.error(`Failed to update character: ${error || 'Unknown error'}`);
      }
    }
    
    window.dispatchEvent(new CustomEvent('character-update-response', { detail: message.data }));
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
    // Use table_id from spriteData if available, otherwise fall back to store
    const tableId = (spriteData.table_id as string) || useGameStore.getState().activeTableId;
    if (!tableId) {
      console.error('[Protocol] No table ID available for sprite create');
      return;
    }
    validateTableId(tableId);
    this.sendMessage(createMessage(MessageType.SPRITE_CREATE, { sprite_data: spriteData, table_id: tableId }, 2));
  }

  updateSprite(spriteId: string, updates: Record<string, unknown>): void {
    const activeTableId = useGameStore.getState().activeTableId;
    if (!activeTableId) {
      console.error('[Protocol] No active table ID available for sprite update');
      return;
    }
    validateTableId(activeTableId);
    this.sendMessage(createMessage(MessageType.SPRITE_UPDATE, { sprite_id: spriteId, table_id: activeTableId, ...updates }, 2));
  }

  moveSprite(spriteId: string, x: number, y: number): void {
    const activeTableId = useGameStore.getState().activeTableId;
    if (!activeTableId) {
      console.error('[Protocol] No active table ID available for sprite move');
      return;
    }
    validateTableId(activeTableId);
    this.sendMessage(createMessage(MessageType.SPRITE_MOVE, { sprite_id: spriteId, x, y, table_id: activeTableId }, 1));
  }

  scaleSprite(spriteId: string, scaleX: number, scaleY: number): void {
    const activeTableId = useGameStore.getState().activeTableId;
    if (!activeTableId) {
      console.error('[Protocol] No active table ID available for sprite scale');
      return;
    }
    validateTableId(activeTableId);
    console.log('📏 Protocol: Sending sprite scale:', { spriteId, scaleX, scaleY, activeTableId });
    this.sendMessage(createMessage(MessageType.SPRITE_SCALE, { 
      sprite_id: spriteId, 
      scale_x: scaleX, 
      scale_y: scaleY, 
      table_id: activeTableId 
    }, 2));
  }

  removeSprite(spriteId: string): void {
    const activeTableId = useGameStore.getState().activeTableId;
    if (!activeTableId) {
      console.error('[Protocol] No active table ID available for sprite remove');
      return;
    }
    validateTableId(activeTableId);
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

  // Fog of War methods
  updateFog(tableId: string, hideRectangles: Array<[[number, number], [number, number]]>, revealRectangles: Array<[[number, number], [number, number]]>): void {
    this.sendMessage(createMessage(MessageType.TABLE_UPDATE, {
      category: 'table',
      type: 'fog_update',
      data: {
        table_id: tableId,
        hide_rectangles: hideRectangles,
        reveal_rectangles: revealRectangles
      }
    }, 2));
  }

  // Character management methods
  /**
   * Save a character to the server (create or update)
   * @param characterData - The character data to save
   * @param userId - Optional user ID (uses instance userId if not provided)
   */
  saveCharacter(characterData: Record<string, unknown>, userId?: number): void {
    const effectiveUserId = userId ?? this.userId;
    if (effectiveUserId === null) {
      console.error('❌ Cannot save character: user ID not set');
      return;
    }

    this.sendMessage(createMessage(MessageType.CHARACTER_SAVE_REQUEST, {
      character_data: characterData,
      user_id: effectiveUserId,
      session_code: this.sessionCode
    }));
  }

  /**
   * Load a character from the server
   * @param characterId - The ID of the character to load
   * @param userId - Optional user ID (uses instance userId if not provided)
   */
  loadCharacter(characterId: string, userId?: number): void {
    const effectiveUserId = userId ?? this.userId;
    if (effectiveUserId === null) {
      console.error('❌ Cannot load character: user ID not set');
      return;
    }

    this.sendMessage(createMessage(MessageType.CHARACTER_LOAD_REQUEST, {
      character_id: characterId,
      user_id: effectiveUserId,
      session_code: this.sessionCode
    }));
  }

  /**
   * Send partial/delta updates for a character
   * @param characterId - The ID of the character to update
   * @param updates - The partial updates to apply
   * @param version - Optional version number for optimistic concurrency control
   * @param userId - Optional user ID (uses instance userId if not provided)
   */
  updateCharacter(characterId: string, updates: Record<string, unknown>, version?: number, userId?: number): void {
    const effectiveUserId = userId ?? this.userId;
    if (effectiveUserId === null) {
      console.error('❌ Cannot update character: user ID not set');
      return;
    }

    const payload: any = {
      character_id: characterId,
      updates,
      user_id: effectiveUserId,
      session_code: this.sessionCode
    };
    if (version !== undefined) payload.version = version;
    this.sendMessage(createMessage(MessageType.CHARACTER_UPDATE, payload));
  }

  /**
   * Request list of all characters in the session
   * @param userId - Optional user ID (uses instance userId if not provided)
   */
  requestCharacterList(userId?: number): void {
    const effectiveUserId = userId ?? this.userId;
    if (effectiveUserId === null) {
      console.error('❌ Cannot request character list: user ID not set');
      return;
    }

    this.sendMessage(createMessage(MessageType.CHARACTER_LIST_REQUEST, {
      user_id: effectiveUserId,
      session_code: this.sessionCode
    }));
  }

  disconnect(): void {
    this.connectionAlive = false;
    this.notifyConnectionState('disconnected');
    this.stopPingInterval();
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }

  isConnected(): boolean {
    // Check both WebSocket state AND heartbeat liveness
    return this.websocket?.readyState === WebSocket.OPEN && this.connectionAlive;
  }

  /**
   * Subscribe to connection state changes
   * @param listener Callback function that receives connection state updates
   * @returns Unsubscribe function
   */
  onConnectionStateChange(listener: (state: 'connected' | 'disconnected' | 'timeout') => void): () => void {
    this.connectionStateListeners.add(listener);
    return () => this.connectionStateListeners.delete(listener);
  }

  /**
   * Notify all listeners of connection state change
   */
  private notifyConnectionState(state: 'connected' | 'disconnected' | 'timeout'): void {
    this.connectionStateListeners.forEach(listener => listener(state));
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
    
    const success = message.data?.success;
    const characterId = String(message.data?.character_id || '');
    const error = message.data?.error;
    
    if (success && characterId) {
      console.log(`✅ Character deletion confirmed: ${characterId}`);
      // Character already removed optimistically, just confirm
      const store = useGameStore.getState();
      // Ensure character is removed from store
      store.removeCharacter(characterId);
      showToast.success('Character deleted successfully');
    } else if (!success) {
      // Deletion failed - need to restore the character
      console.error(`❌ Character deletion failed:`, error);
      showToast.error(`Failed to delete character: ${error || 'Unknown error'}`);
      
      // Try to restore from backup if available
      // The UI component should handle rollback via pendingOperationsRef
    }
    
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

  /**
   * Delete a character from the server
   * @param characterId - The ID of the character to delete
   * @param userId - Optional user ID (uses instance userId if not provided)
   */
  deleteCharacter(characterId: string, userId?: number): void {
    const effectiveUserId = userId ?? this.userId;
    if (effectiveUserId === null) {
      console.error('❌ Cannot delete character: user ID not set');
      return;
    }

    this.sendMessage(createMessage(MessageType.CHARACTER_DELETE_REQUEST, {
      character_id: characterId,
      user_id: effectiveUserId,
      session_code: this.sessionCode
    }));
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
