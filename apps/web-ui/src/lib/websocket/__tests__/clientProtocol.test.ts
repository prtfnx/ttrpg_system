import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// vi.hoisted runs before module imports — these refs are usable in vi.mock factories
const mocks = vi.hoisted(() => {
  const storeState: Record<string, unknown> = {};
  const getState = vi.fn(() => storeState);
  const useGameStore = Object.assign(
    (selector?: (s: unknown) => unknown) => {
      const s = getState();
      return typeof selector === 'function' ? selector(s) : s;
    },
    { getState }
  );
  return { useGameStore, getState, storeState };
});

vi.mock('@/store', () => ({ useGameStore: mocks.useGameStore }));

import { WebClientProtocol } from '../clientProtocol';
import { MessageType } from '../message';

// ---------------------------------------------------------------------------
// Store mock helpers
// ---------------------------------------------------------------------------

const mockSetUserId = vi.fn();
const mockSetSessionRole = vi.fn();
const mockSetTables = vi.fn();
const mockSetTablesLoading = vi.fn();
const mockApplyTableLightingSettings = vi.fn();
const mockSetTableUnits = vi.fn();
const mockSetGridEnabled = vi.fn();
const mockSetGridSnapping = vi.fn();
const mockSetGridColorHex = vi.fn();
const mockSetBackgroundColorHex = vi.fn();
const mockAddWall = vi.fn();
const mockAddWalls = vi.fn();
const mockUpdateWall = vi.fn();
const mockRemoveWall = vi.fn();
const mockSetActiveTableId = vi.fn();

vi.mock('@features/assets/services/assetCache', () => ({
  useAssetCharacterCache: {
    getState: vi.fn(() => ({
      upsertAsset: vi.fn(),
      bulkLoadAssets: vi.fn(),
      upsertCharacter: vi.fn(),
      bulkLoadCharacters: vi.fn(),
    })),
  },
}));

vi.mock('@shared/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
  protocolLogger: { connection: vi.fn(), message: vi.fn() },
}));

vi.mock('@shared/utils/toast', () => ({
  showToast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

vi.mock('@lib/websocket/tableProtocolAdapter', () => ({
  validateTableId: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStoreState(overrides: Record<string, unknown> = {}) {
  return {
    activeTableId: 'table-abc',
    userId: 1,
    characters: [],
    sprites: [],
    permissions: [],
    visibleLayers: [],
    setUserId: mockSetUserId,
    setSessionRole: mockSetSessionRole,
    setTables: mockSetTables,
    setTablesLoading: mockSetTablesLoading,
    applyTableLightingSettings: mockApplyTableLightingSettings,
    setTableUnits: mockSetTableUnits,
    setGridEnabled: mockSetGridEnabled,
    setGridSnapping: mockSetGridSnapping,
    setGridColorHex: mockSetGridColorHex,
    setBackgroundColorHex: mockSetBackgroundColorHex,
    addWall: mockAddWall,
    addWalls: mockAddWalls,
    updateWall: mockUpdateWall,
    removeWall: mockRemoveWall,
    setActiveTableId: mockSetActiveTableId,
    addCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    removeCharacter: vi.fn(),
    ...overrides,
  };
}

function makeProtocol(sessionCode = 'TEST123', userId = 1) {
  return new WebClientProtocol(sessionCode, userId);
}

function makeOpenWs(protocol: WebClientProtocol) {
  const ws: { readyState: number; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } = {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
  };
  // Inject the fake WebSocket
  (protocol as unknown as Record<string, unknown>)['websocket'] = ws;
  return ws;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebClientProtocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.storeState, makeStoreState());
  });

  // ── Construction ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('stores sessionCode and userId', () => {
      const p = makeProtocol('CODE42', 7);
      expect(p.getUserId()).toBe(7);
    });

    it('getUserId returns null when not provided', () => {
      const p = new WebClientProtocol('X');
      expect(p.getUserId()).toBeNull();
    });

    it('setUserId updates the userId', () => {
      const p = makeProtocol();
      p.setUserId(99);
      expect(p.getUserId()).toBe(99);
    });
  });

  // ── isConnected ───────────────────────────────────────────────────────────

  describe('isConnected', () => {
    it('returns false when no websocket', () => {
      expect(makeProtocol().isConnected()).toBe(false);
    });

    it('returns false when ws is not OPEN', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      ws.readyState = WebSocket.CLOSED;
      (p as unknown as Record<string, unknown>)['connectionAlive'] = true;
      expect(p.isConnected()).toBe(false);
    });

    it('returns true when OPEN and connectionAlive', () => {
      const p = makeProtocol();
      makeOpenWs(p);
      (p as unknown as Record<string, unknown>)['connectionAlive'] = true;
      expect(p.isConnected()).toBe(true);
    });
  });

  // ── onConnectionStateChange ───────────────────────────────────────────────

  describe('onConnectionStateChange', () => {
    it('calls listener when state changes', () => {
      const p = makeProtocol();
      const listener = vi.fn();
      p.onConnectionStateChange(listener);
      makeOpenWs(p);
      (p as unknown as Record<string, unknown>)['connectionAlive'] = true;
      // Trigger disconnect which calls notifyConnectionState
      p.disconnect();
      expect(listener).toHaveBeenCalledWith('disconnected');
    });

    it('returns unsubscribe that stops future calls', () => {
      const p = makeProtocol();
      const listener = vi.fn();
      const unsub = p.onConnectionStateChange(listener);
      unsub();
      p.disconnect();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ── disconnect ────────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('closes websocket', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.disconnect();
      expect(ws.close).toHaveBeenCalled();
    });

    it('sets connectionAlive false', () => {
      const p = makeProtocol();
      makeOpenWs(p);
      (p as unknown as Record<string, unknown>)['connectionAlive'] = true;
      p.disconnect();
      expect((p as unknown as Record<string, unknown>)['connectionAlive']).toBe(false);
    });
  });

  // ── Ping ──────────────────────────────────────────────────────────────────

  describe('ping management', () => {
    it('isPingEnabled returns false initially', () => {
      expect(makeProtocol().isPingEnabled()).toBe(false);
    });

    it('stopPing disables ping', () => {
      const p = makeProtocol();
      (p as unknown as Record<string, unknown>)['pingEnabled'] = true;
      p.stopPing();
      expect(p.isPingEnabled()).toBe(false);
    });
  });

  // ── Message batching ──────────────────────────────────────────────────────

  describe('queueMessage', () => {
    it('drops message when ws is not OPEN', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      ws.readyState = WebSocket.CLOSED;
      p.queueMessage({ type: MessageType.PING, data: {}, version: '0.1', priority: 1 });
      expect((p as unknown as Record<string, unknown>)['batchQueue']).toHaveLength(0);
    });

    it('adds message to batchQueue when OPEN', () => {
      const p = makeProtocol();
      makeOpenWs(p);
      p.queueMessage({ type: MessageType.PING, data: {}, version: '0.1', priority: 1 });
      expect((p as unknown as Record<string, unknown>)['batchQueue']).toHaveLength(1);
    });
  });

  describe('sendBatch', () => {
    it('sends batch message and clears queue', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      const msg = { type: MessageType.PING, data: {}, version: '0.1', priority: 1 };
      p.queueMessage(msg);
      p.sendBatch();
      expect(ws.send).toHaveBeenCalledOnce();
      const sent = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(sent.type).toBe('batch');
      expect(sent.data.messages).toHaveLength(1);
      expect((p as unknown as Record<string, unknown>)['batchQueue']).toHaveLength(0);
    });

    it('keeps messages in queue if ws not OPEN', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      const batchQueue = (p as unknown as Record<string, unknown>)['batchQueue'] as unknown[];
      batchQueue.push({ type: MessageType.PING, data: {}, version: '0.1', priority: 1 });
      ws.readyState = WebSocket.CLOSED;
      p.sendBatch();
      expect(ws.send).not.toHaveBeenCalled();
      expect(batchQueue).toHaveLength(1);
    });

    it('does nothing when queue is empty', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.sendBatch();
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  // ── Outgoing requests ─────────────────────────────────────────────────────

  describe('requestTableList', () => {
    it('sends table_list_request', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.requestTableList();
      expect(ws.send).toHaveBeenCalledOnce();
      const msg = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(msg.type).toBe('table_list_request');
    });
  });

  describe('requestPlayerList', () => {
    it('sends player_list_request', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.requestPlayerList();
      const msg = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(msg.type).toBe('player_list_request');
    });
  });

  describe('createNewTable', () => {
    it('sends new_table_request with name/dimensions', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.createNewTable('Arena', 30, 30);
      const msg = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(msg.type).toBe('new_table_request');
      expect(msg.data).toMatchObject({ table_name: 'Arena', width: 30, height: 30 });
    });
  });

  describe('deleteTable', () => {
    it('sends table_delete with table_id', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.deleteTable('tbl-1');
      const msg = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(msg.type).toBe('table_delete');
      expect(msg.data.table_id).toBe('tbl-1');
    });
  });

  describe('setActiveTable', () => {
    it('sends table_active_set with user and table', () => {
      const p = makeProtocol('S', 5);
      const ws = makeOpenWs(p);
      p.setActiveTable('tbl-2');
      // table_active_set is not in the critical list — goes through queueMessage
      p.sendBatch();
      const batch = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('table_active_set');
      expect(inner.data).toMatchObject({ user_id: 5, table_id: 'tbl-2' });
    });
  });

  describe('createWall', () => {
    it('sends wall_create with activeTableId', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.createWall({ x1: 0, y1: 0, x2: 10, y2: 10 });
      // wall_create goes through queueMessage → won't be in ws.send yet
      // flush the batch
      p.sendBatch();
      const msg = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(msg.type).toBe('batch');
      const inner = msg.data.messages[0];
      expect(inner.type).toBe('wall_create');
      expect(inner.data.table_id).toBe('table-abc');
    });

    it('does nothing when no activeTableId', () => {
      Object.assign(mocks.storeState, makeStoreState({ activeTableId: null }));
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.createWall({ x1: 0, y1: 0 });
      p.sendBatch();
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('removeWall', () => {
    it('sends wall_remove with wall_id', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.removeWall('wall-99');
      p.sendBatch();
      const batch = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('wall_remove');
      expect(inner.data.wall_id).toBe('wall-99');
    });
  });

  describe('toggleDoor', () => {
    it('sends door_toggle with wall_id', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.toggleDoor('wall-door-1');
      p.sendBatch();
      const batch = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('door_toggle');
      expect(inner.data.wall_id).toBe('wall-door-1');
    });
  });

  describe('saveCharacter', () => {
    it('sends character_save_request queued', () => {
      const p = makeProtocol('S', 3);
      const ws = makeOpenWs(p);
      p.saveCharacter({ name: 'Elf' });
      p.sendBatch();
      const batch = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('character_save_request');
      expect(inner.data.user_id).toBe(3);
    });

    it('does not send when userId is null', () => {
      const p = new WebClientProtocol('S');
      const ws = makeOpenWs(p);
      p.saveCharacter({ name: 'Elf' });
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('loadCharacter', () => {
    it('sends character_load_request with character_id', () => {
      const p = makeProtocol('S', 2);
      const ws = makeOpenWs(p);
      p.loadCharacter('char-1');
      p.sendBatch();
      const batch = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('character_load_request');
      expect(inner.data.character_id).toBe('char-1');
    });
  });

  describe('rollDeathSave', () => {
    it('sends character_roll with roll_type death_save', () => {
      const p = makeProtocol('S', 1);
      const ws = makeOpenWs(p);
      p.rollDeathSave('char-2');
      p.sendBatch();
      const batch = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('character_roll');
      expect(inner.data.roll_type).toBe('death_save');
    });
  });

  // ── Incoming handlers ─────────────────────────────────────────────────────

  describe('incoming message handlers', () => {
    async function dispatch(p: WebClientProtocol, type: string, data: Record<string, unknown>) {
      const raw = JSON.stringify({ type, data, version: '0.1', priority: 5 });
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
    }

    it('PLAYER_JOINED dispatches player-joined custom event', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('player-joined', handler);
      await dispatch(p, 'player_joined', { user_id: 5 });
      window.removeEventListener('player-joined', handler);
      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ user_id: 5 });
    });

    it('PLAYER_LEFT dispatches player-left custom event', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('player-left', handler);
      await dispatch(p, 'player_left', { user_id: 3 });
      window.removeEventListener('player-left', handler);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('TABLE_UPDATE dispatches table-updated event', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('table-updated', handler);
      await dispatch(p, 'table_update', { table_id: 't1' });
      window.removeEventListener('table-updated', handler);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('SPRITE_CREATE dispatches sprite-created event', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('sprite-created', handler);
      await dispatch(p, 'sprite_create', { sprite_id: 's1' });
      window.removeEventListener('sprite-created', handler);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('SPRITE_REMOVE dispatches sprite-removed event', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('sprite-removed', handler);
      await dispatch(p, 'sprite_remove', { sprite_id: 's1' });
      window.removeEventListener('sprite-removed', handler);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('WALL_DATA operation=create calls store.addWall', async () => {
      const p = makeProtocol();
      const wall = { wall_id: 'w1', x1: 0, y1: 0, x2: 5, y2: 5 };
      await dispatch(p, 'wall_data', { operation: 'create', wall });
      expect(mockAddWall).toHaveBeenCalledWith(wall);
    });

    it('WALL_DATA operation=remove calls store.removeWall', async () => {
      const p = makeProtocol();
      await dispatch(p, 'wall_data', { operation: 'remove', wall_id: 'w2' });
      expect(mockRemoveWall).toHaveBeenCalledWith('w2');
    });

    it('WALL_DATA operation=update calls store.updateWall', async () => {
      const p = makeProtocol();
      await dispatch(p, 'wall_data', { operation: 'update', wall: { wall_id: 'w3', x1: 1 } });
      expect(mockUpdateWall).toHaveBeenCalledWith('w3', { wall_id: 'w3', x1: 1 });
    });

    it('WALL_DATA operation=batch_create calls store.addWalls', async () => {
      const p = makeProtocol();
      const walls = [{ wall_id: 'w4' }, { wall_id: 'w5' }];
      await dispatch(p, 'wall_data', { operation: 'batch_create', walls });
      expect(mockAddWalls).toHaveBeenCalledWith(walls);
    });

    it('PONG marks connection alive', async () => {
      const p = makeProtocol();
      await dispatch(p, 'pong', {});
      expect((p as unknown as Record<string, unknown>)['connectionAlive']).toBe(true);
    });

    it('ERROR dispatches protocol-error event', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('protocol-error', handler);
      await dispatch(p, 'error', { message: 'bad' });
      window.removeEventListener('protocol-error', handler);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('SUCCESS dispatches protocol-success event', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('protocol-success', handler);
      await dispatch(p, 'success', { ok: true });
      window.removeEventListener('protocol-success', handler);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('BATCH dispatches inner messages to handlers', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('player-joined', handler);
      const innerMsg = { type: 'player_joined', data: { user_id: 9 }, version: '0.1', priority: 5 };
      await dispatch(p, 'batch', { messages: [innerMsg] });
      window.removeEventListener('player-joined', handler);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('unknown message type logs a warning (no crash)', async () => {
      const p = makeProtocol();
      await expect(dispatch(p, 'totally_unknown_type', {})).resolves.not.toThrow();
    });

    it('TABLE_LIST_RESPONSE updates store tables', async () => {
      const p = makeProtocol();
      const tables = { 'tbl-1': { table_name: 'Map 1' } };
      await dispatch(p, 'table_list_response', { tables });
      expect(mockSetTables).toHaveBeenCalledOnce();
      expect(mockSetTablesLoading).toHaveBeenCalledWith(false);
    });

    it('TABLE_SETTINGS_CHANGED updates store', async () => {
      const p = makeProtocol();
      await dispatch(p, 'table_settings_changed', {
        dynamic_lighting_enabled: true,
        fog_exploration_mode: 'all',
        ambient_light_level: 0.5,
      });
      expect(mockApplyTableLightingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ dynamic_lighting_enabled: true })
      );
    });

    it('PLAYER_ROLE_CHANGED updates store when matches current user', async () => {
      const p = makeProtocol('S', 7);
      await dispatch(p, 'player_role_changed', { user_id: 7, new_role: 'player', permissions: [] });
      expect(mockSetSessionRole).toHaveBeenCalledWith('player', [], expect.anything());
    });

    it('PLAYER_ROLE_CHANGED does not update store for other users', async () => {
      const p = makeProtocol('S', 7);
      await dispatch(p, 'player_role_changed', { user_id: 99, new_role: 'spectator', permissions: [] });
      expect(mockSetSessionRole).not.toHaveBeenCalled();
    });
  });

  // ── registerHandler / unregisterHandler ──────────────────────────────────

  describe('registerHandler / unregisterHandler', () => {
    it('custom handler is invoked for registered type', async () => {
      const p = makeProtocol();
      const handler = vi.fn().mockResolvedValue(undefined);
      p.registerHandler('custom_type', handler);
      const raw = JSON.stringify({ type: 'custom_type', data: { x: 1 }, version: '0.1', priority: 5 });
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('unregistered handler is not invoked', async () => {
      const p = makeProtocol();
      const handler = vi.fn().mockResolvedValue(undefined);
      p.registerHandler('to_remove', handler);
      p.unregisterHandler('to_remove');
      const raw = JSON.stringify({ type: 'to_remove', data: {}, version: '0.1', priority: 5 });
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
