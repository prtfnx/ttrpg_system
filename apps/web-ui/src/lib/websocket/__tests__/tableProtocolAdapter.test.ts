import { describe, it, expect } from 'vitest';
import {
  isValidUUID,
  validateTableId,
  transformServerTableToClient,
  transformServerTablesToClient,
} from '../tableProtocolAdapter';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('isValidUUID', () => {
  it('accepts a valid v4 UUID', () => {
    expect(isValidUUID(VALID_UUID)).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidUUID('')).toBe(false);
  });

  it('rejects a plain string', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
  });

  it('rejects a UUID with wrong version digit', () => {
    expect(isValidUUID('550e8400-e29b-31d4-a716-446655440000')).toBe(false);
  });
});

describe('validateTableId', () => {
  it('does not throw for a valid UUID', () => {
    expect(() => validateTableId(VALID_UUID)).not.toThrow();
  });

  it('throws for an invalid id', () => {
    expect(() => validateTableId('bad-id')).toThrow('Invalid table UUID');
  });
});

describe('transformServerTableToClient', () => {
  it('maps table_id and table_name correctly', () => {
    const result = transformServerTableToClient({
      table_id: VALID_UUID,
      table_name: 'Dungeon',
      width: 30,
      height: 20,
    });
    expect(result.table_id).toBe(VALID_UUID);
    expect(result.table_name).toBe('Dungeon');
    expect(result.width).toBe(30);
    expect(result.height).toBe(20);
  });

  it('falls back to "id" field if table_id is missing', () => {
    const result = transformServerTableToClient({
      id: VALID_UUID,
      display_name: 'Forest',
    });
    expect(result.table_id).toBe(VALID_UUID);
    expect(result.table_name).toBe('Forest');
  });

  it('defaults width/height to 100 when missing', () => {
    const result = transformServerTableToClient({ table_id: VALID_UUID });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('falls back to "Unknown Table" when no name field present', () => {
    const result = transformServerTableToClient({ table_id: VALID_UUID });
    expect(result.table_name).toBe('Unknown Table');
  });

  it('throws when UUID is missing entirely', () => {
    expect(() => transformServerTableToClient({ table_name: 'No ID' })).toThrow(
      'Server table missing valid UUID'
    );
  });

  it('throws when UUID value is invalid', () => {
    expect(() => transformServerTableToClient({ table_id: 'bad-id' })).toThrow(
      'Server table missing valid UUID'
    );
  });
});

describe('transformServerTablesToClient', () => {
  it('maps an array of server tables', () => {
    const tables = [
      { table_id: VALID_UUID, table_name: 'A' },
      { table_id: '550e8400-e29b-41d4-a716-446655440001', table_name: 'B' },
    ];
    const result = transformServerTablesToClient(tables);
    expect(result).toHaveLength(2);
    expect(result[0].table_name).toBe('A');
    expect(result[1].table_name).toBe('B');
  });

  it('returns empty array for empty input', () => {
    expect(transformServerTablesToClient([])).toEqual([]);
  });
});
