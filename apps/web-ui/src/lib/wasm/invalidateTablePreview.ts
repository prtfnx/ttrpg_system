import { emitWasmEvent } from './wasmEvents';

/** Notify the thumbnail coordinator after an optimistic visual mutation. */
export function invalidateTablePreview(tableId: string | null | undefined): void {
  if (tableId) emitWasmEvent('table-preview-invalidated', { table_id: tableId });
}
