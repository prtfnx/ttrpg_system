import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// vi.hoisted runs before module imports — these refs are usable in vi.mock factories
const mocks = vi.hoisted(() => {
  const storeState: Record<string, unknown> = {};
  const getState = vi.fn(() => storeState);
  const setState = vi.fn((partial: Record<string, unknown> | ((state: Record<string, unknown>) => Record<string, unknown>)) => {
    Object.assign(storeState, typeof partial === 'function' ? partial(storeState) : partial);
  });
  const renderEngine = {
    set_background_color: vi.fn(),
  };
  const useGameStore = Object.assign(
    (selector?: (s: unknown) => unknown) => {
      const s = getState();
      return typeof selector === 'function' ? selector(s) : s;
    },
    { getState, setState }
  );
  const runtime = {
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
import { createMessage, MessageType, type Message } from '../message';
import { useCombatStore } from '@features/combat/stores/combatStore';
import { useCoverStore } from '@features/combat/stores/coverStore';
import { useEncounterStore } from '@features/combat/stores/encounterStore';
import { V2_RECOVERY_DOMAINS } from '../operationRecovery';

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
    updateWall: mockUpdateWall,
    removeWall: mockRemoveWall,
    setActiveTableId: mockSetActiveTableId,
    addCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    reconcileServerCharacters: vi.fn(),
    removeCharacter: vi.fn(),
    ...overrides,
  };
}

function makeProtocol(sessionCode = 'TEST123', userId = 1) {
  return new WebClientProtocol(sessionCode, userId);
}

function makeOpenWs(protocol: WebClientProtocol) {
  const ws: {
    readyState: number;
    bufferedAmount: number;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  } = {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
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
  it('retains typed unknown canvas receipts in tracking until causal acceptance', async () => {
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    const tableId = '550e8400-e29b-41d4-a716-446655440000';
    const operationId = crypto.randomUUID();
    const outcomes = vi.fn(); window.addEventListener('canvas-command-result', outcomes);
    const receive = async (message: Message) => {
      await (protocol as unknown as { handleIncomingMessage(raw: string): Promise<void> })
        .handleIncomingMessage(JSON.stringify(message));
    };
    try {
      expect(protocol.sendCanvasCommand({ table_id: tableId, operation_id: operationId,
        issued_at: Date.now(), mode: 'undo' })).toBe(true);
      protocol.sendBatch();
      const sent = ws.send.mock.calls.flatMap(call => {
        const frame = JSON.parse(call[0]); return frame.type === MessageType.BATCH_REQUEST ? frame.data.messages : [frame];
      }).find(message => message.type === MessageType.CANVAS_COMMAND);
      const tracker = (protocol as unknown as { commandTracking: { watermark(id: string): string[] } }).commandTracking;
      await receive({ ...createMessage(MessageType.CANVAS_COMMAND_RESULT, { success: false,
        operation_id: operationId, table_id: tableId, code: 'outcome_unknown', error: 'Checking', resync_required: true }),
        causation_id: sent.message_id });
      expect(tracker.watermark(tableId)).toContain(sent.message_id);
      await receive({ ...createMessage(MessageType.CANVAS_COMMAND_RESULT, { success: false,
        operation_id: operationId, table_id: tableId, code: 'forbidden', error: 'Current authority required', resync_required: true }),
        causation_id: sent.message_id });
      expect(tracker.watermark(tableId)).toContain(sent.message_id);
      await receive({ ...createMessage(MessageType.CANVAS_COMMAND_RESULT, { success: true,
        operation_id: operationId, table_id: tableId, selection: [], can_undo: false, can_redo: true, resync_required: true }),
        causation_id: sent.message_id });
      expect(tracker.watermark(tableId)).not.toContain(sent.message_id);
      expect(outcomes).toHaveBeenCalledTimes(3);
    } finally { window.removeEventListener('canvas-command-result', outcomes); protocol.disconnect(); }
  });
  it('retains an unknown sprite action and probes current state once without rejecting or replaying it', async () => {
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    const rejected = vi.fn(), settled = vi.fn();
    window.addEventListener('sprite-action-rejected', rejected);
    window.addEventListener('optimistic-sprite-settled', settled);
    const original = createMessage(MessageType.SPRITE_ROTATE, {
      table_id: 'table-abc', sprite_id: 'token', rotation: 30, action_id: 'rotate-original' });
    const receive = async (message: Message) => {
      await (protocol as unknown as { handleIncomingMessage(raw: string): Promise<void> })
        .handleIncomingMessage(JSON.stringify(message));
    };
    try {
      protocol.sendMessage(original); protocol.sendBatch(); ws.send.mockClear();
      for (let i = 0; i < 2; i++) await receive({ ...createMessage(MessageType.ERROR, {
        code: 'outcome_unknown', outcome: 'unknown', error: 'Checking sprite save', resync_required: true,
        operation_id: original.message_id, table_id: 'table-abc', action_id: 'rotate-original',
      }), causation_id: original.message_id });
      protocol.sendBatch();
      expect(rejected).not.toHaveBeenCalled(); expect(settled).not.toHaveBeenCalled();
      const frames = ws.send.mock.calls.map(call => JSON.parse(call[0]));
      expect(frames).toHaveLength(1); expect(frames[0].type).toBe(MessageType.TABLE_REQUEST);
      const tracker = (protocol as unknown as { commandTracking: { watermark(id: string): string[] } }).commandTracking;
      expect(tracker.watermark('table-abc')).toContain(original.message_id);
      await receive({ ...createMessage(MessageType.SPRITE_RESPONSE, {
        table_id: 'table-abc', success: true, resync_required: true, action_id: 'rotate-original',
      }), causation_id: original.message_id });
      expect(tracker.watermark('table-abc')).not.toContain(original.message_id);
      expect(rejected).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('sprite-action-rejected', rejected);
      window.removeEventListener('optimistic-sprite-settled', settled);
      protocol.disconnect();
    }
  });

  it('releases a sprite action on a proven rollback after uncertainty', async () => {
    const protocol = makeProtocol(); makeOpenWs(protocol);
    const rejected = vi.fn(); window.addEventListener('sprite-action-rejected', rejected);
    const original = createMessage(MessageType.SPRITE_ROTATE, {
      table_id: 'table-abc', sprite_id: 'token', rotation: 30, action_id: 'rotate-original' });
    const receive = async (data: Record<string, unknown>) => {
      await (protocol as unknown as { handleIncomingMessage(raw: string): Promise<void> })
        .handleIncomingMessage(JSON.stringify({ ...createMessage(MessageType.ERROR, data), causation_id: original.message_id }));
    };
    try {
      protocol.sendMessage(original); protocol.sendBatch();
      await receive({ code: 'outcome_unknown', outcome: 'unknown', error: 'Checking',
        operation_id: original.message_id, table_id: 'table-abc', action_id: 'rotate-original' });
      expect(rejected).not.toHaveBeenCalled();
      await receive({ code: 'persistence_failed', error: 'Not saved', not_accepted: true,
        operation_id: original.message_id, table_id: 'table-abc', action_id: 'rotate-original', resync_required: true });
      expect(rejected).toHaveBeenCalledOnce();
      const tracker = (protocol as unknown as { commandTracking: { watermark(id: string): string[] } }).commandTracking;
      expect(tracker.watermark('table-abc')).not.toContain(original.message_id);
    } finally { window.removeEventListener('sprite-action-rejected', rejected); protocol.disconnect(); }
  });
  it('fences the committed preview gesture without delaying the next gesture', () => {
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    const preview = (sequence: number) => createMessage(MessageType.SPRITE_DRAG_PREVIEW,
      { id: 'sprite', table_id: 'table-abc', x: 1, y: 2, sequence });
    try {
      const first = preview(1); protocol.sendMessage(first);
      const last = preview(2); protocol.sendMessage(last);
      const commit = createMessage(MessageType.SPRITE_MOVE, { table_id: 'table-abc', sprite_id: 'sprite',
        from: { x: 0, y: 0 }, to: { x: 1, y: 2 } });
      protocol.sendMessage(commit);
      const next = preview(3); protocol.sendMessage(next); protocol.sendBatch();
      expect(first.data?.preview_id).toBe(last.data?.preview_id);
      expect(commit.data?.preview_id).toBe(last.data?.preview_id);
      expect(next.data?.preview_id).not.toBe(commit.data?.preview_id);
      expect(next.data?.ttl_ms).toBe(1500);
      expect(ws.send).toHaveBeenCalled();
    } finally { protocol.disconnect(); }
  });
  it('allows recovery progress but never extends its sixty-second hard deadline', () => {
    vi.useFakeTimers();
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    try {
      protocol.resynchronizeTable('table-abc');
      for (let index = 0; index < 6; index++) {
        vi.advanceTimersByTime(9000);
        window.dispatchEvent(new CustomEvent('table-recovery-progress', { detail: { tableId: 'table-abc' } }));
        expect(ws.close).not.toHaveBeenCalled();
      }
      vi.advanceTimersByTime(6000);
      expect(ws.close).toHaveBeenCalledWith(4000, 'Table synchronization timed out');
    } finally { protocol.disconnect(); }
  });

  it('sends the table recovery request before paint requested by recovery listeners', () => {
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    const paint = () => protocol.requestPaintSnapshot('table-abc', crypto.randomUUID());
    window.addEventListener('table-resync-started', paint);
    try {
      protocol.resynchronizeTable('table-abc');
      expect(JSON.parse(ws.send.mock.calls[0][0]).type).toBe('table_request');
      expect(JSON.parse(ws.send.mock.calls[1][0]).type).toBe('paint_snapshot_request');
    } finally { window.removeEventListener('table-resync-started', paint); protocol.disconnect(); }
  });

  it('defers provisional-wall commands and remaps them after creation confirmation', async () => {
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    try {
      protocol.createWall({ x1: 0, y1: 0, x2: 10, y2: 10 }); protocol.sendBatch();
      const create = JSON.parse(ws.send.mock.calls[0][0]).data.messages[0];
      await Promise.resolve();
      protocol.removeWall(create.message_id); await Promise.resolve(); protocol.sendBatch();
      expect(ws.send).toHaveBeenCalledOnce();
      await (protocol as unknown as { handleIncomingMessage(raw: string): Promise<void> }).handleIncomingMessage(JSON.stringify({
        ...createMessage(MessageType.WALL_DATA, { operation: 'create', table_id: 'table-abc', wall: {
          wall_id: 'server-wall', table_id: 'table-abc', x1: 0, y1: 0, x2: 10, y2: 10,
          wall_type: 'normal', blocks_movement: true, blocks_light: true, blocks_sight: true,
          blocks_sound: false, is_door: false, door_state: 'closed', is_secret: false,
          direction: 'both', created_by: 1 } }), causation_id: create.message_id,
      }));
      protocol.sendBatch();
      const remove = JSON.parse(ws.send.mock.calls[1][0]).data.messages[0];
      expect(remove.type).toBe('wall_remove');
      expect(remove.data.wall_id).toBe('server-wall');
    } finally { protocol.disconnect(); }
  });

  it('settles a recovered create by receipt and reloads current walls without sending queued provisional edits', async () => {
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    try {
      const requestId = protocol.createWall({ x1: 0, y1: 0, x2: 10, y2: 10 }, 'original-wall');
      expect(requestId).toBe('original-wall');
      protocol.sendBatch(); await Promise.resolve();
      protocol.removeWall(requestId!); await Promise.resolve();
      await (protocol as unknown as { handleIncomingMessage(raw: string): Promise<void> }).handleIncomingMessage(JSON.stringify({
        ...createMessage(MessageType.SUCCESS, { success: true, domain: 'wall_command', command: 'wall_create',
          operation_id: requestId, wall_id: 'server-wall', table_id: 'table-abc', replayed: true, resync_required: true }),
        causation_id: requestId,
      }));
      protocol.sendBatch();
      expect(ws.send.mock.calls.map(([raw]) => JSON.parse(raw).type)).toEqual(['batch_request', 'table_request']);
      expect(mockRemoveWall).toHaveBeenCalledWith(requestId);
      expect(mockAddWall.mock.calls.some(([row]) => row.wall_id === 'server-wall')).toBe(false);
      const tracker = (protocol as unknown as { commandTracking: { watermark(id: string): string[] } }).commandTracking;
      expect(tracker.watermark('table-abc')).toEqual([]);
    } finally { protocol.disconnect(); }
  });

  it('retires a table deleted after an accepted wall command without requesting its old scene', async () => {
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    try {
      const id = protocol.toggleDoor('door'); protocol.sendBatch(); await Promise.resolve();
      await (protocol as unknown as { handleIncomingMessage(raw: string): Promise<void> }).handleIncomingMessage(JSON.stringify({
        ...createMessage(MessageType.SUCCESS, { success: true, domain: 'wall_command', table_id: 'table-abc',
          table_deleted: true, resync_required: true }), causation_id: id,
      }));
      expect(mocks.storeState.activeTableId).toBeNull();
      expect(ws.send).toHaveBeenCalledOnce();
    } finally { protocol.disconnect(); }
  });

  it('keeps an unknown wall command pending until its original receipt arrives', async () => {
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    try {
      const id = protocol.toggleDoor('door', 'original-toggle');
      protocol.sendBatch(); await Promise.resolve();
      const receive = (message: Message) => (protocol as unknown as { handleIncomingMessage(raw: string): Promise<void> })
        .handleIncomingMessage(JSON.stringify({ ...message, causation_id: id }));
      await receive(createMessage(MessageType.ERROR, { code: 'outcome_unknown', outcome: 'unknown',
        table_id: 'table-abc', error: 'Checking wall save', resync_required: true }));
      const tracker = (protocol as unknown as { commandTracking: { watermark(id: string): string[] } }).commandTracking;
      expect(tracker.watermark('table-abc')).toContain(id);
      await receive(createMessage(MessageType.SUCCESS, { success: true, domain: 'wall_command',
        command: 'door_toggle', operation_id: id, table_id: 'table-abc', wall_id: 'door', resync_required: true }));
      expect(tracker.watermark('table-abc')).not.toContain(id);
      expect(ws.send.mock.calls.flatMap(([raw]) => {
        const message = JSON.parse(raw); return message.data?.messages ?? [message];
      }).filter(message => message.type === 'door_toggle')).toHaveLength(1);
    } finally { protocol.disconnect(); }
  });

  it('preserves provisional dependents when explicitly retrying the original create identity', async () => {
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    try {
      const wall = { x1: 0, y1: 0, x2: 10, y2: 10 };
      protocol.createWall(wall, 'original-create'); protocol.sendBatch(); await Promise.resolve();
      protocol.removeWall('original-create'); await Promise.resolve();
      protocol.createWall(wall, 'original-create'); protocol.sendBatch(); await Promise.resolve();
      await (protocol as unknown as { handleIncomingMessage(raw: string): Promise<void> }).handleIncomingMessage(JSON.stringify({
        ...createMessage(MessageType.SUCCESS, { success: true, domain: 'wall_command', table_id: 'table-abc',
          operation_id: 'original-create', wall_id: 'server-wall', resync_required: true }), causation_id: 'original-create',
      }));
      protocol.sendBatch();
      const tracker = (protocol as unknown as { commandTracking: { watermark(id: string): string[] } }).commandTracking;
      expect(tracker.watermark('table-abc')).toEqual([]);
      expect(ws.send.mock.calls.flatMap(([raw]) => JSON.parse(raw).data?.messages ?? [])
        .map(message => message.type)).toEqual(['wall_create', 'wall_create']);
    } finally { protocol.disconnect(); }
  });

  it('drops dependent provisional-wall edits when creation is denied', async () => {
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    try {
      protocol.createWall({ x1: 0, y1: 0, x2: 10, y2: 10 }); protocol.sendBatch();
      const create = JSON.parse(ws.send.mock.calls[0][0]).data.messages[0];
      await Promise.resolve();
      protocol.removeWall(create.message_id); await Promise.resolve();
      await (protocol as unknown as { handleIncomingMessage(raw: string): Promise<void> }).handleIncomingMessage(JSON.stringify({
        ...createMessage(MessageType.ERROR, { error: 'Denied' }), causation_id: create.message_id,
      }));
      protocol.sendBatch();
      expect(ws.send).toHaveBeenCalledOnce();
      const tracker = (protocol as unknown as { commandTracking: { watermark(id: string): string[] } }).commandTracking;
      expect(tracker.watermark('table-abc')).toEqual([]);
    } finally { protocol.disconnect(); }
  });
  it('retains a failed batch through authenticated reconnect and prevents a direct command overtaking it', async () => {
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    const setting = createMessage(MessageType.TABLE_SETTINGS_UPDATE, { table_id: 'table-abc', grid_cell_px: 80 });
    try {
      protocol.sendMessage(setting);
      ws.send.mockImplementationOnce(() => { throw new Error('transport'); });
      expect(protocol.sendMessage(createMessage(MessageType.TABLE_REQUEST, { table_id: 'table-abc' }))).toBe(false);
      expect(ws.send).toHaveBeenCalledOnce();
      expect(ws.close).toHaveBeenCalledWith(4000, 'Batch transmission failed');
      const replacement = makeOpenWs(protocol);
      protocol.flushPendingBatches();
      expect(replacement.send).not.toHaveBeenCalled();
      await (protocol as unknown as { handleIncomingMessage(raw: string): Promise<void> })
        .handleIncomingMessage(JSON.stringify(createMessage(MessageType.WELCOME, {
          message: 'Welcome', client_id: 'client', user_id: 1, username: 'Owner', session_code: 'TEST123',
          connection_id: null, tables: [], role: 'owner', permissions: [], visible_layers: [],
          game_mode: 'free_roam', session_rules: {}, choice_encounter: null,
        })));
      const members = JSON.parse(replacement.send.mock.calls[0][0]).data.messages;
      expect(members.map((item: Message) => item.message_id)).toEqual([setting.message_id]);
    } finally { protocol.disconnect(); }
  });

  it('cancels the old recovery watchdog before replacing its socket', () => {
    vi.useFakeTimers();
    const protocol = makeProtocol(); makeOpenWs(protocol);
    try {
      protocol.resynchronizeTable('table-abc');
      (protocol as unknown as { closeForReconnect(reason: string): void }).closeForReconnect('Test replacement');
      const replacement = makeOpenWs(protocol);
      vi.advanceTimersByTime(10_001);
      expect(replacement.close).not.toHaveBeenCalled();
    } finally { protocol.disconnect(); }
  });

  it('keeps a busy connection alive when command outcomes arrive before a delayed pong', async () => {
    vi.useFakeTimers();
    const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
    try {
      protocol.startPing(); vi.advanceTimersByTime(34_000);
      await (protocol as unknown as { handleIncomingMessage(raw: string): Promise<void> }).handleIncomingMessage(
        JSON.stringify(createMessage(MessageType.SUCCESS, { message: 'Committed' })));
      vi.advanceTimersByTime(1000);
      expect(ws.close).not.toHaveBeenCalled();
    } finally { protocol.disconnect(); }
  });
  it('resolves uncertainty only after the correlated snapshot hydrates', async () => {
    const protocol = makeProtocol();
    const ws = makeOpenWs(protocol);
    protocol.resynchronizeTable('table-abc');
    protocol.resynchronizeTable('table-abc');
    expect(ws.send).toHaveBeenCalledOnce();
    const request = JSON.parse(ws.send.mock.calls[0][0]);
    const completed = vi.fn();
    window.addEventListener('table-resync-completed', completed);
    try {
      const internal = protocol as unknown as { handleTableResponse: (message: unknown) => Promise<void> };
      await internal.handleTableResponse({ type: 'table_response', data: { table_data: { table_id: 'table-abc' } },
        causation_id: request.message_id });
      expect(completed).not.toHaveBeenCalled();
      window.dispatchEvent(new CustomEvent('table-sprites-loaded', { detail: { table_id: 'table-abc', count: 0 } }));
      expect(completed).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('table-resync-completed', completed);
      protocol.disconnect();
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.storeState, makeStoreState());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

    it('exposes bounded transport diagnostics without message content', () => {
      const p = makeProtocol();
      const diagnostics = p.getConnectionDiagnostics();

      expect(diagnostics).toMatchObject({
        instanceId: expect.stringMatching(/^protocol-/),
        sessionCode: 'TEST123',
        state: 'disconnected',
        transportReadyState: null,
        connectionAlive: false,
        reconnectAttempt: 0,
        lastCloseCode: null,
        lastCloseReason: null,
      });
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

    it('stops consuming global send events after disconnect', () => {
      const p = makeProtocol();
      window.dispatchEvent(new CustomEvent('protocol-send-message', {
        detail: { type: 'table_request', data: { table_id: 'before' } },
      }));
      const queue = (p as unknown as { messageQueue: unknown[] }).messageQueue;
      expect(queue).toHaveLength(1);

      p.disconnect();
      window.dispatchEvent(new CustomEvent('protocol-send-message', {
        detail: { type: 'table_request', data: { table_id: 'after' } },
      }));

      expect(queue).toHaveLength(1);
    });

    it('rejects an in-flight connection when disconnected', async () => {
      const ws = {
        readyState: WebSocket.CONNECTING,
        send: vi.fn(),
        close: vi.fn(),
        onopen: null as (() => void) | null,
        onclose: null as ((e: Partial<CloseEvent>) => void) | null,
        onerror: null as ((e: Event) => void) | null,
        onmessage: null as ((e: MessageEvent) => void) | null,
      };
      vi.stubGlobal('WebSocket', Object.assign(vi.fn(function() { return ws; }), {
        CONNECTING: 0,
        OPEN: 1,
        CLOSING: 2,
        CLOSED: 3,
      }));
      const protocol = makeProtocol();
      const connection = protocol.connect();

      protocol.disconnect();

      await expect(connection).rejects.toThrow('cancelled');
      expect(ws.close).toHaveBeenCalledWith(1000, 'Client disconnect');
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
    it('publishes the complete canonical create before a dependent editor command rebases', async () => {
      const protocol = makeProtocol(); makeOpenWs(protocol);
      const canonical = vi.fn();
      const listener = (event: Event) => canonical((event as CustomEvent).detail);
      window.addEventListener('canvas-canonical-object', listener);
      try {
        const incoming = createMessage(MessageType.SPRITE_RESPONSE, { table_id: 'table-abc', operation: 'create',
          success: true, sprite_data: { sprite_id: 'sprite-one', position: [10, 20], width: 50, height: 60 } });
        await (protocol as unknown as { handleIncomingMessage: (raw: string) => Promise<void> }).handleIncomingMessage(JSON.stringify(incoming));
        expect(canonical).toHaveBeenCalledWith(expect.objectContaining({ tableId: 'table-abc', id: 'sprite-one',
          object: expect.objectContaining({ position: [10, 20], width: 50, height: 60 }) }));
      } finally { window.removeEventListener('canvas-canonical-object', listener); protocol.disconnect(); }
    });

    it('releases the canvas owner on an early envelope error without a domain result', async () => {
      const protocol = makeProtocol(); makeOpenWs(protocol);
      const result = vi.fn();
      const listener = (event: Event) => result((event as CustomEvent).detail);
      window.addEventListener('canvas-command-result', listener);
      try {
        protocol.sendCanvasCommand({ table_id: 'table-abc', operation_id: 'one', mode: 'undo', issued_at: Date.now() });
        const incoming = { ...createMessage(MessageType.ERROR, { error: 'Invalid command', code: 'invalid_payload' }), causation_id: 'one' };
        await (protocol as unknown as { handleIncomingMessage: (raw: string) => Promise<void> }).handleIncomingMessage(JSON.stringify(incoming));
        expect(result).toHaveBeenCalledWith(expect.objectContaining({ operation_id: 'one', table_id: 'table-abc', success: false }));
      } finally { window.removeEventListener('canvas-command-result', listener); protocol.disconnect(); }
    });

    it('exposes only the matching raw sprite dependency until its correlated outcome', async () => {
      const protocol = makeProtocol(); makeOpenWs(protocol);
      const request = createMessage(MessageType.SPRITE_ROTATE, { table_id: 'table-abc', sprite_id: 'sprite-one', rotation: 45 });
      protocol.sendMessage(request);
      expect(protocol.hasPendingSpriteCommand('table-abc', 'sprite-one')).toBe(true);
      expect(protocol.hasPendingSpriteCommand('table-abc', 'sprite-two')).toBe(false);
      expect(protocol.hasPendingSpriteCommand('other-table', 'sprite-one')).toBe(false);
      const incoming = { ...createMessage(MessageType.ERROR, { error: 'Denied' }), causation_id: request.message_id };
      await (protocol as unknown as { handleIncomingMessage: (raw: string) => Promise<void> }).handleIncomingMessage(JSON.stringify(incoming));
      expect(protocol.hasPendingSpriteCommand('table-abc', 'sprite-one')).toBe(false);
      protocol.disconnect();
    });

    it('keeps one acknowledgement owner when an editor operation is retried', () => {
      const protocol = makeProtocol();
      const ws = makeOpenWs(protocol);
      const command = { table_id: 'table-abc', operation_id: 'same-operation', mode: 'undo', issued_at: Date.now() };
      expect(protocol.sendCanvasCommand(command)).toBe(true);
      expect(protocol.sendCanvasCommand(command)).toBe(true);
      expect(ws.send.mock.calls.map(args => JSON.parse(String(args[0])).message_id)).toEqual(['same-operation', 'same-operation']);
      const tracker = (protocol as unknown as { commandTracking: { watermark: (id: string) => string[] } }).commandTracking;
      expect(tracker.watermark('table-abc')).toEqual(['same-operation']);
      protocol.disconnect();
    });

    it('splits bursts by their UTF-8 frame size and retains member order', () => {
      const protocol = makeProtocol();
      const ws = makeOpenWs(protocol);
      for (let index = 0; index < 3; index++) {
        protocol.sendMessage(createMessage(MessageType.PING, { index, value: 'й'.repeat(20_000) }));
      }
      protocol.sendBatch();
      const frames = ws.send.mock.calls.map(args => String(args[0]));
      expect(frames).toHaveLength(3);
      expect(frames.every((frame: string) => new TextEncoder().encode(frame).length <= 64 * 1024)).toBe(true);
      expect(frames.flatMap((frame: string) => JSON.parse(frame).data.messages).map(message => message.data.index)).toEqual([0, 1, 2]);
      protocol.disconnect();
    });

    it('sends a near-limit member directly when the batch wrapper would overflow', () => {
      const protocol = makeProtocol();
      const ws = makeOpenWs(protocol);
      const message = createMessage(MessageType.PING, { value: '' });
      message.data!.value = 'x'.repeat(64 * 1024 - new TextEncoder().encode(JSON.stringify(message)).length - 10);
      expect(protocol.sendMessage(message)).toBe(true);
      protocol.sendBatch();
      expect(ws.send).toHaveBeenCalledOnce();
      expect(JSON.parse(ws.send.mock.calls[0][0]).type).toBe(MessageType.PING);
      protocol.disconnect();
    });

    it('retains only unsent members after a partially delivered burst', () => {
      const protocol = makeProtocol();
      const ws = makeOpenWs(protocol);
      ws.send.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('closed'); });
      for (let index = 0; index < 3; index++) {
        protocol.sendMessage(createMessage(MessageType.PING, { index, value: 'x'.repeat(40_000) }));
      }
      protocol.sendBatch();
      expect((protocol as unknown as { batchQueue: Array<{ data: { index: number } }> }).batchQueue.map(message => message.data.index)).toEqual([1, 2]);
      protocol.disconnect();
    });

    it('rejects an oversized mutation before registering optimistic state', () => {
      const protocol = makeProtocol();
      const ws = makeOpenWs(protocol);
      const message = createMessage(MessageType.CHAT, { content: 'й'.repeat(40_000) });
      expect(protocol.sendMessage(message)).toBe(false);
      protocol.sendBatch();
      expect(ws.send).not.toHaveBeenCalled();
      expect((protocol as unknown as { commandTracking: { has: (id: string) => boolean } }).commandTracking.has(message.message_id!)).toBe(false);
      protocol.disconnect();
    });

    it('sends batch message and clears queue', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      const msg = { type: MessageType.PING, data: {}, version: '0.1', priority: 1 };
      p.queueMessage(msg);
      p.sendBatch();
      expect(ws.send).toHaveBeenCalledOnce();
      const sent = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(sent.type).toBe('batch_request');
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
    it('keeps the original table creation identity for a deliberate retry', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      const first = p.createNewTable('Arena', 1000, 800);
      p.createNewTable('Arena', 1000, 800, first);
      const next = p.createNewTable('Arena', 1000, 800);
      const sent = (ws.send as Mock).mock.calls.map(call => JSON.parse(call[0]));
      expect(sent.map(message => message.message_id)).toEqual([first, first, next]);
      expect(first).not.toBe(next);
    });

    it('sends new_table_request with name/dimensions', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.createNewTable('Arena', 1000, 800);
      const msg = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      expect(msg.type).toBe('new_table_request');
      expect(msg.data).toMatchObject({ table_name: 'Arena', width: 1000, height: 800 });
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

    it('retains the original identity on a deliberate retry', () => {
      const p = makeProtocol(); const ws = makeOpenWs(p);
      const id = p.deleteTable('550e8400-e29b-41d4-a716-446655440000');
      expect(p.deleteTable('550e8400-e29b-41d4-a716-446655440000', id)).toBe(id);
      expect(ws.send.mock.calls.map(call => JSON.parse(call[0]).message_id)).toEqual([id, id]);
    });
  });

  describe('setActiveTable', () => {
    it('sends table_active_set with only the selected table', () => {
      const p = makeProtocol('S', 5);
      const ws = makeOpenWs(p);
      p.setActiveTable('tbl-2');
      // table_active_set is not in the critical list — goes through queueMessage
      p.sendBatch();
      const batch = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('table_active_set');
      expect(inner.data).toEqual({ table_id: 'tbl-2' });
    });
  });

  describe('requestActiveTable', () => {
    it('does not send caller-controlled identity data', () => {
      const p = makeProtocol('S', 5);
      const ws = makeOpenWs(p);
      p.requestActiveTable();
      p.sendBatch();
      const batch = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('table_active_request');
      expect(inner.data).toEqual({});
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
      expect(msg.type).toBe('batch_request');
      const inner = msg.data.messages[0];
      expect(inner.type).toBe('wall_create');
      expect(inner.data.table_id).toBe('table-abc');
      expect(inner.data.wall_data).toEqual({ x1: 0, y1: 0, x2: 10, y2: 10 });
    });

    it('does nothing when no activeTableId', () => {
      Object.assign(mocks.storeState, makeStoreState({ activeTableId: null }));
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.createWall({ x1: 0, y1: 0, x2: 10, y2: 10 });
      p.sendBatch();
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('updateWall', () => {
    it('does not send an empty wall update', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.updateWall('wall-99', {});
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
    it('retains the original XP identity for a retry and creates a new identity for a new award', () => {
      const p = makeProtocol('ROOM', 7);
      const ws = makeOpenWs(p);
      const original = p.awardCharacterXP('char-1', 100, 'quest', 'Ruins');
      p.awardCharacterXP('char-1', 100, 'quest', 'Ruins', original);
      const deliberate = p.awardCharacterXP('char-1', 100, 'quest', 'Ruins');
      const sent = (ws.send as Mock).mock.calls.map(call => JSON.parse(call[0]));
      expect(original).toBeTruthy();
      expect(sent.map(message => message.message_id)).toEqual([original, original, deliberate]);
      expect(deliberate).not.toBe(original);
      expect(sent[1].data).toEqual(sent[0].data);
    });

    it('keeps multiclass retry identity and explicit version without client authority fields', () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      const id = p.requestCharacterMulticlass('hero', ' ROGUE ', undefined, 3);
      p.requestCharacterMulticlass('hero', 'rogue', id, 3);
      const next = p.requestCharacterMulticlass('hero', 'wizard');
      const sent = (ws.send as Mock).mock.calls.map(call => JSON.parse(call[0]));
      expect(id).toBeTruthy(); expect(next).not.toBe(id);
      expect(sent.map(message => message.message_id)).toEqual([id, id, next]);
      expect(sent[0].data).toEqual({ character_id: 'hero', new_class: 'rogue', version: 3 });
      expect(sent[1].data).toEqual(sent[0].data);
      expect(sent[2].data).toEqual({ character_id: 'hero', new_class: 'wizard' });
    });

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
      expect(msg.type).toBe('batch_request');
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
      expect(msg.type).toBe('batch_request');
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
    async function dispatch(
      p: WebClientProtocol,
      type: string,
      data: Record<string, unknown>,
      envelope: Record<string, unknown> = {},
    ) {
      const raw = JSON.stringify({ type, data, version: '0.1', priority: 5,
        timestamp: Date.now() / 1000, message_id: crypto.randomUUID(), ...envelope });
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
    }

    it('PLAYER_JOINED dispatches player-joined custom event', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('player-joined', handler);
      await dispatch(p, 'player_joined', {
        username: 'Ada',
        user_id: 5,
        client_id: 'client-5',
        role: 'player',
        timestamp: '2026-08-07T12:00:00+00:00',
      });
      window.removeEventListener('player-joined', handler);
      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ user_id: 5 });
    });

    it('PLAYER_LEFT dispatches player-left custom event', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('player-left', handler);
      await dispatch(p, 'player_left', {
        username: 'Ada',
        timestamp: '2026-08-07T12:05:00+00:00',
      });
      window.removeEventListener('player-left', handler);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('TABLE_UPDATE dispatches table-updated event', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('table-updated', handler);
      await dispatch(p, 'table_update', { table_id: 'table-abc' });
      window.removeEventListener('table-updated', handler);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('TABLE_UPDATE adds newly created tables to the store', async () => {
      Object.assign(mocks.storeState, makeStoreState({ tables: [] }));
      const p = makeProtocol();

      await dispatch(p, 'table_update', {
        operation: 'create',
        table_id: 't-new',
        table_name: 'Dungeon',
        table_data: {
          table_id: 't-new',
          table_name: 'Dungeon',
          width: 1600,
          height: 1200,
        },
      });

      expect(mockSetTables).toHaveBeenCalledWith([
        expect.objectContaining({ table_id: 't-new', table_name: 'Dungeon' }),
      ]);
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
      const wall = {
        wall_id: 'w1', table_id: 'table-abc', x1: 0, y1: 0, x2: 5, y2: 5,
        wall_type: 'normal', blocks_movement: true, blocks_light: true,
        blocks_sight: true, blocks_sound: true, is_door: false,
        door_state: 'closed', is_secret: false, direction: 'both', created_by: 1,
      };
      await dispatch(p, 'wall_data', { operation: 'create', wall, table_id: 'table-abc' });
      expect(mockAddWall).toHaveBeenCalledWith(wall);
    });

    it('WALL_DATA operation=remove calls store.removeWall', async () => {
      const p = makeProtocol();
      await dispatch(p, 'wall_data', {
        operation: 'remove', wall_id: 'w2', table_id: 'table-abc',
      });
      expect(mockRemoveWall).toHaveBeenCalledWith('w2');
    });

    it('WALL_DATA operation=update calls store.updateWall', async () => {
      const p = makeProtocol();
      const wall = {
        wall_id: 'w3', table_id: 'table-abc', x1: 1, y1: 0, x2: 5, y2: 5,
        wall_type: 'normal', blocks_movement: true, blocks_light: true,
        blocks_sight: true, blocks_sound: true, is_door: false,
        door_state: 'closed', is_secret: false, direction: 'both', created_by: 1,
      };
      mocks.storeState.walls = [wall];
      await dispatch(p, 'wall_data', { operation: 'update', wall, table_id: 'table-abc' });
      expect(mockUpdateWall).toHaveBeenCalledWith('w3', wall);
    });

    it('ignores table-scoped mutations for an inactive table', async () => {
      const p = makeProtocol();
      const spriteHandler = vi.fn();
      window.addEventListener('sprite-created', spriteHandler);

      await dispatch(p, 'sprite_create', { sprite_id: 'foreign-sprite', table_id: 'table-other' });
      await dispatch(p, 'wall_data', {
        operation: 'remove', wall_id: 'foreign-wall', table_id: 'table-other',
      });
      await dispatch(p, 'table_settings_changed', {
        table_id: 'table-other', dynamic_lighting_enabled: true,
        fog_exploration_mode: 'persist_dimmed', ambient_light_level: 0,
      });

      window.removeEventListener('sprite-created', spriteHandler);
      expect(spriteHandler).not.toHaveBeenCalled();
      expect(mockRemoveWall).not.toHaveBeenCalledWith('foreign-wall');
      expect(mockApplyTableLightingSettings).not.toHaveBeenCalled();
    });

    it('rejects stale table responses before applying ancillary state', async () => {
      const p = makeProtocol();
      const tableHandler = vi.fn();
      window.addEventListener('table-response', tableHandler);

      await dispatch(p, 'table_response', {
        table_data: {
          table_id: 'table-other', dynamic_lighting_enabled: true,
          fog_exploration_mode: 'persist_dimmed', ambient_light_level: 0,
        },
        walls: [{ wall_id: 'foreign-wall', table_id: 'table-other' }],
      });

      window.removeEventListener('table-response', tableHandler);
      expect(tableHandler).not.toHaveBeenCalled();
      expect(mockApplyTableLightingSettings).not.toHaveBeenCalled();
      expect(mockAddWall).not.toHaveBeenCalled();
    });

    it('PONG marks connection alive', async () => {
      const p = makeProtocol();
      await dispatch(p, 'pong', { timestamp: 42, client_id: 'client-1' });
      expect((p as unknown as Record<string, unknown>)['connectionAlive']).toBe(true);
    });

    it('ERROR dispatches protocol-error event', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('protocol-error', handler);
      await dispatch(p, 'error', { error: 'bad' });
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

    it.each(['0.1', '0.2', '0.3'])('WELCOME restores the encounter and negotiates pipeline version %s', async version => {
      const p = makeProtocol();
      useEncounterStore.setState({ encounter: null });

      await dispatch(p, 'welcome', {
        message: 'Welcome to game session TEST123',
        client_id: 'client-1',
        user_id: 1,
        username: 'Ada',
        session_code: 'TEST123',
        connection_id: null,
        tables: ['table-1'],
        role: 'player',
        permissions: ['compendium:read'],
        visible_layers: ['map', 'tokens'],
        game_mode: 'free_roam',
        session_rules: { session_id: 'TEST123' },
        choice_encounter: {
          encounter_id: 'enc-restored',
          title: 'Restored prompt',
          description: 'Continue choosing',
          phase: 'presenting',
          choices: [{ choice_id: 'continue', text: 'Continue' }],
        },
      }, { version });

      expect(p.supportsCanvasPipelining()).toBe(version === '0.2');
      expect(useEncounterStore.getState().encounter?.encounter_id).toBe('enc-restored');
    });

    it('ACTION_RESULT confirms the optimistic sprite action by sequence id', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('sprite-action-confirmed', handler);

      await dispatch(p, 'action_result', { accepted: true, sequence_id: 42, applied: [] });

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
        accepted: true,
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
        accepted: true,
        sequence_id: 45,
        applied: [{
          action_type: 'add_cover_zone',
          actor_id: '__dm__',
          result: { zone },
        }],
      });
      expect(useCoverStore.getState().zones).toEqual([zone]);
      await dispatch(p, 'action_result', {
        accepted: true,
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

    it('applies accepted sprite edits only to the active table', async () => {
      const p = makeProtocol(); const handler = vi.fn();
      Object.assign(mocks.storeState, makeStoreState({ activeTableId: 'table-current' }));
      window.addEventListener('sprite-updated', handler);
      try {
        await dispatch(p, 'success', { sprite_id: 'text-1', table_id: 'table-old', updates: { metadata: 'old' } });
        expect(handler).not.toHaveBeenCalled();
        await dispatch(p, 'success', { sprite_id: 'text-1', table_id: 'table-current', updates: { metadata: 'accepted' } });
        expect(handler).toHaveBeenCalledOnce();
        expect((handler.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ operation: 'update', updates: { metadata: 'accepted' } });
      } finally { window.removeEventListener('sprite-updated', handler); }
    });

    it.each(['success', 'sprite_update'])('installs canonical token stats and binding from %s without another write', async type => {
      const p = makeProtocol(); const ws = makeOpenWs(p);
      mocks.storeState.sprites = [{ id: 'token', tableId: 'table-abc', characterId: 'old', hp: 99, maxHp: 99, ac: 12 }];
      await dispatch(p, type, { table_id: 'table-abc', sprite_id: 'token', operation: 'update',
        updates: { character_id: 'source', hp: 0, max_hp: 30, ac: null } });
      expect((mocks.storeState.sprites as Record<string, unknown>[])[0])
        .toMatchObject({ characterId: 'source', hp: 0, maxHp: 30, ac: undefined });
      await dispatch(p, type, { table_id: 'table-old', sprite_id: 'token', operation: 'update', updates: { hp: 99 } });
      expect((mocks.storeState.sprites as Record<string, unknown>[])[0].hp).toBe(0);
      await dispatch(p, type, { table_id: 'table-abc', sprite_id: 'token', operation: 'update',
        updates: { character_id: null, hp: null, max_hp: null } });
      expect((mocks.storeState.sprites as Record<string, unknown>[])[0])
        .toMatchObject({ characterId: undefined, hp: undefined, maxHp: undefined });
      p.sendBatch();
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('BATCH_RESPONSE dispatches validated inner messages to handlers', async () => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener('player-joined', handler);
      const innerMsg = {
        type: 'player_joined',
        data: {
          username: 'Ada',
          user_id: 9,
          client_id: 'client-9',
          role: 'player',
          timestamp: '2026-08-10T12:00:00Z',
        },
        version: '0.1',
        priority: 5,
      };
      await dispatch(p, 'batch_response', {
        messages: [innerMsg],
        seq: 1,
        processed_count: 1,
        response_count: 1,
      });
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
        table_id: 'table-abc',
        dynamic_lighting_enabled: true,
        fog_exploration_mode: 'persist_dimmed',
        ambient_light_level: 0.5,
        grid_cell_px: 50,
        cell_distance: 5,
        distance_unit: 'ft',
        grid_enabled: true,
        snap_to_grid: true,
        grid_color_hex: '#ffffff',
        background_color_hex: '#2a3441',
      });
      expect(mockApplyTableLightingSettings).toHaveBeenCalledWith(
        expect.objectContaining({ dynamic_lighting_enabled: true })
      );
    });

    it('TABLE_SETTINGS_CHANGED applies supported WASM render settings', async () => {
      const p = makeProtocol();
      await dispatch(p, 'table_settings_changed', {
        table_id: 'table-abc',
        dynamic_lighting_enabled: true,
        fog_exploration_mode: 'current_only',
        ambient_light_level: 0.5,
        grid_cell_px: 72,
        cell_distance: 5,
        distance_unit: 'ft',
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
      await dispatch(p, 'player_role_changed', {
        user_id: 7,
        new_role: 'player',
        permissions: [],
        visible_layers: ['map'],
      });
      expect(mockSetSessionRole).toHaveBeenCalledWith('player', [], expect.anything());
    });

    it('PLAYER_ROLE_CHANGED does not update store for other users', async () => {
      const p = makeProtocol('S', 7);
      await dispatch(p, 'player_role_changed', {
        user_id: 99,
        new_role: 'spectator',
        permissions: [],
        visible_layers: ['map'],
      });
      expect(mockSetSessionRole).not.toHaveBeenCalled();
    });
  });

  // ── registerHandler / unregisterHandler ──────────────────────────────────

  describe('registerHandler / unregisterHandler', () => {
    it('custom handler is invoked for registered type', async () => {
      const p = makeProtocol();
      const handler = vi.fn().mockResolvedValue(undefined);
      p.registerHandler(MessageType.CUSTOM, handler);
      const raw = JSON.stringify({ type: MessageType.CUSTOM, data: { x: 1 }, version: '0.1', priority: 5 });
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('unregistered handler is not invoked', async () => {
      const p = makeProtocol();
      const handler = vi.fn().mockResolvedValue(undefined);
      p.registerHandler(MessageType.CUSTOM, handler);
      p.unregisterHandler(MessageType.CUSTOM);
      const raw = JSON.stringify({ type: MessageType.CUSTOM, data: {}, version: '0.1', priority: 5 });
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
      expect(handler).not.toHaveBeenCalled();
    });

    it('keeps independent subscribers for the same message type', async () => {
      const p = makeProtocol();
      const first = vi.fn().mockResolvedValue(undefined);
      const second = vi.fn().mockResolvedValue(undefined);
      p.registerHandler(MessageType.CUSTOM, first);
      p.registerHandler(MessageType.CUSTOM, second);
      const raw = JSON.stringify({ type: MessageType.CUSTOM, data: {}, version: '0.1', priority: 5 });

      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
      p.unregisterHandler(MessageType.CUSTOM, first);
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(2);
    });
  });

  // ── connect() lifecycle ──────────────────────────────────────────────────

  describe('connect()', () => {
    const activeProtocols = new Set<WebClientProtocol>();

    function makeConnectProtocol() {
      const protocol = makeProtocol();
      activeProtocols.add(protocol);
      return protocol;
    }

    afterEach(() => {
      for (const protocol of activeProtocols) {
        protocol.disconnect();
      }
      activeProtocols.clear();
    });

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
      const p = makeConnectProtocol();
      const promise = p.connect();
      ws.onopen!();
      await promise;
      expect((p as unknown as Record<string, unknown>)['connectionAlive']).toBe(true);
    });

    it('rejects when onerror fires', async () => {
      const ws = makeMockWs();
      vi.stubGlobal('WebSocket', vi.fn(function() { return ws; }));
      const p = makeConnectProtocol();
      const promise = p.connect();
      ws.onerror!(new Event('error'));
      await expect(promise).rejects.toThrow();
    });

    it('rejects with "Kicked from session" on close code 1008', async () => {
      const ws = makeMockWs();
      vi.stubGlobal('WebSocket', vi.fn(function() { return ws; }));
      const p = makeConnectProtocol();
      const promise = p.connect();
      ws.onclose!({ code: 1008, reason: 'Kicked from session', wasClean: false });
      await expect(promise).rejects.toThrow('Kicked from session');
    });

    it('rejects when already connecting', async () => {
      const ws = makeMockWs();
      vi.stubGlobal('WebSocket', vi.fn(function() { return ws; }));
      const p = makeConnectProtocol();
      const firstConnection = p.connect();
      await expect(p.connect()).rejects.toThrow('Already connecting');
      p.disconnect();
      await expect(firstConnection).rejects.toThrow('cancelled');
    });

    it('routes incoming messages to handlers via onmessage', async () => {
      const ws = makeMockWs();
      vi.stubGlobal('WebSocket', vi.fn(function() { return ws; }));
      const p = makeConnectProtocol();
      const connectPromise = p.connect();
      ws.onopen!();
      await connectPromise;

      const handler = vi.fn();
      window.addEventListener('player-joined', handler);
      ws.onmessage!({
        data: JSON.stringify({
          type: 'player_joined',
          data: {
            username: 'Ada',
            user_id: 1,
            client_id: 'client-1',
            role: 'player',
            timestamp: '2026-08-07T12:00:00+00:00',
          },
          version: '0.1',
          priority: 5,
        }),
      } as MessageEvent);
      // Give async handler a tick
      await new Promise(r => setTimeout(r, 0));
      window.removeEventListener('player-joined', handler);
      expect(handler).toHaveBeenCalled();
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
      expect(['ping', 'batch_request']).toContain(sent.type);
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
    it('retains reads but does not replay unaccepted sprite creation after reconnect', () => {
      const p = makeProtocol();
      const closedWs = { readyState: WebSocket.CLOSED, send: vi.fn(), close: vi.fn() };
      (p as unknown as Record<string, unknown>)['websocket'] = closedWs;
      p.sendMessage({ type: 'sprite_create', data: {}, version: '0.1', priority: 2 });
      p.sendMessage({ type: 'table_request', data: { table_id: 'table-abc' }, version: '0.1', priority: 2 });
      // Now open the connection
      const openWs = { readyState: WebSocket.OPEN, send: vi.fn(), close: vi.fn() };
      (p as unknown as Record<string, unknown>)['websocket'] = openWs;
      (p as unknown as Record<string, () => void>)['flushMessageQueue']();
      expect(openWs.send).toHaveBeenCalledOnce();
      expect(JSON.parse(openWs.send.mock.calls[0][0]).type).toBe('table_request');
    });

    it('retains character updates while reconnecting', () => {
      const p = makeProtocol('S', 1);
      const closedWs = { readyState: WebSocket.CLOSED, send: vi.fn(), close: vi.fn() };
      (p as unknown as Record<string, unknown>)['websocket'] = closedWs;
      p.updateCharacter('character-1', { hp: 9 }, 4);

      const openWs = { readyState: WebSocket.OPEN, send: vi.fn(), close: vi.fn() };
      (p as unknown as Record<string, unknown>)['websocket'] = openWs;
      (p as unknown as Record<string, () => void>)['flushMessageQueue']();

      expect(openWs.send).toHaveBeenCalledOnce();
      expect(JSON.parse(openWs.send.mock.calls[0][0])).toMatchObject({
        type: MessageType.CHARACTER_UPDATE,
        data: { character_id: 'character-1', updates: { hp: 9 }, version: 4 },
      });
    });
  });

  // ── Remaining simple event-dispatch handlers ─────────────────────────────

  describe('more incoming handlers', () => {
    describe('persisted high-risk recovery', () => {
      const tableId = '550e8400-e29b-41d4-a716-446655440000';
      const capability = { contract: 'session-operations-v1', session_instance: '1:2026-10-30',
        domains: ['table_create', 'table_delete', 'table_settings', 'xp_award'] };
      const welcome = (patch: Record<string, unknown> = {}) => ({ message: 'Welcome', client_id: 'client',
        user_id: 1, username: 'Owner', session_code: 'TEST123', connection_id: 'connection', tables: [],
        role: 'owner', permissions: [], visible_layers: [], game_mode: 'free_roam', session_rules: {},
        choice_encounter: null, operation_recovery: capability, ...patch });
      const sent = (ws: ReturnType<typeof makeOpenWs>) => ws.send.mock.calls.flatMap(call => {
        const frame = JSON.parse(call[0]); return frame.type === MessageType.BATCH_REQUEST ? frame.data.messages : [frame];
      }) as Message[];
      beforeEach(() => sessionStorage.clear());
      afterEach(() => sessionStorage.clear());

      const extended = (patch: Record<string, unknown> = {}) => welcome({ role: 'player',
        operation_recovery: { ...capability, contract: 'session-operations-v2', domains: [...V2_RECOVERY_DOMAINS] }, ...patch });

      it.each([
        [MessageType.CHARACTER_UPDATE, { character_id: 'hero', updates: { name: 'Saved' }, version: 3 }],
        [MessageType.MULTICLASS_REQUEST, { character_id: 'hero', new_class: 'rogue', version: 3 }],
        [MessageType.ENCOUNTER_START, { choices: [{ text: 'Go' }] }],
        [MessageType.ENCOUNTER_END, { encounter_id: 'original-prompt' }],
        [MessageType.ENCOUNTER_CHOICE, { encounter_id: 'original-prompt', choice_id: 'go' }],
        [MessageType.ENCOUNTER_ROLL, { encounter_id: 'original-prompt', choice_id: 'go', bonus: 2 }],
      ])('reconstructs the exact extended %s intent after page reload', async (type, data) => {
        const first = makeProtocol(); const ws = makeOpenWs(first);
        const restarted = makeProtocol(); const next = makeOpenWs(restarted);
        const role = type === MessageType.ENCOUNTER_START || type === MessageType.ENCOUNTER_END ? 'owner' : 'player';
        try {
          await dispatch(first, 'welcome', extended({ role })); first.sendBatch(); ws.send.mockClear();
          const original = createMessage(type as MessageType, data);
          expect(first.sendMessage(original)).toBe(true); first.sendBatch();
          expect(sent(ws).filter(item => item.type === type)).toEqual([original]);
          first.disconnect();
          await dispatch(restarted, 'welcome', extended({ role })); restarted.sendBatch();
          expect(sent(next).filter(item => item.type === type)).toEqual([original]);
          expect(restarted.getOperationRecoveryStatus().pending).toBe(1);
        } finally { first.disconnect(); restarted.disconnect(); }
      });

      it('reinstates character ownership, waits for all edits, and hydrates current state after receipts', async () => {
        const first = makeProtocol(); makeOpenWs(first);
        const restarted = makeProtocol(); const next = makeOpenWs(restarted);
        try {
          await dispatch(first, 'welcome', extended());
          expect(first.updateCharacter('hero', { name: 'Earlier' }, 3)).toBe(true);
          expect(first.updateCharacter('hero', { data: { hp: 12 } }, 3)).toBe(true);
          first.sendBatch(); first.disconnect();
          await dispatch(restarted, 'welcome', extended()); restarted.sendBatch();
          const originals = sent(next).filter(item => item.type === MessageType.CHARACTER_UPDATE);
          expect(originals).toHaveLength(2); next.send.mockClear();
          await dispatch(restarted, 'character_update_response', { success: true, character_id: 'hero',
            operation_id: originals[0].message_id, version: 4, resync_required: false }, { causation_id: originals[0].message_id });
          restarted.sendBatch();
          expect(sent(next).some(item => item.type === MessageType.CHARACTER_LOAD_REQUEST)).toBe(false);
          await dispatch(restarted, 'character_update_response', { success: true, character_id: 'hero',
            operation_id: originals[1].message_id, version: 5, resync_required: false }, { causation_id: originals[1].message_id });
          restarted.sendBatch();
          expect(sent(next).filter(item => item.type === MessageType.CHARACTER_LOAD_REQUEST)).toHaveLength(1);
          expect(sent(next).some(item => item.type === MessageType.CHARACTER_UPDATE)).toBe(false);
          expect(restarted.getOperationRecoveryStatus().pending).toBe(0);
        } finally { first.disconnect(); restarted.disconnect(); }
      });

      it.each(['forbidden', 'conflict'])('retains a restored character after %s without rebasing an uncertain original', async code => {
        const first = makeProtocol(); makeOpenWs(first);
        const restarted = makeProtocol(); const next = makeOpenWs(restarted);
        try {
          await dispatch(first, 'welcome', extended()); first.updateCharacter('hero', { name: 'Original' }, 3);
          first.sendBatch(); first.disconnect();
          await dispatch(restarted, 'welcome', extended()); restarted.sendBatch();
          const original = sent(next).find(item => item.type === MessageType.CHARACTER_UPDATE)!; next.send.mockClear();
          await dispatch(restarted, 'character_update_response', { success: false, character_id: 'hero',
            error: 'Version conflict', code, current_version: 7, operation_id: original.message_id },
            { causation_id: original.message_id }); restarted.sendBatch();
          expect(sent(next).some(item => item.type === MessageType.CHARACTER_UPDATE)).toBe(false);
          expect(restarted.getOperationRecoveryStatus().blocked).toBe(1);
          await dispatch(restarted, 'error', { error: 'Proven rollback', not_accepted: true,
            code: 'persistence_failed', operation_id: original.message_id }, { causation_id: original.message_id });
          restarted.sendBatch();
          expect(restarted.getOperationRecoveryStatus()).toMatchObject({ pending: 0, blocked: 0 });
          expect(sent(next).some(item => item.type === MessageType.CHARACTER_UPDATE)).toBe(false);
          expect(sent(next).some(item => item.type === MessageType.CHARACTER_LOAD_REQUEST)).toBe(true);
        } finally { first.disconnect(); restarted.disconnect(); }
      });

      it('hydrates multiclass receipts even before the character list has loaded', async () => {
        const first = makeProtocol(); makeOpenWs(first);
        const restarted = makeProtocol(); const next = makeOpenWs(restarted);
        try {
          await dispatch(first, 'welcome', extended());
          const id = first.requestCharacterMulticlass('hero', 'rogue', undefined, 3)!; first.disconnect();
          await dispatch(restarted, 'welcome', extended()); restarted.sendBatch(); next.send.mockClear();
          await dispatch(restarted, 'multiclass_response', { success: true, operation_id: id, character_id: 'hero',
            new_class: 'rogue', accepted_level: 4, version: 5, resync_required: true }, { causation_id: id });
          restarted.sendBatch();
          expect(sent(next).filter(item => item.type === MessageType.CHARACTER_LOAD_REQUEST)).toHaveLength(1);
          expect(restarted.getOperationRecoveryStatus().pending).toBe(0);
        } finally { first.disconnect(); restarted.disconnect(); }
      });

      it('keeps a restored class change through generic unknown recovery and bounded read probes', async () => {
        const first = makeProtocol(); makeOpenWs(first);
        const restarted = makeProtocol(); const next = makeOpenWs(restarted);
        try {
          await dispatch(first, 'welcome', extended());
          const id = first.requestCharacterMulticlass('hero', 'rogue', undefined, 3)!; first.disconnect();
          await dispatch(restarted, 'welcome', extended()); restarted.sendBatch(); next.send.mockClear();
          for (let i = 0; i < 2; i++) await dispatch(restarted, 'error', {
            error: 'Unknown', code: 'character_outcome_unknown', outcome: 'unknown' }, { causation_id: id });
          restarted.sendBatch();
          expect(sent(next).filter(item => item.type === MessageType.TABLE_ACTIVE_REQUEST)).toHaveLength(1);
          expect(sent(next).some(item => item.type === MessageType.MULTICLASS_REQUEST)).toBe(false);
          expect(restarted.getOperationRecoveryStatus().pending).toBe(1);
        } finally { first.disconnect(); restarted.disconnect(); }
      });

      it('does not resend same-page character ownership after an actor or database instance change', async () => {
        const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
        try {
          await dispatch(protocol, 'welcome', extended()); protocol.updateCharacter('hero', { name: 'Private' }, 3);
          protocol.sendBatch(); ws.send.mockClear();
          await dispatch(protocol, 'welcome', extended({ operation_recovery: {
            ...capability, contract: 'session-operations-v2', domains: [...V2_RECOVERY_DOMAINS], session_instance: 'replacement' } }));
          protocol.sendBatch();
          expect(sent(ws).some(item => item.type === MessageType.CHARACTER_UPDATE)).toBe(false);
          expect(sessionStorage.length).toBe(1);
          await dispatch(protocol, 'welcome', extended({ user_id: 2 })); protocol.sendBatch();
          expect(sent(ws).some(item => item.type === MessageType.CHARACTER_UPDATE)).toBe(false);
          expect(sessionStorage.length).toBe(1);
        } finally { protocol.disconnect(); }
      });

      it('releases restored local edit ownership only after explicit scoped forgetting', async () => {
        const first = makeProtocol(); makeOpenWs(first);
        const restarted = makeProtocol(); const next = makeOpenWs(restarted);
        try {
          await dispatch(first, 'welcome', extended()); first.updateCharacter('hero', { name: 'Original' }, 3);
          first.sendBatch(); first.disconnect();
          await dispatch(restarted, 'welcome', extended()); restarted.sendBatch(); next.send.mockClear();
          restarted.discardSavedOperations(); restarted.sendBatch();
          expect(sessionStorage.length).toBe(0);
          expect(sent(next).some(item => item.type === MessageType.CHARACTER_LOAD_REQUEST)).toBe(true);
          expect(sent(next).some(item => item.type === MessageType.CHARACTER_UPDATE)).toBe(false);
        } finally { first.disconnect(); restarted.disconnect(); }
      });

      it('reports a character enqueue failure without retaining a phantom local edit owner', async () => {
        const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
        try {
          await dispatch(protocol, 'welcome', extended()); protocol.sendBatch(); ws.send.mockClear();
          vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
          expect(protocol.updateCharacter('hero', { name: 'Unsaved' }, 3)).toBe(false);
          expect(ws.send).not.toHaveBeenCalled();
          await dispatch(protocol, 'character_update', { character_id: 'hero', resync_required: true });
          protocol.sendBatch();
          expect(sent(ws).some(item => item.type === MessageType.CHARACTER_LOAD_REQUEST)).toBe(true);
          expect(sent(ws).some(item => item.type === MessageType.CHARACTER_UPDATE)).toBe(false);
        } finally { protocol.disconnect(); }
      });

      it.each([
        ['table create', MessageType.NEW_TABLE_REQUEST, { table_name: 'Scene', local_table_id: 'local-original' }],
        ['table copy', MessageType.NEW_TABLE_REQUEST, { table_name: 'Copied', source_table_id: tableId }],
        ['table import', MessageType.NEW_TABLE_REQUEST, { table_name: 'Imported', table_data: { layers: { tokens: [] } } }],
        ['XP award', MessageType.XP_AWARD, { character_id: 'hero', amount: 100 }],
        ['table delete', MessageType.TABLE_DELETE, { table_id: tableId }],
        ['table settings', MessageType.TABLE_SETTINGS_UPDATE, { table_id: tableId, grid_cell_px: 75 }],
      ])('reconstructs the original %s envelope after reload and welcome', async (_label, type, data) => {
        const first = makeProtocol(); const ws = makeOpenWs(first);
        const restarted = makeProtocol(); const next = makeOpenWs(restarted);
        try {
          await dispatch(first, 'welcome', welcome()); ws.send.mockClear();
          const original = createMessage(type as MessageType, data);
          expect(first.sendMessage(original)).toBe(true); first.sendBatch();
          const transmitted = sent(ws).find(message => message.type === type)!;
          expect(first.getOperationRecoveryStatus().pending).toBe(1);
          first.disconnect();
          expect(sent(next)).toEqual([]);
          await dispatch(restarted, 'welcome', welcome()); restarted.sendBatch();
          expect(sent(next).filter(message => message.type === type)).toEqual([transmitted]);
          expect(restarted.getOperationRecoveryStatus().pending).toBe(1);
        } finally { first.disconnect(); restarted.disconnect(); }
      });

      it('does not hydrate a recovered creation when its first accepted response arrives after reload', async () => {
        const first = makeProtocol(); makeOpenWs(first);
        const restarted = makeProtocol(); makeOpenWs(restarted);
        const created = vi.fn(); window.addEventListener('new-table-response', created);
        try {
          await dispatch(first, 'welcome', welcome());
          const id = first.createNewTable('Old scene', 1000, 1000)!; first.disconnect();
          await dispatch(restarted, 'welcome', welcome());
          Object.assign(mocks.storeState, { tables: [], activeTableId: 'newer-current-scene' });
          await dispatch(restarted, 'new_table_response', { success: true, operation_id: id, table_id: tableId,
            replayed: false, table_data: { table_id: tableId, table_name: 'Old scene', width: 1000, height: 1000 } },
            { causation_id: id });
          expect(created).not.toHaveBeenCalled();
          expect(mocks.storeState.activeTableId).toBe('newer-current-scene');
          expect(restarted.getOperationRecoveryStatus().pending).toBe(0);
        } finally { window.removeEventListener('new-table-response', created); first.disconnect(); restarted.disconnect(); }
      });

      it.each([{ user_id: 2 }, { operation_recovery: { ...capability, session_instance: 'replacement' } },
        { operation_recovery: null }])('does not replay another actor, instance or unsupported contract', async patch => {
        const first = makeProtocol(); makeOpenWs(first);
        const restarted = makeProtocol(); const next = makeOpenWs(restarted);
        try {
          await dispatch(first, 'welcome', welcome()); first.awardCharacterXP('hero', 100, 'quest'); first.disconnect();
          await dispatch(restarted, 'welcome', welcome(patch)); restarted.sendBatch();
          expect(sent(next).some(message => message.type === MessageType.XP_AWARD)).toBe(false);
          expect(sessionStorage.length).toBe(1);
        } finally { first.disconnect(); restarted.disconnect(); }
      });

      it('retains unknown and denied evidence instead of treating a read as receipt settlement', async () => {
        const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
        try {
          await dispatch(protocol, 'welcome', welcome()); ws.send.mockClear();
          const id = protocol.awardCharacterXP('hero', 100, 'quest')!;
          await dispatch(protocol, 'error', { code: 'outcome_unknown', outcome: 'unknown', error: 'Unknown' }, { causation_id: id });
          await dispatch(protocol, 'table_response', { table_data: { table_id: tableId } }, { causation_id: id });
          expect(protocol.getOperationRecoveryStatus().pending).toBe(1);
          await dispatch(protocol, 'error', { code: 'forbidden', error: 'Current authority required' }, { causation_id: id });
          expect(protocol.getOperationRecoveryStatus().blocked).toBe(1);
          ws.send.mockClear(); protocol.retrySavedOperations();
          expect(sent(ws).find(message => message.type === MessageType.XP_AWARD)?.message_id).toBe(id);
        } finally { protocol.disconnect(); }
      });

      it('does not transmit a high-risk request when its storage write fails', async () => {
        const protocol = makeProtocol(); const ws = makeOpenWs(protocol);
        try {
          await dispatch(protocol, 'welcome', welcome()); protocol.sendBatch(); ws.send.mockClear();
          vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
          expect(protocol.awardCharacterXP('hero', 100, 'quest')).toBeUndefined();
          expect(ws.send).not.toHaveBeenCalled();
          expect(protocol.getOperationRecoveryStatus().error).not.toBeNull();
        } finally { protocol.disconnect(); }
      });
    });

    const settings = (size: number, revision: number) => ({ table_id: 'table-abc', grid_cell_px: size,
      settings_revision: revision, dynamic_lighting_enabled: false, fog_exploration_mode: 'current_only',
      ambient_light_level: 1, cell_distance: 5, distance_unit: 'ft', grid_enabled: true, snap_to_grid: true,
      grid_color_hex: '#ffffff', background_color_hex: '#2a3441' });

    it('fences older settings receipts and reconciles a replay for a deleted table', async () => {
      const p = makeProtocol();
      Object.assign(mocks.storeState, { tables: [{ table_id: 'table-abc' }] });
      try {
        await dispatch(p, 'table_settings_changed', settings(90, 2));
        await dispatch(p, 'table_settings_changed', { ...settings(60, 1), operation_id: 'older', replayed: true });
        expect(mockSetTableUnits).toHaveBeenLastCalledWith(expect.objectContaining({ gridCellPx: 90 }));
        await dispatch(p, 'table_settings_changed', { table_id: 'table-abc', operation_id: 'older',
          replayed: true, table_deleted: true });
        expect(mocks.storeState.activeTableId).toBeNull();
        expect(mocks.storeState.tables).toEqual([]);
      } finally { p.disconnect(); }
    });

    it('retains an unknown settings intent through canonical hydration before one exact replay', async () => {
      vi.useFakeTimers();
      const p = makeProtocol(); const ws = makeOpenWs(p);
      try {
        p.sendTableSettingsUpdate('table-abc', { grid_cell_px: 60 });
        vi.advanceTimersByTime(150); p.sendBatch();
        const original = JSON.parse(ws.send.mock.calls[0][0]).data.messages[0];
        await dispatch(p, 'error', { code: 'outcome_unknown', outcome: 'unknown', resync_required: true,
          table_id: 'table-abc', operation_id: original.message_id, error: 'Unknown settings outcome' },
          { causation_id: original.message_id });
        p.sendTableSettingsUpdate('table-abc', { grid_cell_px: 90 });
        vi.advanceTimersByTime(150); p.sendBatch();
        const request = ws.send.mock.calls.map(call => JSON.parse(call[0])).find(item => item.type === MessageType.TABLE_REQUEST);
        await dispatch(p, 'table_response', { table_data: settings(60, 1) },
          { causation_id: request.message_id });
        window.dispatchEvent(new CustomEvent('table-sprites-loaded', { detail: { table_id: 'table-abc', count: 0 } }));
        p.sendBatch();
        const sent = ws.send.mock.calls.flatMap(call => {
          const frame = JSON.parse(call[0]); return frame.type === MessageType.BATCH_REQUEST ? frame.data.messages : [frame];
        }).filter((message: Message) => message.type === MessageType.TABLE_SETTINGS_UPDATE);
        expect(sent).toEqual([original, original]);
        await dispatch(p, 'table_settings_changed', { ...settings(60, 1), replayed: true, operation_id: original.message_id },
          { causation_id: original.message_id });
        p.sendBatch();
        expect(mockSetTableUnits).toHaveBeenLastCalledWith(expect.objectContaining({ gridCellPx: 90 }));
      } finally { p.disconnect(); vi.useRealTimers(); }
    });

    async function dispatch(
      p: WebClientProtocol,
      type: string,
      data: Record<string, unknown>,
      envelope: Record<string, unknown> = {},
    ) {
      const raw = JSON.stringify({ type, data, version: '0.1', priority: 5,
        timestamp: Date.now() / 1000, message_id: crypto.randomUUID(), ...envelope });
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
    }

    it.each([
      ['sprite_create', 'sprite-created'], ['sprite_remove', 'sprite-removed'],
      ['sprite_update', 'sprite-updated'], ['sprite_move', 'sprite-moved'],
      ['sprite_scale', 'sprite-scaled'], ['sprite_rotate', 'sprite-rotated'],
    ])('rejects %s without original intent identity before event dispatch', async (type, eventName) => {
      const p = makeProtocol();
      const handler = vi.fn();
      window.addEventListener(eventName, handler);
      try {
        await dispatch(p, type, { sprite_id: 's1' }, { timestamp: undefined });
        await dispatch(p, type, { sprite_id: 's1' }, { message_id: undefined });
        await dispatch(p, type, { sprite_id: 's1' }, { timestamp: null });
        await dispatch(p, type, { sprite_id: 's1' }, { message_id: '' });
        expect(handler).not.toHaveBeenCalled();
        await dispatch(p, type, { sprite_id: 's1' });
        expect(handler).toHaveBeenCalledOnce();
      } finally {
        window.removeEventListener(eventName, handler);
      }
    });

    it.each(['player_status_response', 'player_status_changed'])(
      '%s dispatches player-status-changed',
      async (messageType) => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('player-status-changed', fn);
      await dispatch(p, messageType, {
        client_id: 'client-1',
        status: { ready: true, last_action: 42 },
      });
      window.removeEventListener('player-status-changed', fn);
      expect(fn).toHaveBeenCalledOnce();
      },
    );

    it('PLAYER_KICK_RESPONSE dispatches player-kick-response', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('player-kick-response', fn);
      await dispatch(p, 'player_kick_response', {
        success: true,
        kicked_player: 'client-2',
        reason: 'inactive',
        kicked_by: 'GM',
      });
      window.removeEventListener('player-kick-response', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('PLAYER_BAN_RESPONSE dispatches player-ban-response', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('player-ban-response', fn);
      await dispatch(p, 'player_ban_response', {
        success: true,
        banned_player: 'client-2',
        reason: 'abuse',
        duration: 'permanent',
        banned_by: 'GM',
      });
      window.removeEventListener('player-ban-response', fn);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('TABLE_DATA dispatches table-data-received', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('table-data-received', fn);
      await dispatch(p, 'table_data', { table_id: 'table-abc' });
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

    it('rehydrates the active table for accepted sprite retry receipts without replaying old sprite data', async () => {
      const p = makeProtocol();
      const request = vi.spyOn(p, 'resynchronizeTable').mockImplementation(() => {});
      await dispatch(p, 'sprite_response', { table_id: 'other', success: true, resync_required: true });
      expect(request).not.toHaveBeenCalled();
      await dispatch(p, 'sprite_response', { table_id: 'table-abc', success: true, resync_required: true });
      expect(request).toHaveBeenCalledExactlyOnceWith('table-abc');
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
      await dispatch(p, 'sprite_drag_preview', { id: 's1', table_id: 'table-abc', x: 10, y: 20 });
      window.removeEventListener('sprite-drag-preview-remote', fn);
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

    it('probes an unknown original choice once with a read and never guesses another mutation', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      const original = createMessage(MessageType.ENCOUNTER_START, { table_id: 'table-1', choices: [{ text: 'Go' }] });
      p.sendMessage(original); p.sendBatch(); ws.send.mockClear();
      const tracker = (p as unknown as { commandTracking: { has: (id: string) => boolean } }).commandTracking;
      const error = { error: 'Choice outcome uncertain', code: 'choice_outcome_unknown', outcome: 'unknown',
        operation_id: original.message_id, resync_required: true };
      await dispatch(p, 'error', error, { causation_id: original.message_id }); p.sendBatch();
      expect(tracker.has(original.message_id!)).toBe(true);
      expect(JSON.parse(ws.send.mock.calls[0][0]).data.messages.map((message: Message) => message.type))
        .toEqual([MessageType.TABLE_ACTIVE_REQUEST]);
      ws.send.mockClear();
      await dispatch(p, 'error', error, { causation_id: 'another-blocked-request' }); p.sendBatch();
      expect(ws.send).not.toHaveBeenCalled();
      useEncounterStore.getState().setEncounter({ encounter_id: 'stale', title: 'Old', description: '',
        phase: 'presenting', choices: [] });
      await dispatch(p, 'encounter_state', { encounter: null, operation_id: original.message_id,
        state_authoritative: true, replayed: true }, { causation_id: original.message_id });
      expect(useEncounterStore.getState().encounter).toBeNull();
      expect(tracker.has(original.message_id!)).toBe(false);
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

    it('retains an unknown multiclass original and probes it once without a replacement mutation', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      mocks.storeState.characters = [{ id: 'hero', version: 3, data: { level: 3 } }];
      const id = p.requestCharacterMulticlass('hero', 'rogue', undefined, 3)!;
      const tracker = (p as unknown as { commandTracking: { has: (id: string) => boolean } }).commandTracking;
      ws.send.mockClear();
      const unknown = { success: false, character_id: 'hero', operation_id: id, outcome: 'unknown',
        code: 'character_outcome_unknown', resync_required: true, error: 'Checking advancement' };
      await dispatch(p, 'multiclass_response', unknown, { causation_id: id }); p.sendBatch();
      expect(tracker.has(id)).toBe(true);
      expect(JSON.parse(ws.send.mock.calls[0][0]).data.messages.map((message: Message) => message.type))
        .toEqual([MessageType.TABLE_ACTIVE_REQUEST]);
      ws.send.mockClear();
      await dispatch(p, 'multiclass_response', unknown, { causation_id: id }); p.sendBatch();
      await dispatch(p, 'multiclass_response', { success: false, character_id: 'hero', operation_id: id,
        code: 'forbidden', error: 'Current edit authority required' }, { causation_id: id });
      expect(tracker.has(id)).toBe(true); expect(ws.send).not.toHaveBeenCalled();
      await dispatch(p, 'multiclass_response', { success: true, character_id: 'hero', operation_id: id,
        version: 4, accepted_version: 4, replayed: true, resync_required: true }, { causation_id: id }); p.sendBatch();
      expect(tracker.has(id)).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).data.messages.map((message: Message) => message.type))
        .toContain(MessageType.CHARACTER_LOAD_REQUEST);
    });

    it('defers multiclass receipt hydration until all local character edits settle', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      mocks.storeState.characters = [{ id: 'hero', version: 3, data: { level: 3 } }];
      p.updateCharacter('hero', { name: 'Local' }, 3); p.updateCharacter('hero', { data: { notes: 'Keep' } }, 3); p.sendBatch();
      const [first, second] = JSON.parse(ws.send.mock.calls[0][0]).data.messages;
      const load = vi.spyOn(p, 'loadCharacter');
      const update = mocks.storeState.updateCharacter as Mock; update.mockClear();
      await dispatch(p, 'multiclass_response', { success: true, character_id: 'hero', version: 4,
        resync_required: true, accepted_version: 4, accepted_level: 4, replayed: true });
      expect(load).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
      await dispatch(p, 'character_update_response', { success: true, character_id: 'hero', version: 5 },
        { causation_id: first.message_id });
      expect(load).not.toHaveBeenCalled();
      await dispatch(p, 'character_update_response', { success: true, character_id: 'hero', version: 6 },
        { causation_id: second.message_id });
      expect(load).toHaveBeenCalledOnce();
    });

    it('removes an archived character on multiclass receipt without loading its obsolete source', async () => {
      const p = makeProtocol('ROOM', 7);
      mocks.storeState.characters = [{ id: 'hero', version: 3, data: { level: 3 } }];
      const load = vi.spyOn(p, 'loadCharacter');
      await dispatch(p, 'multiclass_response', { success: true, character_id: 'hero', version: 5,
        character_archived: true, replayed: true, resync_required: true });
      expect(mocks.storeState.removeCharacter).toHaveBeenCalledWith('hero');
      expect(load).not.toHaveBeenCalled();
    });

    it('XP replay reloads current state without installing an old receipt version', async () => {
      const updateCharacter = vi.fn();
      mocks.storeState.updateCharacter = updateCharacter;
      mocks.storeState.characters = [{ id: 'c-xp', version: 8, data: { experience: 1000 } }];
      const p = makeProtocol();
      const load = vi.spyOn(p, 'loadCharacter');
      await dispatch(p, 'xp_award_response', {
        success: true, character_id: 'c-xp', version: 6, new_xp: 900,
        replayed: true, resync_required: true,
      });
      expect(updateCharacter).not.toHaveBeenCalled();
      expect(load).toHaveBeenCalledWith('c-xp');
    });

    it('table creation replay reconciles the draft without reentering scene hydration', async () => {
      const p = makeProtocol();
      const reconcile = vi.fn();
      mocks.storeState.tables = [{ table_id: 'local-draft', table_name: 'Draft', width: 1000, height: 800 }];
      mocks.storeState.reconcileTableIdentity = reconcile;
      const list = vi.spyOn(p, 'requestTableList');
      const scene = vi.spyOn(p, 'requestTableData');
      const event = vi.fn();
      window.addEventListener('new-table-response', event);
      await dispatch(p, 'new_table_response', {
        table_id: 'server-table', local_table_id: 'local-draft', replayed: true,
        table_data: { table_id: 'server-table', table_name: 'Current name', width: 1000, height: 800, layers: {} },
      });
      window.removeEventListener('new-table-response', event);
      expect(reconcile).toHaveBeenCalledWith('local-draft', {
        table_id: 'server-table', table_name: 'Current name', width: 1000, height: 800,
      });
      expect(list).toHaveBeenCalledOnce();
      expect(scene).not.toHaveBeenCalled(); // A replay must not switch an unrelated active table.
      expect(event).not.toHaveBeenCalled();
    });

    it('a deleted creation receipt removes its draft and cannot resurrect a scene', async () => {
      const p = makeProtocol();
      mocks.storeState.tables = [{ table_id: 'local-draft' }, { table_id: 'other' }];
      const list = vi.spyOn(p, 'requestTableList');
      const scene = vi.spyOn(p, 'requestTableData');
      await dispatch(p, 'new_table_response', {
        table_id: 'deleted', local_table_id: 'local-draft', replayed: true, table_deleted: true,
      });
      expect(mocks.storeState.tables).toEqual([{ table_id: 'other' }]);
      expect(list).toHaveBeenCalledOnce();
      expect(scene).not.toHaveBeenCalled();
    });

    it('an older advancement document cannot regress a newer character', async () => {
      const updateCharacter = vi.fn();
      mocks.storeState.updateCharacter = updateCharacter;
      mocks.storeState.characters = [{ id: 'c-xp', version: 8, data: { experience: 1000 } }];
      await dispatch(makeProtocol(), 'xp_award_response', {
        success: true, character_id: 'c-xp', version: 6,
        character_data: { data: { experience: 900 } },
      });
      expect(updateCharacter).not.toHaveBeenCalled();
    });

    it('unknown XP outcomes request a canonical read and emit the uncertainty', async () => {
      const p = makeProtocol();
      const load = vi.spyOn(p, 'loadCharacter');
      const event = vi.fn();
      window.addEventListener('xp-award-response', event);
      await dispatch(p, 'xp_award_response', {
        success: false, character_id: 'c-xp', outcome: 'unknown', code: 'outcome_unknown',
      });
      window.removeEventListener('xp-award-response', event);
      expect(load).toHaveBeenCalledWith('c-xp');
      expect((event.mock.calls[0][0] as CustomEvent).detail.outcome).toBe('unknown');
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

    it('CHARACTER_LOAD_RESPONSE stores nested character data and dispatches character-loaded', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('character-loaded', fn);
      await dispatch(p, 'character_load_response', {
        success: true,
        version: 4,
        character_data: {
          character_id: 'c1',
          name: 'Hero',
          controlledBy: [1],
          data: { level: 3 },
        },
      });
      window.removeEventListener('character-loaded', fn);
      expect(mocks.storeState.addCharacter).toHaveBeenCalledWith(expect.objectContaining({
        id: 'c1',
        name: 'Hero',
        controlledBy: [1],
        data: { level: 3 },
        version: 4,
      }));
      expect(fn).toHaveBeenCalledOnce();
    });

    it('CHARACTER_LOAD_RESPONSE preserves a valid local version when the server version is malformed', async () => {
      Object.assign(mocks.storeState, makeStoreState({
        characters: [{ id: 'c1', version: 7, name: 'Hero', data: {} }],
      }));
      const p = makeProtocol();

      await dispatch(p, 'character_load_response', {
        success: true,
        version: 'not-a-version',
        character_data: { character_id: 'c1', name: 'Hero', data: { level: 4 } },
      });

      expect(mocks.storeState.updateCharacter).toHaveBeenCalledWith('c1', expect.objectContaining({
        version: 7,
      }));
    });

    it('CHARACTER_LIST_RESPONSE defaults malformed versions instead of storing NaN', async () => {
      const p = makeProtocol();

      await dispatch(p, 'character_list_response', {
        characters: [{ character_id: 'c1', name: 'Hero', version: 'invalid' }],
      });

      expect(mocks.storeState.reconcileServerCharacters).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'c1', version: 1 }),
      ]);
    });

    it('CHARACTER_SAVE_RESPONSE resolves the correlated temporary character', async () => {
      const first = { id: 'temp-first', name: 'First', syncStatus: 'syncing' };
      const second = { id: 'temp-second', name: 'Second', syncStatus: 'syncing' };
      Object.assign(mocks.storeState, makeStoreState({ characters: [first, second] }));
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.saveCharacter({ character_id: first.id, name: first.name });
      p.saveCharacter({ character_id: second.id, name: second.name });
      p.sendBatch();
      const batch = JSON.parse((ws.send as Mock).mock.calls[0][0]);
      const secondRequestId = batch.data.messages[1].message_id;

      await dispatch(
        p,
        'character_save_response',
        { success: true, character_id: 'real-second', version: 1 },
        { correlation_id: secondRequestId },
      );

      expect(mocks.storeState.removeCharacter).toHaveBeenCalledWith('temp-second');
      expect(mocks.storeState.removeCharacter).not.toHaveBeenCalledWith('temp-first');
      expect(mocks.storeState.addCharacter).toHaveBeenCalledWith(expect.objectContaining({
        id: 'real-second',
        name: 'Second',
      }));
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

    it('merges incoming character stat deltas without dropping other sheet fields', async () => {
      mocks.storeState.characters = [{ id: 'c1', version: 2,
        data: { stats: { hp: 10, maxHp: 20, ac: 12 }, inventory: ['rope'], spellSlots: { 1: 2 } } }];
      await dispatch(makeProtocol(), 'character_update', {
        character_id: 'c1', updates: { data: { stats: { hp: 0, ac: null }, spellSlots: null } }, version: 3,
      });
      expect(mocks.storeState.updateCharacter).toHaveBeenCalledWith('c1', expect.objectContaining({
        data: { stats: { hp: 0, maxHp: 20 }, inventory: ['rope'] }, version: 3,
      }));
    });

    it('CHARACTER_UPDATE_RESPONSE success updates sync status', async () => {
      const store = mocks.storeState as Record<string, unknown>;
      const updateCharacter = vi.fn();
      store.updateCharacter = updateCharacter;
      const p = makeProtocol();
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c5', version: 3 });
      expect(updateCharacter).toHaveBeenCalledWith('c5', expect.objectContaining({ syncStatus: 'synced', version: 3 }));
    });

    it('CHARACTER_UPDATE_RESPONSE ignores a malformed version', async () => {
      const store = mocks.storeState as Record<string, unknown>;
      const updateCharacter = vi.fn();
      store.updateCharacter = updateCharacter;
      const p = makeProtocol();

      await dispatch(p, 'character_update_response', {
        success: true,
        character_id: 'c5',
        version: '3oops',
      });

      expect(updateCharacter).toHaveBeenCalledWith('c5', { syncStatus: 'synced' });
    });

    it('replays pending character changes once at the authoritative version', async () => {
      const store = mocks.storeState as Record<string, unknown>;
      const updateCharacter = vi.fn();
      store.updateCharacter = updateCharacter;
      const p = makeProtocol('ROOM', 7);
      const ws = makeOpenWs(p);
      p.updateCharacter('c-conflict', { hp: 12 }, 2);
      p.sendBatch();
      ws.send.mockClear();

      await dispatch(p, 'character_update_response', {
        success: false,
        character_id: 'c-conflict',
        error: 'Version conflict',
        current_version: 5,
      });
      p.sendBatch();

      expect(updateCharacter).toHaveBeenCalledWith('c-conflict', {
        version: 5,
        syncStatus: 'syncing',
      });
      const retryBatch = JSON.parse(ws.send.mock.calls[0][0]);
      expect(retryBatch.data.messages[0]).toMatchObject({
        type: MessageType.CHARACTER_UPDATE,
        data: {
          character_id: 'c-conflict',
          updates: { hp: 12 },
          user_id: 7,
          version: 5,
        },
      });

      ws.send.mockClear();
      await dispatch(p, 'character_update_response', {
        success: false,
        character_id: 'c-conflict',
        error: 'Version conflict',
        current_version: 6,
      });
      p.sendBatch();
      expect(ws.send).not.toHaveBeenCalled();
      expect(updateCharacter).toHaveBeenLastCalledWith('c-conflict', { syncStatus: 'error' });
    });

    it('keeps later character updates pending after an earlier acknowledgement', async () => {
      const p = makeProtocol('ROOM', 7);
      const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 }, 2);
      p.updateCharacter('c1', { ac: 16 }, 2);
      p.sendBatch();
      const batch = JSON.parse(ws.send.mock.calls[0][0]);
      const [firstRequest, secondRequest] = batch.data.messages;
      ws.send.mockClear();

      await dispatch(
        p,
        'character_update_response',
        { success: true, character_id: 'c1', version: 3 },
        { correlation_id: firstRequest.message_id },
      );
      await dispatch(
        p,
        'character_update_response',
        { success: false, character_id: 'c1', error: 'Version conflict', current_version: 3 },
        { correlation_id: secondRequest.message_id },
      );
      p.sendBatch();

      const retryBatch = JSON.parse(ws.send.mock.calls[0][0]);
      expect(retryBatch.data.messages[0]).toMatchObject({
        data: { character_id: 'c1', updates: { ac: 16 }, version: 3 },
      });
    });

    it('does not let a duplicate receipt settle a later edit to the same character', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 }, 2); p.sendBatch();
      const first = JSON.parse(ws.send.mock.calls[0][0]).data.messages[0];
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c1', version: 3 },
        { correlation_id: first.message_id });
      ws.send.mockClear();
      p.updateCharacter('c1', { ac: 16 }, 3); p.sendBatch();
      const second = JSON.parse(ws.send.mock.calls[0][0]).data.messages[0];
      ws.send.mockClear();
      const update = mocks.storeState.updateCharacter as Mock; update.mockClear();
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c1', version: 3 },
        { correlation_id: first.message_id });
      expect(update).not.toHaveBeenCalled();
      await dispatch(p, 'character_update_response',
        { success: false, character_id: 'c1', error: 'Version conflict', current_version: 4 },
        { correlation_id: second.message_id });
      p.sendBatch();
      expect(JSON.parse(ws.send.mock.calls[0][0]).data.messages[0].data).toMatchObject({ updates: { ac: 16 }, version: 4 });
    });

    it('uses causation identity before a shared trace correlation', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 }, 2); p.updateCharacter('c1', { ac: 16 }, 2); p.sendBatch();
      const [first, second] = JSON.parse(ws.send.mock.calls[0][0]).data.messages;
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c1', version: 3 },
        { causation_id: first.message_id, correlation_id: 'shared-trace' });
      expect(mocks.storeState.updateCharacter).toHaveBeenLastCalledWith('c1', { syncStatus: 'syncing', version: 3 });
      ws.send.mockClear();
      await dispatch(p, 'character_update_response',
        { success: false, character_id: 'c1', error: 'Version conflict', current_version: 3 },
        { causation_id: second.message_id, correlation_id: 'shared-trace' });
      p.sendBatch();
      expect(JSON.parse(ws.send.mock.calls[0][0]).data.messages[0].data.updates).toEqual({ ac: 16 });
    });

    it('never guesses a pending owner from an ambiguous legacy receipt', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 }, 2); p.updateCharacter('c1', { ac: 16 }, 2); p.sendBatch();
      const requests = JSON.parse(ws.send.mock.calls[0][0]).data.messages;
      ws.send.mockClear();
      const update = mocks.storeState.updateCharacter as Mock; update.mockClear();
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c1', version: 3 });
      expect(update).not.toHaveBeenCalled();
      for (const request of requests) {
        await dispatch(p, 'character_update_response',
          { success: false, character_id: 'c1', error: 'Version conflict', current_version: 3 },
          { causation_id: request.message_id });
      }
      p.sendBatch();
      expect(JSON.parse(ws.send.mock.calls[0][0]).data.messages.map((message: Message) => message.data?.updates))
        .toEqual([{ hp: 10 }, { ac: 16 }]);
    });

    it('keeps an unknown character intent and requests one read without replaying the mutation', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 }, 2); p.sendBatch();
      const request = JSON.parse(ws.send.mock.calls[0][0]).data.messages[0];
      ws.send.mockClear();
      const unknown = { code: 'character_outcome_unknown', outcome: 'unknown', character_id: 'c1', resync_required: true,
        error: 'Character outcome is uncertain. Reload to check before retrying.' };
      await dispatch(p, 'error', unknown, { causation_id: request.message_id }); p.sendBatch();
      expect(JSON.parse(ws.send.mock.calls[0][0]).data.messages.map((message: Message) => message.type))
        .toEqual([MessageType.TABLE_ACTIVE_REQUEST]);
      ws.send.mockClear();
      await dispatch(p, 'error', unknown, { causation_id: request.message_id }); p.sendBatch();
      expect(ws.send).not.toHaveBeenCalled();
      expect(mocks.storeState.updateCharacter).toHaveBeenLastCalledWith('c1', { syncStatus: 'syncing' });
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c1', version: 3, resync_required: true },
        { causation_id: request.message_id }); p.sendBatch();
      const types = ws.send.mock.calls.flatMap(call => {
        const message = JSON.parse(call[0]); return message.type === MessageType.BATCH_REQUEST
          ? message.data.messages.map((item: Message) => item.type) : [message.type];
      });
      expect(types).toContain(MessageType.CHARACTER_LOAD_REQUEST);
      expect(types).toContain(MessageType.TABLE_REQUEST);
      expect(types).not.toContain(MessageType.CHARACTER_UPDATE);
    });

    it('hydrates a recovery hint instead of treating an empty old patch as current character data', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      const update = mocks.storeState.updateCharacter as Mock; update.mockClear();
      await dispatch(p, 'character_update', { character_id: 'c1', updates: {}, version: 3,
        source: 'recovery', resync_required: true });
      p.sendBatch();
      expect(update).not.toHaveBeenCalled();
      expect(JSON.parse(ws.send.mock.calls[0][0]).data.messages.map((message: Message) => message.type))
        .toContain(MessageType.CHARACTER_LOAD_REQUEST);
    });

    it('defers a peer recovery hint until every local edit to the character settles', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 }, 2); p.updateCharacter('c1', { ac: 16 }, 2); p.sendBatch();
      const [first, second] = JSON.parse(ws.send.mock.calls[0][0]).data.messages;
      ws.send.mockClear();
      await dispatch(p, 'character_update', { character_id: 'c1', updates: {}, version: 3, resync_required: true });
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c1', version: 3 },
        { causation_id: first.message_id }); p.sendBatch();
      expect(ws.send).not.toHaveBeenCalled();
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c1', version: 4 },
        { causation_id: second.message_id }); p.sendBatch();
      const sent = JSON.parse(ws.send.mock.calls[0][0]).data.messages;
      expect(sent.filter((message: Message) => message.type === MessageType.CHARACTER_LOAD_REQUEST)).toHaveLength(1);
      expect(sent.some((message: Message) => message.type === MessageType.CHARACTER_UPDATE)).toBe(false);
    });

    it('removes an archived character on retained acceptance without requesting its obsolete source', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 }, 2); p.sendBatch();
      const request = JSON.parse(ws.send.mock.calls[0][0]).data.messages[0]; ws.send.mockClear();
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c1', version: 3,
        character_archived: true, resync_required: true }, { causation_id: request.message_id }); p.sendBatch();
      expect(mocks.storeState.removeCharacter).toHaveBeenCalledWith('c1');
      const sent = ws.send.mock.calls.flatMap(call => JSON.parse(call[0]).data.messages ?? []);
      expect(sent.some((message: Message) => message.type === MessageType.CHARACTER_LOAD_REQUEST)).toBe(false);
    });

    it('does not apply an older delta after a newer character version', async () => {
      mocks.storeState.characters = [{ id: 'c1', version: 5 }];
      const update = mocks.storeState.updateCharacter as Mock; update.mockClear();
      await dispatch(makeProtocol(), 'character_update', { character_id: 'c1', updates: { name: 'Old' }, version: 3 });
      expect(update).not.toHaveBeenCalled();
    });

    it('does not turn an unknown outcome into a new conflict retry after restart', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 }, 2); p.sendBatch();
      const request = JSON.parse(ws.send.mock.calls[0][0]).data.messages[0];
      await dispatch(p, 'error', { code: 'character_outcome_unknown', outcome: 'unknown',
        error: 'Character outcome is uncertain. Reload to check before retrying.' },
        { causation_id: request.message_id }); p.sendBatch(); ws.send.mockClear();
      await dispatch(p, 'character_update_response',
        { success: false, character_id: 'c1', error: 'Version conflict', current_version: 3, not_accepted: true },
        { causation_id: request.message_id }); p.sendBatch();
      const sent = ws.send.mock.calls.flatMap(call => {
        const message = JSON.parse(call[0]); return message.type === MessageType.BATCH_REQUEST ? message.data.messages : [message];
      });
      expect(sent.some((message: Message) => message.type === MessageType.CHARACTER_UPDATE)).toBe(false);
      expect(sent.some((message: Message) => message.type === MessageType.CHARACTER_LOAD_REQUEST)).toBe(true);
    });

    it.each(['forbidden', 'conflict'])('retains a denied %s lookup until the original outcome can be confirmed', async (code) => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 }, 2); p.sendBatch();
      const request = JSON.parse(ws.send.mock.calls[0][0]).data.messages[0]; ws.send.mockClear();
      await dispatch(p, 'character_update_response', { success: false, character_id: 'c1', code, error: 'Lookup denied' },
        { causation_id: request.message_id }); p.sendBatch();
      expect(ws.send).not.toHaveBeenCalled();
      expect(mocks.storeState.updateCharacter).toHaveBeenLastCalledWith('c1', { syncStatus: 'syncing' });
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c1', version: 3,
        replayed: true, resync_required: true }, { causation_id: request.message_id }); p.sendBatch();
      expect(mocks.storeState.updateCharacter).toHaveBeenLastCalledWith('c1', { syncStatus: 'synced', version: 3 });
      expect(JSON.parse(ws.send.mock.calls[0][0]).data.messages.map((message: Message) => message.type))
        .toContain(MessageType.CHARACTER_LOAD_REQUEST);
    });

    it('defers recovery hydration until later edits to that character settle', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 }, 2); p.updateCharacter('c1', { ac: 16 }, 2); p.sendBatch();
      const [first, second] = JSON.parse(ws.send.mock.calls[0][0]).data.messages; ws.send.mockClear();
      await dispatch(p, 'character_update_response',
        { success: false, character_id: 'c1', error: 'Character update did not commit', resync_required: true },
        { causation_id: first.message_id }); p.sendBatch();
      expect(ws.send).not.toHaveBeenCalled();
      expect(mocks.storeState.updateCharacter).toHaveBeenLastCalledWith('c1', { syncStatus: 'syncing' });
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c1', version: 3 },
        { causation_id: second.message_id }); p.sendBatch();
      const sent = ws.send.mock.calls.flatMap(call => {
        const message = JSON.parse(call[0]); return message.type === MessageType.BATCH_REQUEST ? message.data.messages : [message];
      });
      expect(sent.some((message: Message) => message.type === MessageType.CHARACTER_LOAD_REQUEST)).toBe(true);
    });

    it('does not regress the known character version when an older receipt arrives', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 }, 2); p.sendBatch();
      const request = JSON.parse(ws.send.mock.calls[0][0]).data.messages[0];
      mocks.storeState.characters = [{ id: 'c1', version: 4 }];
      await dispatch(p, 'character_update_response', { success: true, character_id: 'c1', version: 3 },
        { causation_id: request.message_id });
      expect(mocks.storeState.updateCharacter).toHaveBeenLastCalledWith('c1', { syncStatus: 'synced' });
    });

    it('treats a sent edit as uncertain after transport disconnect', async () => {
      const p = makeProtocol('ROOM', 7); const ws = makeOpenWs(p);
      p.updateCharacter('c1', { hp: 10 }, 2); p.sendBatch();
      const request = JSON.parse(ws.send.mock.calls[0][0]).data.messages[0];
      p.disconnect(); const resumed = makeOpenWs(p);
      await dispatch(p, 'character_update_response',
        { success: false, character_id: 'c1', error: 'Version conflict', current_version: 3, not_accepted: true },
        { causation_id: request.message_id }); p.sendBatch();
      const sent = resumed.send.mock.calls.flatMap(call => {
        const message = JSON.parse(call[0]); return message.type === MessageType.BATCH_REQUEST ? message.data.messages : [message];
      });
      expect(sent.some((message: Message) => message.type === MessageType.CHARACTER_UPDATE)).toBe(false);
      expect(sent.some((message: Message) => message.type === MessageType.CHARACTER_LOAD_REQUEST)).toBe(true);
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
      await dispatch(p, 'error', { action_id: 'act-x', error: 'rejected' });
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

    it.each(['success', 'table_update'])('%s deletion removes active scene state and fences delayed snapshots', async type => {
      const p = makeProtocol();
      Object.assign(mocks.storeState, { activeTableId: 'table-abc',
        tables: [{ table_id: 'table-abc' }, { table_id: 'kept' }],
        sprites: [{ id: 'token' }], walls: [{ wall_id: 'wall' }], selectedSprites: ['token'] });
      const event = vi.fn(); const table = vi.fn();
      window.addEventListener('table-deleted', event);
      window.addEventListener('table-response', table);
      try {
        await dispatch(p, type, { operation: 'delete', table_id: 'table-abc', operation_id: 'original' });
        expect(mocks.storeState).toMatchObject({ tables: [{ table_id: 'kept' }], activeTableId: null,
          sprites: [], walls: [], selectedSprites: [] });
        expect(event).toHaveBeenCalledOnce();
        expect(mockSetActiveTableId).not.toHaveBeenCalled();
        await dispatch(p, 'table_response', { table_data: { table_id: 'table-abc' } });
        await dispatch(p, 'table_active_response', { success: true, table_id: 'table-abc' });
        expect(table).not.toHaveBeenCalled();
        expect(mockSetActiveTableId).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener('table-deleted', event);
        window.removeEventListener('table-response', table);
        p.disconnect();
      }
    });

    it('removes a peer-deleted inactive table without clearing the current scene', async () => {
      const p = makeProtocol();
      Object.assign(mocks.storeState, { tables: [{ table_id: 'table-abc' }, { table_id: 'inactive' }],
        sprites: [{ id: 'current-token' }], walls: [{ wall_id: 'current-wall' }] });
      await dispatch(p, 'table_update', { operation: 'delete', table_id: 'inactive' });
      expect(mocks.storeState).toMatchObject({ tables: [{ table_id: 'table-abc' }], activeTableId: 'table-abc',
        sprites: [{ id: 'current-token' }], walls: [{ wall_id: 'current-wall' }] });
      p.disconnect();
    });

    it('does not mistake a sprite deletion success for table deletion', async () => {
      const p = makeProtocol(); const event = vi.fn();
      window.addEventListener('table-deleted', event);
      try {
        await dispatch(p, 'success', { message: 'Sprite deleted successfully', operation: 'delete',
          table_id: 'table-abc', sprite_id: 'token' });
        expect(event).not.toHaveBeenCalled();
        expect(mocks.storeState.activeTableId).toBe('table-abc');
      } finally { window.removeEventListener('table-deleted', event); p.disconnect(); }
    });
  });

  // ── More outgoing request methods ────────────────────────────────────────

  describe('outgoing requests', () => {
    it('does not let update fields overwrite captured table or sprite identity', () => {
      const p = makeProtocol(); const ws = makeOpenWs(p);
      p.updateSprite('text-captured', { sprite_id: 'evil', table_id: 'evil', metadata: 'text' }, 'table-captured');
      p.sendBatch();
      const msg = JSON.parse(ws.send.mock.calls[0][0]).data.messages[0];
      expect(msg.data).toMatchObject({ sprite_id: 'text-captured', table_id: 'table-captured' });
    });
    it('createSprite sends sprite_create with sprite_data', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.createSprite({ name: 'Goblin', table_id: 'table-abc' });
      p.sendBatch();
      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]).data.messages[0];
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
      p.sendBatch();
      const msg = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]).data.messages[0];
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

    it('requestPlayerStatus sends a direction-specific request', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      p.requestPlayerStatus('client-2');
      p.sendBatch();
      const batch = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      const inner = batch.data.messages[0];
      expect(inner.type).toBe('player_status_request');
      expect(inner.data).toEqual({ client_id: 'client-2' });
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
    beforeEach(() => {
      Object.assign(mocks.storeState, makeStoreState({ activeTableId: 'tbl1' }));
    });

    async function dispatch(p: WebClientProtocol, type: string, data: Record<string, unknown>, correlation_id?: string) {
      const raw = JSON.stringify({ type, data, version: '0.1', priority: 5, correlation_id });
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
    }

    it('dispatches strictly parsed object events and snapshot chunks', async () => {
      const p = makeProtocol();
      const object = {
        id: 'dd830253-e2bf-4a92-9862-eabe85f79c99',
        table_id: '9e8ed60d-f18c-4f47-a5ce-fc04db50506a',
        kind: 'line',
        geometry: {
          kind: 'line',
          start: { x: 0, y: 0, pressure: 1 },
          end: { x: 10, y: 10, pressure: 1 },
        },
        transform: { x: 0, y: 0, scale_x: 1, scale_y: 1 },
        style: { stroke_rgba: [1, 0, 0, 1], width: 2, fill_rgba: null },
        created_by: 1,
        version: 1,
        z_order: 1,
        created_at: '2026-09-29T00:00:00Z',
        updated_at: '2026-09-29T00:00:00Z',
      };
      const event = vi.fn();
      const chunk = vi.fn();
      window.addEventListener('paint-object-event', event);
      window.addEventListener('paint-snapshot-chunk', chunk);

      await dispatch(p, 'paint_object_event', {
        operation_id: '856e7eca-6461-4a42-a273-25c1171b5cc3',
        table_id: object.table_id,
        revision: 1,
        action: 'create',
        object,
      });
      await dispatch(p, 'paint_snapshot_chunk', {
        snapshot_id: 'a8f761db-c98d-46d6-b690-88ed74135fd1',
        table_id: object.table_id,
        revision: 1,
        chunk_index: 0,
        chunk_count: 1,
        complete: true,
        objects: [object],
      }, 'snapshot-request-1');

      window.removeEventListener('paint-object-event', event);
      window.removeEventListener('paint-snapshot-chunk', chunk);
      expect((event.mock.calls[0][0] as CustomEvent).detail.object.id).toBe(object.id);
      expect((chunk.mock.calls[0][0] as CustomEvent).detail.objects).toEqual([object]);
      expect((chunk.mock.calls[0][0] as CustomEvent).detail.request_id).toBe('snapshot-request-1');
    });
  });

  describe('paint outgoing methods', () => {
    it('sends canvas commands and history directly without a transport batch', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      const tableId = '9e8ed60d-f18c-4f47-a5ce-fc04db50506a';
      const command = { table_id: tableId, operation_id: crypto.randomUUID(), issued_at: Date.now(), mode: 'undo' };
      expect(p.sendCanvasCommand(command)).toBe(true);
      expect(p.requestCanvasHistory(tableId)).toBe(true);
      expect(ws.send.mock.calls.map(([raw]) => JSON.parse(raw as string).type)).toEqual(['canvas_command', 'canvas_history_request']);
      ws.readyState = WebSocket.CLOSED;
      expect(p.sendCanvasCommand(command)).toBe(false);
      expect(p.requestCanvasHistory(tableId)).toBe(false);
      expect(ws.send).toHaveBeenCalledTimes(2);
    });
    it('sends object commands with captured table and operation IDs', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      const tableId = '9e8ed60d-f18c-4f47-a5ce-fc04db50506a';
      const operationId = '856e7eca-6461-4a42-a273-25c1171b5cc3';
      const object = {
        id: 'dd830253-e2bf-4a92-9862-eabe85f79c99',
        kind: 'circle' as const,
        geometry: { kind: 'circle' as const, diameter: 20 },
        transform: { x: 4, y: 5, scale_x: 1, scale_y: 1 },
        style: {
          stroke_rgba: [1, 0, 0, 1] as [number, number, number, number],
          width: 2,
          fill_rgba: null,
        },
      };

      expect(p.createPaintObject(tableId, operationId, object)).toBe(true);
      expect(p.updatePaintObject(tableId, operationId, object.id, 1, object)).toBe(true);
      expect(p.deletePaintObject(tableId, operationId, object.id, 2)).toBe(true);
      expect(p.requestPaintSnapshot(tableId, operationId)).toBe(true);

      const sent = ws.send.mock.calls.map(([raw]) => JSON.parse(raw as string));
      expect(sent.map(message => message.type)).toEqual([
        'paint_object_create',
        'paint_object_update',
        'paint_object_delete',
        'paint_snapshot_request',
      ]);
      expect(sent[0].data).toMatchObject({ table_id: tableId, operation_id: operationId });
      expect(sent[1].data).toMatchObject({ id: object.id, expected_version: 1 });
      expect(sent[2].data).toMatchObject({ id: object.id, expected_version: 2 });
      expect(sent[3].message_id).toBe(operationId);
    });

    it('drops disposable previews under websocket backpressure', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);
      ws.bufferedAmount = 64 * 1024 + 1;
      const object = {
        id: 'dd830253-e2bf-4a92-9862-eabe85f79c99',
        kind: 'square' as const,
        geometry: { kind: 'square' as const, size: 20 },
        transform: { x: 4, y: 5, scale_x: 1, scale_y: 1 },
        style: {
          stroke_rgba: [1, 0, 0, 1] as [number, number, number, number],
          width: 2,
          fill_rgba: null,
        },
      };

      expect(p.sendPaintPreview(
        '9e8ed60d-f18c-4f47-a5ce-fc04db50506a',
        object.id,
        1,
        Date.now() + 1_000,
        object,
      )).toBe(false);
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('measurement synchronization', () => {
    async function dispatch(p: WebClientProtocol, type: string, data: Record<string, unknown>) {
      const raw = JSON.stringify({ type, data, version: '0.1', priority: 5 });
      await (p as unknown as Record<string, (...a: unknown[]) => Promise<void>>)['handleIncomingMessage'](raw);
    }

    it('emits incoming sync data for the measurement service', async () => {
      const p = makeProtocol();
      const fn = vi.fn();
      window.addEventListener('measurements-synced', fn);

      await dispatch(p, 'measurement_sync', {
        table_id: 'table-abc',
        measurements: [{ measurement_id: 'line-1', kind: 'line' }],
      });

      window.removeEventListener('measurements-synced', fn);
      expect(fn).toHaveBeenCalledOnce();
      expect((fn.mock.calls[0][0] as CustomEvent).detail.table_id).toBe('table-abc');
    });

    it('sends a completed measurement against the active table', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);

      p.upsertMeasurement('line', {
        id: 'line-1',
        start: { x: 1, y: 2 },
        end: { x: 3, y: 4 },
      });

      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent).toMatchObject({
        type: 'measurement_upsert',
        data: {
          table_id: 'table-abc',
          measurement_id: 'line-1',
          kind: 'line',
        },
      });
    });

    it('requests table-scoped measurement state', () => {
      const p = makeProtocol();
      const ws = makeOpenWs(p);

      p.requestMeasurementSync();

      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent).toMatchObject({
        type: 'measurement_sync',
        data: { table_id: 'table-abc' },
      });
    });
  });

  describe('automatic reconnect', () => {
    const activeProtocols = new Set<WebClientProtocol>();

    function makeReconnectProtocol() {
      const protocol = makeProtocol();
      activeProtocols.add(protocol);
      return protocol;
    }

    afterEach(async () => {
      for (const protocol of activeProtocols) {
        protocol.disconnect();
      }
      activeProtocols.clear();
      await Promise.resolve();
      vi.clearAllTimers();
    });

    function makeLifecycleWs() {
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

    function installWebSocketFactory() {
      const sockets: ReturnType<typeof makeLifecycleWs>[] = [];
      const constructor = vi.fn(function() {
        const socket = makeLifecycleWs();
        sockets.push(socket);
        return socket;
      });
      vi.stubGlobal('WebSocket', Object.assign(constructor, {
        CONNECTING: 0,
        OPEN: 1,
        CLOSING: 2,
        CLOSED: 3,
      }));
      return { sockets, constructor };
    }

    async function openInitialConnection(
      protocol: WebClientProtocol,
      sockets: ReturnType<typeof makeLifecycleWs>[],
    ) {
      const connection = protocol.connect();
      sockets[0].readyState = WebSocket.OPEN;
      sockets[0].onopen!();
      await connection;
    }

    it('cancels a pending retry on intentional disconnect', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const { sockets, constructor } = installWebSocketFactory();
      const protocol = makeReconnectProtocol();
      await openInitialConnection(protocol, sockets);

      sockets[0].onclose!({ code: 1006, reason: '', wasClean: false });
      expect(vi.getTimerCount()).toBe(1);

      protocol.disconnect();
      await vi.advanceTimersByTimeAsync(30_000);

      expect(constructor).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('continues retrying after a reconnect attempt fails', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { sockets, constructor } = installWebSocketFactory();
      const protocol = makeReconnectProtocol();
      await openInitialConnection(protocol, sockets);

      sockets[0].onclose!({ code: 1006, reason: '', wasClean: false });
      vi.runOnlyPendingTimers();
      expect(constructor).toHaveBeenCalledTimes(2);

      sockets[1].onerror!(new Event('error'));
      await Promise.resolve();
      await Promise.resolve();
      vi.runOnlyPendingTimers();

      expect(constructor).toHaveBeenCalledTimes(3);
    });

    it('resets the retry budget after recovery', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { sockets } = installWebSocketFactory();
      const protocol = makeReconnectProtocol();
      const listener = vi.fn();
      protocol.onConnectionStateChange(listener);
      await openInitialConnection(protocol, sockets);

      sockets[0].onclose!({ code: 1012, reason: 'Restarting', wasClean: true });
      expect(listener).toHaveBeenLastCalledWith('reconnecting');
      expect(protocol.getConnectionDiagnostics()).toMatchObject({
        state: 'reconnecting',
        lastCloseCode: 1012,
        lastCloseReason: 'Restarting',
        reconnectAttempt: 1,
      });
      vi.runOnlyPendingTimers();
      sockets[1].readyState = WebSocket.OPEN;
      sockets[1].onopen!();
      await Promise.resolve();

      expect((protocol as unknown as Record<string, unknown>)['reconnectAttempts']).toBe(0);
      expect(listener).toHaveBeenLastCalledWith('connected');
    });

    it('waits for the authenticated welcome and replays an unacknowledged character edit once', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { sockets } = installWebSocketFactory();
      const protocol = makeReconnectProtocol();
      await openInitialConnection(protocol, sockets);
      const welcome = createMessage(MessageType.WELCOME, { message: 'Welcome', client_id: 'client',
        user_id: 1, username: 'Owner', session_code: 'TEST123', connection_id: 'connection', tables: [],
        role: 'owner', permissions: [], visible_layers: [], game_mode: 'free_roam', session_rules: {},
        choice_encounter: null, operation_recovery: { contract: 'session-operations-v2',
          session_instance: '1:created', domains: [...V2_RECOVERY_DOMAINS] } });
      const receive = async () => {
        await (protocol as unknown as { handleIncomingMessage(raw: string): Promise<void> })
          .handleIncomingMessage(JSON.stringify(welcome));
      };
      sessionStorage.clear();
      await receive(); protocol.sendBatch(); sockets[0].send.mockClear();
      protocol.updateCharacter('character-1', { name: 'Edited' }, 3);
      protocol.sendBatch();
      const firstBatch = JSON.parse(sockets[0].send.mock.calls[0][0] as string);
      const firstPayload = firstBatch.data.messages[0];
      sockets[0].onclose!({ code: 1012, reason: 'Restarting', wasClean: true });
      vi.runOnlyPendingTimers();
      sockets[1].readyState = WebSocket.OPEN;
      sockets[1].onopen!();
      await Promise.resolve();
      expect(sockets[1].send).not.toHaveBeenCalled();
      await receive(); protocol.sendBatch();
      const updates = sockets[1].send.mock.calls.flatMap(call => {
        const frame = JSON.parse(call[0]); return frame.type === MessageType.BATCH_REQUEST ? frame.data.messages : [frame];
      }).filter(message => message.type === MessageType.CHARACTER_UPDATE);
      expect(updates).toEqual([firstPayload]);
      sessionStorage.clear();
    });

    it('does not retry terminal policy closures', async () => {
      vi.useFakeTimers();
      const { sockets, constructor } = installWebSocketFactory();
      const protocol = makeReconnectProtocol();
      const connection = protocol.connect();

      sockets[0].onclose!({
        code: 1008,
        reason: 'Authentication failed',
        wasClean: true,
      });

      await expect(connection).rejects.toThrow('Authentication failed');
      await vi.advanceTimersByTimeAsync(30_000);
      expect(constructor).toHaveBeenCalledTimes(1);
    });

    it('stops after the configured retry budget is exhausted', async () => {
      vi.useFakeTimers();
      const { sockets, constructor } = installWebSocketFactory();
      const protocol = makeReconnectProtocol();
      await openInitialConnection(protocol, sockets);
      (protocol as unknown as Record<string, unknown>)['reconnectAttempts'] = 10;

      sockets[0].onclose!({ code: 1006, reason: '', wasClean: false });
      await vi.advanceTimersByTimeAsync(30_000);

      expect(constructor).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('routes heartbeat timeout through one reconnect path', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { sockets, constructor } = installWebSocketFactory();
      const protocol = makeReconnectProtocol();
      await openInitialConnection(protocol, sockets);

      await vi.advanceTimersByTimeAsync(35_000);
      vi.runOnlyPendingTimers();

      expect(sockets[0].close).toHaveBeenCalledOnce();
      expect(sockets[0].close).toHaveBeenCalledWith(4000, 'Heartbeat timeout');
      expect(constructor).toHaveBeenCalledTimes(2);
    });
  });

});

