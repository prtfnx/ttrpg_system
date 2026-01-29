/**
 * Test Data Factories
 * 
 * Provides consistent, type-safe test data creation.
 * Use these factories instead of inline object literals in tests.
 */
import type { Character } from '../../types';

// Import types from features
export interface TableInfo {
  table_id: string;
  table_name: string;
  width: number;
  height: number;
  table_scale: number;
  viewport_x: number;
  viewport_y: number;
  show_grid: boolean;
  cell_side: number;
}

export interface SessionInfo {
  session_code: string;
  session_name: string;
  role: 'dm' | 'player';
  created_at: string;
}

export interface Sprite {
  id: string;
  tableId: string;
  characterId?: string;
  x: number;
  y: number;
  layer: 'background' | 'tokens' | 'effects' | 'fog';
  texture: string;
  scale: { x: number; y: number };
  rotation: number;
  syncStatus: 'local' | 'syncing' | 'synced' | 'error';
  controlledBy?: string[];
}

/**
 * Creates a test table with sensible defaults
 */
export function createTestTable(overrides: Partial<TableInfo> = {}): TableInfo {
  const id = `table_${Math.random().toString(36).slice(2, 9)}`;
  return {
    table_id: id,
    table_name: 'Test Table',
    width: 2000,
    height: 2000,
    table_scale: 1.0,
    viewport_x: 0,
    viewport_y: 0,
    show_grid: true,
    cell_side: 50,
    ...overrides,
  };
}

/**
 * Creates a test character with sensible defaults
 */
export function createTestCharacter(overrides: Partial<Character> = {}): Character {
  const id = `char_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    sessionId: 'test-session',
    name: 'Test Character',
    ownerId: 1,
    controlledBy: [1],
    data: {},
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'synced',
    ...overrides,
  } as Character;
}

/**
 * Creates a test sprite (token) with sensible defaults
 */
export function createTestSprite(overrides: Partial<Sprite> = {}): Sprite {
  const id = `sprite_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    tableId: 'test-table',
    x: 100,
    y: 100,
    layer: 'tokens',
    texture: 'default.png',
    scale: { x: 1, y: 1 },
    rotation: 0,
    syncStatus: 'synced',
    ...overrides,
  };
}

/**
 * Creates a test session with sensible defaults
 */
export function createTestSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  const code = `TEST${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  return {
    session_code: code,
    session_name: 'Test Campaign',
    role: 'dm',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Creates multiple test tables
 */
export function createTestTables(count: number, overrides: Partial<TableInfo>[] = []): TableInfo[] {
  return Array.from({ length: count }, (_, i) => 
    createTestTable({ 
      table_name: `Table ${i + 1}`,
      ...overrides[i] 
    })
  );
}

/**
 * Creates multiple test characters
 */
export function createTestCharacters(count: number, overrides: Partial<Character>[] = []): Character[] {
  return Array.from({ length: count }, (_, i) => 
    createTestCharacter({ 
      name: `Character ${i + 1}`,
      ...overrides[i] 
    })
  );
}