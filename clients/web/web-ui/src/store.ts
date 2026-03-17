import type { Character, ConnectionState, GameState, Sprite, ToolType } from '@/types';
import { isDM, type SessionRole } from '@features/session/types/roles';
import { ProtocolService } from '@lib/api';
import { transformServerTablesToClient, validateTableId } from '@lib/websocket';
import { UnitConverter, dndDefault, type DistanceUnit, type TableUnitConfig } from '@/utils/unitConverter';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface WallData {
  wall_id: string;
  table_id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  wall_type: 'normal' | 'terrain' | 'invisible' | 'ethereal' | 'window';
  blocks_movement: boolean;
  blocks_light: boolean;
  blocks_sight: boolean;
  blocks_sound: boolean;
  is_door: boolean;
  door_state: 'closed' | 'open' | 'locked';
  is_secret: boolean;
  direction: 'both' | 'left' | 'right';
}

// Change detection cache
const spriteCache = new Map<string, Record<string, any>>();

const detectChanges = (spriteId: string, updates: Record<string, any>): Record<string, any> => {
  const prev = spriteCache.get(spriteId) || {};
  const changes: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(updates)) {
    // Deep comparison for arrays
    if (Array.isArray(value) && Array.isArray(prev[key])) {
      if (JSON.stringify(value) !== JSON.stringify(prev[key])) {
        changes[key] = value;
      }
    } else if (prev[key] !== value) {
      changes[key] = value;
    }
  }
  
  if (Object.keys(changes).length > 0) {
    spriteCache.set(spriteId, { ...prev, ...changes });
  }
  
  return changes;
};

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
  gridSize: number;       // px per cell (alias for gridCellPx)
  gridCellPx: number;
  cellDistance: number;
  distanceUnit: DistanceUnit;
  
  // Tool system state
  activeTool: ToolType;
  measurementActive: boolean;
  alignmentActive: boolean;

  // Session role state
  sessionRole: SessionRole | null;
  userId: number | null;
  permissions: string[];
  visibleLayers: string[];
  setSessionRole: (role: SessionRole, permissions: string[], visibleLayers: string[]) => void;
  setUserId: (id: number) => void;

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
  setTableUnits: (config: TableUnitConfig) => void;
  getUnitConverter: () => UnitConverter;
  
  // Tool system actions
  setActiveTool: (tool: ToolType) => void;
  setMeasurementActive: (active: boolean) => void;
  setAlignmentActive: (active: boolean) => void;

  // Lighting
  ambientLight: number;
  setAmbientLight: (level: number) => void;

  // Dynamic lighting (per-table, synced from server)
  dynamicLightingEnabled: boolean;
  fogExplorationMode: 'current_only' | 'persist_dimmed';
  setDynamicLighting: (enabled: boolean) => void;
  setFogExplorationMode: (mode: 'current_only' | 'persist_dimmed') => void;
  applyTableLightingSettings: (settings: { dynamic_lighting_enabled: boolean; fog_exploration_mode: string; ambient_light_level: number }) => void;

  // DM preview mode
  dmPreviewUserId: number | null;
  setDmPreviewMode: (userId: number | null) => void;

  // Wall segment management
  walls: WallData[];
  addWall: (wall: WallData) => void;
  addWalls: (walls: WallData[]) => void;
  updateWall: (wallId: string, updates: Partial<WallData>) => void;
  removeWall: (wallId: string) => void;
  clearWalls: () => void;
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
      gridCellPx: 50,
      cellDistance: 5,
      distanceUnit: 'ft' as DistanceUnit,
      
      // Tool system initial state
      activeTool: 'select',
      measurementActive: false,
      alignmentActive: false,

      // Session role initial state
      sessionRole: null,
      userId: null,
      permissions: [],
      visibleLayers: [],

      // Lighting initial state
      ambientLight: 0.2,
      dynamicLightingEnabled: false,
      fogExplorationMode: 'current_only' as const,
      dmPreviewUserId: null,

      // Wall segment initial state
      walls: [],

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
        
        // Send to server with change detection
        if (!ProtocolService.hasProtocol()) return;
        
        const serverUpdate: Record<string, any> = {};
        if ('characterId' in updates) serverUpdate.character_id = updates.characterId || null;
        if ('controlledBy' in updates) serverUpdate.controlled_by = updates.controlledBy || [];
        if ('hp' in updates) serverUpdate.hp = updates.hp;
        if ('maxHp' in updates) serverUpdate.max_hp = updates.maxHp;
        if ('ac' in updates) serverUpdate.ac = updates.ac;
        if ('auraRadius' in updates) serverUpdate.aura_radius = updates.auraRadius;
        if ('auraColor' in updates) serverUpdate.aura_color = updates.auraColor;
        if ('x' in updates) serverUpdate.x = updates.x;
        if ('y' in updates) serverUpdate.y = updates.y;
        if ('scaleX' in updates) serverUpdate.scale_x = updates.scaleX;
        if ('scaleY' in updates) serverUpdate.scale_y = updates.scaleY;
        if ('rotation' in updates) serverUpdate.rotation = updates.rotation;
        if ('visionRadius' in updates) serverUpdate.vision_radius = updates.visionRadius;
        if ('hasDarkvision' in updates) serverUpdate.has_darkvision = updates.hasDarkvision;
        if ('darkvisionRadius' in updates) serverUpdate.darkvision_radius = updates.darkvisionRadius;
        
        const changes = detectChanges(id, serverUpdate);
        if (Object.keys(changes).length > 0) {
          ProtocolService.getProtocol().updateSprite(id, changes);
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
        const state = useGameStore.getState();
        if (isDM(state.sessionRole)) return true;
        const sprite = state.sprites.find((s: any) => s.id === spriteId);
        if (!sprite) return false;
        const cb: number[] = Array.isArray(sprite.controlledBy)
          ? sprite.controlledBy.map(Number)
          : [];
        if (userId === undefined) return cb.length > 0;
        if (cb.length === 0) return false; // no controlled_by = DM-only
        if (cb.includes(userId)) return true;
        const character = state.getCharacterForSprite(spriteId);
        if (!character) return false;
        return character.ownerId === userId;
      },

      canEditCharacter: (characterId: string, userId?: number) => {
        const state = useGameStore.getState();
        if (isDM(state.sessionRole)) return true;
        const character = state.characters.find((c: any) => c.id === characterId);
        if (!character) return false;
        if (userId === undefined) return true;
        return character.ownerId === userId || (Array.isArray(character.controlledBy) && character.controlledBy.includes(userId));
      },

      linkSpriteToCharacter: (spriteId: string, characterId: string) => {
        // Just use updateSprite - it handles both local state and server sync
        const updateSprite = useGameStore.getState().updateSprite;
        updateSprite(spriteId, { characterId });
      },

      unlinkSpriteFromCharacter: (spriteId: string) => {
        // Just use updateSprite - it handles both local state and server sync
        const updateSprite = useGameStore.getState().updateSprite;
        updateSprite(spriteId, { characterId: undefined });
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
          gridCellPx: size,
        }));
      },

      setTableUnits: (config: TableUnitConfig) => {
        set(() => ({
          gridCellPx: config.gridCellPx,
          gridSize: config.gridCellPx,
          cellDistance: config.cellDistance,
          distanceUnit: config.distanceUnit,
        }));
      },

      getUnitConverter: () => {
        const s = useGameStore.getState();
        return new UnitConverter({ gridCellPx: s.gridCellPx, cellDistance: s.cellDistance, distanceUnit: s.distanceUnit });
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

      setAmbientLight: (level: number) => {
        set(() => ({ ambientLight: level }));
        const rm = typeof window !== 'undefined' ? (window as any).rustRenderManager : null;
        if (rm?.set_ambient_light) rm.set_ambient_light(level);
      },

      setDmPreviewMode: (userId: number | null) => {
        set(() => ({ dmPreviewUserId: userId }));
      },

      setDynamicLighting: (enabled: boolean) => {
        set(() => ({ dynamicLightingEnabled: enabled }));
      },

      setFogExplorationMode: (mode: 'current_only' | 'persist_dimmed') => {
        set(() => ({ fogExplorationMode: mode }));
      },

      applyTableLightingSettings: (settings: { dynamic_lighting_enabled: boolean; fog_exploration_mode: string; ambient_light_level: number }) => {
        set(() => ({
          dynamicLightingEnabled: settings.dynamic_lighting_enabled,
          fogExplorationMode: (settings.fog_exploration_mode as 'current_only' | 'persist_dimmed') ?? 'current_only',
          ambientLight: settings.ambient_light_level ?? 1.0,
        }));
        // Sync lighting settings to WASM if available
        if (typeof window !== 'undefined') {
          const rm = (window as any).rustRenderManager;
          if (rm?.set_ambient_light) rm.set_ambient_light(settings.ambient_light_level ?? 1.0);
          if (rm?.set_dynamic_lighting_enabled) rm.set_dynamic_lighting_enabled(settings.dynamic_lighting_enabled);
        }
      },

      setSessionRole: (role: SessionRole, permissions: string[], visibleLayers: string[]) => {
        set(() => ({ sessionRole: role, permissions, visibleLayers }));
      },

      setUserId: (id: number) => {
        set(() => ({ userId: id }));
      },
      
      // Table management actions
      setTables: (tables: TableInfo[]) => {
        const transformedTables = transformServerTablesToClient(tables);
        set(() => ({
          tables: transformedTables,
        }));
      },

      setActiveTableId: (tableId: string | null) => {
        console.log('[Store] setActiveTableId called with:', tableId);
        set(() => ({
          activeTableId: tableId,
        }));
        
        // Save active table to server for persistence
        if (tableId && (window as any).protocol) {
          const protocol = (window as any).protocol;
          console.log('[Store] Protocol available, calling setActiveTable');
          if (protocol.setActiveTable) {
            console.log('[Store] Calling protocol.setActiveTable with:', tableId);
            protocol.setActiveTable(tableId);
          } else {
            console.warn('[Store] protocol.setActiveTable method not available');
          }
        } else {
          console.warn('[Store] Protocol not available or tableId is null:', { tableId, protocol: !!(window as any).protocol });
        }
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
        console.log('[Store] switchToTable called with:', tableId);
        validateTableId(tableId);
        
        // Use setActiveTableId to ensure server persistence
        const { setActiveTableId } = _get();
        setActiveTableId(tableId);
        
        set((state) => {
          const table = state.tables.find(t => t.table_id === tableId);
          if (table) {
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
            
            window.dispatchEvent(new CustomEvent('table-data-received', {
              detail: tableDataForWasm
            }));
          }
          
          return {}; // activeTableId already set by setActiveTableId
        });
        
        window.dispatchEvent(new CustomEvent('protocol-send-message', {
          detail: {
            type: 'table_request',
            data: {
              table_id: tableId
            }
          }
        }));
      },

      // Wall segment actions
      addWall: (wall: WallData) => {
        set((state) => ({
          walls: state.walls.some(w => w.wall_id === wall.wall_id)
            ? state.walls.map(w => w.wall_id === wall.wall_id ? wall : w)
            : [...state.walls, wall],
        }));
        const rm = (window as any).rustRenderManager;
        if (rm?.add_wall) rm.add_wall(JSON.stringify(wall));
      },

      addWalls: (walls: WallData[]) => {
        set((state) => {
          const existing = new Map(state.walls.map(w => [w.wall_id, w]));
          for (const w of walls) existing.set(w.wall_id, w);
          return { walls: [...existing.values()] };
        });
        const rm = (window as any).rustRenderManager;
        if (rm?.add_wall) {
          for (const w of walls) rm.add_wall(JSON.stringify(w));
        }
      },

      updateWall: (wallId: string, updates: Partial<WallData>) => {
        set((state) => ({
          walls: state.walls.map(w => w.wall_id === wallId ? { ...w, ...updates } : w),
        }));
        const rm = (window as any).rustRenderManager;
        if (rm?.update_wall) rm.update_wall(wallId, JSON.stringify(updates));
      },

      removeWall: (wallId: string) => {
        set((state) => ({ walls: state.walls.filter(w => w.wall_id !== wallId) }));
        const rm = (window as any).rustRenderManager;
        if (rm?.remove_wall) rm.remove_wall(wallId);
      },

      clearWalls: () => {
        set(() => ({ walls: [] }));
        const rm = (window as any).rustRenderManager;
        if (rm?.clear_walls) rm.clear_walls();
      },
    }),
    {
      name: 'ttrpg-game-store',
    }
  )
);
