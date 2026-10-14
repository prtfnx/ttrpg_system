import { useGameStore } from '@/store';
import type { Sprite } from '@/types';
import type { WebClientProtocol } from '@lib/websocket';
import { wasmBridgeService } from '@lib/wasm/wasmBridge';
import { createMockWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpriteSelectionPort, spriteSelectionBounds } from '../spriteSelectionPort';

vi.mock('@lib/wasm/wasmBridge', () => ({ wasmBridgeService: { commitSelectionMove: vi.fn() } }));

const sprite: Sprite = { id: 'sprite', name: 'Text', tableId: 'table', x: 0, y: 0, width: 20, height: 10,
  scale: { x: 1, y: 1 }, rotation: 90, layer: 'tokens', texture: '__TEXT__', controlledBy: ['7'] };
beforeEach(() => useGameStore.setState({ sprites: [sprite], selectedSprites: [], activeTableId: 'table',
  activeLayer: 'tokens', layerVisibility: {}, userId: 7, sessionRole: 'player' }));

describe('runtime-owned sprite selection adapter', () => {
  it('captures saved dimensions through the real store insertion path instead of legacy defaults', () => {
    useGameStore.getState().addSprite({ ...sprite, width: 320, height: 76, rotation: 0 });
    const port = createSpriteSelectionPort(createMockWasmRuntime(), {} as WebClientProtocol);
    expect(port.items('table')[0]).toMatchObject({ bounds: [0, 0, 320, 76],
      expected: { width: 320, height: 76, scale_x: 1, scale_y: 1 } });
  });
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
    port.move('captured', 'sprite', 10, 20);
    expect(wasmBridgeService.commitSelectionMove).toHaveBeenCalledWith(protocol, 'captured', 'sprite', 10, 20);
    expect(protocol.moveSprite).not.toHaveBeenCalled();
    port.remove('captured', 'sprite'); expect(protocol.removeSprite).toHaveBeenCalledWith('sprite', 'captured');
  });

  it('restores the latest authoritative position even after the selected layer becomes hidden', () => {
    const runtime = createMockWasmRuntime();
    const port = createSpriteSelectionPort(runtime, {} as WebClientProtocol);
    port.preview('sprite', 20, 30);
    useGameStore.setState({ sprites: [{ ...sprite, x: 80, y: 90 }], layerVisibility: { tokens: false } });
    port.restore('table', 'sprite');
    expect(runtime.previewSelectionSpriteTransform).toHaveBeenLastCalledWith('sprite', {
      x: 80, y: 90, scale_x: sprite.scale.x, scale_y: sprite.scale.y, rotation: sprite.rotation,
    });
  });

  it('never restores removed sprites or a different active table', () => {
    const runtime = createMockWasmRuntime();
    const port = createSpriteSelectionPort(runtime, {} as WebClientProtocol);
    useGameStore.setState({ activeTableId: 'other' });
    port.restore('table', 'sprite');
    useGameStore.setState({ activeTableId: 'table', sprites: [] });
    port.restore('table', 'sprite');
    expect(runtime.previewSelectionSprite).not.toHaveBeenCalled();
  });
});
