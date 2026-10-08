import { useGameStore } from '@/store';
import type { Sprite } from '@/types';
import type { WebClientProtocol } from '@lib/websocket';
import { createMockWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpriteSelectionPort, spriteSelectionBounds } from '../spriteSelectionPort';

const sprite: Sprite = { id: 'sprite', name: 'Text', tableId: 'table', x: 0, y: 0, width: 20, height: 10,
  scale: { x: 1, y: 1 }, rotation: 90, layer: 'tokens', texture: '__TEXT__', controlledBy: ['7'] };
beforeEach(() => useGameStore.setState({ sprites: [sprite], selectedSprites: [], activeTableId: 'table',
  activeLayer: 'tokens', layerVisibility: {}, userId: 7, sessionRole: 'player' }));

describe('runtime-owned sprite selection adapter', () => {
  it('uses protocol degrees for rotated world bounds', () => {
    const bounds = spriteSelectionBounds(sprite);
    [5, -5, 15, 15].forEach((value, index) => expect(bounds[index]).toBeCloseTo(value));
  });
  it('distinguishes ownership from deletion and excludes hidden, inactive or spectator-editable sprites', () => {
    const runtime = createMockWasmRuntime(); const protocol = {} as WebClientProtocol;
    const port = createSpriteSelectionPort(runtime, protocol);
    expect(port.items('table')[0]).toMatchObject({ canEdit: true, canDelete: false });
    useGameStore.setState({ sessionRole: 'spectator' }); expect(port.items('table')[0].canEdit).toBe(false);
    expect(port.items('other')).toEqual([]);
    useGameStore.setState({ layerVisibility: { tokens: false } }); expect(port.items('table')).toEqual([]);
  });
  it('updates the store only after runtime selection accepts and captures command table identity', () => {
    const runtime = createMockWasmRuntime();
    const protocol = { moveSprite: vi.fn(), removeSprite: vi.fn() };
    const port = createSpriteSelectionPort(runtime, protocol as unknown as WebClientProtocol);
    vi.mocked(runtime.selectSelectionSprites).mockReturnValueOnce(false);
    port.select(['sprite']); expect(useGameStore.getState().selectedSprites).toEqual([]);
    port.select(['sprite']); expect(useGameStore.getState().selectedSprites).toEqual(['sprite']);
    port.preview('sprite', 10, 20); expect(runtime.previewSelectionSprite).toHaveBeenCalledWith('sprite', 10, 20);
    port.move('captured', 'sprite', 10, 20); expect(protocol.moveSprite).toHaveBeenCalledWith('sprite', 10, 20, 'captured');
    port.remove('captured', 'sprite'); expect(protocol.removeSprite).toHaveBeenCalledWith('sprite', 'captured');
  });
});
