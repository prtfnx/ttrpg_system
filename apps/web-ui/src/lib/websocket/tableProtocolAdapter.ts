import type { TableInfo } from '@/store';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizedDimension(value: unknown): number {
  const dimension = Number(value);
  return Number.isFinite(dimension) && dimension > 0 ? dimension : 100;
}

function normalizedTableName(serverTable: Record<string, unknown>): string {
  for (const candidate of [serverTable.table_name, serverTable.display_name, serverTable.name]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return 'Unknown Table';
}

export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function validateTableId(tableId: string): void {
  if (!isValidUUID(tableId)) {
    throw new Error(`Invalid table UUID: ${tableId}`);
  }
}

export function transformServerTableToClient(serverTable: Record<string, unknown>): TableInfo {
  const uuid = serverTable.table_id || serverTable.id;
  if (!uuid || !isValidUUID(String(uuid))) {
    throw new Error(`Server table missing valid UUID: ${JSON.stringify(serverTable)}`);
  }
  
  return {
    table_id: String(uuid),
    table_name: normalizedTableName(serverTable),
    width: normalizedDimension(serverTable.width),
    height: normalizedDimension(serverTable.height),
  };
}

export function transformServerTablesToClient(serverTables: Record<string, unknown>[]): TableInfo[] {
  return serverTables.map(transformServerTableToClient);
}
