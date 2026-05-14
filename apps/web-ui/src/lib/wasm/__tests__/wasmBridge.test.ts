import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock heavy deps before importing bridge
vi.mock('@/store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      sessionRole: 'dm',
      userId: 1,
      activeTableId: 'tbl-1',
      canControlSprite: vi.fn(() => true),
      updateSprite: vi.fn(),
      updateWall: vi.fn(),
    })),
  },
}));

vi.mock('@features/auth', () => ({
  authService: { getUserInfo: vi.fn(() => ({ id: 1 })) },
}));

vi.mock('@features/session/types/roles', () => ({
  isDM: vi.fn(() => true),
}));

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => ({ protocol: null })),
}));

vi.mock('@lib/websocket', () => ({
  createMessage: vi.fn((type, data) => ({ type, data })),
  MessageType: {
    SPRITE_MOVE: 'sprite_move',
    SPRITE_SCALE: 'sprite_scale',
    SPRITE_ROTATE: 'sprite_rotate',
  },
}));

vi.mock('react-toastify', () => ({
  toast: { error: vi.fn() },
}));

import { wasmBridgeService } from '@lib/wasm/wasmBridge';
import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { toast } from 'react-toastify';

function mockStore(overrides: Record<string, unknown> = {}) {
  vi.mocked(useGameStore.getState).mockReturnValue({
    sessionRole: 'dm',
    userId: 1,
    activeTableId: 'tbl-1',
    canControlSprite: vi.fn(() => true),
    updateSprite: vi.fn(),
    updateWall: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useGameStore.getState>);
}

function dispatchWasmOp(operation: string, spriteId: string, data: Record<string, number>) {
  window.dispatchEvent(new CustomEvent('wasm-sprite-operation', {
    detail: { operation, spriteId, data },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockStore();
  vi.mocked(isDM).mockReturnValue(true);
  wasmBridgeService.init();
});

afterEach(() => {
  wasmBridgeService.cleanup();
  vi.useRealTimers();
});

describe('WasmBridgeService', () => {
  describe('init / cleanup', () => {
    it('init is idempotent — double init does not double-register', () => {
      const eventsReceived: number[] = [];
      const recordProtocol = { sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(recordProtocol as never);
      mockStore({ activeTableId: 'tbl-1' });

      // init already called in beforeEach; calling again should be a no-op
      wasmBridgeService.init();

      dispatchWasmOp('move', 's1', { x: 5, y: 5 });
      // Only one sendMessage call despite double init
      expect(recordProtocol.sendMessage).toHaveBeenCalledTimes(1);
      void eventsReceived;
    });

    it('cleanup removes event listeners', () => {
      const protocol = { sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ activeTableId: 'tbl-1' });

      wasmBridgeService.cleanup();
      dispatchWasmOp('move', 's1', { x: 10, y: 10 });

      expect(protocol.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('setProtocol', () => {
    it('assigns the protocol', () => {
      const protocol = { sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ activeTableId: 'tbl-1' });
      wasmBridgeService.seedSpriteState('s1', { x: 0, y: 0 });

      dispatchWasmOp('move', 's1', { x: 20, y: 20 });

      expect(protocol.sendMessage).toHaveBeenCalledOnce();
    });
  });

  describe('seedSpriteState', () => {
    it('seeds positions correctly', () => {
      wasmBridgeService.seedSpriteState('s1', { x: 10, y: 20 });
      // Verify by triggering a move and checking the "from" in the message
      const protocol = { sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ activeTableId: 'tbl-1' });

      dispatchWasmOp('move', 's1', { x: 100, y: 100 });
      const msg = protocol.sendMessage.mock.calls[0][0] as { data: { from: { x: number; y: number } } };
      expect(msg.data.from).toEqual({ x: 10, y: 20 });
    });

    it('ignores empty spriteId', () => {
      // Should not throw
      expect(() => wasmBridgeService.seedSpriteState('', { x: 1, y: 1 })).not.toThrow();
    });
  });

  describe('wasm-sprite-operation event', () => {
    it('sends move commit via protocol', () => {
      const protocol = { sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ activeTableId: 'tbl-1' });

      dispatchWasmOp('move', 's1', { x: 50, y: 60 });

      expect(protocol.sendMessage).toHaveBeenCalledOnce();
    });

    it('sends resize commit via protocol', () => {
      const protocol = { sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ activeTableId: 'tbl-1' });

      dispatchWasmOp('resize', 's1', { width: 64, height: 64 });

      expect(protocol.sendMessage).toHaveBeenCalledOnce();
    });

    it('sends rotate commit via protocol', () => {
      const protocol = { sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ activeTableId: 'tbl-1' });

      dispatchWasmOp('rotate', 's1', { rotation: 45 });

      expect(protocol.sendMessage).toHaveBeenCalledOnce();
    });

    it('skips send if no active tableId', () => {
      const protocol = { sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ activeTableId: null });

      dispatchWasmOp('move', 's1', { x: 5, y: 5 });

      expect(protocol.sendMessage).not.toHaveBeenCalled();
    });

    it('denies operation and emits revert when non-DM cannot control sprite', () => {
      vi.mocked(isDM).mockReturnValue(false);
      const canControlSprite = vi.fn(() => false);
      mockStore({ sessionRole: 'player', canControlSprite });
      wasmBridgeService.seedSpriteState('s1', { x: 0, y: 0 });

      const revertEvents: Event[] = [];
      window.addEventListener('sprite-revert', (e) => revertEvents.push(e));

      dispatchWasmOp('move', 's1', { x: 99, y: 99 });

      expect(revertEvents).toHaveLength(1);
    });

    it('timeouts a pending action and shows toast', () => {
      const protocol = { sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ activeTableId: 'tbl-1' });

      dispatchWasmOp('move', 's2', { x: 10, y: 10 });
      vi.advanceTimersByTime(6000);

      expect(toast.error).toHaveBeenCalledOnce();
    });
  });

  describe('sprite-action-confirmed event', () => {
    it('clears pending action without reverting', () => {
      const protocol = { sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ activeTableId: 'tbl-1' });

      dispatchWasmOp('move', 's1', { x: 10, y: 10 });
      const actionId = (protocol.sendMessage.mock.calls[0][0] as { data: { action_id: string } }).data.action_id;

      window.dispatchEvent(new CustomEvent('sprite-action-confirmed', { detail: { actionId } }));
      vi.advanceTimersByTime(6000);

      // No toast because pending was cleared before timeout
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('sprite-action-rejected event', () => {
    it('shows toast on rejection', () => {
      const protocol = { sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ activeTableId: 'tbl-1' });

      dispatchWasmOp('move', 's1', { x: 5, y: 5 });
      const actionId = (protocol.sendMessage.mock.calls[0][0] as { data: { action_id: string } }).data.action_id;

      window.dispatchEvent(new CustomEvent('sprite-action-rejected', {
        detail: { actionId, reason: 'server_rejected' },
      }));

      expect(toast.error).toHaveBeenCalledOnce();
    });
  });

  describe('wasm-light-moved event', () => {
    it('calls protocol.moveSprite and updateSprite in store', () => {
      const moveSprite = vi.fn();
      const updateSprite = vi.fn();
      const protocol = { moveSprite, sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ updateSprite });

      window.dispatchEvent(new CustomEvent('wasm-light-moved', {
        detail: { lightId: 'light-1', x: 100, y: 200 },
      }));

      expect(moveSprite).toHaveBeenCalledWith('light-1', 100, 200);
      expect(updateSprite).toHaveBeenCalledWith('light-1', { x: 100, y: 200 });
    });
  });

  describe('wasm-wall-moved event', () => {
    it('calls protocol.updateWall and store.updateWall', () => {
      const updateWall = vi.fn();
      const protoUpdateWall = vi.fn();
      const protocol = { updateWall: protoUpdateWall, sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ updateWall });

      window.dispatchEvent(new CustomEvent('wasm-wall-moved', {
        detail: { wallId: 'w1', x1: 0, y1: 0, x2: 50, y2: 50 },
      }));

      expect(updateWall).toHaveBeenCalled();
      expect(protoUpdateWall).toHaveBeenCalled();
    });
  });

  describe('sprite-created event', () => {
    it('seeds committed position for new sprite', () => {
      window.dispatchEvent(new CustomEvent('sprite-created', {
        detail: { sprite_id: 'new-s1', x: 30, y: 40 },
      }));

      // Verify by checking the "from" in a subsequent move
      const protocol = { sendMessage: vi.fn() };
      wasmBridgeService.setProtocol(protocol as never);
      mockStore({ activeTableId: 'tbl-1' });
      dispatchWasmOp('move', 'new-s1', { x: 100, y: 100 });

      const msg = protocol.sendMessage.mock.calls[0][0] as { data: { from: { x: number; y: number } } };
      expect(msg.data.from).toEqual({ x: 30, y: 40 });
    });
  });
});
