import { describe, it, expect, beforeEach, vi } from 'vitest';

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
  advancedMeasurementSystem: { stop: vi.fn() },
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
