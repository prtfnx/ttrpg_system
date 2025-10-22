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
  // Track assets that need to be retried after upload confirmation
  private pendingAssetRetries: Set<string> = new Set();
  // Track sprites waiting for asset upload confirmation before downloading
  private pendingSpritesForAssets: Map<string, string[]> = new Map(); // asset_id -> sprite_ids[]
  // Track pending scale operations to prevent recursive calls
  private pendingScaleOperations: Set<string> = new Set();
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

    // Handle asset upload confirmations
    const handleAssetUploaded = (event: Event) => {
      this.handleAssetUploaded((event as CustomEvent).detail);
    };
    window.addEventListener('asset-uploaded', handleAssetUploaded);
    this.eventListeners.push(() => window.removeEventListener('asset-uploaded', handleAssetUploaded));

    // Handle asset upload start notifications
    const handleAssetUploadStarted = (event: Event) => {
      const data = (event as CustomEvent).detail;
      if (data.asset_id) {
        console.log('Asset upload started, tracking for pending sprites:', data.asset_id);
        this.pendingAssetRetries.add(data.asset_id);
      }
    };
    window.addEventListener('asset-upload-started', handleAssetUploadStarted);
    this.eventListeners.push(() => window.removeEventListener('asset-upload-started', handleAssetUploadStarted));

    // Also listen for success messages that might contain asset confirmations
    const handleProtocolSuccess = (event: Event) => {
      this.handleProtocolSuccess((event as CustomEvent).detail);
    };
    window.addEventListener('protocol-success', handleProtocolSuccess);
    this.eventListeners.push(() => window.removeEventListener('protocol-success', handleProtocolSuccess));

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
      
      // CRITICAL: Call handle_table_data to set the active table in WASM
      // Transform data to match Rust's TableData struct requirements
      if (tableData.table_id && (this.renderEngine as any).handle_table_data) {
        console.log('[WASM] Setting active table to:', tableData.table_id);
        
        // Format data to match Rust TableData struct
        // Convert layers object to proper HashMap<String, Vec<SpriteData>> format
        const formattedLayers: Record<string, any[]> = {};
        if (tableData.layers && typeof tableData.layers === 'object') {
          // If layers is already an object with arrays, use it
          // If layers is empty object {}, create default empty layers
          Object.keys(tableData.layers).forEach(layerName => {
            const layerData = tableData.layers[layerName];
            formattedLayers[layerName] = Array.isArray(layerData) ? layerData : [];
          });
        }
        // Ensure at least the default layers exist as empty arrays
        if (Object.keys(formattedLayers).length === 0) {
          formattedLayers['background'] = [];
          formattedLayers['tokens'] = [];
          formattedLayers['objects'] = [];
          formattedLayers['foreground'] = [];
        }
        
        const rustTableData = {
          table_id: tableData.table_id,
          table_name: tableData.table_name || tableData.name || tableData.table_id, // Ensure string, not undefined
          name: tableData.table_name || tableData.name || tableData.table_id, // Legacy compatibility
          width: tableData.width || 20,
          height: tableData.height || 20,
          scale: tableData.scale || 1.0,
          x_moved: tableData.x_moved || 0,
          y_moved: tableData.y_moved || 0,
          show_grid: tableData.grid_enabled ?? true,
          cell_side: tableData.grid_size || 50,
          layers: formattedLayers // Properly formatted HashMap<String, Vec<SpriteData>>
        };
        
        console.log('[WASM] Formatted table data:', rustTableData);
        (this.renderEngine as any).handle_table_data(rustTableData);
      }
      
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
              spriteData.table_id = tableData.table_id || 'default_table'; // Add table_id
              this.addSpriteToWasm(spriteData);
            });
          } else if (layerData && typeof layerData === 'object') {
            // Layer data is an object, might contain sprites in a sub-property
            if (layerData.sprites && Array.isArray(layerData.sprites)) {
              layerData.sprites.forEach((spriteData: any) => {
                spriteData.layer = layerName;
                spriteData.table_id = tableData.table_id || 'default_table'; // Add table_id
                this.addSpriteToWasm(spriteData);
              });
            } else {
              // Maybe the object itself contains sprite properties
              Object.values(layerData).forEach((spriteData: any) => {
                if (spriteData && typeof spriteData === 'object' && spriteData.sprite_id) {
                  spriteData.layer = layerName;
                  spriteData.table_id = tableData.table_id || 'default_table'; // Add table_id
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

      // Handle fog rectangles if present
      if (tableData.fog_rectangles) {
        console.log('🌫️ Processing fog rectangles from server:', tableData.fog_rectangles);
        const hideRects = tableData.fog_rectangles.hide || [];
        const revealRects = tableData.fog_rectangles.reveal || [];
        
        console.log(`🌫️ Adding ${hideRects.length} hide rectangles and ${revealRects.length} reveal rectangles`);
        
        // Clear existing fog first
        if (typeof (this.renderEngine as any).clear_fog === 'function') {
          (this.renderEngine as any).clear_fog();
        }
        
        // Add hide rectangles
        hideRects.forEach((rect: [[number, number], [number, number]], index: number) => {
          const [[startX, startY], [endX, endY]] = rect;
          const fogId = `fog_hide_${index}_${Date.now()}`;
          console.log(`🌫️ Adding hide rectangle: ${fogId} from (${startX}, ${startY}) to (${endX}, ${endY})`);
          (this.renderEngine as any).add_fog_rectangle(fogId, startX, startY, endX, endY, 'hide');
        });
        
        // Add reveal rectangles
        revealRects.forEach((rect: [[number, number], [number, number]], index: number) => {
          const [[startX, startY], [endX, endY]] = rect;
          const fogId = `fog_reveal_${index}_${Date.now()}`;
          console.log(`🌫️ Adding reveal rectangle: ${fogId} from (${startX}, ${startY}) to (${endX}, ${endY})`);
          (this.renderEngine as any).add_fog_rectangle(fogId, startX, startY, endX, endY, 'reveal');
        });
        
        console.log('🌫️ Fog rectangles loaded successfully');
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

    // Only handle sprite creation responses (which have sprite_data)
    // Move/Scale/Rotate operations are handled by direct WASM updates and don't need this fallback
    if (data.operation === 'create' || (data.sprite_id && data.sprite_data)) {
      console.log('✅ WasmIntegration: Adding sprite to WASM engine:', data.sprite_data);
      try {
        this.addSpriteToWasm(data.sprite_data);
      } catch (error) {
        console.error('❌ WasmIntegration: Failed to add sprite to WASM:', error);
      }
    } else if (data.operation === 'move' || data.operation === 'scale' || data.operation === 'rotate' || data.operation === 'remove') {
      // These operations are handled directly by WASM updates, no fallback needed
      console.log('✅ WasmIntegration: Sprite operation confirmed by server:', data.operation, data.sprite_id);
    } else if (data.sprite_id === null) {
      console.warn('⚠️ WasmIntegration: Sprite operation failed on server:', data);
    } else {
      console.warn('⚠️ WasmIntegration: Unknown sprite response type:', data);
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

      // Use efficient direct updates for specific operations
      if (data.operation === 'move' && data.position) {
        console.log('🎯 Using direct position update for move operation');
        this.updateSpritePosition(spriteId, data.position);
      } else if (data.operation === 'scale' && (data.scale_x !== undefined || data.scale_y !== undefined)) {
        console.log('🎯 Using direct scale update for scale operation');
        this.updateSpriteScale(spriteId, data.scale_x, data.scale_y);
      } else if (data.operation === 'rotate' && data.rotation !== undefined) {
        console.log('🎯 Using direct rotation update for rotate operation');
        this.updateSpriteRotation(spriteId, data.rotation);
      } else if (data.operation && !this.hasCompleteData(data)) {
        // For partial updates, try to use available direct update methods
        console.log(`🔧 Attempting partial update for operation: ${data.operation}`);
        this.handlePartialSpriteUpdate(spriteId, data);
      } else if (this.hasCompleteData(data) && this.needsFullRecreation(data)) {
        // Only do full recreate for fundamental changes (layer, texture change, etc.)
        console.log('🔄 Full sprite recreation needed for fundamental change');
        this.renderEngine.remove_sprite(spriteId);
        this.addSpriteToWasm(data);
      } else if (this.hasCompleteData(data)) {
        // For complete data without fundamental changes, use efficient updates
        console.log('⚡ Using efficient updates for complete data');
        this.updateSpriteEfficiently(spriteId, data);
      } else {
        console.warn(`❌ Incomplete sprite update data for operation ${data.operation}:`, data);
        console.warn('Skipping update to avoid corrupting sprite state');
      }
    } catch (error) {
      console.error('Failed to update sprite in WASM:', error);
    }
  }

  private updateSpritePosition(spriteId: string, position: {x: number, y: number}): void {
    try {
      console.log(`Updating sprite ${spriteId} position to:`, position);
      
      // Try to use the WASM method - this should always work since it exists in render.rs
      if (this.renderEngine && typeof (this.renderEngine as any).update_sprite_position === 'function') {
        const success = (this.renderEngine as any).update_sprite_position(spriteId, position.x, position.y);
        if (success) {
          console.log(`✅ Successfully updated sprite ${spriteId} position using direct WASM method`);
          return;
        } else {
          console.error(`❌ WASM update_sprite_position returned false for sprite ${spriteId} - sprite may not exist`);
        }
      } else {
        console.error(`❌ WASM update_sprite_position method not available - this should not happen!`);
      }
      
      // If we reach here, something is wrong - log error but don't corrupt sprite state
      console.error(`💥 Failed to update sprite ${spriteId} position - avoiding remove+re-add to prevent data corruption`);
      
    } catch (error) {
      console.error('Failed to update sprite position:', error);
    }
  }

  private updateSpriteScale(spriteId: string, scaleX?: number, scaleY?: number): void {
    try {
      // Prevent recursive/concurrent scale operations
      if (this.pendingScaleOperations.has(spriteId)) {
        console.warn(`⚠️ Scale operation already pending for sprite ${spriteId}, skipping`);
        return;
      }

      this.pendingScaleOperations.add(spriteId);
      
      const finalScaleX = scaleX || 1.0;
      const finalScaleY = scaleY || 1.0;
      console.log(`🔍 Updating sprite ${spriteId} scale to: x=${finalScaleX}, y=${finalScaleY}`);
      
      // Check if this is actually a scale change (not just resetting to 1.0)
      if (finalScaleX === 1.0 && finalScaleY === 1.0) {
        console.log('⚠️ Scale values are 1.0, 1.0 - this might be resetting sprite to original size');
      }
      
      if (!this.renderEngine) {
        console.error('❌ RenderEngine not available for sprite scale update');
        return;
      }
      
      // Check if the method exists and what type it is
      console.log('🔍 Checking WASM update_sprite_scale method:', typeof (this.renderEngine as any).update_sprite_scale);
      
      if (typeof (this.renderEngine as any).update_sprite_scale === 'function') {
        // Create fresh copies to avoid unsafe aliasing in Rust
        const spriteIdCopy = String(spriteId);
        const scaleXCopy = Number(finalScaleX);
        const scaleYCopy = Number(finalScaleY);
        
        const success = (this.renderEngine as any).update_sprite_scale(spriteIdCopy, scaleXCopy, scaleYCopy);
        console.log(`🎯 WASM update_sprite_scale returned:`, success);
        
        if (success) {
          console.log(`✅ Successfully updated sprite ${spriteId} scale - forcing render update`);
          // Force a render to make sure the visual change is applied
          if (typeof (this.renderEngine as any).render === 'function') {
            (this.renderEngine as any).render();
            console.log('🎨 Forced render after scale update');
          }
          // Also try requesting animation frame
          requestAnimationFrame(() => {
            if (this.renderEngine && typeof (this.renderEngine as any).render === 'function') {
              (this.renderEngine as any).render();
              console.log('🎨 Animation frame render after scale update');
            }
          });
          this.pendingScaleOperations.delete(spriteId);
          return;
        } else {
          console.error(`❌ WASM update_sprite_scale failed for sprite ${spriteId}`);
        }
      } else {
        console.warn(`❌ WASM update_sprite_scale method not available`);
      }
      
      console.warn('Scale update requires complete sprite data - operation will be skipped to prevent sprite corruption');
      
    } catch (error) {
      console.error('Failed to update sprite scale:', error);
    } finally {
      // Always clean up the pending operation
      this.pendingScaleOperations.delete(spriteId);
    }
  }

  private updateSpriteRotation(spriteId: string, rotation: number): void {
    try {
      console.log(`Updating sprite ${spriteId} rotation to:`, rotation);
      
      // Try to use existing WASM rotation method
      if (this.renderEngine && typeof this.renderEngine.rotate_sprite === 'function') {
        this.renderEngine.rotate_sprite(spriteId, rotation);
        console.log(`Successfully updated sprite ${spriteId} rotation`);
        return;
      }
      
      console.warn(`WASM rotate_sprite not available for sprite ${spriteId}`);
      console.warn('Rotation update requires complete sprite data - operation will be skipped to prevent sprite corruption');
      
    } catch (error) {
      console.error('Failed to update sprite rotation:', error);
    }
  }

  private hasCompleteData(data: any): boolean {
    // Check if we have enough data to recreate a complete sprite
    const hasPosition = (data.position && Array.isArray(data.position) && data.position.length >= 2) ||
                       (data.x !== undefined && data.y !== undefined) ||
                       (data.coord_x !== undefined && data.coord_y !== undefined) ||
                       (data.world_x !== undefined && data.world_y !== undefined);
    
    const hasAsset = data.asset_id || data.asset_xxhash || data.texture_id;
    const hasDimensions = (data.width && data.height) || (data.size_x && data.size_y);
    
    return hasPosition && hasAsset && hasDimensions;
  }

  private needsFullRecreation(data: any): boolean {
    // Only recreate sprite if fundamental properties changed that require remove+add
    return !!(
      data.layer_changed ||           // Layer change requires removal and re-adding
      data.texture_changed ||         // Texture change might require rebinding
      data.fundamental_change ||      // Explicit flag for full recreation
      // Add more conditions as needed for cases that truly require full recreation
      false
    );
  }

  private handlePartialSpriteUpdate(spriteId: string, data: any): void {
    // Handle partial updates using available direct methods
    console.log(`🔧 Handling partial update for ${spriteId}:`, data);
    
    let updated = false;

    // Try position update
    if (data.position || (data.x !== undefined && data.y !== undefined)) {
      const position = data.position || { x: data.x, y: data.y };
      this.updateSpritePosition(spriteId, position);
      updated = true;
    }

    // Try scale update  
    if (data.scale_x !== undefined || data.scale_y !== undefined) {
      this.updateSpriteScale(spriteId, data.scale_x, data.scale_y);
      updated = true;
    }

    // Try rotation update
    if (data.rotation !== undefined) {
      this.updateSpriteRotation(spriteId, data.rotation);
      updated = true;
    }

    if (!updated) {
      console.warn(`⚠️ No applicable update method found for partial data:`, data);
    }
  }

  private updateSpriteEfficiently(spriteId: string, data: any): void {
    // Use multiple direct updates instead of remove+recreate
    console.log(`⚡ Efficiently updating sprite ${spriteId} with complete data`);
    
    // Update position if available
    if (data.position || (data.x !== undefined && data.y !== undefined) || (data.world_x !== undefined && data.world_y !== undefined)) {
      let position;
      if (data.position) {
        position = Array.isArray(data.position) ? { x: data.position[0], y: data.position[1] } : data.position;
      } else {
        position = {
          x: data.x ?? data.world_x ?? 0,
          y: data.y ?? data.world_y ?? 0
        };
      }
      this.updateSpritePosition(spriteId, position);
    }

    // Update scale if available
    if (data.scale_x !== undefined || data.scale_y !== undefined) {
      this.updateSpriteScale(spriteId, data.scale_x, data.scale_y);
    }

    // Update rotation if available
    if (data.rotation !== undefined) {
      this.updateSpriteRotation(spriteId, data.rotation);
    }

    // TODO: Add other efficient updates as WASM methods become available:
    // - update_sprite_size (width, height)  
    // - update_sprite_texture (for texture swaps)
    // - update_sprite_tint (color changes)
    
    console.log(`✅ Efficient update completed for sprite ${spriteId}`);
  }

  private handleSpriteRemoved(data: any): void {
    if (!this.renderEngine) return;

    try {
      const spriteId = data.sprite_id || data.id;
      if (spriteId) {
        console.log('🗑️ WasmIntegration: Removing sprite from WASM:', spriteId);
        this.renderEngine.remove_sprite(spriteId);
        console.log('✅ WasmIntegration: Sprite removed from WASM:', spriteId);
      } else {
        console.warn('⚠️ WasmIntegration: No sprite ID found in removal data:', data);
      }
    } catch (error) {
      console.error('❌ WasmIntegration: Failed to remove sprite from WASM:', error);
    }
  }

  private handleSpriteMoved(data: any): void {
    if (!this.renderEngine) return;

    try {
      const spriteId = data.sprite_id || data.id;
      if (!spriteId) {
        console.warn('No sprite ID found in move data:', data);
        return;
      }

      // Use efficient position update if we have position data
      if (data.position || (data.x !== undefined && data.y !== undefined)) {
        const position = data.position || { x: data.x, y: data.y };
        this.updateSpritePosition(spriteId, position);
      } else {
        // Fallback to full update
        this.updateSpriteInWasm(data);
      }
    } catch (error) {
      console.error('Failed to move sprite in WASM:', error);
    }
  }

  private handleSpriteScaled(data: any): void {
    if (!this.renderEngine) return;

    try {
      // Handle both snake_case and camelCase sprite ID formats
      const spriteId = data.sprite_id || data.id || data.spriteId;
      if (!spriteId) {
        console.warn('No sprite ID found in scale data:', data);
        return;
      }

      // Use efficient scale update if we have scale data
      if (data.scale_x !== undefined && data.scale_y !== undefined) {
        this.updateSpriteScale(spriteId, data.scale_x, data.scale_y);
      } else if (data.scale_x !== undefined) {
        this.updateSpriteScale(spriteId, data.scale_x, undefined);
      } else if (data.scale_y !== undefined) {
        this.updateSpriteScale(spriteId, undefined, data.scale_y);
      } else if (this.hasCompleteData(data)) {
        // Fallback to full update only if we have complete data
        this.updateSpriteInWasm(data);
      } else {
        console.warn('Scale update requires complete sprite data - operation will be skipped to prevent sprite corruption');
      }
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
      
      // Check if this is a light source
      const isLight = spriteData.texture_path === '__LIGHT__';
      
      if (isLight) {
        // This is a light source, add it as a light instead of a sprite
        console.log('🔦 Detected light entity from server, adding as light:', spriteData);
        
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
        
        // Add as light using the rendering engine's add_light method
        const lightId = spriteData.sprite_id || spriteData.id || `light_${Date.now()}`;
        const tableId = spriteData.table_id || 'default_table';
        
        if (typeof (this.renderEngine as any).add_light === 'function') {
          (this.renderEngine as any).add_light(
            lightId,
            x,
            y,
            150.0,  // Default radius
            1.0, 1.0, 0.9, 1.0,  // Default color (warm white)
            tableId
          );
          console.log(`✅ Successfully added light from server: ${lightId} at (${x}, ${y})`);
        } else {
          console.error('❌ add_light method not available on render engine');
        }
        
        return; // Exit early, don't add as sprite
      }
      
      // Regular sprite handling (not a light)
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
        tint_color: spriteData.tint_color || [1.0, 1.0, 1.0, 1.0],
        table_id: spriteData.table_id || 'default_table'  // Use table_id from spriteData
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
        // Check if this asset is still being uploaded (has pending retries)
        if (this.pendingAssetRetries.has(assetId)) {
          console.log('Asset upload still pending, deferring download request:', assetId);
          // Add sprite to pending list for this asset
          const existingSprites = this.pendingSpritesForAssets.get(assetId) || [];
          existingSprites.push(wasmSprite.id);
          this.pendingSpritesForAssets.set(assetId, existingSprites);
        } else {
          console.log('Requesting asset download link for:', assetId);
          this.requestAssetDownloadLink(assetId, wasmSprite.id);
        }
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
      // Remove from pending retries if it was there
      this.pendingAssetRetries.delete(data.asset_id);
    } else {
      console.warn('Asset download response failed or incomplete:', data);
      // If the failure is because asset needs to be uploaded, track it for retry
      if (data.instructions && data.instructions.includes('upload') && data.asset_id) {
        console.log('Asset needs upload, tracking for retry after upload confirmation:', data.asset_id);
        this.pendingAssetRetries.add(data.asset_id);
      }
    }
  }

  /**
   * Handle asset upload confirmation and retry pending downloads
   */
  private handleAssetUploaded(data: any): void {
    console.log('Asset uploaded:', data);
    
    if (data.asset_id && this.pendingAssetRetries.has(data.asset_id)) {
      console.log('Retrying asset download after upload confirmation:', data.asset_id);
      this.pendingAssetRetries.delete(data.asset_id);
      
      // Retry the asset download request
      setTimeout(() => {
        this.requestAssetDownloadLink(data.asset_id, `sprite_for_${data.asset_id}`);
      }, 100); // Small delay to ensure upload is fully processed
    }

    // Check if there are pending sprites waiting for this asset
    if (data.asset_id && this.pendingSpritesForAssets.has(data.asset_id)) {
      console.log('Processing pending sprites for confirmed asset:', data.asset_id);
      const pendingSprites = this.pendingSpritesForAssets.get(data.asset_id) || [];
      
      // Request asset download for each pending sprite
      setTimeout(() => {
        pendingSprites.forEach(spriteId => {
          console.log('Requesting deferred asset download for sprite:', spriteId, 'asset:', data.asset_id);
          this.requestAssetDownloadLink(data.asset_id, spriteId);
        });
        
        // Clear the pending sprites for this asset
        this.pendingSpritesForAssets.delete(data.asset_id);
      }, 150); // Small delay to ensure upload confirmation is fully processed
    }
  }

  /**
   * Handle protocol success messages that might contain asset confirmations
   */
  private handleProtocolSuccess(data: any): void {
    // Check if this is an asset upload confirmation success
    if (data && data.asset_id && (data.message?.includes('Upload confirmed') || data.status === 'uploaded')) {
      console.log('Asset upload confirmed via success message:', data.asset_id);
      this.handleAssetUploaded(data);
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
