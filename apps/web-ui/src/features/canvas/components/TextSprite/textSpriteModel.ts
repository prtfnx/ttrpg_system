import validate from 'virtual:ttrpg-text-sprite-validator';
import schema from './text_sprite.schema.generated.json';

export interface TextSpriteDescriptor {
  version: 1;
  text: string;
  font_size: number;
  font_family: 'sans-serif' | 'serif' | 'monospace';
  font_weight: 400 | 700;
  font_style: 'normal' | 'italic';
  color: string;
  language: string;
  direction: 'auto' | 'ltr' | 'rtl';
}

export const TEXT_LIMITS = schema['x-limits'];
export const DEFAULT_TEXT: TextSpriteDescriptor = {
  version: 1, text: '', font_size: 24, font_family: 'sans-serif', font_weight: 400,
  font_style: 'normal', color: '#ffffff', language: 'und', direction: 'auto',
};

export function assertTextSprite(value: unknown): asserts value is TextSpriteDescriptor {
  if (!validate(value)) throw new Error('Invalid text sprite settings.');
  const descriptor = value as TextSpriteDescriptor;
  if (!descriptor.text.trim() || descriptor.text.split('\n').length > TEXT_LIMITS.maxLines
    || [...descriptor.text].some(char => char.charCodeAt(0) < 32 && char !== '\n' && char !== '\t')) {
    throw new Error('Text must be non-empty, contain at most 32 lines, and have no control characters.');
  }
}

export function parseTextSpriteMetadata(raw: unknown): { descriptor: TextSpriteDescriptor; revision: number; metadata: Record<string, unknown> } | null {
  try {
    if (typeof raw === 'string' && new TextEncoder().encode(raw).byteLength > TEXT_LIMITS.maxMetadataBytes) return null;
    const metadata: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
    const record = metadata as Record<string, unknown>;
    let descriptor = record.text_sprite;
    if (!descriptor && record.is_text === true && typeof record.text === 'string') {
      const family = String(record.fontFamily ?? 'sans-serif');
      descriptor = { ...DEFAULT_TEXT, text: record.text, font_size: record.fontSize ?? 24,
        color: record.color ?? '#ffffff', font_weight: record.fontWeight === 'bold' || Number(record.fontWeight) >= 600 ? 700 : 400,
        font_family: /mono|courier|console/i.test(family) ? 'monospace' : /times|georgia|^serif$/i.test(family) ? 'serif' : 'sans-serif' };
    }
    assertTextSprite(descriptor);
    const revision = record.text_revision ?? 1;
    if (!Number.isSafeInteger(revision) || Number(revision) < 1) return null;
    return { descriptor, revision: Number(revision), metadata: record };
  } catch { return null; }
}

export function textDirection(descriptor: TextSpriteDescriptor): 'ltr' | 'rtl' {
  if (descriptor.direction !== 'auto') return descriptor.direction;
  const letter = descriptor.text.match(/\p{Letter}/u)?.[0] ?? '';
  return /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}]/u.test(letter) ? 'rtl' : 'ltr';
}

export function textFont(descriptor: TextSpriteDescriptor): string {
  return `${descriptor.font_style} ${descriptor.font_weight} ${descriptor.font_size}px ${descriptor.font_family}`;
}

export async function rasterizeTextSprite(descriptor: TextSpriteDescriptor): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  assertTextSprite(descriptor);
  const font = textFont(descriptor);
  if (document.fonts) {
    await document.fonts.load(font, descriptor.text);
    await document.fonts.ready;
  }
  const canvas = document.createElement('canvas');
  canvas.lang = descriptor.language;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Text rendering is unavailable.');
  const configure = () => {
    ctx.font = font;
    ctx.direction = textDirection(descriptor);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // The element language is the fallback on browsers without context.lang.
    if ('lang' in ctx) (ctx as CanvasRenderingContext2D & { lang: string }).lang = descriptor.language;
  };
  configure();
  const lines = descriptor.text.split('\n');
  const metrics = lines.map(line => ctx.measureText(line || ' '));
  const left = Math.max(0, ...metrics.map(m => m.actualBoundingBoxLeft || 0));
  const right = Math.max(...metrics.map(m => Math.max(m.width, m.actualBoundingBoxRight || 0)));
  const ascent = Math.max(descriptor.font_size, ...metrics.map(m => m.actualBoundingBoxAscent || 0));
  const descent = Math.max(descriptor.font_size * 0.25, ...metrics.map(m => m.actualBoundingBoxDescent || 0));
  const lineHeight = Math.max(descriptor.font_size * 1.25, ascent + descent);
  const padding = 4;
  const width = Math.ceil(left + right + padding * 2);
  const height = Math.ceil(ascent + descent + (lines.length - 1) * lineHeight + padding * 2);
  const scale = Math.min(Math.max(1, Math.min(window.devicePixelRatio || 1, 2)),
    TEXT_LIMITS.maxTextureDimension / width, TEXT_LIMITS.maxTextureDimension / height,
    Math.sqrt(TEXT_LIMITS.maxTexturePixels / (width * height)));
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  configure();
  ctx.scale(canvas.width / width, canvas.height / height);
  ctx.fillStyle = descriptor.color;
  lines.forEach((line, index) => ctx.fillText(line, padding + left, padding + ascent + index * lineHeight));
  return { canvas, width, height };
}
