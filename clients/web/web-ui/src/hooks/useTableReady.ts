/**
 * useTableReady Hook
 * SSoT Pattern: Ensures table is ready before allowing operations
 * Components should use this hook to validate table state
 */

import { useEffect } from 'react';
import { useGameStore } from '../store';

interface UseTableReadyOptions {
  required?: boolean; // If true, throws error when table not ready
  onNotReady?: () => void; // Callback when table is not ready
}

/**
 * Hook to ensure active table is ready for operations
 * @param options Configuration options
 * @returns Object with activeTableId, tableReady, and validation function
 */
export function useTableReady(options: UseTableReadyOptions = {}) {
  const { required = false, onNotReady } = options;
  const { activeTableId, tableReady } = useGameStore();

  useEffect(() => {
    if (required && !tableReady) {
      const errorMsg = 'Table not ready. Please select a table before performing this operation.';
      console.error('❌', errorMsg);
      
      if (onNotReady) {
        onNotReady();
      } else {
        throw new Error(errorMsg);
      }
    }
  }, [required, tableReady, onNotReady]);

  /**
   * Validate table is ready, throw error if not
   * Use in event handlers or async operations
   */
  const validateTableReady = (): string => {
    if (!activeTableId) {
      throw new Error('No active table selected. Please select a table first.');
    }

    if (!tableReady) {
      throw new Error('Table is not ready. Please wait for table to load.');
    }

    return activeTableId;
  };

  return {
    activeTableId,
    tableReady,
    isReady: tableReady && activeTableId !== null,
    validateTableReady
  };
}

/**
 * Synchronous function to validate table readiness
 * Use in services or non-React code
 * For async operations with auto-recovery, use ensureTableLoaded from store
 */
export function validateTableReady(): string {
  const store = useGameStore.getState();
  
  if (!store.activeTableId) {
    throw new Error('No active table selected. Please select a table first.');
  }

  if (!store.tableReady) {
    throw new Error('Table is not ready. Please wait for table to load.');
  }

  return store.activeTableId;
}

/**
 * Async function with auto-recovery
 * Automatically requests table from server if needed
 * Use this in async operations like drag-drop handlers
 */
export async function ensureTableLoaded(): Promise<string> {
  return useGameStore.getState().ensureTableLoaded();
}
