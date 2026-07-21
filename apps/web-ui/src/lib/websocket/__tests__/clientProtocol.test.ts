import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// vi.hoisted runs before module imports — these refs are usable in vi.mock factories
const mocks = vi.hoisted(() => {
  const storeState: Record<string, unknown> = {};
  const getState = vi.fn(() => storeState);
  const renderEngine = {
    set_background_color: vi.fn(),
  };
  const useGameStore = Object.assign(
    (selector?: (s: unknown) => unknown) => {
      const s = getState();
      return typeof selector === 'function' ? selector(s) : s;
    },
    { getState }
  );
  const runtime = {
    addRemotePaintStroke: vi.fn(),
    removePaintStroke: vi.fn(),
    clearPaintStrokes: vi.fn(),
    loadPaintStrokes: vi.fn(),
    applyLayerSettings: vi.fn(),
    setGridEnabled: vi.fn(),
    setGridSnapping: vi.fn(),
    setGridSize: vi.fn(),
    getRenderEngine: vi.fn(() => renderEngine),
  };
  return { useGameStore, getState, storeState, runtime, renderEngine };
});

vi.mock('@/store', () => ({ useGameStore: mocks.useGameStore }));
vi.mock('@lib/wasm/runtime', () => ({ getCurrentWasmRuntime: vi.fn(() => mocks.runtime) }));

import { WebClientProtocol } from '../clientProtocol';
import { MessageType } from '../message';
import { useCombatStore } from '@features/combat/stores/combatStore';
import { useCoverStore } from '@features/combat/stores/coverStore';
import { useEncounterStore } from '@features/combat/stores/encounterStore';

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
      // character_roll is a critical message — sent directly, not batched
      const msg = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(msg.type).toBe('character_roll');
      expect(msg.data.roll_type).toBe('death_save');
    });
  });

  describe('character advancement commands', () => {
    it('sends XP awards and multiclass requests immediately', () => {
      const p = makeProtocol('ROOM', 7);
      const ws = makeOpenWs(p);

      p.awardCharacterXP('char-1', 250, 'quest', 'Ruins');
      p.requestCharacterMulticlass('char-1', 'wizard');

      const sent = (ws.send as Mock).mock.calls.map(call => JSON.parse(call[0]));
      expect(sent).toEqual([
        expect.objectContaining({
          type: 'xp_award',
          data: expect.objectContaining({ character_id: 'char-1', amount: 250 }),
        }),
        expect.objectContaining({
          type: 'multiclass_request',
          data: expect.objectContaining({ character_id: 'char-1', new_class: 'wizard' }),
        }),
      ]);
    });
  });

  describe('character drafts', () => {
    it('sends durable draft mutations immediately with optimistic versions', () => {
      const p = makeProtocol('ROOM', 7);
      const ws = makeOpenWs(p);

      p.createCharacterDraft({ name: 'Ari' }, 1);
      p.updateCharacterDraft('draft-1', { name: 'Aria' }, 2, 4);
      p.finalizeCharacterDraft('draft-1', { name: 'Aria' }, 5);
      p.abandonCharacterDraft('draft-2', 3);

      const sent = (ws.send as Mock).mock.calls.map(call => JSON.parse(call[0]));
      expect(sent.map(message => message.type)).toEqual([
        'character_draft_create_request',
        'character_draft_update_request',
        'character_draft_finalize_request',
        'character_draft_abandon_request',
      ]);
      expect(sent[1].data).toMatchObject({
        draft_id: 'draft-1', current_step: 2, expected_version: 4,
      });
      expect(sent[2].data.expected_version).toBe(5);
      expect(sent[3].data.expected_version).toBe(3);
    });

    it('batches draft list and load queries', () => {
      const p = makeProtocol('ROOM', 7);
      const ws = makeOpenWs(p);

      p.requestCharacterDrafts();
      p.loadCharacterDraft('draft-1');
      p.sendBatch();

      const batch = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(batch.data.messages.map((message: { type: string }) => message.type)).toEqual([
        'character_draft_list_request',
        'character_draft_load_request',
      ]);
      expect(batch.data.messages[1].data.draft_id).toBe('draft-1');
    });
  });

  describe('resolveOA', () => {
    it('sends opportunity attack resolution as a combat_command', () => {
      const p = makeProtocol('S', 2);
      const ws = makeOpenWs(p);

      p.resolveOA({
        use_reaction: true,
        attacker_combatant_id: 'attacker-1',
        target_combatant_id: 'target-1',
        attack_bonus: 4,
        damage_formula: '1d8+2',
        damage_type: 'piercing',
      });
      p.sendBatch();

      const msg = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(msg.type).toBe('batch');
      const inner = msg.data.messages[0];
      expect(inner.type).toBe('combat_command');
      expect(inner.data.commands).toEqual([
        expect.objectContaining({
          type: 'resolve_opportunity_attack',
          actor_id: 'attacker-1',
          target_id: 'target-1',
          use_reaction: true,
          attack_bonus: 4,
          damage_formula: '1d8+2',
          damage_type: 'piercing',
        }),
      ]);
    });
  });

  describe('cover zones', () => {
    it('sends add/remove cover zone as combat_command batches', () => {
      const p = makeProtocol('S', 2);
      const ws = makeOpenWs(p);
      const zone = {
        zone_id: 'z1',
        shape_type: 'rect',
        coords: [0, 0, 10, 10],
        cover_tier: 'half',
        label: 'Crates',
      };

      p.addCoverZone('table-1', zone);
      p.removeCoverZone('table-1', 'z1');
      p.sendBatch();

      const msg = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(msg.type).toBe('batch');
      expect(msg.data.messages).toEqual([
        expect.objectContaining({
          type: 'combat_command',
          data: expect.objectContaining({
            commands: [expect.objectContaining({
              type: 'add_cover_zone',
              actor_id: '__dm__',
              table_id: 'table-1',
              zone,
            })],
          }),
        }),
        expect.objectContaining({
          type: 'combat_command',
          data: expect.objectContaining({
            commands: [expect.objectContaining({
              type: 'remove_cover_zone',
              actor_id: '__dm__',
              table_id: 'table-1',
              zone_id: 'z1',
            })],
          }),
        }),
      ]);
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

    it('ENCOUNTER_RESULT updates the encounter store from server snapshot', async () => {
      const p = makeProtocol();
      useEncounterStore.setState({ encounter: null });

      await dispatch(p, 'encounter_result', {
        player_id: '1',
        status: 'choice_recorded',
        encounter: {
          encounter_id: 'enc-1',
          title: 'Crossroads',
          description: 'Pick one',
          phase: 'awaiting_choice',
          choices: [{ choice_id: 'left', text: 'Left' }],
        },
      });

      expect(useEncounterStore.getState().encounter?.encounter_id).toBe('enc-1');
      expect(useEncounterStore.getState().encounter?.choices[0].choice_id).toBe('left');
    });

    it('WELCOME restores the active choice encounter', async () => {
      const p = makeProtocol();
      useEncounterStore.setState({ encounter: null });

      await dispatch(p, 'welcome', {
        user_id: 1,
        role: 'player',
        choice_encounter: {
          encounter_id: 'enc-restored',
          title: 'Restored prompt',
          description: 'Continue choosing',
          phase: 'presenting',
          choices: [{ choice_id: 'continue', text: 'Continue' }],
        },
      });

      expect(useEncounterStore.getState().encounter?.encounter_id).toBe('enc-restored');
    });

    it('ACTION_RESULT confirms the optimistic sprite action by sequence id', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('sprite-action-confirmed', handler);

      await dispatch(p, 'action_result', { sequence_id: 42, applied: [] });

      window.removeEventListener('sprite-action-confirmed', handler);
      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ actionId: '42' });
    });

    it('ACTION_RESULT clears combat after an accepted end combat command', async () => {
      const p = makeProtocol();
      useCombatStore.setState({
        combat: {
          combat_id: 'combat-1',
          session_id: 'session-1',
          table_id: 'table-1',
          phase: 'active',
          round_number: 1,
          current_turn_index: 0,
          combatants: [],
          action_log: [],
          started_at: Date.now(),
          settings: {
            auto_roll_npc_initiative: false,
            auto_sort_initiative: true,
            skip_defeated: true,
            allow_player_end_turn: true,
            show_npc_hp_to_players: 'hidden',
            group_initiative: false,
            ai_auto_act: false,
            death_saves_enabled: true,
            critical_hit_rule: 'double_dice',
          },
          state_hash: 'hash',
        },
      });

      await dispatch(p, 'action_result', {
        sequence_id: 44,
        applied: [{ action_type: 'end_combat', actor_id: '__dm__' }],
        combat: { combat_id: 'combat-1', phase: 'ended' },
      });

      expect(useCombatStore.getState().combat).toBeNull();
    });

    it('ACTION_RESULT applies accepted cover zone mutations to the cover store', async () => {
      const p = makeProtocol();
      const zone = {
        zone_id: 'z1',
        shape_type: 'rect' as const,
        coords: [0, 0, 10, 10],
        cover_tier: 'half' as const,
        label: 'Crates',
      };
      useCoverStore.setState({ zones: [] });

      await dispatch(p, 'action_result', {
        sequence_id: 45,
        applied: [{
          action_type: 'add_cover_zone',
          actor_id: '__dm__',
          result: { zone },
        }],
      });
      expect(useCoverStore.getState().zones).toEqual([zone]);
      await dispatch(p, 'action_result', {
        sequence_id: 46,
        applied: [{
          action_type: 'remove_cover_zone',
          actor_id: '__dm__',
          result: { zone_id: 'z1' },
        }],
      });

      expect(useCoverStore.getState().zones).toEqual([]);
    });

    it('ACTION_REJECTED reverts the optimistic sprite action by sequence id', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('sprite-action-rejected', handler);

      await dispatch(p, 'action_rejected', { sequence_id: 43, reason: 'Not your turn' });

      window.removeEventListener('sprite-action-rejected', handler);
      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
        actionId: '43',
        reason: 'Not your turn',
      });
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

    it('TABLE_SETTINGS_CHANGED applies supported WASM render settings', async () => {
      const p = makeProtocol();
      await dispatch(p, 'table_settings_changed', {
        dynamic_lighting_enabled: true,
        fog_exploration_mode: 'all',
        ambient_light_level: 0.5,
        grid_cell_px: 72,
        grid_enabled: false,
        snap_to_grid: true,
        grid_color_hex: '#123456',
        background_color_hex: '#101820',
      });

      expect(mocks.runtime.setGridEnabled).toHaveBeenCalledWith(false);
      expect(mocks.runtime.setGridSnapping).toHaveBeenCalledWith(true);
      expect(mocks.runtime.setGridSize).toHaveBeenCalledWith(72);
      expect(mocks.renderEngine.set_background_color).toHaveBeenCalledWith('#101820');
      expect(mockSetGridColorHex).toHaveBeenCalledWith('#123456');
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

    it('keeps independent subscribers for the same message type', async () => {
      const p = makeProtocol();
      const first = vi.fn().mockResolvedValue(undefined);
      const second = vi.fn().mockResolvedValue(undefined);
      p.registerHandler('shared_type', first);
      p.registerHandler('shared_type', second);
      const raw = JSON.stringify({ type: 'shared_type', data: {}, version: '0.1', priority: 5 });

      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
      p.unregisterHandler('shared_type', first);
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(2);
    });
  });

  // ── connect() lifecycle ──────────────────────────────────────────────────

  describe('connect()', () => {
    function makeMockWs() {
      return {
        readyState: WebSocket.CONNECTING as number,
        send: vi.fn(),
        close: vi.fn(),
        onopen: null as (() => void) | null,
        onclose: null as ((e: Partial<CloseEvent>) => void) | null,
        onerror: null as ((e: Event) => void) | null,
        onmessage: null as ((e: MessageEvent) => void) | null,
      };
    }

    it('resolves when onopen fires and sets connectionAlive', async () => {
      const ws = makeMockWs();
      vi.stubGlobal('WebSocket', vi.fn(function() { return ws; }));
      const p = makeProtocol();
      const promise = p.connect();
      ws.onopen!();
      await promise;
      expect((p as unknown as Record<string, unknown>)['connectionAlive']).toBe(true);
      vi.unstubAllGlobals();
    });

    it('rejects when onerror fires', async () => {
      const ws = makeMockWs();
      vi.stubGlobal('WebSocket', vi.fn(function() { return ws; }));
      const p = makeProtocol();
      const promise = p.connect();
      ws.onerror!(new Event('error'));
      await expect(promise).rejects.toThrow();
      vi.unstubAllGlobals();
    });

    it('rejects with "Kicked from session" on close code 1008', async () => {
      const ws = makeMockWs();
      vi.stubGlobal('WebSocket', vi.fn(function() { return ws; }));
      const p = makeProtocol();
      const promise = p.connect();
      ws.onclose!({ code: 1008, reason: 'Kicked from session', wasClean: false });
      await expect(promise).rejects.toThrow('Kicked from session');
      vi.unstubAllGlobals();
    });

    it('rejects when already connecting', async () => {
      const ws = makeMockWs();
      vi.stubGlobal('WebSocket', vi.fn(function() { return ws; }));
      const p = makeProtocol();
      p.connect(); // first call — keeps connecting
      await expect(p.connect()).rejects.toThrow('Already connecting');
      vi.unstubAllGlobals();
    });

    it('routes incoming messages to handlers via onmessage', async () => {
      const ws = makeMockWs();
      vi.stubGlobal('WebSocket', vi.fn(function() { return ws; }));
      const p = makeProtocol();
      const connectPromise = p.connect();
      ws.onopen!();
      await connectPromise;

      const handler = vi.fn();
      window.addEventListener('player-joined', handler);
      ws.onmessage!({ data: JSON.stringify({ type: 'player_joined', data: { user_id: 1 }, version: '0.1', priority: 5 }) } as MessageEvent);
      window.removeEventListener('player-joined', handler);
      // Give async handler a tick
      await new Promise(r => setTimeout(r, 0));
      expect(handler).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  // ── startPing / stopPing ─────────────────────────────────────────────────

  describe('startPing / stopPing', () => {
    it('startPing queues PING message after interval', () => {
      vi.useFakeTimers();
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.startPing();
      vi.advanceTimersByTime(30001);
      // PING is queued (non-critical), flush the batch to send
      p.sendBatch();
      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      // sendBatch wraps in a batch message
      expect(['ping', 'batch']).toContain(sent.type);
      p.stopPing();
    });

    it('startPing is idempotent (second call is no-op)', () => {
      vi.useFakeTimers();
      const p = makeProtocol();
      makeOpenWs(p);
      p.startPing();
      p.startPing(); // should not create a second interval
      expect(p.isPingEnabled()).toBe(true);
      p.stopPing();
    });

    it('stopPing disables ping and clears interval', () => {
      vi.useFakeTimers();
      const p = makeProtocol();
      makeOpenWs(p);
      p.startPing();
      p.stopPing();
      expect(p.isPingEnabled()).toBe(false);
    });
  });

  // ── flushMessageQueue ────────────────────────────────────────────────────

  describe('flushMessageQueue', () => {
    it('sends queued critical messages when ws becomes OPEN', () => {
      const p = makeProtocol();
      const closedWs = { readyState: WebSocket.CLOSED, send: vi.fn(), close: vi.fn() };
      (p as unknown as Record<string, unknown>)['websocket'] = closedWs;
      p.sendMessage({ type: 'sprite_create', data: {}, version: '0.1', priority: 2 });
      // Now open the connection
      const openWs = { readyState: WebSocket.OPEN, send: vi.fn(), close: vi.fn() };
      (p as unknown as Record<string, unknown>)['websocket'] = openWs;
      (p as unknown as Record<string, () => void>)['flushMessageQueue']();
      expect(openWs.send).toHaveBeenCalledOnce();
    });
  });

  // ── Remaining simple event-dispatch handlers ─────────────────────────────

  describe('more incoming handlers', () => {
    async function dispatch(p: WebClientProtocol, type: string, data: Record<string, unknown>) {
      const raw = JSON.stringify({ type, data, version: '0.1', priority: 5 });
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
    }

    it('AUTH_STATUS dispatches auth-status-changed', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('auth-status-changed', fn);
      await dispatch(p, 'auth_status', { authenticated: true });
      window.removeEventListener('auth-status-changed', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('PLAYER_ACTION_RESPONSE dispatches player-action-response', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('player-action-response', fn);
      await dispatch(p, 'player_action_response', { ok: true });
      window.removeEventListener('player-action-response', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('PLAYER_ACTION_UPDATE dispatches player-action-update', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('player-action-update', fn);
      await dispatch(p, 'player_action_update', {});
      window.removeEventListener('player-action-update', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('PLAYER_STATUS dispatches player-status-changed', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('player-status-changed', fn);
      await dispatch(p, 'player_status', { status: 'online' });
      window.removeEventListener('player-status-changed', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('PLAYER_KICK_RESPONSE dispatches player-kick-response', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('player-kick-response', fn);
      await dispatch(p, 'player_kick_response', { success: true });
      window.removeEventListener('player-kick-response', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('PLAYER_BAN_RESPONSE dispatches player-ban-response', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('player-ban-response', fn);
      await dispatch(p, 'player_ban_response', { success: true });
      window.removeEventListener('player-ban-response', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('CONNECTION_STATUS_RESPONSE dispatches connection-status-response', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('connection-status-response', fn);
      await dispatch(p, 'connection_status_response', {});
      window.removeEventListener('connection-status-response', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('TABLE_DATA dispatches table-data-received', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('table-data-received', fn);
      await dispatch(p, 'table_data', { table_id: 't1' });
      window.removeEventListener('table-data-received', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('NEW_TABLE_RESPONSE dispatches new-table-response', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('new-table-response', fn);
      await dispatch(p, 'new_table_response', { table_id: 'new-t1' });
      window.removeEventListener('new-table-response', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('TABLE_ACTIVE_SET_ALL_RESPONSE dispatches table-force-switch when table_id present', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('table-force-switch', fn);
      await dispatch(p, 'table_active_set_all_response', { table_id: 't2', table_name: 'Arena' });
      window.removeEventListener('table-force-switch', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('SPRITE_UPDATE dispatches sprite-updated', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('sprite-updated', fn);
      await dispatch(p, 'sprite_update', { sprite_id: 's1' });
      window.removeEventListener('sprite-updated', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('SPRITE_MOVE dispatches sprite-moved', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('sprite-moved', fn);
      await dispatch(p, 'sprite_move', { sprite_id: 's1', to: { x: 1, y: 2 } });
      window.removeEventListener('sprite-moved', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('SPRITE_MOVE with action_id dispatches sprite-action-confirmed', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('sprite-action-confirmed', fn);
      await dispatch(p, 'sprite_move', { action_id: 'act-1', sprite_id: 's1' });
      window.removeEventListener('sprite-action-confirmed', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('SPRITE_SCALE dispatches sprite-scaled', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('sprite-scaled', fn);
      await dispatch(p, 'sprite_scale', { sprite_id: 's1' });
      window.removeEventListener('sprite-scaled', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('SPRITE_ROTATE dispatches sprite-rotated', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('sprite-rotated', fn);
      await dispatch(p, 'sprite_rotate', { sprite_id: 's1', rotation: 45 });
      window.removeEventListener('sprite-rotated', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('SPRITE_RESPONSE dispatches sprite-response', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('sprite-response', fn);
      await dispatch(p, 'sprite_response', { sprite_id: 's1' });
      window.removeEventListener('sprite-response', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('SPRITE_RESPONSE with action_id+success dispatches sprite-action-confirmed', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('sprite-action-confirmed', fn);
      await dispatch(p, 'sprite_response', { action_id: 'act-2', success: true });
      window.removeEventListener('sprite-action-confirmed', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('SPRITE_DATA dispatches sprite-data-received', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('sprite-data-received', fn);
      await dispatch(p, 'sprite_data', { sprite_id: 's1' });
      window.removeEventListener('sprite-data-received', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('SPRITE_DRAG_PREVIEW dispatches sprite-drag-preview-remote', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('sprite-drag-preview-remote', fn);
      await dispatch(p, 'sprite_drag_preview', { sprite_id: 's1' });
      window.removeEventListener('sprite-drag-preview-remote', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('FILE_DATA dispatches file-data-received', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('file-data-received', fn);
      await dispatch(p, 'file_data', { file_id: 'f1' });
      window.removeEventListener('file-data-received', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('ASSET_UPLOAD_RESPONSE dispatches asset-uploaded', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('asset-uploaded', fn);
      await dispatch(p, 'asset_upload_response', { asset_id: 'a1' });
      window.removeEventListener('asset-uploaded', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('ASSET_DELETE_RESPONSE dispatches asset-delete-response', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('asset-delete-response', fn);
      await dispatch(p, 'asset_delete_response', { asset_id: 'a1' });
      window.removeEventListener('asset-delete-response', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('ASSET_HASH_CHECK dispatches asset-hash-check', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('asset-hash-check', fn);
      await dispatch(p, 'asset_hash_check', { asset_id: 'a1' });
      window.removeEventListener('asset-hash-check', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('ASSET_DOWNLOAD_RESPONSE dispatches asset-downloaded', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('asset-downloaded', fn);
      await dispatch(p, 'asset_download_response', { id: 'a1', name: 'img.png', url: 'http://x.com/img.png' });
      window.removeEventListener('asset-downloaded', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('ASSET_LIST_RESPONSE dispatches asset-list-updated', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('asset-list-updated', fn);
      await dispatch(p, 'asset_list_response', { assets: [] });
      window.removeEventListener('asset-list-updated', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('CHARACTER_LOG_RESPONSE dispatches character-log-response', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('character-log-response', fn);
      await dispatch(p, 'character_log_response', { entries: [] });
      window.removeEventListener('character-log-response', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('CHARACTER_ROLL_RESULT dispatches character-roll-result', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('character-roll-result', fn);
      await dispatch(p, 'character_roll_result', { roll: 15 });
      window.removeEventListener('character-roll-result', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('XP_AWARD_RESPONSE applies the canonical character and version', async () => {
      const store = mocks.storeState as Record<string, unknown>;
      const updateCharacter = vi.fn();
      store.updateCharacter = updateCharacter;
      store.characters = [{ id: 'c-xp', data: {} }];
      const p = makeProtocol();

      await dispatch(p, 'xp_award_response', {
        success: true,
        character_id: 'c-xp',
        version: 6,
        character_data: { name: 'Hero', data: { experience: 900, level: 3 } },
      });

      expect(updateCharacter).toHaveBeenCalledWith('c-xp', expect.objectContaining({
        name: 'Hero',
        data: { experience: 900, level: 3 },
        version: 6,
      }));
    });

    it('CHARACTER_DRAFT_FINALIZE_RESPONSE stores the character and exposes draft identity', async () => {
      const store = mocks.storeState as Record<string, unknown>;
      const addCharacter = vi.fn();
      store.addCharacter = addCharacter;
      const p = makeProtocol('ROOM', 7);
      const fn = vi.fn();
      window.addEventListener('character-draft-finalized', fn);

      await dispatch(p, 'character_draft_finalize_response', {
        success: true,
        draft_id: 'draft-1',
        character_id: 'char-1',
        version: 1,
        character_data: { name: 'Aria', data: { class: 'wizard' } },
      });

      window.removeEventListener('character-draft-finalized', fn);
      expect(addCharacter).toHaveBeenCalledWith(expect.objectContaining({
        id: 'char-1', name: 'Aria', ownerId: 7,
      }));
      expect((fn.mock.calls[0][0] as CustomEvent).detail.draft_id).toBe('draft-1');
    });

    it('TABLE_ACTIVE_RESPONSE sets activeTableId on success', async () => {
      const p = makeProtocol();
      await dispatch(p, 'table_active_response', { success: true, table_id: 'tbl-active' });
      expect(mockSetActiveTableId).toHaveBeenCalledWith('tbl-active');
    });

    it('TABLE_ACTIVE_RESPONSE dispatches active-table-response', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('active-table-response', fn);
      await dispatch(p, 'table_active_response', { success: false, error: 'no active table' });
      window.removeEventListener('active-table-response', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('CHARACTER_LOAD_RESPONSE dispatches character-loaded', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('character-loaded', fn);
      await dispatch(p, 'character_load_response', { character_id: 'c1', name: 'Hero' });
      window.removeEventListener('character-loaded', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('CHARACTER_DELETE_RESPONSE success removes character from store', async () => {
      const store = mocks.storeState as Record<string, unknown>;
      const removeCharacter = vi.fn();
      store.removeCharacter = removeCharacter;
      const p = makeProtocol();
      await dispatch(p, 'character_delete_response', { success: true, character_id: 'c2' });
      expect(removeCharacter).toHaveBeenCalledWith('c2');
    });

    it('CHARACTER_UPDATE delete operation removes character from store', async () => {
      const store = mocks.storeState as Record<string, unknown>;
      const removeCharacter = vi.fn();
      store.removeCharacter = removeCharacter;
      const p = makeProtocol();
      await dispatch(p, 'character_update', { operation: 'delete', character_id: 'c3' });
      expect(removeCharacter).toHaveBeenCalledWith('c3');
    });

    it('CHARACTER_UPDATE delta path calls store.updateCharacter', async () => {
      const store = mocks.storeState as Record<string, unknown>;
      const updateCharacter = vi.fn();
      store.updateCharacter = updateCharacter;
      const p = makeProtocol();
      await dispatch(p, 'character_update', { character_id: 'c4', updates: { hp: 20 } });
      expect(updateCharacter).toHaveBeenCalledWith('c4', expect.objectContaining({ hp: 20 }));
    });

    it('CHARACTER_UPDATE_RESPONSE success updates sync status', async () => {
      const store = mocks.storeState as Record<string, unknown>;
      const updateCharacter = vi.fn();
      store.updateCharacter = updateCharacter;
      const p = makeProtocol();
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c5', version: 3 });
      expect(updateCharacter).toHaveBeenCalledWith('c5', expect.objectContaining({ syncStatus: 'synced', version: 3 }));
    });

    it('CHARACTER_UPDATE_RESPONSE failure marks character as error', async () => {
      const store = mocks.storeState as Record<string, unknown>;
      const updateCharacter = vi.fn();
      store.updateCharacter = updateCharacter;
      store.characters = [{ id: 'c6', syncStatus: 'syncing' }];
      const p = makeProtocol();
      await dispatch(p, 'character_update_response', { success: false, character_id: 'c6', error: 'Some error' });
      expect(updateCharacter).toHaveBeenCalledWith('c6', expect.objectContaining({ syncStatus: 'error' }));
    });

    it('LAYER_SETTINGS_UPDATE applies layer settings via applyLayerSettings', async () => {
      mocks.runtime.applyLayerSettings.mockClear();
      const p = makeProtocol();
      await dispatch(p, 'layer_settings_update', { layer: 'tokens', settings: { opacity: 0.5 } });
      expect(mocks.runtime.applyLayerSettings).toHaveBeenCalledWith({ tokens: { opacity: 0.5 } });
    });

    it('ERROR with action_id dispatches sprite-action-rejected', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('sprite-action-rejected', fn);
      await dispatch(p, 'error', { action_id: 'act-x', message: 'rejected' });
      window.removeEventListener('sprite-action-rejected', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('SUCCESS with delete message dispatches table-deleted', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('table-deleted', fn);
      await dispatch(p, 'success', { message: 'Table deleted successfully', table_id: 't1' });
      window.removeEventListener('table-deleted', fn);
      expect(fn).toHaveBeenCalledOnce();
    });
  });

  // ── More outgoing request methods ────────────────────────────────────────

  describe('outgoing requests', () => {
    it('createSprite sends sprite_create with sprite_data', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.createSprite({ name: 'Goblin', table_id: 'table-abc' });
      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('sprite_create');
      expect(msg.data.table_id).toBe('table-abc');
    });

    it('createSprite skips when no table_id available', () => {
      Object.assign(mocks.storeState, makeStoreState({ activeTableId: null }));
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.createSprite({ name: 'Goblin' });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('moveSprite queues sprite_move message', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.moveSprite('s1', 10, 20);
      p.sendBatch();
      const batch = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('sprite_move');
      expect(inner.data.sprite_id).toBe('s1');
    });

    it('removeSprite sends sprite_remove', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.removeSprite('s2');
      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('sprite_remove');
      expect(msg.data.sprite_id).toBe('s2');
    });

    it('scaleSprite queues sprite_scale', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.scaleSprite('s3', 2.0, 2.0);
      p.sendBatch();
      const batch = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('sprite_scale');
      expect(inner.data).toMatchObject({
        sprite_id: 's3',
        table_id: 'table-abc',
        width: 2.0,
        height: 2.0,
      });
      expect(inner.data.scale_x).toBeUndefined();
      expect(inner.data.scale_y).toBeUndefined();
    });

    it('kickPlayer sends player_kick_request', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.kickPlayer('player-1');
      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('player_kick_request');
      expect(msg.data.player_id).toBe('player-1');
    });

    it('banPlayer sends player_ban_request', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.banPlayer('player-2');
      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('player_ban_request');
    });

    it('updateCharacter queues character_update', () => {
      const p = makeProtocol('S', 1);
      const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 30 }, 2);
      p.sendBatch();
      const batch = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('character_update');
      expect(inner.data.character_id).toBe('c1');
      expect(inner.data.version).toBe(2);
    });

    it('updateCharacter skips when userId is null', () => {
      const p = new WebClientProtocol('S');
      const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('requestCharacterList sends character_list_request', () => {
      const p = makeProtocol('S', 5);
      const ws = makeOpenWs(p);
      p.requestCharacterList();
      p.sendBatch();
      const batch = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('character_list_request');
    });

    it('deleteCharacter sends character_delete_request', () => {
      const p = makeProtocol('S', 3);
      const ws = makeOpenWs(p);
      p.deleteCharacter('c-del');
      p.sendBatch();
      const batch = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('character_delete_request');
      expect(inner.data.character_id).toBe('c-del');
    });

    it('requestAssetList sends asset_list_request', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.requestAssetList();
      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('asset_list_request');
    });

    it('deleteAsset sends asset_delete_request', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.deleteAsset('asset-xyz');
      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('asset_delete_request');
      expect(msg.data.asset_id).toBe('asset-xyz');
    });

    it('setPlayerReady queues player_ready', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.setPlayerReady();
      p.sendBatch();
      const batch = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('player_ready');
    });

    it('setPlayerUnready queues player_unready', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.setPlayerUnready();
      p.sendBatch();
      const batch = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('player_unready');
    });

    it('sendDelta queues a delta message', () => {
      const p = makeProtocol();
      makeOpenWs(p);
      p.sendDelta('sprite_move', 's1', { x: 5, y: 10 });
      const q = (p as unknown as Record<string, unknown>)['batchQueue'] as { type: string; data: Record<string, unknown> }[];
      expect(q.length).toBe(1);
      expect(q[0].data).toEqual({ id: 's1', changes: { x: 5, y: 10 } });
    });
  });

  // ── Paint protocol ────────────────────────────────────────────────────────

  describe('paint incoming handlers', () => {
    async function dispatch(p: WebClientProtocol, type: string, data: Record<string, unknown>) {
      const raw = JSON.stringify({ type, data, version: '0.1', priority: 5 });
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
    }

    function makeRm() {
      mocks.runtime.addRemotePaintStroke.mockClear();
      mocks.runtime.removePaintStroke.mockClear();
      mocks.runtime.clearPaintStrokes.mockClear();
      mocks.runtime.loadPaintStrokes.mockClear();
      return mocks.runtime;
    }

    it('PAINT_STROKE_CREATE calls paint_add_remote_stroke with stroke_data', async () => {
      const p = makeProtocol();
      const rm = makeRm();
      const strokeData = JSON.stringify({ id: 's1', points: [], color: [1, 0, 0, 1], width: 3 });
      await dispatch(p, 'paint_stroke_create', {
        stroke: { stroke_id: 's1', created_by: 99, stroke_data: strokeData },
        table_id: 'tbl1',
      });
      expect(rm.addRemotePaintStroke).toHaveBeenCalledWith(strokeData);
    });

    it('PAINT_STROKE_CREATE skips own stroke (created_by === userId)', async () => {
      const p = makeProtocol('TEST', 1); // userId = 1
      const rm = makeRm();
      const strokeData = JSON.stringify({ id: 's2', points: [], color: [1, 0, 0, 1], width: 3 });
      await dispatch(p, 'paint_stroke_create', {
        stroke: { stroke_id: 's2', created_by: 1, stroke_data: strokeData },
        table_id: 'tbl1',
      });
      expect(rm.addRemotePaintStroke).not.toHaveBeenCalled();
    });

    it('PAINT_STROKE_CREATE dispatches paint-stroke-created event', async () => {
      const p = makeProtocol();
      makeRm();
      const fn = vi.fn();
      window.addEventListener('paint-stroke-created', fn);
      const strokeData = JSON.stringify({ id: 's3', points: [], color: [1, 0, 0, 1], width: 3 });
      await dispatch(p, 'paint_stroke_create', {
        stroke: { stroke_id: 's3', created_by: 99, stroke_data: strokeData },
        table_id: 'tbl1',
      });
      window.removeEventListener('paint-stroke-created', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('PAINT_STROKE_DELETE calls paint_remove_stroke', async () => {
      const p = makeProtocol();
      const rm = makeRm();
      await dispatch(p, 'paint_stroke_delete', { stroke_id: 'stroke-xyz', table_id: 'tbl1' });
      expect(rm.removePaintStroke).toHaveBeenCalledWith('stroke-xyz');
    });

    it('PAINT_STROKE_DELETE dispatches paint-stroke-deleted event', async () => {
      const p = makeProtocol();
      makeRm();
      const fn = vi.fn();
      window.addEventListener('paint-stroke-deleted', fn);
      await dispatch(p, 'paint_stroke_delete', { stroke_id: 'stroke-xyz', table_id: 'tbl1' });
      window.removeEventListener('paint-stroke-deleted', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('PAINT_STROKE_CLEAR calls paint_clear_all', async () => {
      const p = makeProtocol();
      const rm = makeRm();
      await dispatch(p, 'paint_stroke_clear', { table_id: 'tbl1' });
      expect(rm.clearPaintStrokes).toHaveBeenCalled();
    });

    it('PAINT_STROKE_CLEAR dispatches paint-strokes-cleared event', async () => {
      const p = makeProtocol();
      makeRm();
      const fn = vi.fn();
      window.addEventListener('paint-strokes-cleared', fn);
      await dispatch(p, 'paint_stroke_clear', { table_id: 'tbl1' });
      window.removeEventListener('paint-strokes-cleared', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('PAINT_SYNC extracts DrawStroke from stroke_data and calls paint_load_strokes', async () => {
      const p = makeProtocol();
      const rm = makeRm();
      const ds = { id: 'ds1', points: [], color: [1, 0, 0, 1], width: 3, blend_mode: 'alpha' };
      await dispatch(p, 'paint_sync', {
        strokes: [
          { stroke_id: 'ds1', stroke_data: JSON.stringify(ds) },
        ],
      });
      expect(rm.loadPaintStrokes).toHaveBeenCalledWith(JSON.stringify([ds]));
    });
  });

  describe('paint outgoing methods', () => {
    it('createPaintStroke sends PAINT_STROKE_CREATE message', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.createPaintStroke('stroke-1', '{"points":[]}');
      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(sent.type).toBe('paint_stroke_create');
      expect(sent.data.stroke_id).toBe('stroke-1');
    });

    it('deletePaintStroke sends PAINT_STROKE_DELETE message', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.deletePaintStroke('stroke-2');
      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(sent.type).toBe('paint_stroke_delete');
      expect(sent.data.stroke_id).toBe('stroke-2');
    });

    it('clearPaintStrokes sends PAINT_STROKE_CLEAR message', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.clearPaintStrokes();
      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(sent.type).toBe('paint_stroke_clear');
    });
  });
});

