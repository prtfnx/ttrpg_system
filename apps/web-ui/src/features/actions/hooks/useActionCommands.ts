import { logger } from '@shared/utils/logger';
import {
  useActions,
  type ActionResult,
  type ActionsCallbacks,
  type ActionsEngine,
  type BatchAction,
  type TableInfo,
} from '@shared/hooks';
import { useCallback, useState } from 'react';

export interface ActionCommandStatus {
  type: 'success' | 'error';
  message: string;
}

interface ActionCommandOptions extends ActionsCallbacks {
  onResult?: (operation: string, result: ActionResult) => void;
}

const errorResult = (message: string): ActionResult => ({
  success: false,
  message,
});

export function useActionCommands(actionsEngine: ActionsEngine | null, options: ActionCommandOptions = {}) {
  const [status, setStatus] = useState<ActionCommandStatus | null>(null);
  const actions = useActions(actionsEngine, options);

  const recordResult = useCallback((operation: string, result: ActionResult): ActionResult => {
    setStatus({
      type: result.success ? 'success' : 'error',
      message: `${operation}: ${result.message || (result.success ? 'Done' : 'Failed')}`,
    });
    options.onResult?.(operation, result);
    return result;
  }, [options]);

  const recordError = useCallback((operation: string, error: unknown): ActionResult => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`${operation} failed`, error);
    const result = errorResult(message);
    return recordResult(operation, result);
  }, [recordResult]);

  const createTable = useCallback(async (name: string, width: number, height: number) => {
    try {
      return recordResult('Create Table', await actions.createTable(name, width, height));
    } catch (error) {
      return recordError('Create Table', error);
    }
  }, [actions, recordError, recordResult]);

  const deleteTable = useCallback(async (tableId: string) => {
    try {
      return recordResult('Delete Table', await actions.deleteTable(tableId));
    } catch (error) {
      return recordError('Delete Table', error);
    }
  }, [actions, recordError, recordResult]);

  const updateTable = useCallback(async (tableId: string, updates: Partial<TableInfo>) => {
    try {
      return recordResult('Update Table', await actions.updateTable(tableId, updates));
    } catch (error) {
      return recordError('Update Table', error);
    }
  }, [actions, recordError, recordResult]);

  const setLayerVisibility = useCallback(async (layer: string, visible: boolean) => {
    try {
      return recordResult(`Toggle Layer ${layer}`, await actions.setLayerVisibility(layer, visible));
    } catch (error) {
      return recordError(`Toggle Layer ${layer}`, error);
    }
  }, [actions, recordError, recordResult]);

  const batchActions = useCallback(async (batch: BatchAction[]) => {
    try {
      return recordResult('Batch Actions', await actions.batchActions(batch));
    } catch (error) {
      return recordError('Batch Actions', error);
    }
  }, [actions, recordError, recordResult]);

  const undo = useCallback(async () => {
    try {
      return recordResult('Undo', await actions.undo());
    } catch (error) {
      return recordError('Undo', error);
    }
  }, [actions, recordError, recordResult]);

  const redo = useCallback(async () => {
    try {
      return recordResult('Redo', await actions.redo());
    } catch (error) {
      return recordError('Redo', error);
    }
  }, [actions, recordError, recordResult]);

  const refreshState = useCallback(() => {
    actions.refreshState();
    setStatus({ type: 'success', message: 'Refresh: Done' });
  }, [actions]);

  return {
    actions,
    status,
    clearStatus: () => setStatus(null),
    createTable,
    deleteTable,
    updateTable,
    setLayerVisibility,
    batchActions,
    undo,
    redo,
    refreshState,
  };
}
