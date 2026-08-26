export interface TablePreviewPalette {
  background: string;
  border: string;
  danger: string;
  mutedText: string;
  subtleText: string;
}

function themeColor(token: string, fallback: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return fallback;
  }
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
}

export function getTablePreviewPalette(): TablePreviewPalette {
  return {
    background: themeColor('--bg-primary', '#1a1a1a'),
    border: themeColor('--border-primary', '#444444'),
    danger: themeColor('--color-danger', '#ff4444'),
    mutedText: themeColor('--text-muted', '#888888'),
    subtleText: themeColor('--text-tertiary', '#666666'),
  };
}
