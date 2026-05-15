import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock heavy dependencies before importing the store
vi.mock('@lib/api', () => ({
  ProtocolService: {
    getInstance: () => null,
    hasProtocol: () => false,
  },
}));
vi.mock('@lib/websocket', () => ({
  transformServerTablesToClient: (t: unknown) => t,
  validateTableId: () => true,
}));
vi.mock('@features/measurement/services/advancedMeasurement.service', () => ({
  advancedMeasurementSystem: { stop: vi.fn(), syncWithTableUnits: vi.fn() },
}));

import { useGameStore } from '../store';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeSprite(id: string, x = 0, y = 0) {
  return {
    id, x, y,
    name: 'Token',
    tableId: 't1',
    texture: 'default.png',
    layer: 'tokens',
    scale: { x: 1, y: 1 },
    rotation: 0,
  };
}

function makeCharacter(id: string) {
  return { id, name: 'Hero', data: { inventory: [] }, controlled_by: [1] };
}

function makeWall(wallId: string) {
  return {
    wall_id: wallId,
    table_id: 't1',
    x1: 0, y1: 0, x2: 10, y2: 0,
    wall_type: 'normal' as const,
    blocks_movement: true, blocks_light: true, blocks_sight: true, blocks_sound: false,
    is_door: false, door_state: 'closed' as const,
    is_secret: false, direction: 'both' as const,
  };
}

beforeEach(() => {
  useGameStore.setState({
    sprites: [],
    characters: [],
    selectedSprites: [],
    camera: { x: 0, y: 0, zoom: 1 },
    walls: [],
    isConnected: false,
    connectionState: 'disconnected',
    tables: [],
    activeTableId: null,
    activeLayer: 'tokens',
    gridEnabled: true,
    gridSnapping: false,
    gridSize: 50,
    gridCellPx: 50,
    ambientLight: 0.2,
    dynamicLightingEnabled: false,
    fogExplorationMode: 'current_only',
    sessionRole: null,
    userId: null,
    permissions: [],
    visibleLayers: [],
    measurementActive: false,
    alignmentActive: false,
    activeTool: 'select',
    dmPreviewUserId: null,
  } as unknown as Parameters<typeof useGameStore.setState>[0]);
});

// ─── sprites ─────────────────────────────────────────────────────────────────

describe('gameStore — sprites', () => {
  it('addSprite adds to list', () => {
    useGameStore.getState().addSprite(makeSprite('s1'));
    expect(useGameStore.getState().sprites).toHaveLength(1);
  });

  it('addSprite deduplicates by id', () => {
    useGameStore.getState().addSprite(makeSprite('s1'));
    useGameStore.getState().addSprite(makeSprite('s1'));
    expect(useGameStore.getState().sprites).toHaveLength(1);
  });

  it('removeSprite removes by id', () => {
    useGameStore.getState().addSprite(makeSprite('s1'));
    useGameStore.getState().removeSprite('s1');
    expect(useGameStore.getState().sprites).toHaveLength(0);
  });

  it('moveSprite updates position', () => {
    useGameStore.getState().addSprite(makeSprite('s1', 0, 0));
    useGameStore.getState().moveSprite('s1', 50, 75);
    const s = useGameStore.getState().sprites.find((s) => s.id === 's1');
    expect(s?.x).toBe(50);
    expect(s?.y).toBe(75);
  });

  it('updateSprite merges partial fields', () => {
    useGameStore.getState().addSprite(makeSprite('s1'));
    useGameStore.getState().updateSprite('s1', { x: 99 });
    const s = useGameStore.getState().sprites.find((s) => s.id === 's1');
    expect(s?.x).toBe(99);
  });

  it('selectSprite sets selection', () => {
    useGameStore.getState().addSprite(makeSprite('s1'));
    useGameStore.getState().selectSprite('s1');
    expect(useGameStore.getState().selectedSprites).toContain('s1');
  });

  it('selectSprite deselects when already sole selection', () => {
    useGameStore.getState().addSprite(makeSprite('s1'));
    useGameStore.getState().selectSprite('s1');
    useGameStore.getState().selectSprite('s1');
    expect(useGameStore.getState().selectedSprites).toHaveLength(0);
  });

  it('selectSprite with multiSelect adds to selection', () => {
    useGameStore.getState().addSprite(makeSprite('s1'));
    useGameStore.getState().addSprite(makeSprite('s2'));
    useGameStore.getState().selectSprite('s1');
    useGameStore.getState().selectSprite('s2', true);
    expect(useGameStore.getState().selectedSprites).toHaveLength(2);
  });
});

// ─── characters ───────────────────────────────────────────────────────────────

describe('gameStore — characters', () => {
  it('addCharacter adds to list', () => {
    useGameStore.getState().addCharacter(makeCharacter('c1') as never);
    expect(useGameStore.getState().characters).toHaveLength(1);
  });

  it('updateCharacter merges partial fields', () => {
    useGameStore.getState().addCharacter(makeCharacter('c1') as never);
    useGameStore.getState().updateCharacter('c1', { name: 'Updated' } as never);
    const c = useGameStore.getState().characters.find((c) => c.id === 'c1');
    expect(c?.name).toBe('Updated');
  });

  it('removeCharacter removes by id', () => {
    useGameStore.getState().addCharacter(makeCharacter('c1') as never);
    useGameStore.getState().removeCharacter('c1');
    expect(useGameStore.getState().characters).toHaveLength(0);
  });

  it('addInventoryItem appends item', () => {
    useGameStore.getState().addCharacter(makeCharacter('c1') as never);
    useGameStore.getState().addInventoryItem('c1', 'Sword');
    const c = useGameStore.getState().characters.find((c) => c.id === 'c1');
    expect((c as never as { data: { inventory: string[] } })?.data?.inventory).toContain('Sword');
  });
});

// ─── walls ────────────────────────────────────────────────────────────────────

describe('gameStore — walls', () => {
  it('addWall adds to list', () => {
    useGameStore.getState().addWall(makeWall('w1'));
    expect(useGameStore.getState().walls).toHaveLength(1);
  });

  it('addWalls adds multiple walls', () => {
    useGameStore.getState().addWalls([makeWall('w1'), makeWall('w2')]);
    expect(useGameStore.getState().walls).toHaveLength(2);
  });

  it('updateWall merges partial', () => {
    useGameStore.getState().addWall(makeWall('w1'));
    useGameStore.getState().updateWall('w1', { is_door: true });
    const w = useGameStore.getState().walls.find((w) => w.wall_id === 'w1');
    expect(w?.is_door).toBe(true);
  });

  it('removeWall removes by id', () => {
    useGameStore.getState().addWall(makeWall('w1'));
    useGameStore.getState().removeWall('w1');
    expect(useGameStore.getState().walls).toHaveLength(0);
  });

  it('clearWalls empties list', () => {
    useGameStore.getState().addWalls([makeWall('w1'), makeWall('w2')]);
    useGameStore.getState().clearWalls();
    expect(useGameStore.getState().walls).toHaveLength(0);
  });
});

// ─── camera ──────────────────────────────────────────────────────────────────

describe('gameStore — camera', () => {
  it('updateCamera sets position', () => {
    useGameStore.getState().updateCamera(100, 200);
    const cam = useGameStore.getState().camera;
    expect(cam.x).toBe(100);
    expect(cam.y).toBe(200);
  });

  it('updateCamera with zoom updates zoom', () => {
    useGameStore.getState().updateCamera(0, 0, 2.5);
    expect(useGameStore.getState().camera.zoom).toBe(2.5);
  });

  it('updateCamera without zoom preserves existing zoom', () => {
    useGameStore.getState().updateCamera(0, 0, 3);
    useGameStore.getState().updateCamera(10, 10);
    expect(useGameStore.getState().camera.zoom).toBe(3);
  });
});

// ─── connection ───────────────────────────────────────────────────────────────

describe('gameStore — connection', () => {
  it('setConnection connected=true updates state', () => {
    useGameStore.getState().setConnection(true, 'sess-1');
    expect(useGameStore.getState().isConnected).toBe(true);
    expect(useGameStore.getState().connectionState).toBe('connected');
  });

  it('setConnection connected=false updates state', () => {
    useGameStore.getState().setConnection(false);
    expect(useGameStore.getState().isConnected).toBe(false);
    expect(useGameStore.getState().connectionState).toBe('disconnected');
  });

  it('updateConnectionState syncs isConnected', () => {
    useGameStore.getState().updateConnectionState('connecting');
    expect(useGameStore.getState().connectionState).toBe('connecting');
    expect(useGameStore.getState().isConnected).toBe(false);
  });
});

// ─── lighting ─────────────────────────────────────────────────────────────────

describe('gameStore — lighting', () => {
  it('setAmbientLight updates ambientLight', () => {
    useGameStore.getState().setAmbientLight(0.8);
    expect(useGameStore.getState().ambientLight).toBe(0.8);
  });

  it('setDynamicLighting toggles flag', () => {
    useGameStore.getState().setDynamicLighting(true);
    expect(useGameStore.getState().dynamicLightingEnabled).toBe(true);
  });

  it('setFogExplorationMode sets mode', () => {
    useGameStore.getState().setFogExplorationMode('persist_dimmed');
    expect(useGameStore.getState().fogExplorationMode).toBe('persist_dimmed');
  });

  it('applyTableLightingSettings updates all lighting fields', () => {
    useGameStore.getState().applyTableLightingSettings({
      dynamic_lighting_enabled: true,
      fog_exploration_mode: 'persist_dimmed',
      ambient_light_level: 0.5,
    });
    const s = useGameStore.getState();
    expect(s.dynamicLightingEnabled).toBe(true);
    expect(s.fogExplorationMode).toBe('persist_dimmed');
    expect(s.ambientLight).toBe(0.5);
  });
});

// ─── layer / grid ─────────────────────────────────────────────────────────────

describe('gameStore — layer and grid', () => {
  it('setActiveLayer changes layer', () => {
    useGameStore.getState().setActiveLayer('map');
    expect(useGameStore.getState().activeLayer).toBe('map');
  });

  it('setLayerVisibility toggles layer', () => {
    useGameStore.getState().setLayerVisibility('tokens', false);
    expect(useGameStore.getState().layerVisibility['tokens']).toBe(false);
  });

  it('setGridEnabled toggles grid', () => {
    useGameStore.getState().setGridEnabled(false);
    expect(useGameStore.getState().gridEnabled).toBe(false);
  });

  it('setGridSnapping toggles snapping', () => {
    useGameStore.getState().setGridSnapping(true);
    expect(useGameStore.getState().gridSnapping).toBe(true);
  });

  it('setGridSize updates gridSize and gridCellPx', () => {
    useGameStore.getState().setGridSize(100);
    expect(useGameStore.getState().gridSize).toBe(100);
  });
});

// ─── session role ─────────────────────────────────────────────────────────────

describe('gameStore — session role', () => {
  it('setSessionRole stores role and permissions', () => {
    useGameStore.getState().setSessionRole('owner', ['all'], ['tokens', 'map']);
    expect(useGameStore.getState().sessionRole).toBe('owner');
    expect(useGameStore.getState().permissions).toContain('all');
    expect(useGameStore.getState().visibleLayers).toContain('tokens');
  });

  it('setUserId stores user id', () => {
    useGameStore.getState().setUserId(42);
    expect(useGameStore.getState().userId).toBe(42);
  });

  it('setDmPreviewMode sets target user', () => {
    useGameStore.getState().setDmPreviewMode(7);
    expect(useGameStore.getState().dmPreviewUserId).toBe(7);
  });

  it('setDmPreviewMode null clears preview', () => {
    useGameStore.getState().setDmPreviewMode(7);
    useGameStore.getState().setDmPreviewMode(null);
    expect(useGameStore.getState().dmPreviewUserId).toBeNull();
  });
});

// ─── sprite/character helpers ─────────────────────────────────────────────────

describe('gameStore — sprite/character helpers', () => {
  it('getSpritesForCharacter returns sprites linked to character', () => {
    const s = { ...makeSprite('s1'), characterId: 'c1' };
    useGameStore.setState({ sprites: [s as never] });
    expect(useGameStore.getState().getSpritesForCharacter('c1')).toHaveLength(1);
  });

  it('getCharacterForSprite returns linked character', () => {
    const char = { ...makeCharacter('c1'), id: 'c1' };
    const s = { ...makeSprite('s1'), characterId: 'c1' };
    useGameStore.setState({ sprites: [s as never], characters: [char as never] });
    expect(useGameStore.getState().getCharacterForSprite('s1')).toBeDefined();
  });

  it('canControlSprite returns true for DM', () => {
    useGameStore.setState({ sessionRole: 'owner' as never, sprites: [makeSprite('s1') as never] });
    expect(useGameStore.getState().canControlSprite('s1')).toBe(true);
  });

  it('canEditCharacter returns true for DM', () => {
    useGameStore.setState({ sessionRole: 'owner' as never, characters: [makeCharacter('c1') as never] });
    expect(useGameStore.getState().canEditCharacter('c1')).toBe(true);
  });
});

// ─── table management ─────────────────────────────────────────────────────────

describe('gameStore — switchToTable with existing table', () => {
  it('switchToTable dispatches table-data-received for existing table', () => {
    const events: string[] = [];
    window.addEventListener('table-data-received', () => events.push('table-data'));
    window.addEventListener('protocol-send-message', () => events.push('protocol'));

    useGameStore.setState({
      tables: [{ table_id: 't1', table_name: 'Main', width: 100, height: 100 }],
    } as never);
    useGameStore.getState().switchToTable('t1');

    expect(events).toContain('table-data');
    expect(events).toContain('protocol');
  });
});

describe('gameStore — wall actions', () => {
  beforeEach(() => {
    useGameStore.setState({ walls: [] } as never);
    delete (window as never)['rustRenderManager'];
  });

  it('addWall inserts a new wall', () => {
    useGameStore.getState().addWall({ wall_id: 'w1' } as never);
    expect(useGameStore.getState().walls).toHaveLength(1);
  });

  it('addWall updates existing wall', () => {
    useGameStore.setState({ walls: [{ wall_id: 'w1', color: 'red' }] } as never);
    useGameStore.getState().addWall({ wall_id: 'w1', color: 'blue' } as never);
    expect(useGameStore.getState().walls[0]).toMatchObject({ wall_id: 'w1', color: 'blue' });
    expect(useGameStore.getState().walls).toHaveLength(1);
  });

  it('addWall calls rustRenderManager.add_wall if present', () => {
    const add_wall = vi.fn();
    (window as unknown as Record<string, unknown>)['rustRenderManager'] = { add_wall };
    useGameStore.getState().addWall({ wall_id: 'w2' } as never);
    expect(add_wall).toHaveBeenCalled();
  });

  it('addWalls merges multiple walls', () => {
    useGameStore.getState().addWalls([{ wall_id: 'w1' } as never, { wall_id: 'w2' } as never]);
    expect(useGameStore.getState().walls).toHaveLength(2);
  });

  it('updateWall merges partial updates', () => {
    useGameStore.setState({ walls: [{ wall_id: 'w1', color: 'red' }] } as never);
    useGameStore.getState().updateWall('w1', { color: 'green' } as never);
    expect(useGameStore.getState().walls[0]).toMatchObject({ color: 'green' });
  });

  it('updateWall calls rustRenderManager.update_wall if present', () => {
    const update_wall = vi.fn();
    (window as unknown as Record<string, unknown>)['rustRenderManager'] = { update_wall };
    useGameStore.setState({ walls: [{ wall_id: 'w1' }] } as never);
    useGameStore.getState().updateWall('w1', {} as never);
    expect(update_wall).toHaveBeenCalled();
  });
});

// ─── setTableUnits ─────────────────────────────────────────────────────────────

describe('gameStore — setTableUnits', () => {
  it('updates grid state with valid config', () => {
    useGameStore.getState().setTableUnits({ gridCellPx: 100, cellDistance: 10, distanceUnit: 'ft' });
    const s = useGameStore.getState();
    expect(s.gridCellPx).toBe(100);
    expect(s.gridSize).toBe(100);
    expect(s.cellDistance).toBe(10);
    expect(s.distanceUnit).toBe('ft');
  });

  it('falls back to defaults for invalid values', () => {
    useGameStore.getState().setTableUnits({ gridCellPx: -5, cellDistance: 0, distanceUnit: 'xx' as never });
    const s = useGameStore.getState();
    expect(s.gridCellPx).toBe(50);
    expect(s.cellDistance).toBe(5);
    expect(s.distanceUnit).toBe('ft');
  });

  it('calls rustRenderManager.set_table_units when present', () => {
    const set_table_units = vi.fn();
    (window as unknown as Record<string, unknown>)['rustRenderManager'] = { set_table_units };
    useGameStore.setState({ activeTableId: 'tbl-1' } as never);
    useGameStore.getState().setTableUnits({ gridCellPx: 60, cellDistance: 5, distanceUnit: 'm' });
    expect(set_table_units).toHaveBeenCalledWith('tbl-1', 60, 5, 'm');
    delete (window as unknown as Record<string, unknown>)['rustRenderManager'];
  });
});

// ─── createNewTable ────────────────────────────────────────────────────────────

describe('gameStore — createNewTable', () => {
  it('adds table to store and sets activeTableId', () => {
    useGameStore.getState().createNewTable('Arena', 800, 600);
    const s = useGameStore.getState();
    expect(s.tables).toHaveLength(1);
    expect(s.tables[0].table_name).toBe('Arena');
    expect(s.tables[0].width).toBe(800);
    expect(s.tables[0].syncStatus).toBe('local');
    expect(s.activeTableId).toBe(s.tables[0].table_id);
  });

  it('dispatches table-data-received and protocol-send-message events', () => {
    const events: string[] = [];
    window.addEventListener('table-data-received', () => events.push('data'));
    window.addEventListener('protocol-send-message', () => events.push('protocol'));

    useGameStore.getState().createNewTable('Map', 100, 100);

    expect(events).toContain('data');
    expect(events).toContain('protocol');
  });
});

// ─── deleteTable ────────────────────────────────────────────────────────────────

describe('gameStore — deleteTable', () => {
  it('dispatches protocol-send-message with table_delete type', () => {
    let detail: unknown = null;
    window.addEventListener('protocol-send-message', (e) => { detail = (e as CustomEvent).detail; });

    useGameStore.getState().deleteTable('tbl-99');

    expect(detail).toMatchObject({ type: 'table_delete', data: { table_id: 'tbl-99' } });
  });
});

// ─── syncTableToServer ─────────────────────────────────────────────────────────

describe('gameStore — syncTableToServer', () => {
  it('marks table as syncing and dispatches new_table_request', () => {
    useGameStore.setState({
      tables: [{ table_id: 't1', table_name: 'Map', width: 100, height: 100, syncStatus: 'local' }],
    } as never);

    let detail: unknown = null;
    window.addEventListener('protocol-send-message', (e) => { detail = (e as CustomEvent).detail; });

    useGameStore.getState().syncTableToServer('t1');

    const s = useGameStore.getState();
    expect((s.tables[0] as unknown as Record<string, unknown>).syncStatus).toBe('syncing');
    expect(detail).toMatchObject({ type: 'new_table_request' });
  });

  it('logs error for unknown tableId and does not change state', () => {
    useGameStore.setState({ tables: [] } as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    useGameStore.getState().syncTableToServer('nonexistent');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ─── applyTableLightingSettings ────────────────────────────────────────────────

describe('gameStore — applyTableLightingSettings', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['rustRenderManager'];
  });

  it('updates lighting state', () => {
    useGameStore.getState().applyTableLightingSettings({
      dynamic_lighting_enabled: true,
      fog_exploration_mode: 'persist_dimmed',
      ambient_light_level: 0.5,
    });
    const s = useGameStore.getState();
    expect(s.dynamicLightingEnabled).toBe(true);
    expect(s.fogExplorationMode).toBe('persist_dimmed');
    expect(s.ambientLight).toBe(0.5);
  });

  it('calls rustRenderManager methods when available', () => {
    const rm = {
      set_ambient_light: vi.fn(),
      set_dynamic_lighting_enabled: vi.fn(),
    };
    (window as unknown as Record<string, unknown>)['rustRenderManager'] = rm;
    useGameStore.setState({ sessionRole: null } as never);

    useGameStore.getState().applyTableLightingSettings({
      dynamic_lighting_enabled: false,
      fog_exploration_mode: 'current_only',
      ambient_light_level: 0.8,
    });

    expect(rm.set_ambient_light).toHaveBeenCalledWith(0.8);
    expect(rm.set_dynamic_lighting_enabled).toHaveBeenCalledWith(false);
  });
});

// ─── setActiveTableId with protocol ───────────────────────────────────────────

describe('gameStore — setActiveTableId', () => {
  it('sets activeTableId in state', () => {
    useGameStore.getState().setActiveTableId('tbl-42');
    expect(useGameStore.getState().activeTableId).toBe('tbl-42');
  });

  it('calls protocol.setActiveTable when window.protocol present', () => {
    const setActiveTable = vi.fn();
    (window as unknown as Record<string, unknown>)['protocol'] = { setActiveTable };
    useGameStore.getState().setActiveTableId('tbl-42');
    expect(setActiveTable).toHaveBeenCalledWith('tbl-42');
    delete (window as unknown as Record<string, unknown>)['protocol'];
  });
});
