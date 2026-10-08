import { describe, expect, it } from 'vitest';
import { assertTextSprite, DEFAULT_TEXT, parseTextSpriteMetadata, textDirection, textFont } from '../textSpriteModel';

const descriptor = { ...DEFAULT_TEXT, text: 'Привіт\nمرحبا' };

describe('canonical text sprite metadata', () => {
  it.each([{ text: ' ' }, { text: '\n'.repeat(33) }, { text: 'x'.repeat(4097) }, { text: 'bad\0' },
    { font_size: true }, { font_size: 129 }, { color: 'red' }, { font_family: 'url(evil)' },
    { font_weight: 500 }, { language: '<script>' }, { direction: 'inherit' }, { extra: 1 }])('rejects invalid descriptor %j', changes => {
    expect(() => assertTextSprite({ ...descriptor, ...changes })).toThrow();
  });
  it('preserves Unicode, style, language and authoritative revision', () => {
    const metadata = { text_sprite: { ...descriptor, language: 'uk-UA', font_style: 'italic', font_weight: 700 }, text_revision: 3, other: 'kept' };
    expect(parseTextSpriteMetadata(JSON.stringify(metadata))).toEqual({ descriptor: metadata.text_sprite, revision: 3, metadata });
  });
  it('adapts existing legacy text metadata without discarding other fields', () => {
    const parsed = parseTextSpriteMetadata(JSON.stringify({ is_text: true, text: 'Legacy', fontSize: 30, fontFamily: 'Courier New', fontWeight: 'bold', color: '#ffffff', extra: 1 }));
    expect(parsed?.descriptor).toMatchObject({ text: 'Legacy', font_size: 30, font_family: 'monospace', font_weight: 700 });
    expect(parsed?.metadata.extra).toBe(1);
  });
  it.each([null, '{}', 'bad JSON', JSON.stringify({ text_sprite: descriptor, text_revision: 0 }),
    JSON.stringify({ text_sprite: descriptor, extra: 'x'.repeat(32768) })])('does not recognize malformed metadata %j', raw => {
    expect(parseTextSpriteMetadata(raw)).toBeNull();
  });
  it('uses first strong letter direction and a bounded CSS font, not arbitrary CSS', () => {
    expect(textDirection({ ...descriptor, text: '123 مرحبا' })).toBe('rtl');
    expect(textDirection({ ...descriptor, text: '123 Привіт' })).toBe('ltr');
    expect(textDirection({ ...descriptor, direction: 'rtl' })).toBe('rtl');
    expect(textFont(descriptor)).toBe('normal 400 24px sans-serif');
  });
});
