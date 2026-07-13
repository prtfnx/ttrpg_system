import { describe, expect, it } from 'vitest';

import { isSupportedAssetImage } from './DragDropImageHandler';


describe('isSupportedAssetImage', () => {
  it.each([
    ['map.png', 'image/png'],
    ['portrait.JPG', 'image/jpeg'],
    ['token.jpeg', 'image/jpeg'],
    ['animation.gif', 'image/gif'],
    ['map.bmp', 'image/bmp'],
    ['scene.webp', 'image/webp'],
  ])('accepts supported raster image %s', (name, type) => {
    expect(isSupportedAssetImage({ name, type })).toBe(true);
  });

  it.each([
    ['script.svg', 'image/svg+xml'],
    ['map.png', 'text/plain'],
    ['notes.pdf', 'application/pdf'],
    ['no-extension', 'image/png'],
  ])('rejects unsupported or mismatched file %s', (name, type) => {
    expect(isSupportedAssetImage({ name, type })).toBe(false);
  });
});
