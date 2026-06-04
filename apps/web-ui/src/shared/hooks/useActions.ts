import type { ActionsClient } from '@lib/wasm/ttrpg_rust_core';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ActionsEngine = Pick<
  ActionsClient,
  | 'set_action_handler'
  | 'set_state_change_handler'
  | 'set_error_handler'
  | 'can_undo'
  | 'can_redo'
  | 'create_table'
  | 'delete_table'
  | 'update_table'
  | 'create_sprite'
  | 'delete_sprite'
  | 'update_sprite'
  | 'set_layer_visibility'
  | 'move_sprite_to_layer'
  | 'batch_actions'
  | 'undo'
  | 'redo'
  | 'get_all_tables'
  | 'get_action_history'
>;

export interface ActionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface TableInfo {
  table_id: string;
  name: string;
  width: number;
  height: number;
  scale_x: number;
  scale_y: number;
  offset_x: number;
  offset_y: number;
}

export interface SpriteInfo {
  sprite_id: string;
  layer: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  texture_name: string;
  visible: boolean;
}

export interface BatchAction {
  type: string;
  params: Record<string, unknown>;
}

export interface ActionHistoryEntry {
  action_type: string;
  timestamp: number;
  data: unknown;
  reversible: boolean;
}

export interface ActionsState {
  tables: Map<string, TableInfo>;
  sprites: Map<string, SpriteInfo>;
  layerVisibility: Map<string, boolean>;
  actionHistory: ActionHistoryEntry[];
  canUndo: boolean;
  canRedo: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface ActionsCallbacks {
  onAction?: (actionType: string, data: unknown) => void;
  onStateChange?: (eventType: string, targetId: string) => void;
  onError?: (error: string) => void;
}

const initialState: ActionsState = {
  tables: new Map(),
  sprites: new Map(),
  layerVisibility: new Map([
    ['map', true],
    ['tokens', true],
    ['dungeon_master', true],
    ['light', true],
    ['height', true],
    ['obstacles', true],
    ['fog_of_war', true],
  ]),
  actionHistory: [],
  canUndo: false,
  canRedo: false,
  isLoading: false,
  error: null,
};

export function useActions(actionsEngine: ActionsEngine | null, callbacks?: ActionsCallbacks) {
  const [state, setState] = useState<ActionsState>(initialState);
  const callbacksRef = useRef(callbacks);
  
  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Setup event handlers
  useEffect(() => {
    if (!actionsEngine) return;

    const handleAction = (actionType: string, data: unknown) => {
      callbacksRef.current?.onAction?.(actionType, data);
    };

    const handleStateChange = (eventType: string, targetId: string) => {
      // Update local state based on event type
      setState(prev => ({
        ...prev,
        canUndo: actionsEngine.can_undo(),
        canRedo: actionsEngine.can_redo(),
      }));
      
      callbacksRef.current?.onStateChange?.(eventType, targetId);
    };

    const handleError = (error: string) => {
      setState(prev => ({ ...prev, error, isLoading: false }));
      callbacksRef.current?.onError?.(error);
    };

    try {
      // TODO temporal fix: cast actionsEngine to any until action handlers exist in WASM d.ts
      (actionsEngine as any).set_action_handler?.(handleAction);
      (actionsEngine as any).set_state_change_handler?.(handleStateChange);
      (actionsEngine as any).set_error_handler?.(handleError);
    } catch (error) {
      console.error('Error setting up actions handlers:', error);
    }

    return () => {
      // Cleanup handlers if needed
    };
  }, [actionsEngine]);

  // Table Management
  const createTable = useCallback(async (name: string, width: number, height: number): Promise<ActionResult> => {
    if (!actionsEngine) throw new Error('ActionsEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = (actionsEngine as any).create_table?.(name, width, height) ?? { success: false, message: 'create_table_action not supported' } as ActionResult;
      const actionResult = result as ActionResult;
      
      if (actionResult.success && actionResult.data) {
        const tableInfo = actionResult.data as TableInfo;
        setState(prev => ({
          ...prev,
          tables: new Map(prev.tables).set(tableInfo.table_id, tableInfo),
          isLoading: false,
        }));
      } else {
        setState(prev => ({ ...prev, isLoading: false, error: actionResult.message }));
      }
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
      throw error;
    }
  }, [actionsEngine]);

  const deleteTable = useCallback(async (tableId: string): Promise<ActionResult> => {
    if (!actionsEngine) throw new Error('ActionsEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = (actionsEngine as any).delete_table?.(tableId) ?? { success: false, message: 'delete_table_action not supported' } as ActionResult;
      const actionResult = result as ActionResult;
      
      if (actionResult.success) {
        setState(prev => {
          const newTables = new Map(prev.tables);
          newTables.delete(tableId);
          return { ...prev, tables: newTables, isLoading: false };
        });
      } else {
        setState(prev => ({ ...prev, isLoading: false, error: actionResult.message }));
      }
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
      throw error;
    }
  }, [actionsEngine]);

  const updateTable = useCallback(async (tableId: string, updates: Partial<TableInfo>): Promise<ActionResult> => {
    if (!actionsEngine) throw new Error('ActionsEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = (actionsEngine as any).update_table?.(tableId, updates) ?? { success: false, message: 'update_table_action not supported' } as ActionResult;
      const actionResult = result as ActionResult;
      
      if (actionResult.success && actionResult.data) {
        const updatedTable = actionResult.data as TableInfo;
        setState(prev => ({
          ...prev,
          tables: new Map(prev.tables).set(tableId, updatedTable),
          isLoading: false,
        }));
      } else {
        setState(prev => ({ ...prev, isLoading: false, error: actionResult.message }));
      }
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
      throw error;
    }
  }, [actionsEngine]);

  // Sprite Management
  const createSprite = useCallback(async (
    tableId: string, 
    layer: string, 
    position: { x: number; y: number }, 
    textureName: string
  ): Promise<ActionResult> => {
    if (!actionsEngine) throw new Error('ActionsEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = (actionsEngine as any).create_sprite?.(tableId, layer, position, textureName) ?? { success: false, message: 'create_sprite_action not supported' } as ActionResult;
      const actionResult = result as ActionResult;
      
      if (actionResult.success && actionResult.data) {
        const spriteInfo = actionResult.data as SpriteInfo;
        setState(prev => ({
          ...prev,
          sprites: new Map(prev.sprites).set(spriteInfo.sprite_id, spriteInfo),
          isLoading: false,
        }));
      } else {
        setState(prev => ({ ...prev, isLoading: false, error: actionResult.message }));
      }
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
      throw error;
    }
  }, [actionsEngine]);

  const deleteSprite = useCallback(async (spriteId: string): Promise<ActionResult> => {
    if (!actionsEngine) throw new Error('ActionsEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = (actionsEngine as any).delete_sprite?.(spriteId) ?? { success: false, message: 'delete_sprite_action not supported' } as ActionResult;
      const actionResult = result as ActionResult;
      
      if (actionResult.success) {
        setState(prev => {
          const newSprites = new Map(prev.sprites);
          newSprites.delete(spriteId);
          return { ...prev, sprites: newSprites, isLoading: false };
        });
      } else {
        setState(prev => ({ ...prev, isLoading: false, error: actionResult.message }));
      }
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
      throw error;
    }
  }, [actionsEngine]);

  const updateSprite = useCallback(async (spriteId: string, updates: Partial<SpriteInfo>): Promise<ActionResult> => {
    if (!actionsEngine) throw new Error('ActionsEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = (actionsEngine as any).update_sprite?.(spriteId, updates) ?? { success: false, message: 'update_sprite_action not supported' } as ActionResult;
      const actionResult = result as ActionResult;
      
      if (actionResult.success && actionResult.data) {
        const updatedSprite = actionResult.data as SpriteInfo;
        setState(prev => ({
          ...prev,
          sprites: new Map(prev.sprites).set(spriteId, updatedSprite),
          isLoading: false,
        }));
      } else {
        setState(prev => ({ ...prev, isLoading: false, error: actionResult.message }));
      }
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
      throw error;
    }
  }, [actionsEngine]);

  // Layer Management
  const setLayerVisibility = useCallback(async (layer: string, visible: boolean): Promise<ActionResult> => {
    if (!actionsEngine) throw new Error('ActionsEngine not initialized');
    
    try {
      const result = (actionsEngine as any).set_layer_visibility?.(layer, visible) ?? { success: false, message: 'set_layer_visibility_action not supported' } as ActionResult;
      const actionResult = result as ActionResult;
      
      if (actionResult.success) {
        setState(prev => ({
          ...prev,
          layerVisibility: new Map(prev.layerVisibility).set(layer, visible),
        }));
      }
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw error;
    }
  }, [actionsEngine]);

  const moveSpriteToLayer = useCallback(async (spriteId: string, newLayer: string): Promise<ActionResult> => {
    if (!actionsEngine) throw new Error('ActionsEngine not initialized');
    
    try {
      const result = (actionsEngine as any).move_sprite_to_layer?.(spriteId, newLayer) ?? { success: false, message: 'move_sprite_to_layer_action not supported' } as ActionResult;
      const actionResult = result as ActionResult;
      
      if (actionResult.success && actionResult.data) {
        const updatedSprite = actionResult.data as SpriteInfo;
        setState(prev => ({
          ...prev,
          sprites: new Map(prev.sprites).set(spriteId, updatedSprite),
        }));
      }
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw error;
    }
  }, [actionsEngine]);

  // Batch Operations
  const batchActions = useCallback(async (actions: BatchAction[]): Promise<ActionResult> => {
    if (!actionsEngine) throw new Error('ActionsEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = (actionsEngine as any).batch_actions?.(actions) ?? { success: false, message: 'batch_actions not supported' } as ActionResult;
      const actionResult = result as ActionResult;

      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        canUndo: (actionsEngine as any).can_undo?.() ?? false,
        canRedo: (actionsEngine as any).can_redo?.() ?? false,
      }));
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
      throw error;
    }
  }, [actionsEngine]);

  // Undo/Redo
  const undo = useCallback(async (): Promise<ActionResult> => {
    if (!actionsEngine) throw new Error('ActionsEngine not initialized');
    
    try {
      const result = (actionsEngine as any).undo?.() ?? { success: false, message: 'undo_action not supported' } as ActionResult;
      const actionResult = result as ActionResult;

      setState(prev => ({
        ...prev,
        canUndo: (actionsEngine as any).can_undo?.() ?? false,
        canRedo: (actionsEngine as any).can_redo?.() ?? false,
      }));
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw error;
    }
  }, [actionsEngine]);

  const redo = useCallback(async (): Promise<ActionResult> => {
    if (!actionsEngine) throw new Error('ActionsEngine not initialized');
    
    try {
      const result = (actionsEngine as any).redo?.() ?? { success: false, message: 'redo_action not supported' } as ActionResult;
      const actionResult = result as ActionResult;

      setState(prev => ({
        ...prev,
        canUndo: (actionsEngine as any).can_undo?.() ?? false,
        canRedo: (actionsEngine as any).can_redo?.() ?? false,
      }));
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw error;
    }
  }, [actionsEngine]);

  // Query operations
  const refreshState = useCallback(() => {
    if (!actionsEngine) return;
    
    try {
      // Get tables data for future use
      (actionsEngine as any).get_all_tables?.();
      const history = (actionsEngine as any).get_action_history?.() ?? [];

      setState(prev => ({
        ...prev,
        actionHistory: history as ActionHistoryEntry[],
        canUndo: (actionsEngine as any).can_undo?.() ?? false,
        canRedo: (actionsEngine as any).can_redo?.() ?? false,
      }));
    } catch (error) {
      console.error('Error refreshing actions state:', error);
    }
  }, [actionsEngine]);

  // Auto-refresh state when actionsEngine changes
  useEffect(() => {
    refreshState();
  }, [refreshState]);

  return {
    // State
    ...state,
    
    // Table operations
    createTable,
    deleteTable,
    updateTable,
    
    // Sprite operations
    createSprite,
    deleteSprite,
    updateSprite,
    
    // Layer operations
    setLayerVisibility,
    moveSpriteToLayer,
    
    // Batch operations
    batchActions,
    
    // Undo/Redo
    undo,
    redo,
    
    // Utilities
    refreshState,
    clearError: () => setState(prev => ({ ...prev, error: null })),
  };
}
