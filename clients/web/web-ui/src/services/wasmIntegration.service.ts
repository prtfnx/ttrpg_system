/**
 * WASM Integration Service - bridges protocol messages with WASM RenderEngine
 * Handles sprite synchronization, table updates, and asset management
 */

import type { RenderEngine } from '../types/wasm';

class WasmIntegrationService {
  private renderEngine: RenderEngine | null = null;
  private eventListeners: Array<() => void> = [];
  // Map of optimistic client ids -> timeout id for automatic rollback
  private optimisticTimers: Map<string, number> = new Map();
  // Timeout for optimistic inserts (ms)
  private readonly OPTIMISTIC_TIMEOUT = 10000;

  /**
   * Initialize the service with a WASM render engine
   */
  initialize(renderEngine: RenderEngine): void {
    this.renderEngine = renderEngine;
    this.setupEventListeners();
    console.log('WASM Integration Service initialized');
  }

  /**
   * Clean up event listeners
   */
  dispose(): void {
    this.eventListeners.forEach(cleanup => cleanup());
    this.eventListeners = [];
    this.renderEngine = null;
  }

  private setupEventListeners(): void {
    // Table management events
    const handleTableData = (event: Event) => {
      this.handleTableDataReceived((event as CustomEvent).detail);
    };
    window.addEventListener('table-data-received', handleTableData);
    this.eventListeners.push(() => window.removeEventListener('table-data-received', handleTableData));

    // Also listen for table-response and new-table-response events
    const handleTableResponse = (event: Event) => {
      this.handleTableDataReceived((event as CustomEvent).detail);
    };
    window.addEventListener('table-response', handleTableResponse);
    this.eventListeners.push(() => window.removeEventListener('table-response', handleTableResponse));

    const handleNewTableResponse = (event: Event) => {
      this.handleTableDataReceived((event as CustomEvent).detail);
    };
    window.addEventListener('new-table-response', handleNewTableResponse);
    this.eventListeners.push(() => window.removeEventListener('new-table-response', handleNewTableResponse));

    const handleTableUpdate = (event: Event) => {
      this.handleTableUpdate((event as CustomEvent).detail);
    };
    window.addEventListener('table-updated', handleTableUpdate);
    this.eventListeners.push(() => window.removeEventListener('table-updated', handleTableUpdate));

    // Sprite management events
    const handleSpriteCreated = (event: Event) => {
      this.handleSpriteCreated((event as CustomEvent).detail);
    };
    window.addEventListener('sprite-created', handleSpriteCreated);
    this.eventListeners.push(() => window.removeEventListener('sprite-created', handleSpriteCreated));

    const handleSpriteUpdated = (event: Event) => {
      this.handleSpriteUpdated((event as CustomEvent).detail);
    };
    window.addEventListener('sprite-updated', handleSpriteUpdated);
    this.eventListeners.push(() => window.removeEventListener('sprite-updated', handleSpriteUpdated));

    const handleSpriteRemoved = (event: Event) => {
      this.handleSpriteRemoved((event as CustomEvent).detail);
    };
    window.addEventListener('sprite-removed', handleSpriteRemoved);
    this.eventListeners.push(() => window.removeEventListener('sprite-removed', handleSpriteRemoved));

    // Handle sprite response from server (for newly created sprites)
    const handleSpriteResponse = (event: Event) => {
      this.handleSpriteResponse((event as CustomEvent).detail);
    };
    window.addEventListener('sprite-response', handleSpriteResponse);
    this.eventListeners.push(() => window.removeEventListener('sprite-response', handleSpriteResponse));

    // Also handle compendium sprite messages emitted by the protocol layer
    const handleCompendiumSpriteAdded = (event: Event) => {
      const data = (event as CustomEvent).detail;
      // If server returned a confirmation with client_temp_id, remove optimistic sprite first
      try {
        if (data && data.client_temp_id) {
          // clear any pending timer for this optimistic id
          this.clearOptimisticTimer(data.client_temp_id);
          if (this.renderEngine) {
            console.log('Removing optimistic sprite (confirmed):', data.client_temp_id);
            try { this.renderEngine.remove_sprite(data.client_temp_id); } catch(e) { /* best-effort */ }
          }
        }
      } catch (e) {
        console.warn('Error while removing optimistic sprite:', e);
      }

      this.handleSpriteCreated(data);
    };
    window.addEventListener('compendium-sprite-added', handleCompendiumSpriteAdded);
    this.eventListeners.push(() => window.removeEventListener('compendium-sprite-added', handleCompendiumSpriteAdded));

    const handleCompendiumSpriteUpdated = (event: Event) => {
      const data = (event as CustomEvent).detail;
      // If update corresponds to an optimistic insert, remove the optimistic id first
      try {
        if (data && data.client_temp_id) {
          this.clearOptimisticTimer(data.client_temp_id);
          if (this.renderEngine) {
            try { this.renderEngine.remove_sprite(data.client_temp_id); } catch(e) { /* best-effort */ }
          }
        }
      } catch (e) {
        console.warn('Error while reconciling optimistic sprite on update:', e);
      }

      this.handleSpriteUpdated(data);
    };
    window.addEventListener('compendium-sprite-updated', handleCompendiumSpriteUpdated);
    this.eventListeners.push(() => window.removeEventListener('compendium-sprite-updated', handleCompendiumSpriteUpdated));

    const handleCompendiumSpriteRemoved = (event: Event) => {
      this.handleSpriteRemoved((event as CustomEvent).detail);
    };
    window.addEventListener('compendium-sprite-removed', handleCompendiumSpriteRemoved);
    this.eventListeners.push(() => window.removeEventListener('compendium-sprite-removed', handleCompendiumSpriteRemoved));

    const handleSpriteMoved = (event: Event) => {
      this.handleSpriteMoved((event as CustomEvent).detail);
    };
    window.addEventListener('sprite-moved', handleSpriteMoved);
    this.eventListeners.push(() => window.removeEventListener('sprite-moved', handleSpriteMoved));

    const handleSpriteScaled = (event: Event) => {
      this.handleSpriteScaled((event as CustomEvent).detail);
    };
    window.addEventListener('sprite-scaled', handleSpriteScaled);
    this.eventListeners.push(() => window.removeEventListener('sprite-scaled', handleSpriteScaled));

    const handleSpriteRotated = (event: Event) => {
      this.handleSpriteRotated((event as CustomEvent).detail);
    };
    window.addEventListener('sprite-rotated', handleSpriteRotated);
    this.eventListeners.push(() => window.removeEventListener('sprite-rotated', handleSpriteRotated));

    // Asset management events
    const handleAssetDownloaded = (event: Event) => {
      this.handleAssetDownloaded((event as CustomEvent).detail);
    };
    window.addEventListener('asset-downloaded', handleAssetDownloaded);
    this.eventListeners.push(() => window.removeEventListener('asset-downloaded', handleAssetDownloaded));

    // Protocol-level errors: if server returns an error including a client_temp_id, remove optimistic sprite
    const handleProtocolError = (event: Event) => {
      const data = (event as CustomEvent).detail;
      try {
        if (data && data.client_temp_id) {
          console.warn('Protocol error for optimistic insert, removing:', data.client_temp_id, data);
          this.clearOptimisticTimer(data.client_temp_id);
          if (this.renderEngine) {
            try { this.renderEngine.remove_sprite(data.client_temp_id); } catch(e) { /* best-effort */ }
          }
        }
      } catch (e) {
        console.error('Error handling protocol-error in WASM integration:', e);
      }
    };
    window.addEventListener('protocol-error', handleProtocolError);
    this.eventListeners.push(() => window.removeEventListener('protocol-error', handleProtocolError));

    // Compendium events (user inserted or dropped an entry from compendium)
    const handleCompendiumInsert = (event: Event) => {
      this.handleCompendiumInsert((event as CustomEvent).detail);
    };
    window.addEventListener('compendium-insert', handleCompendiumInsert);
    this.eventListeners.push(() => window.removeEventListener('compendium-insert', handleCompendiumInsert));

    const handleCompendiumDrop = (event: Event) => {
      this.handleCompendiumDrop((event as CustomEvent).detail);
    };
    window.addEventListener('compendium-drop', handleCompendiumDrop);
    this.eventListeners.push(() => window.removeEventListener('compendium-drop', handleCompendiumDrop));
  }

  private handleTableDataReceived(data: any): void {
    if (!this.renderEngine) return;

    console.log('Processing table data for WASM:', data);
    console.log('Data keys:', Object.keys(data));
    console.log('Has table_data:', !!data.table_data);
    console.log('Has sprites:', !!data.sprites);

    try {
      // Extract table data from the response structure
      const tableData = data.table_data || data;
      console.log('Using tableData:', tableData);
      console.log('TableData keys:', Object.keys(tableData));
      
      // Handle table configuration
      if (tableData.grid_size) {
        this.renderEngine.set_grid_size(tableData.grid_size);
      }
      if (typeof tableData.grid_enabled === 'boolean') {
        this.renderEngine.set_grid_enabled(tableData.grid_enabled);
      }
      if (typeof tableData.grid_snapping === 'boolean') {
        this.renderEngine.set_grid_snapping(tableData.grid_snapping);
      }

      // Load sprites from layer structure
      if (tableData.layers) {
        console.log('Processing table layers:', Object.keys(tableData.layers));
        
        // Clear existing sprites before loading new table
        console.log('Clearing all sprites before loading new table');
        if ((this.renderEngine as any).clear_all_sprites) {
          (this.renderEngine as any).clear_all_sprites();
        } else {
          console.warn('clear_all_sprites method not available on render engine');
        }
        
        // TODO: Table background will be implemented as a core Rust type, not as sprites
        
        // Process each layer
        Object.entries(tableData.layers).forEach(([layerName, layerData]: [string, any]) => {
          console.log(`Processing layer ${layerName}:`, layerData);
          
          // Handle different layer data structures
          if (Array.isArray(layerData)) {
            // Layer data is an array of sprites
            layerData.forEach((spriteData: any) => {
              spriteData.layer = layerName; // Ensure layer is set
              this.addSpriteToWasm(spriteData);
            });
          } else if (layerData && typeof layerData === 'object') {
            // Layer data is an object, might contain sprites in a sub-property
            if (layerData.sprites && Array.isArray(layerData.sprites)) {
              layerData.sprites.forEach((spriteData: any) => {
                spriteData.layer = layerName;
                this.addSpriteToWasm(spriteData);
              });
            } else {
              // Maybe the object itself contains sprite properties
              Object.values(layerData).forEach((spriteData: any) => {
                if (spriteData && typeof spriteData === 'object' && spriteData.sprite_id) {
                  spriteData.layer = layerName;
                  this.addSpriteToWasm(spriteData);
                }
              });
            }
          }
        });
      }
      
      // Fallback: Load sprites from flat array (backward compatibility)
      if (data.sprites && Array.isArray(data.sprites)) {
        console.log('🔍 Processing fallback sprites array:', data.sprites.length);
        console.log('🔍 First sprite sample:', JSON.stringify(data.sprites[0], null, 2));
        data.sprites.forEach((spriteData: any, index: number) => {
          console.log(`🔍 Processing fallback sprite ${index}:`, JSON.stringify(spriteData, null, 2));
          this.addSpriteToWasm(spriteData);
        });
      }

      // Handle background image if present
      if (tableData.background_image) {
        // Background images need special handling - load as a base layer sprite
        this.loadBackgroundImage(tableData.background_image);
      }

    } catch (error) {
      console.error('Failed to process table data in WASM:', error);
    }
  }

  private handleTableUpdate(data: any): void {
    if (!this.renderEngine) return;

    console.log('Processing table update for WASM:', data);

    try {
      if (data.grid_size) {
        this.renderEngine.set_grid_size(data.grid_size);
      }
      if (typeof data.grid_enabled === 'boolean') {
        this.renderEngine.set_grid_enabled(data.grid_enabled);
      }
      if (typeof data.grid_snapping === 'boolean') {
        this.renderEngine.set_grid_snapping(data.grid_snapping);
      }
    } catch (error) {
      console.error('Failed to process table update in WASM:', error);
    }
  }

  private handleSpriteCreated(data: any): void {
    if (!this.renderEngine) return;
    this.addSpriteToWasm(data);
  }

  private handleSpriteResponse(data: any): void {
    console.log('🎭 WasmIntegration: Received sprite response from server:', data);
    
    if (!this.renderEngine) return;
    
    // Handle successful sprite creation response
    if (data.sprite_id && data.sprite_data) {
      console.log('✅ WasmIntegration: Adding sprite to WASM engine:', data.sprite_data);
      try {
        this.addSpriteToWasm(data.sprite_data);
      } catch (error) {
        console.error('❌ WasmIntegration: Failed to add sprite to WASM:', error);
      }
    } else if (data.sprite_id && !data.sprite_data) {
      console.warn('⚠️ WasmIntegration: Sprite created but no sprite_data received. Need to wait for sprite-created broadcast.');
      // The sprite was created on server but we don't have the full data
      // This might be handled by the sprite-created event instead
    } else if (data.sprite_id === null) {
      console.warn('⚠️ WasmIntegration: Sprite creation failed on server');
    } else {
      console.warn('⚠️ WasmIntegration: Invalid sprite response structure:', data);
    }
  }

  private handleSpriteUpdated(data: any): void {
    if (!this.renderEngine) return;

    try {
      console.log('handleSpriteUpdated called with data:', data);
      
      // Handle different types of sprite updates based on operation
      const spriteId = data.sprite_id || data.id;
      if (!spriteId) {
        console.warn('No sprite ID found in update data:', data);
        return;
      }

      if (data.operation === 'move' && data.position) {
        // For move operations, we need to get the current sprite from store and update position
        // Since WASM doesn't have direct position update, we'll remove and re-add
        // But we need the full sprite data, so get it from the game store
        this.updateSpritePosition(spriteId, data.position, data.table_id);
      } else {
        // For general updates, remove and re-add the sprite
        this.renderEngine.remove_sprite(spriteId);
        this.addSpriteToWasm(data);
      }
    } catch (error) {
      console.error('Failed to update sprite in WASM:', error);
    }
  }

  private updateSpritePosition(spriteId: string, position: {x: number, y: number}, tableId: string): void {
    try {
      // We need to get the full sprite data from the store and update its position
      // Then remove and re-add with new position
      // For now, we'll use the simpler approach of remove/re-add
      // TODO: Optimize this by maintaining sprite data cache or adding position update to WASM
      
      console.log(`Updating sprite ${spriteId} position to:`, position);
      
      // Remove the sprite
      this.renderEngine?.remove_sprite(spriteId);
      
      // We need the full sprite data to re-add it. 
      // Since we don't have it in the broadcast message, we should trigger a data fetch
      // or maintain a sprite cache. For now, let's try to reconstruct minimal sprite data
      const updatedSpriteData = {
        id: spriteId,
        sprite_id: spriteId,
        world_x: position.x,
        world_y: position.y,
        // These will be default values - not ideal but better than nothing
        width: 64,
        height: 64,
        scale_x: 1.0,
        scale_y: 1.0,
        rotation: 0.0,
        layer: 'tokens',
        texture_id: spriteId,  // Fallback
        tint_color: [1.0, 1.0, 1.0, 1.0]
      };
      
      this.addSpriteToWasm(updatedSpriteData);
      
    } catch (error) {
      console.error('Failed to update sprite position:', error);
    }
  }

  private handleSpriteRemoved(data: any): void {
    if (!this.renderEngine) return;

    try {
      if (data.id) {
        this.renderEngine.remove_sprite(data.id);
        console.log('Removed sprite from WASM:', data.id);
      }
    } catch (error) {
      console.error('Failed to remove sprite from WASM:', error);
    }
  }

  private handleSpriteMoved(data: any): void {
    if (!this.renderEngine) return;

    try {
      // Movement requires a full sprite update
      this.updateSpriteInWasm(data);
    } catch (error) {
      console.error('Failed to move sprite in WASM:', error);
    }
  }

  private handleSpriteScaled(data: any): void {
    if (!this.renderEngine) return;

    try {
      // Scaling requires a full sprite update
      this.updateSpriteInWasm(data);
    } catch (error) {
      console.error('Failed to scale sprite in WASM:', error);
    }
  }

  private handleSpriteRotated(data: any): void {
    if (!this.renderEngine) return;

    try {
      if (data.id && typeof data.rotation === 'number') {
        this.renderEngine.rotate_sprite(data.id, data.rotation);
        console.log('Rotated sprite in WASM:', data.id, data.rotation);
      }
    } catch (error) {
      console.error('Failed to rotate sprite in WASM:', error);
    }
  }

  private addSpriteToWasm(spriteData: any): void {
    if (!this.renderEngine) return;

    console.log('Adding sprite to WASM:', spriteData);
    console.log('Sprite data keys:', Object.keys(spriteData));

    try {
      const layer = spriteData.layer || 'tokens';
      
      // Create sprite object for WASM - handle various position formats
      let x = 0, y = 0;
      if (Array.isArray(spriteData.position) && spriteData.position.length >= 2) {
        // Server format: position: [x, y]
        x = spriteData.position[0];
        y = spriteData.position[1];
        console.log(`Position from array: [${x}, ${y}]`);
      } else {
        // Client format: coord_x/coord_y or x/y
        x = spriteData.coord_x ?? spriteData.x ?? 0;
        y = spriteData.coord_y ?? spriteData.y ?? 0;
        console.log(`Position from properties: (${x}, ${y})`);
      }
      
      // Get asset ID for texture loading
      const assetId = spriteData.asset_id || spriteData.asset_xxhash;
      
      const wasmSprite = {
        id: spriteData.sprite_id || spriteData.id || `sprite_${Date.now()}`,
        world_x: x,
        world_y: y,
        width: spriteData.width || 50,  // Default size
        height: spriteData.height || 50,
        scale_x: spriteData.scale_x || 1.0,
        scale_y: spriteData.scale_y || 1.0,
        rotation: spriteData.rotation || 0.0,
        layer: layer,
        texture_id: assetId || '',  // Use asset_id as texture_id so it matches loaded texture
        tint_color: spriteData.tint_color || [1.0, 1.0, 1.0, 1.0]
      };

      console.log('Converted sprite for WASM:', wasmSprite);

      // Add sprite to WASM engine
      const addedSpriteId = this.renderEngine.add_sprite_to_layer(layer, wasmSprite);
      console.log('Successfully added sprite to WASM:', addedSpriteId, wasmSprite);
      
      console.log('Asset management for sprite:', {
        spriteId: wasmSprite.id,
        assetId: assetId
      });
      
      if (assetId) {
        console.log('Requesting asset download link for:', assetId);
        this.requestAssetDownloadLink(assetId, wasmSprite.id);
      } else {
        console.warn('No asset_id or asset_xxhash found for sprite:', wasmSprite.id);
      }

    } catch (error) {
      console.error('Failed to add sprite to WASM:', error);
      console.error('Failed sprite data:', spriteData);
      console.error('Available sprite data keys:', Object.keys(spriteData));
    }
  }

  private updateSpriteInWasm(spriteData: any): void {
    if (!this.renderEngine || !spriteData.id) return;

    try {
      // For updates, remove and re-add the sprite
      this.renderEngine.remove_sprite(spriteData.id);
      this.addSpriteToWasm(spriteData);
    } catch (error) {
      console.error('Failed to update sprite in WASM:', error);
    }
  }

  private loadBackgroundImage(imagePath: string): void {
    if (!this.renderEngine) return;

    try {
      // Load background as a special sprite on the background layer
      const backgroundSprite = {
        id: 'background_' + Date.now(),
        world_x: 0,
        world_y: 0,
        width: 1920, // Default size, should be adjusted based on actual image
        height: 1080,
        scale_x: 1.0,
        scale_y: 1.0,
        rotation: 0.0,
        layer: 'background',
        texture_id: imagePath,
        tint_color: [1.0, 1.0, 1.0, 1.0]
      };

      this.renderEngine.add_sprite_to_layer('background', backgroundSprite);
      console.log('Loaded background image:', imagePath);

    } catch (error) {
      console.error('Failed to load background image:', error);
    }
  }

  /**
   * Request asset download link from server using protocol client
   */
  private async requestAssetDownloadLink(assetId: string, _spriteId: string): Promise<void> {
    try {
      console.log('Requesting asset download link for:', assetId);
      
      // Dispatch event that components with protocol access can handle
      window.dispatchEvent(new CustomEvent('request-asset-download', { 
        detail: { asset_id: assetId } 
      }));
      
    } catch (error) {
      console.error('Failed to request asset download link:', error);
    }
  }

  /**
   * Handle asset download response and load texture into WASM
   */
  private handleAssetDownloaded(data: any): void {
    console.log('Asset downloaded:', data);
    
    if (data.success && data.download_url && data.asset_id) {
      console.log('Loading texture from download URL:', data.asset_id, data.download_url);
      this.loadTextureFromUrl(data.asset_id, data.download_url);
    } else {
      console.warn('Asset download response failed or incomplete:', data);
    }
  }

  /**
   * Handle compendium insert (explicit Insert button) - optimistic add to WASM
   */
  private handleCompendiumInsert(data: any): void {
    if (!data) return;
    try {
      // Expecting data to contain sprite-like fields or compendium entry info
      // Normalize to the same shape used elsewhere by addSpriteToWasm
      const spriteData: any = {
        id: data.id || `comp_${Date.now()}`,
        x: data.x ?? data.world_x ?? 0,
        y: data.y ?? data.world_y ?? 0,
        width: data.width || data.size_x || 50,
        height: data.height || data.size_y || 50,
        asset_id: data.asset_id || data.texture || data.imageUrl || data.texture_id || data.image || data.texture_path || '',
        layer: data.layer || 'tokens',
        rotation: data.rotation || 0,
        scale_x: data.scale_x || 1,
        scale_y: data.scale_y || 1,
        tint_color: data.tint_color || [1, 1, 1, 1]
      };

      this.addSpriteToWasm(spriteData);

      // Start optimistic rollback timer if this looks like a client-side optimistic id
      if (spriteData.id && String(spriteData.id).startsWith('opt_')) {
        this.startOptimisticTimer(spriteData.id);
      }
    } catch (err) {
      console.error('Failed to process compendium-insert in WASM integration:', err);
    }
  }

  /**
   * Handle compendium drop (drag-drop from compendium onto canvas) - optimistic add
   */
  private handleCompendiumDrop(data: any): void {
    if (!data) return;
    try {
      // Data coming from drag-drop may include tableId and payload
      const payload = data.payload || data;
      const spriteData: any = {
        id: payload.id || `comp_${Date.now()}`,
        x: payload.x ?? payload.world_x ?? payload.coord_x ?? payload.position?.[0] ?? 0,
        y: payload.y ?? payload.world_y ?? payload.coord_y ?? payload.position?.[1] ?? 0,
        width: payload.width || payload.size_x || 50,
        height: payload.height || payload.size_y || 50,
        asset_id: payload.asset_id || payload.texture || payload.imageUrl || payload.texture_id || payload.image || payload.texture_path || '',
        layer: payload.layer || 'tokens',
        rotation: payload.rotation || 0,
        scale_x: payload.scale_x || 1,
        scale_y: payload.scale_y || 1,
        tint_color: payload.tint_color || [1, 1, 1, 1]
      };

      this.addSpriteToWasm(spriteData);

      // Start optimistic rollback timer for drag-drop optimistic ids
      if (spriteData.id && String(spriteData.id).startsWith('opt_')) {
        this.startOptimisticTimer(spriteData.id);
      }
    } catch (err) {
      console.error('Failed to process compendium-drop in WASM integration:', err);
    }
  }

  /**
   * Start a timer for an optimistic insert; on timeout remove the optimistic sprite.
   */
  private startOptimisticTimer(tempId: string): void {
    try {
      // Clear existing timer if any
      this.clearOptimisticTimer(tempId);
      const t = window.setTimeout(() => {
        try {
          console.warn('Optimistic insert timed out, removing sprite:', tempId);
          if (this.renderEngine) {
            try { this.renderEngine.remove_sprite(tempId); } catch(e) { /* best-effort */ }
          }
        } catch (e) {
          console.error('Error during optimistic timeout cleanup for', tempId, e);
        } finally {
          this.optimisticTimers.delete(tempId);
        }
      }, this.OPTIMISTIC_TIMEOUT);
      this.optimisticTimers.set(tempId, t as unknown as number);
    } catch (e) {
      console.error('Failed to start optimistic timer for', tempId, e);
    }
  }

  private clearOptimisticTimer(tempId: string): void {
    try {
      const t = this.optimisticTimers.get(tempId);
      if (t) {
        clearTimeout(t);
        this.optimisticTimers.delete(tempId);
      }
    } catch (e) {
      console.error('Failed to clear optimistic timer for', tempId, e);
    }
  }

  /**
   * Load texture from URL into WASM
   */
  private async loadTextureFromUrl(assetId: string, url: string): Promise<void> {
    if (!this.renderEngine) {
      console.warn('Cannot load texture: renderEngine not initialized');
      return;
    }

    try {
      console.log('Loading texture from URL:', url);
      
      const image = new Image();
      image.crossOrigin = 'anonymous';
      
      const loadPromise = new Promise<void>((resolve, reject) => {
        image.onload = () => {
          try {
            console.log('Image loaded successfully, calling load_texture with name:', assetId);
            this.renderEngine!.load_texture(assetId, image);
            console.log('Texture loaded into WASM successfully:', assetId);
            resolve();
          } catch (error) {
            console.error('Failed to load texture into WASM:', error);
            reject(error);
          }
        };
        
        image.onerror = (error) => {
          console.error('Failed to load image from URL:', url, error);
          reject(error);
        };
      });
      
      image.src = url;
      await loadPromise;
      
    } catch (error) {
      console.error('Failed to load texture from URL:', error);
    }
  }

  /**
   * Get the current render engine instance
   */
  getRenderEngine(): RenderEngine | null {
    return this.renderEngine;
  }
}

export const wasmIntegrationService = new WasmIntegrationService();
