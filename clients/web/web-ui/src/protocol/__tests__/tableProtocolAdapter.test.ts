/**
 * Table Protocol Adapter Tests
 * Production-ready tests for UUID validation and table transformation
 */

import { describe, expect, it } from 'vitest';
import { isValidUUID, transformServerTableToClient, validateTableId } from '@lib/websocket/tableProtocolAdapter';

describe('isValidUUID', () => {
  it('validates correct UUID v4 format', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUUID('0a577ca2-7f6a-400d-9758-26f232003cc5')).toBe(true);
    expect(isValidUUID('9a7a3180-0c2a-4e91-9158-58071a1241cb')).toBe(true);
  });

  it('validates correct UUID v4 with uppercase letters', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    expect(isValidUUID('0A577CA2-7F6A-400D-9758-26F232003CC5')).toBe(true);
  });

  it('rejects UUIDs with wrong version number', () => {
    expect(isValidUUID('550e8400-e29b-31d4-a716-446655440000')).toBe(false);
    expect(isValidUUID('550e8400-e29b-51d4-a716-446655440000')).toBe(false);
  });

  it('rejects UUIDs with wrong variant', () => {
    expect(isValidUUID('550e8400-e29b-41d4-0716-446655440000')).toBe(false);
    expect(isValidUUID('550e8400-e29b-41d4-c716-446655440000')).toBe(false);
  });

  it('rejects malformed strings', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('123')).toBe(false);
    expect(isValidUUID('')).toBe(false);
    expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
    expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
  });

  it('rejects UUIDs with invalid characters', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
    expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000z')).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(isValidUUID(null as any)).toBe(false);
    expect(isValidUUID(undefined as any)).toBe(false);
  });
});

describe('validateTableId', () => {
  it('does not throw for valid UUIDs', () => {
    expect(() => validateTableId('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
    expect(() => validateTableId('0a577ca2-7f6a-400d-9758-26f232003cc5')).not.toThrow();
  });

  it('throws for invalid UUIDs with descriptive message', () => {
    expect(() => validateTableId('invalid-uuid')).toThrow('Invalid table UUID: invalid-uuid');
    expect(() => validateTableId('123')).toThrow('Invalid table UUID: 123');
    expect(() => validateTableId('')).toThrow('Invalid table UUID: ');
  });
});

describe('transformServerTableToClient', () => {
  it('transforms server table with table_id and table_name', () => {
    const serverTable = {
      table_id: '550e8400-e29b-41d4-a716-446655440000',
      table_name: 'Dragon Lair',
      width: 2000,
      height: 1500
    };

    const result = transformServerTableToClient(serverTable);

    expect(result).toEqual({
      table_id: '550e8400-e29b-41d4-a716-446655440000',
      table_name: 'Dragon Lair',
      width: 2000,
      height: 1500
    });
  });

  it('transforms server table with id and display_name', () => {
    const serverTable = {
      id: '0a577ca2-7f6a-400d-9758-26f232003cc5',
      display_name: 'Dungeon Level 1',
      width: 3000,
      height: 2500
    };

    const result = transformServerTableToClient(serverTable);

    expect(result).toEqual({
      table_id: '0a577ca2-7f6a-400d-9758-26f232003cc5',
      table_name: 'Dungeon Level 1',
      width: 3000,
      height: 2500
    });
  });

  it('transforms server table with name field as fallback', () => {
    const serverTable = {
      id: '9a7a3180-0c2a-4e91-9158-58071a1241cb',
      name: 'Castle Map',
      width: 1500,
      height: 1200
    };

    const result = transformServerTableToClient(serverTable);

    expect(result).toEqual({
      table_id: '9a7a3180-0c2a-4e91-9158-58071a1241cb',
      table_name: 'Castle Map',
      width: 1500,
      height: 1200
    });
  });

  it('uses default name when no name field present', () => {
    const serverTable = {
      table_id: '550e8400-e29b-41d4-a716-446655440000',
      width: 1000,
      height: 800
    };

    const result = transformServerTableToClient(serverTable);

    expect(result.table_name).toBe('Unknown Table');
  });

  it('uses default dimensions when not provided', () => {
    const serverTable = {
      table_id: '550e8400-e29b-41d4-a716-446655440000',
      table_name: 'Test Table'
    };

    const result = transformServerTableToClient(serverTable);

    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('throws when UUID is missing', () => {
    const serverTable = {
      table_name: 'No UUID Table',
      width: 1000,
      height: 800
    };

    expect(() => transformServerTableToClient(serverTable)).toThrow(
      /Server table missing valid UUID/
    );
  });

  it('throws when UUID is invalid', () => {
    const serverTable = {
      table_id: 'not-a-uuid',
      table_name: 'Invalid UUID Table',
      width: 1000,
      height: 800
    };

    expect(() => transformServerTableToClient(serverTable)).toThrow(
      /Server table missing valid UUID/
    );
  });

  it('handles mixed case UUIDs', () => {
    const serverTable = {
      table_id: '550E8400-E29B-41D4-A716-446655440000',
      table_name: 'Mixed Case',
      width: 1000,
      height: 800
    };

    const result = transformServerTableToClient(serverTable);

    expect(result.table_id).toBe('550E8400-E29B-41D4-A716-446655440000');
  });

  it('prioritizes table_id over id field', () => {
    const serverTable = {
      table_id: '550e8400-e29b-41d4-a716-446655440000',
      id: '0a577ca2-7f6a-400d-9758-26f232003cc5',
      table_name: 'Priority Test'
    };

    const result = transformServerTableToClient(serverTable);

    expect(result.table_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('preserves all expected fields', () => {
    const serverTable = {
      table_id: '550e8400-e29b-41d4-a716-446655440000',
      table_name: 'Complete Table',
      width: 2000,
      height: 1500
    };

    const result = transformServerTableToClient(serverTable);

    expect(Object.keys(result).sort()).toEqual(['height', 'table_id', 'table_name', 'width'].sort());
  });
});
