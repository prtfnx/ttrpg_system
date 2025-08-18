/**
 * WASM Integration Service - bridges protocol messages with WASM RenderEngine
 * Handles sprite synchronization, table updates, and asset management
 */

import type { RenderEngine } from '../types/wasm';

class WasmIntegrationService {
  private renderEngine: RenderEngine | null = null;
  private eventListeners: Array<() => void> = [];

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
        if (this.renderEngine.clear_all_sprites) {
          this.renderEngine.clear_all_sprites();
        }
        
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

  private handleSpriteUpdated(data: any): void {
    if (!this.renderEngine) return;

    try {
      // For updates, we need to remove and re-add the sprite
      if (data.id) {
        this.renderEngine.remove_sprite(data.id);
        this.addSpriteToWasm(data);
      }
    } catch (error) {
      console.error('Failed to update sprite in WASM:', error);
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

  private handleAssetDownloaded(data: any): void {
    console.log('Asset downloaded, need to integrate with asset manager:', data);
    // This would integrate with existing asset management system
    // For now, just log the event
  }

  private addSpriteToWasm(spriteData: any): void {
    if (!this.renderEngine) return;

    console.log('Adding sprite to WASM:', spriteData);
    console.log('Sprite data keys:', Object.keys(spriteData));

    try {
      const layer = spriteData.layer || 'tokens';
      
      // Create sprite object for WASM - handle server format (coord_x/coord_y) and client format (x/y)
      const wasmSprite = {
        id: spriteData.sprite_id || spriteData.id || `sprite_${Date.now()}`,
        world_x: spriteData.coord_x ?? spriteData.x ?? 0,
        world_y: spriteData.coord_y ?? spriteData.y ?? 0,
        width: spriteData.width || 50,  // Default size
        height: spriteData.height || 50,
        scale_x: spriteData.scale_x || 1.0,
        scale_y: spriteData.scale_y || 1.0,
        rotation: spriteData.rotation || 0.0,
        layer: layer,
        texture_id: spriteData.texture_path || spriteData.texture_id || '',
        tint_color: spriteData.tint_color || [1.0, 1.0, 1.0, 1.0]
      };

      console.log('Converted sprite for WASM:', wasmSprite);

      // Add sprite to WASM engine
      const addedSpriteId = this.renderEngine.add_sprite_to_layer(layer, wasmSprite);
      console.log('Successfully added sprite to WASM:', addedSpriteId, wasmSprite);

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
   * Get the current render engine instance
   */
  getRenderEngine(): RenderEngine | null {
    return this.renderEngine;
  }
}

export const wasmIntegrationService = new WasmIntegrationService();
