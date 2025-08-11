import { useCallback, useEffect, useRef, useState } from 'react';
import type { RenderEngine } from '../types/wasm';

export interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
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
  params: Record<string, any>;
}

export interface ActionHistoryEntry {
  action_type: string;
  timestamp: number;
  data: any;
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
  onAction?: (actionType: string, data: any) => void;
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

export function useActions(renderEngine: RenderEngine | null, callbacks?: ActionsCallbacks) {
  const [state, setState] = useState<ActionsState>(initialState);
  const callbacksRef = useRef(callbacks);
  
  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Setup event handlers
  useEffect(() => {
    if (!renderEngine) return;

    const handleAction = (actionType: string, data: any) => {
      callbacksRef.current?.onAction?.(actionType, data);
    };

    const handleStateChange = (eventType: string, targetId: string) => {
      // Update local state based on event type
      setState(prev => ({
        ...prev,
        canUndo: renderEngine.can_undo(),
        canRedo: renderEngine.can_redo(),
      }));
      
      callbacksRef.current?.onStateChange?.(eventType, targetId);
    };

    const handleError = (error: string) => {
      setState(prev => ({ ...prev, error, isLoading: false }));
      callbacksRef.current?.onError?.(error);
    };

    try {
      renderEngine.set_action_handler(handleAction);
      renderEngine.set_state_change_handler(handleStateChange);
      renderEngine.set_actions_error_handler(handleError);
    } catch (error) {
      console.error('Error setting up actions handlers:', error);
    }

    return () => {
      // Cleanup handlers if needed
    };
  }, [renderEngine]);

  // Table Management
  const createTable = useCallback(async (name: string, width: number, height: number): Promise<ActionResult> => {
    if (!renderEngine) throw new Error('RenderEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = renderEngine.create_table_action(name, width, height);
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
  }, [renderEngine]);

  const deleteTable = useCallback(async (tableId: string): Promise<ActionResult> => {
    if (!renderEngine) throw new Error('RenderEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = renderEngine.delete_table_action(tableId);
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
  }, [renderEngine]);

  const updateTable = useCallback(async (tableId: string, updates: Partial<TableInfo>): Promise<ActionResult> => {
    if (!renderEngine) throw new Error('RenderEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = renderEngine.update_table_action(tableId, updates);
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
  }, [renderEngine]);

  // Sprite Management
  const createSprite = useCallback(async (
    tableId: string, 
    layer: string, 
    position: { x: number; y: number }, 
    textureName: string
  ): Promise<ActionResult> => {
    if (!renderEngine) throw new Error('RenderEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = renderEngine.create_sprite_action(tableId, layer, position, textureName);
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
  }, [renderEngine]);

  const deleteSprite = useCallback(async (spriteId: string): Promise<ActionResult> => {
    if (!renderEngine) throw new Error('RenderEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = renderEngine.delete_sprite_action(spriteId);
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
  }, [renderEngine]);

  const updateSprite = useCallback(async (spriteId: string, updates: Partial<SpriteInfo>): Promise<ActionResult> => {
    if (!renderEngine) throw new Error('RenderEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = renderEngine.update_sprite_action(spriteId, updates);
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
  }, [renderEngine]);

  // Layer Management
  const setLayerVisibility = useCallback(async (layer: string, visible: boolean): Promise<ActionResult> => {
    if (!renderEngine) throw new Error('RenderEngine not initialized');
    
    try {
      const result = renderEngine.set_layer_visibility_action(layer, visible);
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
  }, [renderEngine]);

  const moveSpriteToLayer = useCallback(async (spriteId: string, newLayer: string): Promise<ActionResult> => {
    if (!renderEngine) throw new Error('RenderEngine not initialized');
    
    try {
      const result = renderEngine.move_sprite_to_layer_action(spriteId, newLayer);
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
  }, [renderEngine]);

  // Batch Operations
  const batchActions = useCallback(async (actions: BatchAction[]): Promise<ActionResult> => {
    if (!renderEngine) throw new Error('RenderEngine not initialized');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = renderEngine.batch_actions(actions);
      const actionResult = result as ActionResult;
      
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        canUndo: renderEngine.can_undo(),
        canRedo: renderEngine.can_redo(),
      }));
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
      throw error;
    }
  }, [renderEngine]);

  // Undo/Redo
  const undo = useCallback(async (): Promise<ActionResult> => {
    if (!renderEngine) throw new Error('RenderEngine not initialized');
    
    try {
      const result = renderEngine.undo_action();
      const actionResult = result as ActionResult;
      
      setState(prev => ({
        ...prev,
        canUndo: renderEngine.can_undo(),
        canRedo: renderEngine.can_redo(),
      }));
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw error;
    }
  }, [renderEngine]);

  const redo = useCallback(async (): Promise<ActionResult> => {
    if (!renderEngine) throw new Error('RenderEngine not initialized');
    
    try {
      const result = renderEngine.redo_action();
      const actionResult = result as ActionResult;
      
      setState(prev => ({
        ...prev,
        canUndo: renderEngine.can_undo(),
        canRedo: renderEngine.can_redo(),
      }));
      
      return actionResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw error;
    }
  }, [renderEngine]);

  // Query operations
  const refreshState = useCallback(() => {
    if (!renderEngine) return;
    
    try {
      // Get tables data for future use
      renderEngine.get_all_tables();
      const history = renderEngine.get_action_history();
      
      setState(prev => ({
        ...prev,
        actionHistory: history as ActionHistoryEntry[],
        canUndo: renderEngine.can_undo(),
        canRedo: renderEngine.can_redo(),
      }));
    } catch (error) {
      console.error('Error refreshing actions state:', error);
    }
  }, [renderEngine]);

  // Auto-refresh state when renderEngine changes
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
