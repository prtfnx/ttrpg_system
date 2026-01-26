/**
 * Sprite Helper Utilities
 * 
 * These utilities provide compatibility between the new Sprite interface
 * and legacy code that expects display properties like width, height, name, etc.
 * 
 * The new Sprite interface is aligned with the WASM backend and uses:
 * - texture (string) instead of imageUrl
 * - scale: {x, y} instead of width/height
 * - No UI-specific properties (name, isVisible, isSelected)
 */

import type { Sprite } from '../../types';

/**
 * Standard sprite dimensions - these should ideally come from WASM
 * but we use defaults for components that need immediate values
 */
export const DEFAULT_SPRITE_SIZE = 64; // Default grid cell size

/**
 * Get sprite display width based on scale
 * In WASM, sprites have a base texture size and scale factor
 */
export function getSpriteWidth(sprite: Sprite, baseSize: number = DEFAULT_SPRITE_SIZE): number {
  return baseSize * sprite.scale.x;
}

/**
 * Get sprite display height based on scale
 */
export function getSpriteHeight(sprite: Sprite, baseSize: number = DEFAULT_SPRITE_SIZE): number {
  return baseSize * sprite.scale.y;
}

/**
 * Get sprite display name - uses texture path as fallback
 */
export function getSpriteName(sprite: Sprite): string {
  // Extract filename from texture path
  const textureName = sprite.texture.split('/').pop() || sprite.texture;
  return textureName.replace(/\.[^/.]+$/, ''); // Remove extension
}

/**
 * Get sprite center point
 */
export function getSpriteCenter(sprite: Sprite, baseSize: number = DEFAULT_SPRITE_SIZE): { x: number; y: number } {
  return {
    x: sprite.x + getSpriteWidth(sprite, baseSize) / 2,
    y: sprite.y + getSpriteHeight(sprite, baseSize) / 2
  };
}

/**
 * Get sprite bounding box
 */
export function getSpriteBounds(sprite: Sprite, baseSize: number = DEFAULT_SPRITE_SIZE) {
  const width = getSpriteWidth(sprite, baseSize);
  const height = getSpriteHeight(sprite, baseSize);
  
  return {
    left: sprite.x,
    top: sprite.y,
    right: sprite.x + width,
    bottom: sprite.y + height,
    width,
    height
  };
}

/**
 * Check if a point is inside a sprite
 */
export function isPointInSprite(
  sprite: Sprite,
  x: number,
  y: number,
  baseSize: number = DEFAULT_SPRITE_SIZE
): boolean {
  const bounds = getSpriteBounds(sprite, baseSize);
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

/**
 * Calculate distance between two sprites
 */
export function getDistanceBetweenSprites(
  sprite1: Sprite,
  sprite2: Sprite,
  baseSize: number = DEFAULT_SPRITE_SIZE
): number {
  const center1 = getSpriteCenter(sprite1, baseSize);
  const center2 = getSpriteCenter(sprite2, baseSize);
  
  const dx = center2.x - center1.x;
  const dy = center2.y - center1.y;
  
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Legacy compatibility: create a sprite display object with old properties
 * Use this temporarily for components that need migration
 */
export interface LegacySpriteDisplay extends Sprite {
  name: string;
  width: number;
  height: number;
  imageUrl: string;
  isVisible: boolean;
  isSelected: boolean;
}

export function toLegacySpriteDisplay(
  sprite: Sprite,
  isSelected: boolean = false,
  isVisible: boolean = true,
  baseSize: number = DEFAULT_SPRITE_SIZE
): LegacySpriteDisplay {
  return {
    ...sprite,
    name: getSpriteName(sprite),
    width: getSpriteWidth(sprite, baseSize),
    height: getSpriteHeight(sprite, baseSize),
    imageUrl: sprite.texture,
    isVisible,
    isSelected
  };
}
