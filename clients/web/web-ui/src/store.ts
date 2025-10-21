import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ConnectionState, GameState, Sprite } from './types';
import type { ToolType } from './types/tools';

export interface TableInfo {
  table_id: string;
  table_name: string;
  width: number;
  height: number;
  created_at?: string;
  updated_at?: string;
  // Sync state tracking (best practice: local-first architecture)
  syncStatus?: 'local' | 'syncing' | 'synced' | 'error';
  lastSyncTime?: number;
  syncError?: string;
}

interface GameStore extends GameState {
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
  updateCharacter: (id: string, updates: Partial<import('./types').Character>) => void;
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
    (set) => ({
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
              ? { ...char, inventory: [...(char.inventory || []), item] }
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

      addSprite: (sprite: Sprite) => {
        set((state) => {
          // Check if sprite already exists
          const existingSprite = state.sprites.find(s => s.id === sprite.id);
          if (existingSprite) {
            // If it exists, update it instead of adding
            return {
              sprites: state.sprites.map(s => s.id === sprite.id ? sprite : s)
            };
          } else {
            // Add new sprite
            return {
              sprites: [...state.sprites, sprite]
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
      },

      addCharacter: (character) => {
        set((state) => ({
          characters: [...state.characters, character],
        }));
      },

      updateCharacter: (id, updates) => {
        set((state) => ({
          characters: state.characters.map((char) =>
            char.id === id ? { ...char, ...updates, stats: { ...char.stats, ...(updates.stats || {}) } } : char
          ),
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
