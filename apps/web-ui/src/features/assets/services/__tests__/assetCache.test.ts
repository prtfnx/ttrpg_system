import { describe, it, expect, beforeEach } from 'vitest';
import { useAssetCharacterCache } from '../assetCache';

// Reset store state before each test
beforeEach(() => {
  useAssetCharacterCache.setState({ assets: {}, characters: {} });
});

describe('upsertAsset', () => {
  it('adds a new asset', () => {
    useAssetCharacterCache.getState().upsertAsset({ id: 'a1', name: 'Map', url: '/map.png' });
    const { assets } = useAssetCharacterCache.getState();
    expect(assets['a1']).toMatchObject({ id: 'a1', name: 'Map', url: '/map.png' });
    expect(assets['a1'].lastUsed).toBeTypeOf('number');
  });

  it('updates an existing asset', () => {
    useAssetCharacterCache.getState().upsertAsset({ id: 'a1', name: 'Map', url: '/map.png' });
    useAssetCharacterCache.getState().upsertAsset({ id: 'a1', name: 'Map v2', url: '/map2.png' });
    expect(useAssetCharacterCache.getState().assets['a1'].name).toBe('Map v2');
  });
});

describe('upsertCharacter', () => {
  it('adds a new character', () => {
    useAssetCharacterCache.getState().upsertCharacter({ id: 'c1', name: 'Aria', data: { hp: 20 } });
    expect(useAssetCharacterCache.getState().characters['c1']).toMatchObject({ id: 'c1', name: 'Aria' });
  });
});

describe('bulkLoadAssets', () => {
  it('loads multiple assets at once', () => {
    const assets = [
      { id: 'a1', name: 'Token1', url: '/t1.png' },
      { id: 'a2', name: 'Token2', url: '/t2.png' },
    ];
    useAssetCharacterCache.getState().bulkLoadAssets(assets);
    const state = useAssetCharacterCache.getState().assets;
    expect(Object.keys(state)).toHaveLength(2);
    expect(state['a1'].name).toBe('Token1');
  });
});

describe('bulkLoadCharacters', () => {
  it('loads multiple characters at once', () => {
    const chars = [
      { id: 'c1', name: 'Aria', data: {} },
      { id: 'c2', name: 'Bard', data: {} },
    ];
    useAssetCharacterCache.getState().bulkLoadCharacters(chars);
    expect(Object.keys(useAssetCharacterCache.getState().characters)).toHaveLength(2);
  });
});

describe('evictUnused', () => {
  it('removes assets older than 24h', () => {
    const old = Date.now() - 25 * 60 * 60 * 1000;
    useAssetCharacterCache.setState({
      assets: { stale: { id: 'stale', name: 'old', url: '/x', lastUsed: old } },
      characters: {},
    });
    useAssetCharacterCache.getState().evictUnused();
    expect(useAssetCharacterCache.getState().assets['stale']).toBeUndefined();
  });

  it('keeps recent assets', () => {
    useAssetCharacterCache.getState().upsertAsset({ id: 'fresh', name: 'New', url: '/new.png' });
    useAssetCharacterCache.getState().evictUnused();
    expect(useAssetCharacterCache.getState().assets['fresh']).toBeDefined();
  });
});

describe('clearCache', () => {
  it('clears all assets and characters', () => {
    useAssetCharacterCache.getState().upsertAsset({ id: 'a1', name: 'X', url: '/x' });
    useAssetCharacterCache.getState().upsertCharacter({ id: 'c1', name: 'Y', data: {} });
    useAssetCharacterCache.getState().clearCache();
    const state = useAssetCharacterCache.getState();
    expect(state.assets).toEqual({});
    expect(state.characters).toEqual({});
  });
});
