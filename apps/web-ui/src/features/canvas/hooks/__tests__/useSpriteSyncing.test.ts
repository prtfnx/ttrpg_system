import { waitFor } from '@testing-library/react';
import { createMockWasmRuntime, renderHookWithWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpriteSyncing } from '../useSpriteSyncing';

const storeMocks = vi.hoisted(() => ({
  addSprite: vi.fn(),
  removeSprite: vi.fn(),
  updateSprite: vi.fn(),
  state: {
    activeTableId: 'table-1',
    sprites: [] as Array<{
      id: string;
      tableId?: string;
      x?: number;
      y?: number;
      rotation?: number;
      scale?: { x: number; y: number };
      texture?: string;
      layer?: string;
      name?: string;
    }>,
  },
}));

vi.mock('@/store', () => ({
  useGameStore: Object.assign(
    vi.fn((selector?: (state: typeof storeMocks.state & {
      addSprite: typeof storeMocks.addSprite;
      removeSprite: typeof storeMocks.removeSprite;
      updateSprite: typeof storeMocks.updateSprite;
    }) => unknown) => {
      const state = {
        ...storeMocks.state,
        addSprite: storeMocks.addSprite,
        removeSprite: storeMocks.removeSprite,
        updateSprite: storeMocks.updateSprite,
      };
      return selector ? selector(state) : state;
    }),
    { getState: vi.fn(() => storeMocks.state) },
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  storeMocks.state.activeTableId = 'table-1';
  storeMocks.state.sprites = [];
});

describe('useSpriteSyncing', () => {
  it('syncs sprites from the runtime TableSync contract', async () => {
    storeMocks.state.sprites = [
      {
        id: 'existing',
        tableId: 'table-1',
        x: 1,
        y: 2,
        rotation: 0,
        scale: { x: 1, y: 1 },
        texture: 'old-texture',
        layer: 'tokens',
        name: 'Existing',
      },
      { id: 'stale', tableId: 'table-1', layer: 'tokens', name: 'Stale' },
    ];

    renderHookWithWasmRuntime(
      () => useSpriteSyncing(),
      createMockWasmRuntime({
        getTableSync: vi.fn(() => ({
          get_sprites: vi.fn(() => [
            { id: 'existing', table_id: 'table-1', world_x: 5, world_y: 6, texture_id: 'new-texture', layer: 'tokens' },
            { id: 'new', table_id: 'table-1', world_x: 10, world_y: 12, texture_id: 'new-token', layer: 'map' },
          ]),
        }) as never),
      }),
    );

    await waitFor(() => {
      expect(storeMocks.removeSprite).toHaveBeenCalledWith('stale');
      expect(storeMocks.updateSprite).toHaveBeenCalledWith('existing', expect.objectContaining({
        x: 5,
        y: 6,
        texture: 'new-texture',
      }));
      expect(storeMocks.addSprite).toHaveBeenCalledWith(expect.objectContaining({
        id: 'new',
        tableId: 'table-1',
        layer: 'map',
      }));
    });
  });
});
