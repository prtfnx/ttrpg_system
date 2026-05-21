import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spriteCreationService } from '../spriteCreation.service';
import type { WebClientProtocol } from '@lib/websocket';

vi.mock('@/store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({ activeTableId: 'table-1' })),
  },
}));

const mockProtocol = { sendMessage: vi.fn() } as unknown as WebClientProtocol;

beforeEach(() => {
  vi.clearAllMocks();
  // Reset protocol so each test starts clean
  spriteCreationService.setProtocol(mockProtocol);
});

describe('spriteCreationService', () => {
  describe('setProtocol / no protocol', () => {
    it('throws when no protocol is set', async () => {
      // Use a fresh-ish approach — temporarily replace internal protocol
      (spriteCreationService as unknown as { protocol: null }).protocol = null;
      await expect(
        spriteCreationService.createSprite({
          assetId: 'a1', fileName: 'hero.png', worldX: 0, worldY: 0, sessionId: 'sess'
        })
      ).rejects.toThrow('Protocol not initialized');
    });
  });

  describe('createSprite', () => {
    it('returns a valid UUID string', async () => {
      const id = await spriteCreationService.createSprite({
        assetId: 'a1', fileName: 'hero.png', worldX: 10, worldY: 20, sessionId: 'sess'
      });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('dispatches optimistic-sprite-create event', async () => {
      const events: CustomEvent[] = [];
      window.addEventListener('optimistic-sprite-create', (e) => events.push(e as CustomEvent));
      await spriteCreationService.createSprite({
        assetId: 'a1', fileName: 'hero.png', worldX: 10, worldY: 20, sessionId: 'sess'
      });
      window.removeEventListener('optimistic-sprite-create', () => {});
      expect(events).toHaveLength(1);
      const detail = events[0].detail;
      expect(detail.asset_id).toBe('a1');
      expect(detail.x).toBe(10);
      expect(detail.y).toBe(20);
      expect(detail.table_id).toBe('table-1');
    });

    it('calls protocol.sendMessage with sprite data', async () => {
      await spriteCreationService.createSprite({
        assetId: 'a2', fileName: 'dragon.png', worldX: 5, worldY: 15, sessionId: 'sess'
      });
      expect(mockProtocol.sendMessage).toHaveBeenCalledOnce();
      const call = (mockProtocol.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.type).toBe('sprite_create');
      expect(call.data.sprite_data.asset_id).toBe('a2');
      expect(call.data.table_id).toBe('table-1');
    });

    it('strips extension from filename for sprite name', async () => {
      const events: CustomEvent[] = [];
      window.addEventListener('optimistic-sprite-create', (e) => events.push(e as CustomEvent));
      await spriteCreationService.createSprite({
        assetId: 'a3', fileName: 'my.hero.png', worldX: 0, worldY: 0, sessionId: 'sess'
      });
      window.removeEventListener('optimistic-sprite-create', () => {});
      expect(events[0].detail.name).toBe('my');
    });

    it('sets default sprite properties', async () => {
      const events: CustomEvent[] = [];
      window.addEventListener('optimistic-sprite-create', (e) => events.push(e as CustomEvent));
      await spriteCreationService.createSprite({
        assetId: 'a4', fileName: 'tile.jpg', worldX: 0, worldY: 0, sessionId: 'sess'
      });
      window.removeEventListener('optimistic-sprite-create', () => {});
      const d = events[0].detail;
      expect(d.width).toBe(64);
      expect(d.height).toBe(64);
      expect(d.layer).toBe('tokens');
      expect(d.visible).toBe(true);
      expect(d.rotation).toBe(0);
    });

    it('returns spriteId without sending when no active table', async () => {
      const { useGameStore } = await import('@/store');
      (useGameStore.getState as ReturnType<typeof vi.fn>).mockReturnValueOnce({ activeTableId: null });
      const id = await spriteCreationService.createSprite({
        assetId: 'a5', fileName: 'item.png', worldX: 0, worldY: 0, sessionId: 'sess'
      });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(mockProtocol.sendMessage).not.toHaveBeenCalled();
    });
  });
});
