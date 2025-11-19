import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Character, ConnectionState, GameState, Sprite } from './types';
import type { ToolType } from './types/tools';

export interface TableInfo {
  table_id: string;
  table_name: string;
  width: number;
  height: number;
  created_at?: string;
  updated_at?: string;
  entity_count?: number;
  // Sync state tracking (best practice: local-first architecture)
  syncStatus?: 'local' | 'syncing' | 'synced' | 'error';
  lastSyncTime?: number;
  syncError?: string;
}

interface GameStore extends GameState {
  // Character/Sprite linking helpers
  getSpritesForCharacter: (characterId: string) => Sprite[];
  getCharacterForSprite: (spriteId: string) => import('./types').Character | undefined;
  canControlSprite: (spriteId: string, userId?: number) => boolean;
  canEditCharacter: (characterId: string, userId?: number) => boolean;
  linkSpriteToCharacter: (spriteId: string, characterId: string) => void;
  unlinkSpriteFromCharacter: (spriteId: string) => void;
  // Table management state
  tables: TableInfo[];
  activeTableId: string | null;
  tablesLoading: boolean;
  
  // Layer management state
  activeLayer: string;
  layerVisibility: Record<string, boolean>;
  layerOpacity: Record<string, number>;
  
  // Grid system state
  gridEnabled: boolean;
  gridSnapping: boolean;
  gridSize: number;
  
  // Tool system state
  activeTool: ToolType;
  measurementActive: boolean;
  alignmentActive: boolean;
  
  // Actions
  moveSprite: (id: string, x: number, y: number) => void;
  selectSprite: (id: string, multiSelect?: boolean) => void;
  updateCamera: (x: number, y: number, zoom?: number) => void;
  setConnection: (connected: boolean, sessionId?: string) => void;
  updateConnectionState: (state: ConnectionState) => void;
  addSprite: (sprite: Sprite) => void;
  removeSprite: (id: string) => void;
  updateSprite: (id: string, updates: Partial<Sprite>) => void;
  addCharacter: (character: import('./types').Character) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  removeCharacter: (id: string) => void;
  addInventoryItem: (characterId: string, item: string) => void;
  
  // Table management actions
  setTables: (tables: TableInfo[]) => void;
  setActiveTableId: (tableId: string | null) => void;
  setTablesLoading: (loading: boolean) => void;
  requestTableList: () => void;
  createNewTable: (name: string, width: number, height: number) => void;
  deleteTable: (tableId: string) => void;
  switchToTable: (tableId: string) => void;
  syncTableToServer: (tableId: string) => void; // BEST PRACTICE: Manual sync control
  
  // Layer management actions
  setActiveLayer: (layerName: string) => void;
  setLayerVisibility: (layerName: string, visible: boolean) => void;
  setLayerOpacity: (layerName: string, opacity: number) => void;
  
  // Grid system actions
  setGridEnabled: (enabled: boolean) => void;
  setGridSnapping: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  
  // Tool system actions
  setActiveTool: (tool: ToolType) => void;
  setMeasurementActive: (active: boolean) => void;
  setAlignmentActive: (active: boolean) => void;
}

export const useGameStore = create<GameStore>()(
  devtools(
  (set, _get) => ({
      // Initial state
      sprites: [],
      characters: [],
      selectedSprites: [],
      camera: { x: 0, y: 0, zoom: 1 },
      isConnected: false,
      connectionState: 'disconnected',
      sessionId: undefined,
      
      // Table management initial state
      tables: [],
      activeTableId: null,
      tablesLoading: false,
      
      // Layer management initial state
      activeLayer: 'tokens',
      layerVisibility: {
        'map': true,
        'tokens': true,
        'dungeon_master': true,
        'light': true,
        'height': true,
        'obstacles': true,
        'fog_of_war': true
      },
      layerOpacity: {
        'map': 1.0,
        'tokens': 1.0,
        'dungeon_master': 1.0,
        'light': 0.6,
        'height': 0.7,
        'obstacles': 1.0,
        'fog_of_war': 0.8
      },
      
      // Grid system initial state
      gridEnabled: true,
      gridSnapping: false,
      gridSize: 50,
      
      // Tool system initial state
      activeTool: 'select',
      measurementActive: false,
      alignmentActive: false,

      // Actions
      moveSprite: (id: string, x: number, y: number) => {
        set((state) => ({
          sprites: state.sprites.map((sprite) =>
            sprite.id === id ? { ...sprite, x, y } : sprite
          ),
        }));
      },

      selectSprite: (id: string, multiSelect = false) => {
        set((state) => {
          const currentSelection = state.selectedSprites;
          let newSelection: string[];

          if (multiSelect) {
            newSelection = currentSelection.includes(id)
              ? currentSelection.filter((spriteId) => spriteId !== id)
              : [...currentSelection, id];
          } else {
            newSelection = currentSelection.includes(id) && currentSelection.length === 1
              ? []
              : [id];
          }

          return {
            selectedSprites: newSelection,
            sprites: state.sprites.map((sprite) => ({
              ...sprite,
              isSelected: newSelection.includes(sprite.id),
            })),
          };
        });
      },

      addInventoryItem: (characterId: string, item: string) => {
        set((state) => ({
          characters: state.characters.map((char) =>
            char.id === characterId
              ? { 
                  ...char, 
                  data: {
                    ...char.data,
                    inventory: [...(char.data?.inventory || []), item]
                  }
                }
              : char
          ),
        }));
      },

      updateCamera: (x: number, y: number, zoom?: number) => {
        set((state) => ({
          camera: {
            x,
            y,
            zoom: zoom ?? state.camera.zoom,
          },
        }));
      },

      setConnection: (connected: boolean, sessionId?: string) => {
        set(() => ({
          isConnected: connected,
          connectionState: connected ? 'connected' : 'disconnected',
          sessionId,
        }));
      },

      updateConnectionState: (state: ConnectionState) => {
        set(() => ({
          connectionState: state,
          isConnected: state === 'connected',
        }));
      },

      addSprite: (sprite: any) => {
        // Migrate legacy sprite fields if needed
        const migrated = { ...sprite };
        if (migrated.imageUrl && !migrated.texture) {
          migrated.texture = migrated.imageUrl;
        }
        if ((typeof migrated.width === 'number' && typeof migrated.height === 'number') && !migrated.scale) {
          // Assume default sprite size is 32x32 for scale calculation
          migrated.scale = {
            x: migrated.width / 32,
            y: migrated.height / 32
          };
        }
        // Remove legacy fields if present
        delete migrated.imageUrl;
        delete migrated.width;
        delete migrated.height;
        set((state) => {
          // Check if sprite already exists
          const existingSprite = state.sprites.find(s => s.id === migrated.id);
          if (existingSprite) {
            // If it exists, update it instead of adding
            return {
              sprites: state.sprites.map(s => s.id === migrated.id ? migrated : s)
            };
          } else {
            // Add new sprite
            return {
              sprites: [...state.sprites, migrated]
            };
          }
        });
      },

      removeSprite: (id: string) => {
        set((state) => ({
          sprites: state.sprites.filter((sprite) => sprite.id !== id),
          selectedSprites: state.selectedSprites.filter((spriteId) => spriteId !== id),
        }));
      },

      updateSprite: (id: string, updates: Partial<Sprite>) => {
        set((state) => ({
          sprites: state.sprites.map((sprite) =>
            sprite.id === id ? { ...sprite, ...updates } : sprite
          ),
        }));
        
        // Send update to server - only send fields that are actually in updates
        const protocol = (window as any).__protocol__;
        if (protocol?.updateSprite) {
          const serverUpdate: Record<string, unknown> = {};
          
          // Only include fields that are being updated
          if ('characterId' in updates) {
            serverUpdate.character_id = updates.characterId || null;
          }
          
          if ('controlledBy' in updates) {
            serverUpdate.controlled_by = updates.controlledBy || [];
          }
          
          // Include token stats only if present in updates
          if ('hp' in updates) serverUpdate.hp = updates.hp;
          if ('maxHp' in updates) serverUpdate.max_hp = updates.maxHp;
          if ('ac' in updates) serverUpdate.ac = updates.ac;
          if ('auraRadius' in updates) serverUpdate.aura_radius = updates.auraRadius;
          
          // Include position/transform updates only if present
          if ('x' in updates) serverUpdate.x = updates.x;
          if ('y' in updates) serverUpdate.y = updates.y;
          if ('scaleX' in updates) serverUpdate.scale_x = updates.scaleX;
          if ('scaleY' in updates) serverUpdate.scale_y = updates.scaleY;
          if ('rotation' in updates) serverUpdate.rotation = updates.rotation;
          
          // Only send if there are actual server-relevant updates
          if (Object.keys(serverUpdate).length > 0) {
            console.log('[Store] Sending sprite update to server:', { id, serverUpdate });
            protocol.updateSprite(id, serverUpdate);
          }
        }
      },

      addCharacter: (character: any) => {
        // Migrate legacy character fields if needed
        const migrated = { ...character };
        if (typeof migrated.data !== 'object' || migrated.data == null) {
          migrated.data = {};
        }
        if (typeof migrated.version !== 'number') {
          migrated.version = 1;
        }
        set((state) => ({
          characters: [...state.characters, migrated],
        }));
      },

          // --- Character / Sprite linking helpers ---


      // --- Character / Sprite linking helpers ---
      getSpritesForCharacter: (characterId: string) => {
        return useGameStore.getState().sprites.filter((s: any) => s.characterId === characterId);
      },

      getCharacterForSprite: (spriteId: string) => {
        const sprite = useGameStore.getState().sprites.find((s: any) => s.id === spriteId);
        if (!sprite?.characterId) return undefined;
        return useGameStore.getState().characters.find((c: any) => c.id === sprite.characterId);
      },

      canControlSprite: (spriteId: string, userId?: number) => {
        const sprite = useGameStore.getState().sprites.find((s: any) => s.id === spriteId);
        if (!sprite) return false;
        if (userId === undefined) return Array.isArray(sprite.controlledBy) && sprite.controlledBy.length > 0;
        if (sprite.controlledBy && sprite.controlledBy.includes(String(userId))) return true;
        const character = useGameStore.getState().getCharacterForSprite(spriteId);
        if (!character) return false;
        return character.ownerId === userId || (Array.isArray(character.controlledBy) && character.controlledBy.includes(userId));
      },

      canEditCharacter: (characterId: string, userId?: number) => {
        const character = useGameStore.getState().characters.find((c: any) => c.id === characterId);
        if (!character) return false;
        if (userId === undefined) return true;
        return character.ownerId === userId || (Array.isArray(character.controlledBy) && character.controlledBy.includes(userId));
      },

      linkSpriteToCharacter: (spriteId: string, characterId: string) => {
        set((state) => ({
          sprites: state.sprites.map((s: any) => s.id === spriteId ? { ...s, characterId } : s)
        }));
        
        // Send character link to server
        const protocol = (window as any).__protocol__;
        if (protocol?.updateSprite) {
          console.log('[Store] Linking sprite to character on server:', { spriteId, characterId });
          protocol.updateSprite(spriteId, { character_id: characterId });
        }
      },

      unlinkSpriteFromCharacter: (spriteId: string) => {
        set((state) => ({
          sprites: state.sprites.map((s: any) => s.id === spriteId ? { ...s, characterId: undefined } : s)
        }));
        
        // Send character unlink to server
        const protocol = (window as any).__protocol__;
        if (protocol?.updateSprite) {
          console.log('[Store] Unlinking sprite from character on server:', { spriteId });
          protocol.updateSprite(spriteId, { character_id: null });
        }
      },

      updateCharacter: (id: string, updates: Partial<Character>) => {
        set((state) => ({
          characters: state.characters.map((char) =>
            char.id === id ? { ...char, ...updates } : char
          )
        }));
      },

      removeCharacter: (id: string) => {
        set((state) => ({
          characters: state.characters.filter((char) => char.id !== id),
          // Remove spriteId from selectedSprites if any sprite is linked to this character
          selectedSprites: state.selectedSprites.filter((spriteId) => {
            const spritesForChar = state.sprites.filter(s => s.characterId === id);
            return !spritesForChar.some(s => s.id === spriteId);
          }),
        }));
      },

      // Layer management actions
      setActiveLayer: (layerName: string) => {
        set(() => ({
          activeLayer: layerName,
        }));
      },

      setLayerVisibility: (layerName: string, visible: boolean) => {
        set((state) => ({
          layerVisibility: {
            ...state.layerVisibility,
            [layerName]: visible,
          },
        }));
      },

      setLayerOpacity: (layerName: string, opacity: number) => {
        set((state) => ({
          layerOpacity: {
            ...state.layerOpacity,
            [layerName]: opacity,
          },
        }));
      },
      
      // Grid system actions
      setGridEnabled: (enabled: boolean) => {
        set(() => ({
          gridEnabled: enabled,
        }));
      },

      setGridSnapping: (enabled: boolean) => {
        set(() => ({
          gridSnapping: enabled,
        }));
      },

      setGridSize: (size: number) => {
        set(() => ({
          gridSize: size,
        }));
      },
      
      // Tool system actions
      setActiveTool: (tool: ToolType) => {
        set(() => ({
          activeTool: tool,
          measurementActive: tool === 'measure',
          alignmentActive: tool === 'align',
        }));
      },

      setMeasurementActive: (active: boolean) => {
        set(() => ({
          measurementActive: active,
        }));
      },

      setAlignmentActive: (active: boolean) => {
        set(() => ({
          alignmentActive: active,
        }));
      },
      
      // Table management actions
      setTables: (tables: TableInfo[]) => {
        set(() => ({
          tables,
        }));
      },

      setActiveTableId: (tableId: string | null) => {
        set(() => ({
          activeTableId: tableId,
        }));
      },

      setTablesLoading: (loading: boolean) => {
        set(() => ({
          tablesLoading: loading,
        }));
      },

      requestTableList: () => {
        console.log('🔄 Store: Requesting table list...');
        // Send message via protocol to request table list
        window.dispatchEvent(new CustomEvent('protocol-send-message', {
          detail: {
            type: 'table_list_request',
            data: {}
          }
        }));
        console.log('📤 Store: Dispatched protocol-send-message event');
        set(() => ({
          tablesLoading: true
        }));
      },

      createNewTable: (name: string, width: number, height: number) => {
        // BEST PRACTICE: Create table locally first (optimistic UI)
        const newTable: TableInfo = {
          table_id: `local_${Date.now()}`, // Local ID until synced to server
          table_name: name,
          width,
          height,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          syncStatus: 'local', // Mark as local-only initially
          lastSyncTime: undefined
        };
        
        set((state) => ({
          tables: [...state.tables, newTable],
          activeTableId: newTable.table_id
        }));
        
        // Create basic table data structure for WASM rendering
        const tableDataForWasm = {
          table_data: {
            table_id: newTable.table_id,
            table_name: newTable.table_name,
            width: newTable.width,
            height: newTable.height,
            grid_size: 50,
            grid_enabled: true,
            grid_snapping: false,
            layers: {
              map: [],
              tokens: [],
              dungeon_master: [],
              light: [],
              height: [],
              obstacles: [],
              fog_of_war: []
            }
          }
        };
        
        // Emit table data event for WASM integration
        window.dispatchEvent(new CustomEvent('table-data-received', {
          detail: tableDataForWasm
        }));
        
        // Send message via protocol to create new table on server
        // BEST PRACTICE: Include local_table_id for sync mapping
        window.dispatchEvent(new CustomEvent('protocol-send-message', {
          detail: {
            type: 'new_table_request',
            data: {
              table_name: name,
              width,
              height,
              local_table_id: newTable.table_id // Include local ID for server mapping
            }
          }
        }));
      },

      deleteTable: (tableId: string) => {
        // Send message via protocol to delete table
        window.dispatchEvent(new CustomEvent('protocol-send-message', {
          detail: {
            type: 'table_delete',
            data: {
              table_id: tableId
            }
          }
        }));
      },

      // BEST PRACTICE: Manual sync - send local table to server
      syncTableToServer: (tableId: string) => {
        set((state) => {
          const table = state.tables.find((t: TableInfo) => t.table_id === tableId);
          
          if (!table) {
            console.error('Table not found for sync:', tableId);
            return state; // No change
          }
          
          console.log('Syncing table to server:', table);
          
          // Send NEW_TABLE_REQUEST to create on server
          window.dispatchEvent(new CustomEvent('protocol-send-message', {
            detail: {
              type: 'new_table_request',
              data: {
                table_name: table.table_name,
                width: table.width,
                height: table.height,
                local_table_id: tableId // Include local ID for mapping
              }
            }
          }));
          
          // Mark table as syncing
          return {
            tables: state.tables.map((t: TableInfo) => 
              t.table_id === tableId 
                ? { ...t, syncStatus: 'syncing' as const, syncError: undefined }
                : t
            )
          };
        });
      },

      switchToTable: (tableId: string) => {
        set((state) => {
          // Find the table info
          const table = state.tables.find(t => t.table_id === tableId);
          if (table) {
            // Create basic table data structure for WASM rendering when switching locally
            const tableDataForWasm = {
              table_data: {
                table_id: table.table_id,
                table_name: table.table_name,
                width: table.width,
                height: table.height,
                grid_size: 50,
                grid_enabled: true,
                grid_snapping: false,
                layers: {
                  map: [],
                  tokens: [],
                  dungeon_master: [],
                  light: [],
                  height: [],
                  obstacles: [],
                  fog_of_war: []
                }
              }
            };
            
            // Emit table data event for WASM integration
            window.dispatchEvent(new CustomEvent('table-data-received', {
              detail: tableDataForWasm
            }));
          }
          
          return { activeTableId: tableId };
        });
        
        // Send message via protocol to request table data from server
        window.dispatchEvent(new CustomEvent('protocol-send-message', {
          detail: {
            type: 'table_request',
            data: {
              table_id: tableId
            }
          }
        }));
      },
    }),
    {
      name: 'ttrpg-game-store',
    }
  )
);
