import { afterEach, describe, expect, it } from 'vitest';
import { getTablePreviewPalette } from '../tablePreviewTheme';

const TOKENS = [
  '--bg-primary',
  '--border-primary',
  '--color-danger',
  '--text-muted',
  '--text-tertiary',
];

afterEach(() => {
  TOKENS.forEach(token => document.documentElement.style.removeProperty(token));
});

describe('getTablePreviewPalette', () => {
  it('resolves semantic colors from the active document theme', () => {
    document.documentElement.style.setProperty('--bg-primary', '#fafafa');
    document.documentElement.style.setProperty('--border-primary', '#d4d4d4');
    document.documentElement.style.setProperty('--color-danger', '#dc2626');
    document.documentElement.style.setProperty('--text-muted', '#525252');
    document.documentElement.style.setProperty('--text-tertiary', '#737373');

    expect(getTablePreviewPalette()).toEqual({
      background: '#fafafa',
      border: '#d4d4d4',
      danger: '#dc2626',
      mutedText: '#525252',
      subtleText: '#737373',
    });
  });
});
