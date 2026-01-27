import { wasmManager } from '@lib/wasm/wasmManager';
import { useNetworkClient } from '@shared/hooks/useNetworkClient';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface TableData {
  table_id: string;
  table_name: string;
  width: number;
  height: number;
  scale_x: number;
  scale_y: number;
  offset_x: number;
  offset_y: number;
  sprites: SpriteData[];
  fog_rectangles: FogRectangle[];
}

export interface SpriteData {
  sprite_id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  layer: string;
  texture_path: string;
  color: string;
  visible: boolean;
}

export interface FogRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  hidden: boolean;
}

export interface SpriteUpdateData {
  sprite_id: string;
  table_id: string;
  update_type: string;
  data: any;
}

interface TableSyncState {
  tableData: TableData | null;
  tableId: string | null;
  sprites: SpriteData[];
  isLoading: boolean;
  error: string | null;
}

interface TableSyncHookOptions {
  autoRequestTable?: boolean;
  defaultTableName?: string;
  onTableReceived?: (tableData: TableData) => void;
  onSpriteUpdate?: (updateData: SpriteUpdateData) => void;
  onError?: (error: string) => void;
}

export const useTableSync = (options: TableSyncHookOptions = {}) => {
  const tableSyncRef = useRef<any>(null);
  const { client: networkClient, networkState } = useNetworkClient();
  const isConnected = networkState.isConnected;
  
  const [state, setState] = useState<TableSyncState>({
    tableData: null,
    tableId: null,
    sprites: [],
    isLoading: false,
    error: null,
  });

  // Initialize table sync client
  useEffect(() => {
    if (!tableSyncRef.current) {
      // Use global WASM manager for consistent instance
      wasmManager.getTableSync().then(async (TableSyncClass) => {
        const tableSync = new TableSyncClass();
        
        // Set up event handlers
        tableSync.set_table_received_handler((tableDataJs: any) => {
          try {
            const tableData = JSON.parse(JSON.stringify(tableDataJs)) as TableData;
            setState(prev => ({
              ...prev,
              tableData,
              tableId: tableData.table_id,
              sprites: tableData.sprites,
              isLoading: false,
              error: null,
            }));
            
            if (options.onTableReceived) {
              options.onTableReceived(tableData);
            }
          } catch (error) {
            const errorMsg = `Failed to process table data: ${error}`;
            setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
            if (options.onError) {
              options.onError(errorMsg);
            }
          }
        });

        tableSync.set_sprite_update_handler((updateDataJs: any) => {
          try {
            const updateData = JSON.parse(JSON.stringify(updateDataJs)) as SpriteUpdateData;
            
            // Update local sprites state
            setState(prev => {
              const updatedSprites = prev.sprites.map(sprite => {
                if (sprite.sprite_id === updateData.sprite_id) {
                  const updated = { ...sprite };
                  
                  switch (updateData.update_type) {
                    case 'sprite_move':
                      if (updateData.data.to) {
                        updated.x = updateData.data.to.x ?? updated.x;
                        updated.y = updateData.data.to.y ?? updated.y;
                      }
                      break;
                    case 'sprite_scale':
                      updated.scale_x = updateData.data.scale_x ?? updated.scale_x;
                      updated.scale_y = updateData.data.scale_y ?? updated.scale_y;
                      break;
                    case 'sprite_rotate':
                      updated.rotation = updateData.data.rotation ?? updated.rotation;
                      break;
                  }
                  
                  return updated;
                }
                return sprite;
              });
              
              return {
                ...prev,
                sprites: updatedSprites,
              };
            });
            
            if (options.onSpriteUpdate) {
              options.onSpriteUpdate(updateData);
            }
          } catch (error) {
            const errorMsg = `Failed to process sprite update: ${error}`;
            setState(prev => ({ ...prev, error: errorMsg }));
            if (options.onError) {
              options.onError(errorMsg);
            }
          }
        });

        tableSync.set_error_handler((error: string) => {
          setState(prev => ({ ...prev, error, isLoading: false }));
          if (options.onError) {
            options.onError(error);
          }
        });

        tableSyncRef.current = tableSync;
        console.log('Table sync client initialized');
      }).catch((error) => {
        const errorMsg = `Failed to initialize table sync: ${error}`;
        setState(prev => ({ ...prev, error: errorMsg }));
        if (options.onError) {
          options.onError(errorMsg);
        }
      });
    }
  }, [options.onTableReceived, options.onSpriteUpdate, options.onError]);

  // Listen for protocol events and forward to WASM
  useEffect(() => {
    const handleTableDataReceived = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (tableSyncRef.current && customEvent.detail.table_data) {
        console.log('Forwarding table data to WASM:', customEvent.detail.table_data);
        try {
          tableSyncRef.current.handle_table_data(customEvent.detail.table_data);
        } catch (error) {
          console.error('Failed to handle table data in WASM:', error);
        }
      }
    };

    const handleTableResponse = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (tableSyncRef.current && customEvent.detail.table_data) {
        console.log('Forwarding table response to WASM:', customEvent.detail.table_data);
        try {
          tableSyncRef.current.handle_table_data(customEvent.detail.table_data);
        } catch (error) {
          console.error('Failed to handle table response in WASM:', error);
        }
      }
    };

    const handleNewTableResponse = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (tableSyncRef.current && customEvent.detail.table_data) {
        console.log('Forwarding new table response to WASM:', customEvent.detail.table_data);
        try {
          tableSyncRef.current.handle_table_data(customEvent.detail.table_data);
        } catch (error) {
          console.error('Failed to handle new table response in WASM:', error);
        }
      }
    };

    const handleSpriteUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (tableSyncRef.current) {
        console.log('Forwarding sprite update to WASM:', customEvent.detail);
        try {
          tableSyncRef.current.handle_sprite_update(customEvent.detail);
        } catch (error) {
          console.error('Failed to handle sprite update in WASM:', error);
        }
      }
    };

    // Add event listeners
    window.addEventListener('table-data-received', handleTableDataReceived);
    window.addEventListener('table-response', handleTableResponse);
    window.addEventListener('new-table-response', handleNewTableResponse);
    window.addEventListener('sprite-updated', handleSpriteUpdate);

    return () => {
      // Cleanup event listeners
      window.removeEventListener('table-data-received', handleTableDataReceived);
      window.removeEventListener('table-response', handleTableResponse);
      window.removeEventListener('new-table-response', handleNewTableResponse);
      window.removeEventListener('sprite-updated', handleSpriteUpdate);
    };
  }, []);

  // Set network client when available
  useEffect(() => {
    if (tableSyncRef.current && networkClient) {
      try {
        tableSyncRef.current.set_network_client(networkClient);
        console.log('Network client set for table sync');
      } catch (error) {
        console.error('Failed to set network client:', error);
      }
    }
  }, [networkClient]);

  // Auto-request table when connected
  useEffect(() => {
    if (
      options.autoRequestTable &&
      options.defaultTableName &&
      isConnected &&
      tableSyncRef.current &&
      !state.tableData
    ) {
      requestTable(options.defaultTableName);
    }
  }, [isConnected, options.autoRequestTable, options.defaultTableName, state.tableData]);

  // Request table data from server
  const requestTable = useCallback((tableName: string) => {
    if (!tableSyncRef.current) {
      setState(prev => ({ ...prev, error: 'Table sync not initialized' }));
      return;
    }

    if (!isConnected) {
      setState(prev => ({ ...prev, error: 'Not connected to server' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      tableSyncRef.current.request_table(tableName);
      console.log(`Requested table: ${tableName}`);
    } catch (error) {
      const errorMsg = `Failed to request table: ${error}`;
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      if (options.onError) {
        options.onError(errorMsg);
      }
    }
  }, [isConnected, options.onError]);

  // Send sprite move update
  const moveSprite = useCallback((spriteId: string, x: number, y: number) => {
    if (!tableSyncRef.current) {
      throw new Error('Table sync not initialized');
    }

    try {
      tableSyncRef.current.send_sprite_move(spriteId, x, y);
      console.log(`Sent sprite move: ${spriteId} to (${x}, ${y})`);
    } catch (error) {
      console.error('Failed to send sprite move:', error);
      throw error;
    }
  }, []);

  // Send sprite scale update
  const scaleSprite = useCallback((spriteId: string, scaleX: number, scaleY: number) => {
    if (!tableSyncRef.current) {
      throw new Error('Table sync not initialized');
    }

    try {
      tableSyncRef.current.send_sprite_scale(spriteId, scaleX, scaleY);
      console.log(`Sent sprite scale: ${spriteId} to (${scaleX}, ${scaleY})`);
    } catch (error) {
      console.error('Failed to send sprite scale:', error);
      throw error;
    }
  }, []);

  // Send sprite rotation update
  const rotateSprite = useCallback((spriteId: string, rotation: number) => {
    if (!tableSyncRef.current) {
      throw new Error('Table sync not initialized');
    }

    try {
      tableSyncRef.current.send_sprite_rotate(spriteId, rotation);
      console.log(`Sent sprite rotation: ${spriteId} to ${rotation}`);
    } catch (error) {
      console.error('Failed to send sprite rotation:', error);
      throw error;
    }
  }, []);

  // Send sprite creation
  const createSprite = useCallback((spriteData: Omit<SpriteData, 'sprite_id'>) => {
    if (!tableSyncRef.current) {
      throw new Error('Table sync not initialized');
    }

    const fullSpriteData: SpriteData = {
      ...spriteData,
      sprite_id: `sprite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    try {
      tableSyncRef.current.send_sprite_create(fullSpriteData);
      console.log(`Sent sprite create: ${fullSpriteData.sprite_id}`);
      return fullSpriteData.sprite_id;
    } catch (error) {
      console.error('Failed to send sprite create:', error);
      throw error;
    }
  }, []);

  // Send sprite deletion
  const deleteSprite = useCallback((spriteId: string) => {
    if (!tableSyncRef.current) {
      throw new Error('Table sync not initialized');
    }

    try {
      tableSyncRef.current.send_sprite_delete(spriteId);
      console.log(`Sent sprite delete: ${spriteId}`);
    } catch (error) {
      console.error('Failed to send sprite delete:', error);
      throw error;
    }
  }, []);

  // Handle message from network client
  const handleNetworkMessage = useCallback((messageType: string, data: any) => {
    if (!tableSyncRef.current) return;

    try {
      switch (messageType) {
        case 'table_data':
        case 'table_response':
          if (data && (data.data || data.table_data)) {
            const tableData = data.data || data.table_data;
            tableSyncRef.current.handle_table_data(tableData);
          }
          break;
        case 'table_update':
          if (data && data.category === 'sprite') {
            const updateData = {
              sprite_id: data.data?.sprite_id || '',
              table_id: data.data?.table_id || state.tableId || '',
              update_type: data.type || '',
              data: data.data || {},
            };
            tableSyncRef.current.handle_sprite_update(updateData);
          }
          break;
        case 'sprite_update':
          if (data) {
            tableSyncRef.current.handle_sprite_update(data);
          }
          break;
      }
    } catch (error) {
      console.error('Error handling network message:', error);
    }
  }, [state.tableId]);

  // Register message handler with network client
  useEffect(() => {
    if (networkClient) {
      // TODO: Register handleNetworkMessage with the network client
      // This depends on the exact API of the network client
    }
  }, [networkClient, handleNetworkMessage]);

  return {
    // State
    tableData: state.tableData,
    tableId: state.tableId,
    sprites: state.sprites,
    isLoading: state.isLoading,
    error: state.error,
    
    // Actions
    requestTable,
    moveSprite,
    scaleSprite,
    rotateSprite,
    createSprite,
    deleteSprite,
    
    // Network message handler
    handleNetworkMessage,
    
    // Raw table sync client
    tableSync: tableSyncRef.current,
  };
};
