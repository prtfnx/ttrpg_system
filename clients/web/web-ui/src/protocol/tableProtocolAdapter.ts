import type { TableInfo } from '../store';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function validateTableId(tableId: string): void {
  if (!isValidUUID(tableId)) {
    throw new Error(`Invalid table UUID: ${tableId}`);
  }
}

export function transformServerTableToClient(serverTable: any): TableInfo {
  const uuid = serverTable.table_id || serverTable.id;
  if (!uuid || !isValidUUID(uuid)) {
    throw new Error(`Server table missing valid UUID: ${JSON.stringify(serverTable)}`);
  }
  
  const displayName = serverTable.table_name || serverTable.display_name || serverTable.name || 'Unknown Table';
  
  return {
    table_id: uuid,
    table_name: displayName,
    width: serverTable.width || 100,
    height: serverTable.height || 100
  };
}

export function transformServerTablesToClient(serverTables: any[]): TableInfo[] {
  return serverTables.map(transformServerTableToClient);
}
