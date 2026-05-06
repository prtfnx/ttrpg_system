import { describe, it, expect } from 'vitest';
import {
  getSpriteWidth,
  getSpriteHeight,
  getSpriteBounds,
  getSpriteName,
  getSpriteCenter,
  isPointInSprite,
  getDistanceBetweenSprites,
  DEFAULT_SPRITE_SIZE,
} from '../spriteHelpers';
import type { Sprite } from '@/types';

const makeSprite = (overrides: Partial<Sprite> = {}): Sprite => ({
  id: 's1',
  x: 0,
  y: 0,
  texture: 'tokens/goblin.png',
  scale: { x: 1, y: 1 },
  layer: 'ground',
  z_index: 0,
  ...overrides,
} as Sprite);

describe('getSpriteWidth', () => {
  it('returns baseSize for scale 1', () => {
    expect(getSpriteWidth(makeSprite())).toBe(DEFAULT_SPRITE_SIZE);
  });

  it('scales with sprite.scale.x', () => {
    expect(getSpriteWidth(makeSprite({ scale: { x: 2, y: 1 } }))).toBe(DEFAULT_SPRITE_SIZE * 2);
  });

  it('respects custom baseSize', () => {
    expect(getSpriteWidth(makeSprite(), 32)).toBe(32);
  });
});

describe('getSpriteHeight', () => {
  it('returns baseSize for scale 1', () => {
    expect(getSpriteHeight(makeSprite())).toBe(DEFAULT_SPRITE_SIZE);
  });

  it('scales with sprite.scale.y', () => {
    expect(getSpriteHeight(makeSprite({ scale: { x: 1, y: 3 } }))).toBe(DEFAULT_SPRITE_SIZE * 3);
  });
});

describe('getSpriteName', () => {
  it('extracts filename without extension', () => {
    expect(getSpriteName(makeSprite({ texture: 'tokens/goblin.png' }))).toBe('goblin');
  });

  it('handles texture with no path separator', () => {
    expect(getSpriteName(makeSprite({ texture: 'dragon.jpg' }))).toBe('dragon');
  });
});

describe('getSpriteCenter', () => {
  it('returns center of sprite at origin', () => {
    const center = getSpriteCenter(makeSprite({ x: 0, y: 0 }));
    expect(center.x).toBe(DEFAULT_SPRITE_SIZE / 2);
    expect(center.y).toBe(DEFAULT_SPRITE_SIZE / 2);
  });

  it('offsets by sprite position', () => {
    const center = getSpriteCenter(makeSprite({ x: 100, y: 200 }));
    expect(center.x).toBe(100 + DEFAULT_SPRITE_SIZE / 2);
    expect(center.y).toBe(200 + DEFAULT_SPRITE_SIZE / 2);
  });
});

describe('getSpriteBounds', () => {
  it('returns correct bounds for sprite at origin', () => {
    const bounds = getSpriteBounds(makeSprite({ x: 10, y: 20 }));
    expect(bounds.left).toBe(10);
    expect(bounds.top).toBe(20);
    expect(bounds.right).toBe(10 + DEFAULT_SPRITE_SIZE);
    expect(bounds.bottom).toBe(20 + DEFAULT_SPRITE_SIZE);
    expect(bounds.width).toBe(DEFAULT_SPRITE_SIZE);
    expect(bounds.height).toBe(DEFAULT_SPRITE_SIZE);
  });
});

describe('isPointInSprite', () => {
  it('returns true for point inside sprite', () => {
    const sprite = makeSprite({ x: 0, y: 0 });
    expect(isPointInSprite(sprite, 10, 10)).toBe(true);
  });

  it('returns false for point outside sprite', () => {
    const sprite = makeSprite({ x: 0, y: 0 });
    expect(isPointInSprite(sprite, 1000, 1000)).toBe(false);
  });

  it('returns true for point on the boundary', () => {
    const sprite = makeSprite({ x: 0, y: 0 });
    expect(isPointInSprite(sprite, DEFAULT_SPRITE_SIZE, DEFAULT_SPRITE_SIZE)).toBe(true);
  });
});

describe('getDistanceBetweenSprites', () => {
  it('returns 0 for same position', () => {
    const s = makeSprite({ x: 0, y: 0 });
    expect(getDistanceBetweenSprites(s, s)).toBe(0);
  });

  it('calculates distance correctly', () => {
    const s1 = makeSprite({ x: 0, y: 0 });
    const s2 = makeSprite({ x: 100, y: 0 });
    // centers are same x-offset apart since both are at y=0
    expect(getDistanceBetweenSprites(s1, s2)).toBe(100);
  });
});
